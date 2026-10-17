# Nidito · estado del proyecto

## Estado

**Todo el plan está construido en código (2026-10-17): fases 0 a 4 y el cajón "después".**
Pendiente de la puesta en marcha manual del dueño (`docs/CONFIGURACION-MANUAL.md`) y de la
primera prueba a dos. Nada se ha probado todavía contra un Supabase real: las reglas de
seguridad y las funciones SQL se prueban en local con PGlite (`npm run test:db`), y las
pantallas con un Supabase de mentira.

| Fase | Qué hay | Dónde |
| --- | --- | --- |
| 0 · Esqueleto | Entrada, hogar de dos con código, PWA con icono, sin conexión, workflows | `0001_init.sql`, `src/views/Login*`, `Onboarding*` |
| 1 · Casas, pegar texto, mapa y lista | Ficha completa, lector de texto pegado (reglas), buscador de direcciones (CartoCiudad) con pin, mapa Leaflet con pines de precio y agrupación, lista con buscador, orden y filtros compartidos, fotos reducidas, historial de precio, estados | `0002_casas.sql`, `lib/parseListing.ts`, `views/MapView`, `ListView`, `PropertyView`, `components/PropertyForm` |
| 2 · Valoraciones a dos | Aspectos del hogar (10 de serie), estrellas por aspecto, nota conjunta, desacuerdos, modo a ciegas garantizado por RLS, veto, comentarios, avisos Web Push | `0003_valoraciones.sql`, `lib/ratings.ts`, `components/RatingsPanel`, `functions/notify-partner` |
| 3 · Criterios, zonas, duplicados, enlaces | Imprescindibles y preferencias con nota de encaje 0–100, zonas dibujadas en el mapa, duplicados con fusión, atajo de iPhone con código secreto (`register_link`) | `0004_criterios.sql`, `components/CriteriaCard`, `FitCard`, `LinkShareCard`, `docs/ENLACES.md` |
| 4 · Correo automático | Función `ingest-email` (alertas de portales por reglas; inmobiliarias con Claude si hay clave), Apps Script de Gmail, Bandeja y Descartadas con rescate, correos recibidos | `0005_correo.sql`, `functions/ingest-email`, `scripts/apps-script/Code.gs`, `views/InboxView`, `docs/CORREO.md` |
| Después | Coste real (ITP, hipoteca, frente al alquiler), lugares importantes con distancia y enlace a transporte, visitas con lista de comprobación y .ics, contactos con la inmobiliaria, notas de barrio, comparador, exportar CSV | `0006_despues.sql`, `lib/cost.ts`, `lib/csv.ts`, `components/CostCard`, `VisitsCard`, `ContactsCard`, `ZoneNotes`, `views/CompareView` |

Pruebas: 84 tests de Vitest (`npm test`) sobre las librerías puras y el lector de correos, y
83 comprobaciones de base de datos y RLS con PGlite (`npm run test:db`), con dos usuarios
y un extraño.

## Decisiones tomadas

- 2026-10-17: nombre provisional **Nidito**. Navegación inferior Mapa · ➕ · Lista; la
  Bandeja es un acceso dentro de la Lista con bolita en la pestaña.
- 2026-10-17: tipografía de títulos Fraunces (serif), cuerpo Manrope; colores terracota
  (yo) y verde azulado (pareja) para distinguir las valoraciones.
- 2026-10-17: sin pesos por aspecto en la primera versión de las valoraciones.
- 2026-10-17: **sin PostGIS**: la comprobación "dentro de la zona" y las distancias se hacen
  con dos funciones SQL propias (`point_in_polygon`, `distance_m`), suficientes para una
  pareja y probables en local.
- 2026-10-17: el lector de "Pegar texto" es de reglas (sin coste, sin conexión); el modelo
  de Claude solo se usa en la función de correo si se configura `ANTHROPIC_API_KEY`.
- 2026-10-17: lo que entra solo pasa por la Bandeja; lo que metéis vosotros entra directo y
  los criterios solo avisan (nota de encaje).
- 2026-10-17: minutos al metro con datos del CRTM **no está hecho**: en su lugar, lugares
  importantes con distancia en línea recta y enlace a Google Maps en transporte.

## Pendiente

- Dueño: `docs/CONFIGURACION-MANUAL.md` entero (Supabase, `.env`, migraciones, secrets,
  Pages, cuentas, funciones, avisos) y la primera prueba a dos.
- Verificar los tipos del ITP y las bonificaciones en la web de la Comunidad de Madrid
  (están como valores editables en Ajustes → Hipoteca y gastos).
- Minutos andando al metro con las paradas del CRTM (hace falta descargar el archivo de
  paradas de datos.crtm.es y guardarlo en la app).
- Web Share Target para Android (compartir a la app instalada sin atajo).
- Cloudflare Email Routing como alternativa a Gmail (solo documentado).
- API de Idealista: pedida por el dueño si procede; el código no la usa todavía (si la
  dan, una búsqueda diaria en una función programada que llame a `ingest_email` con
  `source = 'idealista'`).
