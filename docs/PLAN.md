# Nidito · Plan de producto

Fecha: 2026-10-17. Aprobado por el dueño tras revisión. Copia del plan compartido en
Claude; si cambia algo, se cambia aquí.

## 0. La idea en una frase

Nidito es la app de la pareja para buscar casa: cada piso que os interesa entra solo o a
mano, queda en un mapa y en una lista, y cada uno lo puntúa por aspectos para ver de un
vistazo dónde coincidís y dónde no.

Se construye como GasTitos: mismo hogar de dos con código de invitación, misma
seguridad en la base de datos y mismo despliegue automático. Lo nuevo es el mapa, la
entrada automática por correo y las valoraciones por aspecto.

## 1. Qué se hereda de GasTitos

| Pieza | En GasTitos | En Nidito |
| --- | --- | --- |
| Hogar de dos | `households` + `household_members`, máximo 2, alta con código | Igual, copiado de `0001_init.sql` |
| Seguridad | RLS en todas las tablas, `current_household_id()` | Igual. Las casas son del hogar; cada valoración solo la edita su autor |
| Migraciones | `migrate.yml` aplica `supabase/migrations/NNNN_*.sql` | Igual |
| Publicación | `deploy.yml` a `gh-pages` | Igual, base `/Nidito/` |
| Funciones | `funciones.yml` publica `notify-partner` | Igual, más `ingest-email`, `ingest-link` y `enrich-property` cuando lleguen |
| Avisos al móvil | Web Push hecho a mano en `webpush.ts` | Reutilizado en la fase 2: valoración de tu pareja, bajada de precio |
| Entrada externa con código secreto | `register_payment` + atajo de iPhone | Mismo patrón para compartir enlaces y para el correo |
| PWA, `Sheet`, `useConfirm`, iconos SVG sin emojis | Sí | Igual |
| Keepalive | `keepalive.yml` cada 3 días | Igual |

Límites a tener en cuenta: el plan gratuito de Supabase permite dos proyectos activos
por organización, y el modo sin conexión guarda los datos pero no las teselas del mapa
(la política de OpenStreetMap lo prohíbe).

## 2. Cómo entra una casa: tres vías y una cuarta

Todas las vías acaban en la misma función `save_property`: crea la casa, busca
duplicados, aplica vuestros criterios y apunta el precio. Lo que llega solo pasa por la
Bandeja (fase 4); lo que metéis vosotros entra directo y los criterios solo avisan.

### Vía 3 (fase 1) · A mano y "Pegar texto"

- Formulario corto: dirección con buscador y pin arrastrable en el mapa, precio, m²,
  habitaciones, baños y de dónde viene. El resto, opcional.
- **"Pegar texto del anuncio"**: pegas la descripción del portal o el WhatsApp de la
  inmobiliaria y el lector rellena la ficha. Es la vía de trabajo diaria.

### Vía 4 (fase 3) · Compartir un enlace desde el móvil

- Desde la app de Idealista o cualquier portal: Compartir → Nidito. En iPhone las apps
  web no salen en el menú Compartir, así que se hace con un atajo de Atajos, como los
  pagos de GasTitos. Llegan el enlace y el título; la ficha se completa con "Pegar texto"
  o a mano. Nidito no descarga la página del portal.

### Vía 2 · Idealista

- La API existe, pero es por invitación y pensada para empresas; una app de pareja no es
  el perfil que aprueban. Solo hace búsquedas (50 resultados por página), no consulta un
  anuncio concreto y la cuota no es pública. Pedidla igual, pero no contéis con ella.
- Scraping, no: sus condiciones lo prohíben y la web bloquea robots.
- Camino principal: búsquedas guardadas con alerta por correo (se pegan, o entran solas
  cuando exista la vía 1) y compartir el anuncio desde la app. Vale igual para Fotocasa,
  pisos.com y Habitaclia.

### Vía 1 (fase 4, solo si el volumen lo justifica) · Correo

- Contad durante un mes cuántos correos de inmobiliarias y alertas recibís. Con dos o
  tres a la semana, "Pegar texto" los resuelve sin montar nada.
- Cómo llegaría: cada uno crea en su Gmail una etiqueta "Nidito" y un filtro por
  remitente. Un Google Apps Script en vuestra cuenta mira esa etiqueta cada 10 minutos y
  manda lo nuevo a la función `ingest-email` con vuestro código secreto. Alternativa:
  Cloudflare Email Routing con un Worker (exige dominio propio).
- Cómo se lee: las alertas de portales tienen formato fijo (reglas, sin modelo); los
  correos de inmobiliarias los convierte en ficha un modelo pequeño de Claude. El
  original se guarda para poder reprocesarlo.

## 3. Criterios del hogar (fase 3)

Dos niveles: **imprescindibles** (precio máximo, m² mínimos, habitaciones, baños, tipo,
dentro de vuestras zonas) deciden si una casa automática entra o va a Descartadas con el
motivo; **preferencias** (terraza, garaje, ascensor, exterior…) solo suman a la nota de
encaje. Las zonas se dibujan como polígonos en el mapa y la comprobación la hace PostGIS.
Si faltan datos, la casa entra marcada "faltan datos". Nada se borra solo: Descartadas
se revisa y se rescata con un toque. A mano y por enlace solo se avisa.

## 4. Ficha de la casa

| Grupo | Campos | De dónde sale |
| --- | --- | --- |
| Básicos | Precio, m² construidos y útiles, habitaciones, baños, planta, tipo, exterior/interior | Anuncio, correo o a mano |
| Extras | Ascensor, terraza, garaje, trastero, calefacción, aire, orientación, certificado energético | Anuncio o a mano |
| Gastos fijos | Comunidad al mes, IBI al año, derramas conocidas | A mano |
| Ubicación | Dirección, coordenadas, barrio | CartoCiudad (geocodificador público) o pin en el mapa |
| Catastro | Referencia catastral de la parcela (identifica el edificio, no el piso), superficie, año | Servicios de datos no protegidos del Catastro |
| Origen | Vía de entrada, enlace, inmobiliaria y contacto, correo original | Automático |
| Lo vuestro | Estado, fotos, notas, valoraciones, visitas | Vosotros |

Calcula sola: **€/m²** (fase 1) comparado con la media de vuestras casas en la zona. Para
"después": minutos andando al metro o cercanías (paradas de los datos abiertos del CRTM;
la ruta completa en transporte la abre Google Maps con un botón), coste total de compra
(precio + ITP + notaría, registro, gestoría y tasación; en Madrid el ITP de vivienda
usada es el 6 % sobre el mayor entre precio y valor de referencia, con bonificaciones
para familia numerosa y menores de 35 hasta 250.000 €; **verificar en la web de la
Comunidad de Madrid antes de meterlo en la calculadora**), hipoteca (entrada, cuota y
coste mensual frente al alquiler) y contraste de m² con el Catastro si se identifica el
piso.

## 5. Valoraciones a dos (fase 2)

Cada uno puntúa de 1 a 5 estrellas por aspecto; el otro ve estrellas y comentarios.
Aspectos de partida (editables): ubicación y barrio, transporte, luz, distribución,
estado, tamaño, ruido y entorno, edificio, precio para lo que es, flechazo.

- Tu nota es la media de tus estrellas; la conjunta, la media de las dos. Sin pesos en la
  primera versión.
- Desacuerdo: 2 estrellas o más de diferencia en un aspecto se marca, y la lista ordena
  por "más desacuerdo".
- Valoración a ciegas (opcional, recomendada): no ves las del otro hasta haber puntuado
  al menos un aspecto. Garantizado en la base de datos.
- Veto ("para mí, no", con motivo) e hilo de comentarios por casa, con aviso al móvil.

## 6. Vistas

Navegación inferior **Mapa · ➕ · Lista**; mapa y lista comparten filtros.

- **Mapa:** Leaflet sobre OpenStreetMap con atribución; capa opcional de ortofoto del
  IGN. Un pin por casa con el precio ("385k"), coloreado por estado o por nota conjunta;
  agrupación de pines cercanos; tarjeta al tocar; capas de zonas, lugares importantes y
  descartadas; botón "mi ubicación".
- **Lista:** tarjetas con foto, precio, m², habitaciones, barrio, estado, las dos notas y
  marcas (bajada de precio, desacuerdo, faltan datos, visita). Ordenar por nota conjunta,
  mi nota, precio, €/m², m², fecha, minutos al metro, desacuerdo. Filtrar por estado,
  precio, m², habitaciones, zona, vía de entrada, extras, "sin valorar por mí". Vistas
  guardadas por persona. Comparar dos o tres casas lado a lado.

## 7. Lo que se añadió a la idea inicial

| Propuesta | Fase |
| --- | --- |
| Estados: Nueva, Interesa, Visita pedida, Visitada, Oferta, Comprada; Descartada o Retirada en cualquier momento | 1 |
| Duplicados: misma dirección con planta y puerta, o a menos de 30 m con m² y precio parecidos; la referencia catastral solo marca "mismo edificio" | 3 |
| Historial de precio con aviso si baja | 3 |
| Bandeja y Descartadas | 4 |
| Coste real y metro · Visitas con lista de comprobación y fotos · Contactos con la inmobiliaria · Notas de barrio · Exportar CSV | después |

## 8. Modelo de datos

Ver `docs/MODELO-DATOS.md`. Casi todo es del hogar; lo único personal son las
valoraciones y los códigos secretos. Una sola puerta para guardar casas (`save_property`),
como `save_expense` en GasTitos.

## 9. Fases

| Fase | Contenido | Tamaño | Hecho cuando |
| --- | --- | --- | --- |
| **0 · Esqueleto** ✅ 2026-10-17 | Repositorio copiado de GasTitos: login, hogar con código, PWA, workflows | S | Los dos entráis y estáis en el mismo hogar |
| **1 · Casas a mano, pegar texto, mapa y lista** ✅ 2026-10-17 | Alta manual con buscador de dirección, lector de texto pegado, ficha, estados, mapa con pines, lista con orden y filtros | L | Un anuncio pegado desde el móvil aparece en el mapa y la lista del otro |
| **2 · Valoraciones a dos** ✅ 2026-10-17 | Aspectos, estrellas y comentarios, nota conjunta, desacuerdos, a ciegas, veto, avisos | M | La nota conjunta cuadra y, a ciegas, no ves lo del otro hasta valorar tú |
| **3 · Criterios, zonas y enlaces** ✅ 2026-10-17 | Criterios y zonas con encaje y avisos, duplicados, historial de precio, atajo para compartir | M | Compartir un anuncio desde Idealista crea la casa y no se duplica |
| **4 · Correo automático** ✅ 2026-10-17 (construido; montar solo si hay volumen) | Gmail con Apps Script, lector, Bandeja y Descartadas, API de Idealista si la aprueban | L | Un correo real acaba en la Bandeja o en Descartadas con su motivo |
| **Después** ✅ 2026-10-17 (todo menos minutos al metro) | Coste total e hipoteca, metro, visitas, contactos, notas de barrio, comparador, CSV | a demanda | Una cosa cada vez |

Al acabar la fase 3 se decide, con un mes de uso real, si la 4 se hace y qué sale del
cajón. Una búsqueda de casa dura meses, no años: lo que no se use cada semana no merece
una sesión.

### Cambios respecto al plan al construirlo

- Sin PostGIS: `point_in_polygon` y `distance_m` propias (probables en local con PGlite).
- Minutos al metro con el CRTM queda pendiente; en su lugar, lugares importantes con
  distancia y enlace a Google Maps en transporte.
- El lector de "Pegar texto" es de reglas; Claude solo en la función de correo, opcional.
- Pruebas de base de datos y RLS en local (`npm run test:db`), con PGlite.

## 10. Decisiones

1. **Nombre:** Nidito (provisional; renombrar el repo cuesta un minuto). ✅ 2026-10-17
2. **Dónde vive en Supabase:** proyecto propio (ver `CONFIGURACION-MANUAL.md`, punto 1).
3. **Aspectos** (fase 2): ¿vale la lista de partida?
4. **Valoración a ciegas** (fase 2): ¿activada por defecto? Recomendado sí.
5. **Criterios iniciales** (fase 3): precio máximo, zonas, m², habitaciones e imprescindibles.
6. **Correo automático** (fase 4): tras un mes, ¿cuántos correos a la semana? Si merece la
   pena: lector con API de Claude o solo reglas, y cada uno su Gmail o una cuenta común.

Para hacer ya: pedir la clave de la API de Idealista (tarda y es probable que no la
den), guardar búsquedas con alerta por correo en los portales, contar durante un mes los
correos que recibís.

## Fuentes consultadas

- Idealista: [solicitud de acceso a la API](https://developers.idealista.com/access-request), [análisis de qué ofrece](https://www.realtyapi.io/blog/idealista-api)
- Supabase: [límites del plan gratuito en 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
- Google: [cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas?hl=en)
- Cloudflare: [Email Routing](https://developers.cloudflare.com/email-routing/postmaster/limitations/)
- Catastro: [servicios de datos no protegidos](https://datos.gob.es/gl/catalogo/e05250001-servicios-de-datos-catastrales-no-protegidos)
- CartoCiudad: [geocodificador](https://github.com/IDEESpain/Cartociudad)
- OpenStreetMap: [política de uso de teselas](https://operations.osmfoundation.org/policies/tiles/)
- CRTM: [licencia de datos abiertos](https://www.crtm.es/licencia-de-uso/)
- ITP en Madrid: [tipos y bonificaciones 2026](https://guiafiscal.es/patrimonio/itp/madrid/) (verificar en fuente oficial)
