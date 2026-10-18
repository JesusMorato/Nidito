# Modelo de datos

Todas las tablas tienen RLS activado. "Hogar" significa: lo ven y lo editan las dos
personas del hogar. La función `current_household_id()` devuelve el hogar del usuario
que hace la petición y es la base de todas las políticas. Cada migración es idempotente y
se puede volver a ejecutar.

| Tabla | Migración | Qué guarda | Quién ve · quién edita |
| --- | --- | --- | --- |
| `schema_migrations` | 0001 | Migraciones aplicadas | Nadie desde la app |
| `households` | 0001, 0003, 0006 | Nombre, código de invitación, `blind_rating` (a ciegas), `finance` (coste real) | Hogar · hogar |
| `household_members` | 0001 | Quién pertenece al hogar y con qué nombre; máximo 2 (trigger) | Hogar · cada uno su nombre |
| `properties` | 0002, 0004 | La ficha de la casa (ver abajo), `status`, `inbox`, `fit_score`, `fit_notes`, `in_zone`, `merged_into` | Hogar · solo con `save_property` (sin política de insert/update); borrar sí |
| `price_history` | 0002 | Cada precio con el que llegó la casa | Hogar · solo las funciones |
| `photos` | 0002 | Ruta en el cubo privado `fotos` (`<hogar>/<casa>/…jpg`) | Hogar · cada uno sube las suyas; borra cualquiera del hogar |
| `rating_aspects` | 0003 | Aspectos del hogar, orden y activo (10 de serie por trigger) | Hogar · hogar |
| `ratings` | 0003 | Estrellas 1–5 y comentario por casa, persona y aspecto | Las mías; las del otro si no va a ciegas o si yo ya puntué un aspecto de esa casa · solo las mías |
| `property_reactions` | 0003 | Veto con motivo y comentario general, por persona | Hogar · la mía |
| `comments` | 0003 | Hilo por casa | Hogar · los míos (borrar) |
| `push_subscriptions` | 0003 | Aparatos con permiso para avisos | Los míos · los míos |
| `criteria` | 0004 | Una fila por hogar: imprescindibles, preferencias, tipos, exigir zona | Hogar · hogar |
| `zones` | 0004 | Polígonos `[[lat, lng], …]` con nombre y color | Hogar · hogar |
| `ingest_tokens` | 0004 | Código secreto por persona (atajo de iPhone y Apps Script) | El mío · el mío |
| `inbound_messages` | 0005 | Correos recibidos: remitente, asunto, texto, estado, casas creadas | Hogar · solo la función (borrar sí) |
| `places` | 0006 | Lugares importantes | Hogar · hogar |
| `visits` | 0006 | Visitas: fecha, hecha, lista de comprobación, notas | Hogar · hogar (se crea a nombre propio) |
| `contact_log` | 0006 | Llamadas y mensajes con la inmobiliaria, próximo paso | Hogar · el mío |
| `zone_notes` | 0006 | Notas de barrio por zona | Hogar · las mías (borrar) |

## La ficha (`properties`)

Lo que dice el anuncio: `title`, `address`, `neighborhood`, `lat`, `lng`, `price`, `m2`,
`m2_useful`, `rooms`, `baths`, `floor`, `type` (piso, atico, bajo, duplex, estudio, chalet,
otro), `exterior`, `extras` (jsonb: ascensor, terraza, garaje, trastero, piscina,
calefaccion, aire, orientacion, certificado, obra_nueva), `community_fee`, `ibi`, `notes`.

De dónde viene: `source` (manual, pegado, enlace, correo, idealista), `url`, `agency`,
`contact`, `external_ref` (p. ej. `idealista:104567890`), `raw_text`, `cadastral_ref`.

Lo vuestro: `status` (nueva, interesa, visita_pedida, visitada, oferta, comprada,
descartada, retirada), `inbox` (bandeja, aceptada, descartada; lo que metéis vosotros nace
aceptado), `discard_reason`, `fit_score` 0–100, `fit_notes` (`fail`, `ok`, `missing`),
`in_zone`, `merged_into`.

## Funciones

| Función | Quién la llama | Qué hace |
| --- | --- | --- |
| `create_household`, `join_household` | App (con sesión) | Alta del hogar |
| `save_property(p jsonb)` | App | Única puerta para crear o editar una casa: apunta el historial de precio y aplica los criterios. Llama a `_save_property`, que no tiene permisos para nadie |
| `set_property_status`, `set_inbox` | App | Cambiar estado o bandeja |
| `apply_criteria`, `reapply_criteria` | `save_property` / App | Nota de encaje, motivos y zona |
| `find_duplicates`, `merge_properties` | App | Posibles duplicados y fusión |
| `register_link(token, url, title, text)` | Atajo del iPhone (clave anon) | Crea la casa a nombre del dueño del código; si ya existía, apunta el precio |
| `ingest_email(token, message, properties)` | Función `ingest-email` (clave de servicio) | Guarda el correo (siempre, también si falla) y crea las casas con `source = correo`, una a una; ignora `id`, `status` e `inbox` de lo que traiga el correo |
| `ingest_token_valid(token)` | Función `ingest-email` (clave de servicio) | Comprueba el código secreto antes de leer el correo |
| `clean_url(text)` | `_save_property`, `register_link` | Solo enlaces http(s); completa `www.…`; lo demás, null |
| `point_in_polygon`, `distance_m` | SQL | Geometría sin PostGIS |
| `property_in_my_household`, `can_see_partner_ratings`, `zone_in_my_household` | Políticas RLS | Ayudas security definer para no recursar |

## Storage

Cubo privado `fotos`. Políticas en `storage.objects`: cada hogar solo toca la carpeta que
empieza por su `household_id`. La app pide URLs firmadas de una hora para enseñarlas.
