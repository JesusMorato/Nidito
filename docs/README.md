# Nidito · estado del proyecto

## Estado

**Fase 0 · Esqueleto** (2026-10-17): hecha en código, pendiente de la puesta en marcha
manual (crear el proyecto de Supabase, rellenar `.env`, migración, secret, Pages, cuentas).

Lo que hay:

- Entrada con email y contraseña (y Google si se activa en Supabase), recuperar contraseña.
- Hogar de dos: crear hogar o unirse con código; el código se copia desde Ajustes.
- Pantallas Mapa y Lista vacías, con la ilustración del nido y el código de invitación
  mientras falte la pareja. El botón ➕ avisa de que el alta llega en la fase 1.
- Ajustes: tu nombre, nombre del hogar, pareja o código, cerrar sesión.
- PWA instalable con icono propio (la casita en el nido) y modo sin conexión para la app.
- Si `.env` está vacío, la app enseña una pantalla que explica qué falta, en vez de
  quedarse en blanco.
- Workflows: deploy a GitHub Pages, migraciones automáticas, keepalive de Supabase.
- Tests: `format.spec.ts` y `authError.spec.ts`.

## Decisiones tomadas

- 2026-10-17: nombre provisional **Nidito**. Navegación inferior Mapa · ➕ · Lista (la
  Bandeja de la fase 4 irá como acceso dentro de la Lista, no como pestaña).
- 2026-10-17: tipografía de títulos Fraunces (serif), cuerpo Manrope; colores terracota
  (yo) y verde azulado (pareja) para distinguir las valoraciones.
- 2026-10-17: sin pesos por aspecto en la primera versión de las valoraciones.
- 2026-10-17: el correo automático (fase 4) solo se hace si, tras un mes, el volumen de
  correos lo justifica. "Pegar texto" es la vía de trabajo diaria desde la fase 1.

## Pendiente

- Dueño: `docs/CONFIGURACION-MANUAL.md` entero (Supabase, `.env`, migración, secret,
  Pages, cuentas) y la primera prueba a dos.
- Fase 1: tablas `properties`, `photos`, `price_history` y función `save_property`;
  formulario de alta con buscador de dirección (CartoCiudad) y pin; "Pegar texto";
  mapa Leaflet con pines de precio; lista con orden y filtros; estados.
