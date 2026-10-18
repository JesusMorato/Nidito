# Nidito · guía para Claude Code

App web de una pareja (exactamente dos usuarios) para llevar las casas en venta que les
interesan: cada casa entra a mano, pegando el texto del anuncio o compartiendo un enlace
(más adelante, por correo), queda en un mapa y en una lista, y cada uno la puntúa por
aspectos con estrellas. El otro ve las estrellas y los comentarios.

El dueño del proyecto es principiante: explica los cambios en lenguaje sencillo y sin
jerga innecesaria. Una cosa cada vez.

Cuando pida un cambio, desarróllalo directamente: nada de mockups, capturas ni vistas
previas salvo que las pida expresamente. Al terminar, fusiona en `main` y haz push (eso
publica la web) salvo que diga lo contrario.

## Stack

- Frontend: Vue 3 + TypeScript + Vite. Router en modo hash. Sin Pinia (estado en
  composables `src/composables/`).
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions). Cliente en
  `src/supabase.ts`. Sin PostGIS: `point_in_polygon` y `distance_m` son funciones SQL
  propias (migración 0004).
- Mapa: Leaflet sobre OpenStreetMap (fase 1). Atribución visible siempre; las teselas
  no se guardan para uso sin conexión (lo prohíbe la política de OSM).
- Tests: Vitest (`npm test`). Los tests viven junto al código (`*.spec.ts`).
  Base de datos: `npm run test:db` aplica las migraciones en un Postgres de mentira
  (PGlite) e imita Supabase (auth.uid(), roles anon/authenticated) para probar RLS y
  funciones con dos usuarios y un extraño. TODA migración nueva añade sus escenarios en
  `scripts/test-db.mjs`.
- Publicación: GitHub Pages desde la rama `gh-pages`, base `/Nidito/`.
- Automatismos: `.github/workflows/` (deploy, migraciones, keepalive).

## Comandos

```
npm install        # primera vez
npm run dev        # servidor local
npm test           # tests
npm run build      # typecheck + build (lo mismo que hace el deploy)
npm run test:db    # migraciones + RLS en PGlite (sin tocar Supabase)
npm run icons      # regenera los iconos PNG y el favicon a partir del logo
```

En el portátil del trabajo (proxy corporativo) npm falla con `SELF_SIGNED_CERT_IN_CHAIN`.
Ejecuta los comandos con `NODE_USE_SYSTEM_CA=1` delante (o `$env:NODE_USE_SYSTEM_CA=1`
en PowerShell) para que Node confíe en los certificados de Windows. En GitHub Actions
no hace falta.

Antes de hacer push ejecuta `npm test` y `npm run build`: si falla aquí, fallará en
GitHub Actions.

## Convenciones

- Idioma de la interfaz, comentarios y commits: español.
- Nunca subir secretos. `.env` solo contiene la URL y la clave *pública* de Supabase.
  La contraseña de la base de datos vive únicamente en el secret `SUPABASE_DB_URL`
  de GitHub.
- Cambios de base de datos = nuevo archivo `supabase/migrations/NNNN_descripcion.sql`
  (numeración consecutiva, nunca editar uno ya aplicado). Deben ser idempotentes
  (`if not exists`, `drop policy if exists` …) y terminar con el `insert` en
  `schema_migrations` con su propio nombre.
- Toda tabla nueva lleva RLS activado y políticas explícitas. La privacidad se
  garantiza en la base de datos, no solo en la interfaz. Lo del hogar lo ven los dos;
  las valoraciones solo las edita su autor (y, en modo a ciegas, la base de datos
  esconde las del otro hasta que tú has puntuado).
- Las casas se crean y editan SIEMPRE con la función `save_property` (RPC), nunca con
  insert/update directos (no hay política que lo permita): es la única puerta, apunta el
  historial de precio y aplica los criterios. `_save_property` es la pieza interna que
  también usan `register_link` (atajo) e `ingest_email` (correo).
- Todo lo que llega de fuera (correo, atajo, lo que devuelve el modelo) es entrada NO
  confiable: se comprueba el código secreto antes de hacer nada, solo pasan campos
  conocidos y bien tipados (`sanitise` en `ingest-email`), y la base de datos ignora
  `id`/`status`/`inbox` de esas fichas. Los mensajes de error internos van al registro de
  la función, no a quien llama.
- `useData.ensureLoaded(hid, uid)` va por hogar Y usuario; `resetData()` vacía todo al
  cerrar sesión o cambiar de usuario (el modo a ciegas no se filtra por compartir móvil).
- El lector de texto (`src/lib/parseListing.ts`) tiene una COPIA en
  `supabase/functions/ingest-email/parseListing.ts`; un test comprueba que son idénticas.
  Si cambias uno, copia el otro.
- Los componentes reciben datos por props y emiten eventos; las llamadas a Supabase
  se concentran en `src/composables/useData.ts` y `useSession.ts`. Mapa y lista comparten
  filtros (`useFilters.ts`) y la lista visible (`useVisible.ts`).
- Diseño: tokens en `src/style.css`. Colores de persona: `--casa` (terracota, "yo")
  y `--pareja` (verde azulado). `.space-yo` / `.space-pareja` fijan `--accent`.
  Modales con `components/Sheet.vue`. Avisos breves con `useToast()`.
- Confirmaciones con `useConfirm()` (`if (await confirm({ message }))`), nunca `confirm()` del navegador.
- Sin conexión: `public/sw.js` (caché de la app) y `lib/offline.ts` (copia local de datos por usuario).
- Nada de emojis en la interfaz: iconos SVG de trazo 2 px en `src/lib/uiIcons.ts` y
  ilustraciones planas en `components/EmptyState.vue`. El logo es `components/Logo.vue`
  (la casita en el nido) y `scripts/make-icons.mjs` genera los PNG a partir del mismo dibujo.
- Formato de cifras y fechas en `src/lib/format.ts` (puro, testeado).

## Navegación

Barra inferior: **Mapa · ➕ · Lista**. Ajustes arriba a la derecha. Cuando llegue la
entrada automática (fase 4), la Bandeja de casas nuevas se añade como acceso en la Lista
con una bolita, no como pestaña nueva.

## Modelo de datos (resumen)

Ver `docs/MODELO-DATOS.md`. `households` + `household_members` (hogar de dos),
`properties` + `price_history` + `photos` (casas), `rating_aspects` + `ratings` +
`property_reactions` + `comments` (valoraciones; a ciegas por RLS), `criteria` + `zones`
(encaje), `ingest_tokens` (códigos secretos), `inbound_messages` (correo), `places`,
`visits`, `contact_log`, `zone_notes` (después), `push_subscriptions` (avisos).

## Funciones de Supabase

`notify-partner` (avisos Web Push, con sesión) e `ingest-email` (correo, sin sesión: el
código secreto del cuerpo identifica a la persona). Las publica `funciones.yml`.

## Documentación

- `docs/README.md` — estado del proyecto y decisiones tomadas.
- `docs/PLAN.md` — plan de producto: vías de entrada, criterios, ficha, valoraciones,
  vistas, modelo de datos, fases y decisiones.
- `docs/MODELO-DATOS.md` — tablas y reglas de visibilidad.
- `docs/CONFIGURACION-MANUAL.md` — pasos que solo puede hacer el dueño (Supabase,
  secrets, Pages, usuarios, funciones).
- `docs/AVISOS.md` — avisos en el móvil. `docs/ENLACES.md` — atajo de iPhone.
  `docs/CORREO.md` — correo automático con Apps Script.

Al terminar una sesión con cambios relevantes, actualiza `docs/README.md`
(sección "Estado" y "Pendiente").
