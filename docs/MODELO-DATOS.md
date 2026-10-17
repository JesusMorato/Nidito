# Modelo de datos

Todas las tablas tienen RLS activado. "Hogar" significa: lo ven y lo editan las dos
personas del hogar. La función `current_household_id()` devuelve el hogar del usuario
que hace la petición y es la base de todas las políticas.

## Fase 0 (en `0001_init.sql`)

| Tabla | Qué guarda | Quién ve · quién edita |
| --- | --- | --- |
| `schema_migrations` | Migraciones aplicadas | Nadie desde la app (solo el workflow) |
| `households` | Nombre y código de invitación de la pareja | Hogar · hogar |
| `household_members` | Quién pertenece al hogar y con qué nombre; máximo 2 (trigger) | Hogar · cada uno su propio nombre |

Alta: `create_household(nombre, mi_nombre)` y `join_household(codigo, mi_nombre)`,
funciones `security definer` que son la única forma de insertar en `household_members`.

## Fases siguientes (previstas en `docs/PLAN.md`)

- **Fase 1:** `properties` (ficha, `location` como punto, `source`, `status`), `photos`
  (Supabase Storage; reducidas en el cliente a 1.600 px), `price_history`. Función
  `save_property` como única puerta de entrada.
- **Fase 2:** `rating_aspects` (del hogar), `ratings` (estrellas 1–5 y comentario por casa,
  persona y aspecto; en modo a ciegas la política RLS esconde las del otro hasta que
  yo he puntuado al menos un aspecto), `property_reactions` (veto), `comments`,
  `push_subscriptions`.
- **Fase 3:** `criteria`, `zones` (polígonos PostGIS), `ingest_tokens` (código secreto por
  persona para el atajo de iPhone).
- **Fase 4:** `inbound_messages` (correo recibido y su estado de lectura).
