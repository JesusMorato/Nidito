// Prueba las migraciones y las reglas de seguridad (RLS) en un Postgres de mentira
// que corre dentro de Node (PGlite), sin tocar Supabase.
//
//   npm run test:db
//
// Qué hace: imita lo mínimo de Supabase (esquema auth, auth.uid(), roles anon y
// authenticated), aplica supabase/migrations/*.sql en orden y ejecuta escenarios
// con dos usuarios: Ana y Luis. Si algo de RLS deja ver a uno lo del otro, falla aquí
// antes de llegar a producción. Los escenarios de cada fase están al final.
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
let fallos = 0
let ok = 0

async function sql(q, params) {
  return db.query(q, params)
}

function check(cond, msg) {
  if (cond) {
    ok++
  } else {
    fallos++
    console.error(`  ✗ ${msg}`)
  }
}

async function expectError(fn, pattern, msg) {
  try {
    await fn()
    check(false, `${msg} (no dio error y debía)`)
  } catch (e) {
    check(pattern.test(e.message), `${msg}: error distinto → ${e.message}`)
  }
}

// ---------- imitación de Supabase ----------
const ANA = '11111111-1111-4111-8111-111111111111'
const LUIS = '22222222-2222-4222-8222-222222222222'
const OTRO = '33333333-3333-4333-8333-333333333333'

async function setup() {
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    insert into auth.users values ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'), ('${OTRO}', 'otro@example.com');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      -- La clave de servicio (la usan las funciones de Supabase): se salta RLS, como en Supabase.
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `)
}

/** Ejecuta fn como el usuario dado (o como anon si es null), con RLS activo. */
async function as(userId, fn) {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

/** Ejecuta fn como la clave de servicio (las funciones de Supabase), sin sesión. */
async function asService(fn) {
  await db.exec(`set role service_role; select set_config('request.jwt.claim.sub', '', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}

async function applyMigrations() {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8')
    try {
      await db.exec(text)
      // Idempotencia: la segunda vez tampoco debe fallar.
      await db.exec(text)
      console.log(`  ✓ ${f}`)
    } catch (e) {
      console.error(`  ✗ ${f}: ${e.message}`)
      fallos++
      throw e
    }
  }
  // Las tablas creadas por las migraciones tienen que ser accesibles para los roles.
  await db.exec('grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role;')
}

// ---------- escenarios ----------
const ctx = {}

async function fase0() {
  console.log('Fase 0 · hogar de dos')
  // Sin sesión no se puede crear un hogar.
  await as(null, () => expectError(() => sql(`select create_household('Casa', 'Nadie')`), /sesión|permission|denied/i, 'anon no crea hogar'))

  ctx.hid = await as(ANA, async () => (await sql(`select create_household('Ana y Luis', 'Ana') as id`)).rows[0].id)
  check(!!ctx.hid, 'Ana crea el hogar')
  ctx.code = await as(ANA, async () => (await sql(`select invite_code from households`)).rows[0].invite_code)
  check(typeof ctx.code === 'string' && ctx.code.length === 8, 'Ana ve su código de invitación')

  await as(ANA, () => expectError(() => sql(`select create_household('Otro', 'Ana')`), /Ya perteneces/, 'Ana no puede crear un segundo hogar'))
  await as(LUIS, () => expectError(() => sql(`select join_household('MALO1234', 'Luis')`), /no válido/, 'código malo rechazado'))

  const joined = await as(LUIS, async () => (await sql(`select join_household($1, 'Luis') as id`, [ctx.code])).rows[0].id)
  check(joined === ctx.hid, 'Luis se une con el código')
  await as(OTRO, () => expectError(() => sql(`select join_household($1, 'Otro') as id`, [ctx.code]), /dos miembros/, 'un tercero no cabe'))

  const members = await as(LUIS, async () => (await sql(`select display_name from household_members order by joined_at`)).rows)
  check(members.length === 2 && members[0].display_name === 'Ana', 'Luis ve a los dos miembros')
  const otrosVe = await as(OTRO, async () => (await sql(`select count(*)::int as n from households`)).rows[0].n)
  check(otrosVe === 0, 'un extraño no ve el hogar')

  // Luis solo puede cambiar su propio nombre.
  await as(LUIS, () => sql(`update household_members set display_name = 'Luis M.' where user_id = $1`, [LUIS]))
  const sneaky = await as(LUIS, async () => (await sql(`update household_members set display_name = 'Pepa' where user_id = $1 returning 1`, [ANA])).rows.length)
  check(sneaky === 0, 'Luis no renombra a Ana')
}

async function fase1() {
  console.log('Fase 1 · casas')
  // Un extraño sin hogar no puede guardar casas.
  await as(OTRO, () => expectError(() => sql(`select save_property('{"title":"X"}'::jsonb)`), /ningún hogar/, 'sin hogar no se guarda'))
  await as(ANA, () => expectError(() => sql(`select save_property('{"title":"  "}'::jsonb)`), /título/, 'título obligatorio'))

  ctx.casa = await as(ANA, async () => (await sql(
    `select save_property($1::jsonb) as id`,
    [JSON.stringify({ title: 'Piso en Fuencarral', price: 385000, m2: 92, rooms: 3, baths: 2, lat: 40.49, lng: -3.69, extras: { ascensor: true }, exterior: true, source: 'pegado' })],
  )).rows[0].id)
  check(!!ctx.casa, 'Ana guarda una casa')

  const vista = await as(LUIS, async () => (await sql(`select title, price, extras->>'ascensor' as asc, exterior from properties`)).rows)
  check(vista.length === 1 && vista[0].price === 385000 && vista[0].asc === 'true' && vista[0].exterior === true, 'Luis ve la casa de Ana con sus datos')
  const ajeno = await as(OTRO, async () => (await sql(`select count(*)::int as n from properties`)).rows[0].n)
  check(ajeno === 0, 'un extraño no ve casas')

  // Insert directo prohibido: solo save_property.
  await as(LUIS, () => expectError(
    () => sql(`insert into properties (household_id, created_by, title) values ($1, $2, 'Colado')`, [ctx.hid, LUIS]),
    /policy|permission|denied/i, 'insert directo en properties rechazado'))

  // Luis edita (es del hogar) y baja el precio: queda en el historial.
  await as(LUIS, () => sql(`select save_property($1::jsonb)`, [JSON.stringify({ id: ctx.casa, title: 'Piso en Fuencarral', price: 370000, m2: 92, rooms: 3, baths: 2 })]))
  const hist = await as(ANA, async () => (await sql(`select price from price_history where property_id = $1 order by seen_at`, [ctx.casa])).rows.map((r) => r.price))
  check(hist.length === 2 && hist[0] === 385000 && hist[1] === 370000, 'el historial guarda los dos precios')
  // Mismo precio otra vez: no se repite.
  await as(LUIS, () => sql(`select save_property($1::jsonb)`, [JSON.stringify({ id: ctx.casa, title: 'Piso en Fuencarral', price: 370000 })]))
  const n = await as(ANA, async () => (await sql(`select count(*)::int as n from price_history where property_id = $1`, [ctx.casa])).rows[0].n)
  check(n === 2, 'un precio repetido no añade historial')

  // Estado.
  await as(LUIS, () => sql(`select set_property_status($1, 'interesa')`, [ctx.casa]))
  const st = await as(ANA, async () => (await sql(`select status from properties where id = $1`, [ctx.casa])).rows[0].status)
  check(st === 'interesa', 'cambiar el estado')
  await as(ANA, () => expectError(() => sql(`select set_property_status($1, 'inventado')`, [ctx.casa]), /check|violates/i, 'estado inválido rechazado'))

  // Un extraño no puede editar la casa aunque sepa el id.
  await as(OTRO, () => expectError(() => sql(`select save_property($1::jsonb)`, [JSON.stringify({ id: ctx.casa, title: 'Hackeada' })]), /hogar/, 'un extraño no edita'))

  // Fotos: Ana sube, Luis la ve, Luis puede borrarla; un extraño ni la ve.
  await as(ANA, () => sql(`insert into photos (household_id, property_id, path, created_by) values ($1, $2, $3, $4)`, [ctx.hid, ctx.casa, `${ctx.hid}/${ctx.casa}/a.jpg`, ANA]))
  const fotos = await as(LUIS, async () => (await sql(`select count(*)::int as n from photos`)).rows[0].n)
  check(fotos === 1, 'Luis ve la foto de Ana')
  await as(LUIS, () => expectError(
    () => sql(`insert into photos (household_id, property_id, path, created_by) values ($1, $2, 'x', $3)`, [ctx.hid, ctx.casa, ANA]),
    /policy|permission|denied/i, 'no se puede subir una foto a nombre de otro'))
}

async function fase2() {
  console.log('Fase 2 · valoraciones')
  const aspects = await as(ANA, async () => (await sql(`select id, name from rating_aspects order by sort_order`)).rows)
  check(aspects.length === 10 && aspects[0].name === 'Ubicación y barrio', 'el hogar tiene los 10 aspectos de serie')
  const luz = aspects.find((a) => a.name === 'Luz').id
  const estado = aspects.find((a) => a.name === 'Estado').id
  const ajenos = await as(OTRO, async () => (await sql(`select count(*)::int as n from rating_aspects`)).rows[0].n)
  check(ajenos === 0, 'un extraño no ve los aspectos')

  // Ana puntúa dos aspectos.
  await as(ANA, () => sql(`insert into ratings (property_id, user_id, aspect_id, stars, comment) values ($1, $2, $3, 5, 'Mucha luz'), ($1, $2, $4, 3, null)`, [ctx.casa, ANA, luz, estado]))
  // Luis no puede puntuar en nombre de Ana.
  await as(LUIS, () => expectError(() => sql(`insert into ratings (property_id, user_id, aspect_id, stars) values ($1, $2, $3, 1)`, [ctx.casa, ANA, luz]), /policy|permission|denied/i, 'Luis no puntúa como Ana'))

  // A ciegas (por defecto): Luis no ve las de Ana hasta puntuar.
  let ve = await as(LUIS, async () => (await sql(`select count(*)::int as n from ratings where user_id = $1`, [ANA])).rows[0].n)
  check(ve === 0, 'a ciegas: Luis no ve las estrellas de Ana')
  await as(LUIS, () => sql(`insert into ratings (property_id, user_id, aspect_id, stars) values ($1, $2, $3, 2)`, [ctx.casa, LUIS, luz]))
  ve = await as(LUIS, async () => (await sql(`select count(*)::int as n from ratings where user_id = $1`, [ANA])).rows[0].n)
  check(ve === 2, 'tras puntuar un aspecto, Luis ve las de Ana')
  const anaVe = await as(ANA, async () => (await sql(`select stars from ratings where user_id = $1`, [LUIS])).rows)
  check(anaVe.length === 1 && anaVe[0].stars === 2, 'Ana ve la de Luis')

  // Otra casa: Luis sigue a ciegas en esa.
  const casa2 = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Segunda casa', price: 200000 })])).rows[0].id)
  await as(ANA, () => sql(`insert into ratings (property_id, user_id, aspect_id, stars) values ($1, $2, $3, 4)`, [casa2, ANA, luz]))
  ve = await as(LUIS, async () => (await sql(`select count(*)::int as n from ratings where property_id = $1`, [casa2])).rows[0].n)
  check(ve === 0, 'la ceguera es por casa')
  // Apagar el modo a ciegas: se ve todo.
  await as(LUIS, () => sql(`update households set blind_rating = false`))
  ve = await as(LUIS, async () => (await sql(`select count(*)::int as n from ratings where property_id = $1`, [casa2])).rows[0].n)
  check(ve === 1, 'sin modo a ciegas, Luis ve todo')
  await as(LUIS, () => sql(`update households set blind_rating = true`))

  // Un extraño no ve nada aunque conozca los ids.
  const extr = await as(OTRO, async () => (await sql(`select count(*)::int as n from ratings`)).rows[0].n)
  check(extr === 0, 'un extraño no ve valoraciones')

  // Veto y comentarios.
  await as(LUIS, () => sql(`insert into property_reactions (property_id, user_id, veto, veto_reason) values ($1, $2, true, 'Demasiado lejos')`, [ctx.casa, LUIS]))
  const veto = await as(ANA, async () => (await sql(`select veto, veto_reason from property_reactions where property_id = $1 and user_id = $2`, [ctx.casa, LUIS])).rows[0])
  check(veto?.veto === true && veto.veto_reason === 'Demasiado lejos', 'Ana ve el veto de Luis')
  await as(ANA, () => expectError(() => sql(`update property_reactions set veto = false where user_id = $1 returning 1`, [LUIS]).then((r) => { if (r.rows.length === 0) throw new Error('policy: 0 filas') }), /policy/, 'Ana no quita el veto de Luis'))
  await as(ANA, () => sql(`insert into comments (property_id, user_id, body) values ($1, $2, '¿Vamos a verla el sábado?')`, [ctx.casa, ANA]))
  const coms = await as(LUIS, async () => (await sql(`select body from comments where property_id = $1`, [ctx.casa])).rows)
  check(coms.length === 1 && coms[0].body.includes('sábado'), 'Luis lee el comentario de Ana')
  await as(ANA, () => expectError(() => sql(`insert into comments (property_id, user_id, body) values ($1, $2, '   ')`, [ctx.casa, ANA]), /check|violates/i, 'comentario vacío rechazado'))

  // Avisos: cada uno solo ve sus aparatos.
  await as(ANA, () => sql(`insert into push_subscriptions (user_id, household_id, endpoint, p256dh, auth, aparato) values ($1, $2, 'https://push/a', 'k', 'a', 'iPhone')`, [ANA, ctx.hid]))
  const subs = await as(LUIS, async () => (await sql(`select count(*)::int as n from push_subscriptions`)).rows[0].n)
  check(subs === 0, 'Luis no ve los aparatos de Ana')
}

async function fase3() {
  console.log('Fase 3 · criterios, zonas, duplicados y enlaces')
  // Geometría
  const d = (await sql(`select distance_m(40.4168, -3.7038, 40.4966, -3.6915) as d`)).rows[0].d
  check(d > 8500 && d < 9500, 'distance_m: Sol → Fuencarral ≈ 9 km')
  const poly = JSON.stringify([[40.48, -3.72], [40.48, -3.66], [40.52, -3.66], [40.52, -3.72]])
  check((await sql(`select point_in_polygon(40.50, -3.69, $1::jsonb) as r`, [poly])).rows[0].r === true, 'point_in_polygon: dentro')
  check((await sql(`select point_in_polygon(40.42, -3.70, $1::jsonb) as r`, [poly])).rows[0].r === false, 'point_in_polygon: fuera')

  // Zona y criterios del hogar
  await as(ANA, () => sql(`insert into zones (household_id, name, polygon) values ($1, 'Fuencarral', $2::jsonb)`, [ctx.hid, poly]))
  await as(ANA, () => sql(`insert into criteria (household_id, max_price, min_m2, min_rooms, must, prefs) values ($1, 380000, 80, 3, '{"ascensor": true}', '{"terraza": 2}')`, [ctx.hid]))
  const zonasAjenas = await as(OTRO, async () => (await sql(`select count(*)::int as n from zones`)).rows[0].n)
  check(zonasAjenas === 0, 'un extraño no ve las zonas')

  // La casa de Ana vuelve a tener la ficha completa (la actualización parcial de la fase 1 la dejó sin metros ni ubicación).
  await as(ANA, () => sql(`select save_property($1::jsonb)`, [JSON.stringify({ id: ctx.casa, title: 'Piso en Fuencarral', price: 370000, m2: 92, rooms: 3, baths: 2, lat: 40.49, lng: -3.69, address: 'Calle de Alonso Cano 12', floor: '4', extras: { ascensor: true }, external_ref: 'idealista:1' })]))
  // La casa de Ana (370.000, 92 m², 3 hab, ascensor, en Fuencarral): cumple todo.
  const n = await as(LUIS, async () => (await sql(`select reapply_criteria() as n`)).rows[0].n)
  check(n >= 2, 'reapply_criteria recorre las casas del hogar')
  let c = await as(ANA, async () => (await sql(`select fit_score, fit_notes, in_zone, inbox from properties where id = $1`, [ctx.casa])).rows[0])
  check(c.in_zone === 'Fuencarral', 'la casa está en la zona')
  check(c.fit_notes.fail.length === 0 && c.fit_score >= 90, `cumple todos los criterios (score ${c.fit_score})`)
  check(c.inbox === 'aceptada', 'lo que metéis vosotros entra directo')

  // Una casa cara, pequeña y fuera de zona: solo avisa (manual), pero con los fallos apuntados.
  const cara = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Cara y lejos', price: 450000, m2: 60, rooms: 2, lat: 40.42, lng: -3.70, extras: { ascensor: false, terraza: true } })])).rows[0].id)
  c = await as(LUIS, async () => (await sql(`select fit_score, fit_notes, in_zone, inbox from properties where id = $1`, [cara])).rows[0])
  check(c.fit_notes.fail.length === 5 && c.fit_score === 0, `apunta los 5 fallos (${c.fit_notes.fail.join(' | ')})`)
  check(c.fit_notes.ok.includes('terraza'), 'la preferencia cuenta aunque falle lo demás')
  check(c.inbox === 'aceptada', 'a mano entra aunque incumpla')

  // Una casa automática (correo) que incumple va a Descartadas con el motivo; una que cumple, a la Bandeja.
  const correoMala = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Del correo, mala', price: 900000, source: 'correo' })])).rows[0].id)
  c = await as(ANA, async () => (await sql(`select inbox, discard_reason from properties where id = $1`, [correoMala])).rows[0])
  check(c.inbox === 'descartada' && /precio/.test(c.discard_reason), 'lo automático que incumple se descarta con motivo')
  const correoBuena = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Del correo, buena', price: 300000, m2: 90, rooms: 3, lat: 40.5, lng: -3.69, extras: { ascensor: true }, source: 'correo' })])).rows[0].id)
  c = await as(ANA, async () => (await sql(`select inbox from properties where id = $1`, [correoBuena])).rows[0])
  check(c.inbox === 'bandeja', 'lo automático que cumple va a la Bandeja')

  // Duplicados: misma dirección y planta; a menos de 30 m con m² y precio parecidos; misma referencia.
  const dup1 = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Otra inmobiliaria', price: 365000, m2: 90, lat: 40.49001, lng: -3.69001 })])).rows[0].id)
  const dup2 = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Misma dirección', address: 'calle de alonso cano 12', floor: '4' })])).rows[0].id)
  const dup3 = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Mismo bloque, otra planta', address: 'Calle de Alonso Cano 12', floor: '2' })])).rows[0].id)
  const found = await as(ANA, async () => (await sql(`select id from find_duplicates($1)`, [ctx.casa])).rows.map((r) => r.id))
  check(found.includes(dup1) && found.includes(dup2) && !found.includes(dup3), 'find_duplicates: cerca+parecida y misma dirección+planta sí; otra planta no')
  const foundOtro = await as(OTRO, async () => (await sql(`select count(*)::int as n from find_duplicates($1)`, [ctx.casa])).rows[0].n)
  check(foundOtro === 0, 'un extraño no busca duplicados en vuestro hogar')

  // Fusionar: la fusionada queda marcada, sus datos rellenan huecos y sus precios pasan.
  await as(ANA, () => sql(`insert into comments (property_id, user_id, body) values ($1, $2, 'Comentario en la duplicada')`, [dup1, ANA]))
  await as(ANA, () => sql(`select merge_properties($1, $2)`, [ctx.casa, dup1]))
  c = await as(LUIS, async () => (await sql(`select merged_into from properties where id = $1`, [dup1])).rows[0])
  check(c.merged_into === ctx.casa, 'la duplicada apunta a la que se queda')
  const coms = await as(LUIS, async () => (await sql(`select count(*)::int as n from comments where property_id = $1`, [ctx.casa])).rows[0].n)
  check(coms === 2, 'los comentarios pasan a la que se queda')
  const precios = await as(LUIS, async () => (await sql(`select count(*)::int as n from price_history where property_id = $1`, [ctx.casa])).rows[0].n)
  check(precios === 3, 'el historial de precio se junta')
  await as(OTRO, () => expectError(() => sql(`select merge_properties($1, $2)`, [ctx.casa, dup2]), /hogar/, 'un extraño no fusiona'))

  // Enlace compartido con código secreto.
  await as(LUIS, () => sql(`insert into ingest_tokens (user_id, household_id, token) values ($1, $2, 'tok-luis-1234567890')`, [LUIS, ctx.hid]))
  const anaVeToken = await as(ANA, async () => (await sql(`select count(*)::int as n from ingest_tokens`)).rows[0].n)
  check(anaVeToken === 0, 'Ana no ve el código de Luis')
  await as(null, () => expectError(() => sql(`select register_link('malo', 'https://x', 't', null)`), /no válido/, 'register_link con código malo'))
  const linkId = await as(null, async () => (await sql(`select register_link('tok-luis-1234567890', 'https://www.idealista.com/inmueble/777/', 'Piso en venta en calle Mayor, 3 hab', '299.000 € 3 hab 95 m2') as id`)).rows[0].id)
  c = await as(ANA, async () => (await sql(`select title, source, external_ref, price, created_by, inbox from properties where id = $1`, [linkId])).rows[0])
  check(c.source === 'enlace' && c.external_ref === 'idealista:777' && c.price === 299000 && c.created_by === LUIS && c.inbox === 'aceptada', 'el enlace crea la casa a nombre de Luis con referencia y precio')
  // El mismo enlace otra vez con otro precio: no duplica, apunta el precio.
  const again = await as(null, async () => (await sql(`select register_link('tok-luis-1234567890', 'https://www.idealista.com/inmueble/777/', 'x', 'ahora 289.000 €') as id`)).rows[0].id)
  check(again === linkId, 'el mismo enlace no se duplica')
  const hist = await as(ANA, async () => (await sql(`select price from price_history where property_id = $1 order by seen_at`, [linkId])).rows.map((r) => r.price))
  check(hist.length === 2 && hist[1] === 289000, 'la segunda llegada apunta la bajada')
  // Con sesión de otro hogar tampoco se puede usar el código ajeno para colarse: solo crea en el hogar del código.
  const hh = await as(OTRO, async () => (await sql(`select household_id from properties where id = $1`, [linkId])).rows)
  check(hh.length === 0, 'un extraño sigue sin ver la casa creada por enlace')
}

async function fase4() {
  console.log('Fase 4 · correo y Bandeja')
  // La función de Supabase llama a ingest_email con la clave de servicio.
  await asService(() => expectError(() => sql(`select ingest_email('malo', '{"message_id":"m1"}', '[]')`), /no válido/, 'ingest_email con código malo'))
  const r1 = (await asService(() => sql(`select ingest_email('tok-luis-1234567890', $1::jsonb, $2::jsonb) as r`, [
    JSON.stringify({ message_id: 'msg-1', from: 'alertas@idealista.com', subject: 'Nuevas casas', body: 'texto' }),
    JSON.stringify([
      { title: 'Piso en Fuencarral, 3 hab', price: 350000, m2: 95, rooms: 3, lat: 40.5, lng: -3.69, extras: { ascensor: true }, url: 'https://www.idealista.com/inmueble/5001/' },
      { title: 'Piso caro', price: 700000, m2: 95, rooms: 3, lat: 40.5, lng: -3.69, extras: { ascensor: true } },
    ]),
  ]))).rows[0].r
  check(r1.estado === 'done' && r1.casas.length === 2, 'un correo con dos casas crea dos fichas')
  const bandeja = await as(ANA, async () => (await sql(`select title, inbox, source from properties where id = any($1::uuid[]) order by title`, [r1.casas])).rows)
  check(bandeja.find((p) => p.title === 'Piso caro').inbox === 'descartada', 'la que incumple cae en Descartadas')
  check(bandeja.find((p) => p.title !== 'Piso caro').inbox === 'bandeja' && bandeja[0].source === 'correo', 'la que cumple cae en la Bandeja')
  // El mismo correo otra vez no repite.
  const r2 = (await asService(() => sql(`select ingest_email('tok-luis-1234567890', $1::jsonb, $2::jsonb) as r`, [JSON.stringify({ message_id: 'msg-1' }), '[]']))).rows[0].r
  check(r2.estado === 'repetido', 'un correo repetido no crea nada')
  // Un correo sin casas queda como ignorado.
  const r3 = (await asService(() => sql(`select ingest_email('tok-luis-1234567890', $1::jsonb, '[]'::jsonb) as r`, [JSON.stringify({ message_id: 'msg-2', subject: 'Hola' })]))).rows[0].r
  check(r3.estado === 'ignored', 'un correo sin casas se apunta como ignorado')
  const correos = await as(ANA, async () => (await sql(`select status from inbound_messages order by created_at`)).rows.map((r) => r.status))
  check(correos.join(',') === 'done,ignored', 'los dos ven los correos recibidos')
  const ajenos = await as(OTRO, async () => (await sql(`select count(*)::int as n from inbound_messages`)).rows[0].n)
  check(ajenos === 0, 'un extraño no ve vuestros correos')
  // Desde la app no se puede llamar a ingest_email.
  await as(ANA, () => expectError(() => sql(`select ingest_email('tok-luis-1234567890', '{"message_id":"m9"}', '[]')`), /permission|denied/i, 'la app no puede llamar a ingest_email'))

  // Aceptar y rescatar.
  const enBandeja = bandeja.find((p) => p.inbox === 'bandeja')
  const idB = (await sql(`select id from properties where title = $1`, [enBandeja.title])).rows[0].id
  await as(ANA, () => sql(`select set_inbox($1, 'aceptada')`, [idB]))
  check((await sql(`select inbox from properties where id = $1`, [idB])).rows[0].inbox === 'aceptada', 'aceptar desde la Bandeja')
  const idD = (await sql(`select id from properties where title = 'Piso caro'`)).rows[0].id
  await as(LUIS, () => sql(`select set_inbox($1, 'aceptada')`, [idD]))
  const resc = (await sql(`select inbox, discard_reason from properties where id = $1`, [idD])).rows[0]
  check(resc.inbox === 'aceptada' && resc.discard_reason === null, 'rescatar una descartada limpia el motivo')
  await as(OTRO, () => sql(`select set_inbox($1, 'descartada', 'hack')`, [idB]))
  check((await sql(`select inbox from properties where id = $1`, [idB])).rows[0].inbox === 'aceptada', 'un extraño no cambia la bandeja')
}

async function despues() {
  console.log('Después · lugares, visitas, contactos, notas de barrio, finanzas')
  await as(ANA, () => sql(`update households set finance = '{"rent": 934, "down_pct": 20}'`))
  const fin = await as(LUIS, async () => (await sql(`select finance from households`)).rows[0].finance)
  check(fin.rent === 934, 'los datos de finanzas son del hogar')

  await as(ANA, () => sql(`insert into places (household_id, name, lat, lng) values ($1, 'Trabajo Ana', 40.42, -3.70)`, [ctx.hid]))
  check((await as(LUIS, async () => (await sql(`select count(*)::int as n from places`)).rows[0].n)) === 1, 'Luis ve el lugar de Ana')
  check((await as(OTRO, async () => (await sql(`select count(*)::int as n from places`)).rows[0].n)) === 0, 'un extraño no ve lugares')

  await as(ANA, () => sql(`insert into visits (household_id, property_id, created_by, scheduled_at, checklist) values ($1, $2, $3, now() + interval '2 days', '{"humedades": true}')`, [ctx.hid, ctx.casa, ANA]))
  await as(LUIS, () => sql(`update visits set done = true, notes = 'Bien de luz'`))
  const v = await as(ANA, async () => (await sql(`select done, notes from visits where property_id = $1`, [ctx.casa])).rows[0])
  check(v.done === true && v.notes === 'Bien de luz', 'los dos editan la visita')
  await as(LUIS, () => expectError(() => sql(`insert into visits (household_id, property_id, created_by) values ($1, $2, $3)`, [ctx.hid, ctx.casa, ANA]), /policy|permission|denied/i, 'no se crea una visita a nombre de otro'))

  await as(LUIS, () => sql(`insert into contact_log (household_id, property_id, user_id, kind, note, next_step) values ($1, $2, $3, 'llamada', 'Hablé con Marta', 'Visita el sábado')`, [ctx.hid, ctx.casa, LUIS]))
  const cl = await as(ANA, async () => (await sql(`select note from contact_log where property_id = $1`, [ctx.casa])).rows)
  check(cl.length === 1 && cl[0].note === 'Hablé con Marta', 'Ana ve el contacto de Luis')
  const borrado = await as(ANA, async () => (await sql(`delete from contact_log where user_id = $1 returning 1`, [LUIS])).rows.length)
  check(borrado === 0, 'Ana no borra el contacto de Luis')

  const zona = (await sql(`select id from zones limit 1`)).rows[0].id
  await as(ANA, () => sql(`insert into zone_notes (zone_id, user_id, body) values ($1, $2, 'De noche hay mucho ruido en la calle principal')`, [zona, ANA]))
  const zn = await as(LUIS, async () => (await sql(`select count(*)::int as n from zone_notes`)).rows[0].n)
  check(zn === 1, 'Luis ve la nota de barrio')
  check((await as(OTRO, async () => (await sql(`select count(*)::int as n from zone_notes`)).rows[0].n)) === 0, 'un extraño no ve notas de barrio')
}

async function revision() {
  console.log('Revisión · 0007 y escenarios de seguridad que faltaban')
  const TOK = 'tok-luis-1234567890'

  // --- 1 · extras a null = sin dato, no "no lo tiene" ---
  const r = (await asService(() => sql(`select ingest_email($1, $2::jsonb, $3::jsonb) as r`, [TOK,
    JSON.stringify({ message_id: 'rev-null' }),
    JSON.stringify([{ title: 'Del correo con nulls', price: 300000, m2: 90, rooms: 3, lat: 40.5, lng: -3.69, extras: { ascensor: null, terraza: null } }]),
  ]))).rows[0].r
  let c = await as(ANA, async () => (await sql(`select inbox, fit_notes from properties where id = $1`, [r.casas[0]])).rows[0])
  check(c.inbox === 'bandeja' && c.fit_notes.missing.includes('ascensor') && c.fit_notes.fail.length === 0, 'extras a null: va a la Bandeja como "falta dato", no a Descartadas')
  const casaStr = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Extras raros', price: 300000, extras: { ascensor: 'sí', terraza: 'true' } })])).rows[0].id)
  c = await as(ANA, async () => (await sql(`select fit_notes from properties where id = $1`, [casaStr])).rows[0])
  check(c.fit_notes.missing.includes('ascensor') && !c.fit_notes.ok.includes('terraza'), 'extras que no son booleanos no cuentan ni a favor ni en contra')

  // --- 2 · clean_url ---
  const urls = (await sql(`select clean_url('javascript:alert(1)') as a, clean_url('www.idealista.com/inmueble/1/') as b, clean_url(' https://x.es/p ') as c, clean_url('') as d`)).rows[0]
  check(urls.a === null && urls.b === 'https://www.idealista.com/inmueble/1/' && urls.c === 'https://x.es/p' && urls.d === null, 'clean_url: solo http(s), completa dominios, descarta lo raro')
  const conJs = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Con enlace raro', url: 'javascript:alert(1)' })])).rows[0].id)
  check((await sql(`select url from properties where id = $1`, [conJs])).rows[0].url === null, 'save_property no guarda enlaces que no sean http(s)')

  // --- 3 · ingest_token_valid ---
  const tv = await asService(async () => [(await sql(`select ingest_token_valid($1) as v`, [TOK])).rows[0].v, (await sql(`select ingest_token_valid('malo') as v`)).rows[0].v])
  check(tv[0] === true && tv[1] === false, 'la clave de servicio comprueba códigos (ingest_token_valid)')
  await as(ANA, () => expectError(() => sql(`select ingest_token_valid($1)`, [TOK]), /permission|denied/i, 'la app no puede comprobar códigos'))
  await as(null, () => expectError(() => sql(`select ingest_token_valid($1)`, [TOK]), /permission|denied/i, 'anon no puede comprobar códigos'))

  // --- 4 · ingest_email endurecida ---
  const antes = (await sql(`select title, price, status from properties where id = $1`, [ctx.casa])).rows[0]
  const inj = (await asService(() => sql(`select ingest_email($1, $2::jsonb, $3::jsonb) as r`, [TOK,
    JSON.stringify({ message_id: 'rev-inj' }),
    JSON.stringify([{ id: ctx.casa, title: 'Inyectado', status: 'descartada', inbox: 'aceptada', source: 'manual', price: 1 }]),
  ]))).rows[0].r
  const despuesInj = (await sql(`select title, price, status from properties where id = $1`, [ctx.casa])).rows[0]
  check(JSON.stringify(antes) === JSON.stringify(despuesInj), 'un correo con "id" no toca la casa existente')
  const creada = (await sql(`select inbox, source, status from properties where id = $1`, [inj.casas[0]])).rows[0]
  check(inj.casas.length === 1 && creada.source === 'correo' && creada.status === 'nueva' && creada.inbox === 'bandeja', 'crea una casa nueva del correo e ignora status/inbox/source del correo')
  const mixto = (await asService(() => sql(`select ingest_email($1, $2::jsonb, $3::jsonb) as r`, [TOK,
    JSON.stringify({ message_id: 'rev-mixto', received_at: 'fecha rara' }),
    JSON.stringify([{ title: 'Buena', price: 300000, m2: 90, rooms: 3, lat: 40.5, lng: -3.69, extras: { ascensor: true } }, { title: 'Mala', type: 'casa', price: 385000.5 }, 'basura']),
  ]))).rows[0].r
  check(mixto.estado === 'done' && mixto.casas.length === 1 && mixto.errores.length === 1, 'una ficha inválida no tira las demás')
  let msg = (await sql(`select status, detail, received_at from inbound_messages where message_id = 'rev-mixto'`)).rows[0]
  check(msg && msg.status === 'done' && /1 de 2 con error/.test(msg.detail) && msg.received_at instanceof Date, 'el correo queda apuntado con el detalle del error y fecha válida')
  const todoMal = (await asService(() => sql(`select ingest_email($1, $2::jsonb, $3::jsonb) as r`, [TOK, JSON.stringify({ message_id: 'rev-mal' }), JSON.stringify([{ title: 'Mala', type: 'casa' }])]))).rows[0].r
  msg = (await sql(`select status from inbound_messages where message_id = 'rev-mal'`)).rows[0]
  check(todoMal.estado === 'error' && msg?.status === 'error', 'si todas fallan, el correo queda como error (y queda rastro)')

  // --- 5 · register_link: el precio no es la cuota ---
  const link = await as(null, async () => (await sql(`select register_link($1, 'https://www.fotocasa.es/vivienda/9/', 'Piso 385.000 €', 'Hipoteca desde 1.200 €/mes. Precio 385.000 € · 950 € al mes') as id`, [TOK])).rows[0].id)
  check((await sql(`select price from properties where id = $1`, [link])).rows[0].price === 385000, 'register_link coge el precio, no la cuota de hipoteca')
  await as(null, () => expectError(() => sql(`select register_link($1, 'javascript:x', 't', null)`, [TOK]), /Falta el enlace/, 'register_link rechaza enlaces que no sean http(s)'))

  // --- 6 · merge_properties: visitas y contactos; sin cadenas ---
  const dupV = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Con visita' })])).rows[0].id)
  await as(LUIS, () => sql(`insert into visits (household_id, property_id, created_by) values ($1, $2, $3)`, [ctx.hid, dupV, LUIS]))
  await as(LUIS, () => sql(`insert into contact_log (household_id, property_id, user_id, kind) values ($1, $2, $3, 'llamada')`, [ctx.hid, dupV, LUIS]))
  await as(LUIS, () => sql(`select merge_properties($1, $2)`, [ctx.casa, dupV]))
  const huerfanas = (await sql(`select (select count(*) from visits where property_id = $1) + (select count(*) from contact_log where property_id = $1) as n`, [dupV])).rows[0].n
  check(Number(huerfanas) === 0, 'al fusionar, visitas y contactos pasan a la que se queda')
  const otra = await as(LUIS, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Otra más' })])).rows[0].id)
  await as(LUIS, () => expectError(() => sql(`select merge_properties($1, $2)`, [dupV, otra]), /ya está fusionada/, 'no se fusiona dentro de una casa ya fusionada'))

  // --- 7 · join_household ---
  await as(OTRO, () => expectError(() => sql(`select join_household($1, '  ')`, [ctx.code]), /nombre|dos miembros/, 'join_household sin nombre o con hogar lleno falla'))

  // --- 8 · UPDATE no puede apuntar a casas de otro hogar ---
  // Un segundo hogar con su casa, para tener una "casa ajena".
  const hid2 = await as(OTRO, async () => (await sql(`select create_household('Otro hogar', 'Otro') as id`)).rows[0].id)
  const ajena = await as(OTRO, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Casa ajena', price: 100000 })])).rows[0].id)
  check(!!hid2 && !!ajena, 'un segundo hogar guarda su casa')
  await as(ANA, () => expectError(() => sql(`update visits set property_id = $1 where property_id = $2`, [ajena, ctx.casa]), /policy|permission|denied/i, 'una visita no se puede apuntar a una casa ajena'))
  await as(LUIS, () => expectError(() => sql(`update property_reactions set property_id = $1 where user_id = $2`, [ajena, LUIS]), /policy|permission|denied/i, 'una reacción no se puede apuntar a una casa ajena'))
  await as(LUIS, () => expectError(() => sql(`update contact_log set property_id = $1 where user_id = $2`, [ajena, LUIS]), /policy|permission|denied/i, 'un contacto no se puede apuntar a una casa ajena'))
  await as(ANA, () => expectError(() => sql(`select merge_properties($1, $2)`, [ctx.casa, ajena]), /hogar/, 'un miembro no fusiona una casa ajena con la suya'))
  await as(OTRO, () => sql(`select set_property_status($1, 'descartada')`, [ctx.casa]))
  check((await sql(`select status from properties where id = $1`, [ctx.casa])).rows[0].status !== 'descartada', 'un extraño no cambia el estado de vuestra casa')
  const veOtro = await as(OTRO, async () => (await sql(`select count(*)::int as n from properties`)).rows[0].n)
  check(veOtro === 1, 'el otro hogar solo ve su casa')

  // --- 9 · funciones internas y escrituras directas ---
  await as(ANA, () => expectError(() => sql(`select _save_property($1, $2, '{"title":"x"}')`, [ctx.hid, ANA]), /permission|denied/i, 'la app no llama a _save_property'))
  await as(ANA, () => expectError(() => sql(`select apply_criteria($1)`, [ctx.casa]), /permission|denied/i, 'la app no llama a apply_criteria'))
  await as(ANA, () => expectError(() => sql(`update properties set price = 1 where id = $1 returning 1`, [ctx.casa]).then((q) => { if (q.rows.length === 0) throw new Error('policy: 0 filas') }), /policy|permission|denied/i, 'update directo en properties rechazado'))
  await as(ANA, () => expectError(() => sql(`insert into price_history (property_id, price, source) values ($1, 1, 'x')`, [ctx.casa]), /policy|permission|denied/i, 'insert directo en price_history rechazado'))
  await as(ANA, () => expectError(() => sql(`insert into inbound_messages (household_id, user_id, message_id) values ($1, $2, 'x')`, [ctx.hid, ANA]), /policy|permission|denied/i, 'insert directo en inbound_messages rechazado'))
  await as(ANA, () => expectError(() => sql(`insert into household_members (household_id, user_id, display_name) values ($1, $2, 'Colado')`, [hid2, ANA]), /policy|permission|denied|dos miembros|Ya perteneces/i, 'nadie se mete en un hogar por insert directo'))
  // Las valoraciones del otro no se tocan.
  const tocadas = await as(LUIS, async () => (await sql(`update ratings set stars = 1 where user_id = $1 returning 1`, [ANA])).rows.length)
  const borradas = await as(LUIS, async () => (await sql(`delete from ratings where user_id = $1 returning 1`, [ANA])).rows.length)
  check(tocadas === 0 && borradas === 0, 'Luis no modifica ni borra las valoraciones de Ana')
  // A ciegas también esconde el comentario de la estrella (va en la misma fila).
  const casaCiega = await as(ANA, async () => (await sql(`select save_property($1::jsonb) as id`, [JSON.stringify({ title: 'Ciega' })])).rows[0].id)
  const luz = (await sql(`select id from rating_aspects where name = 'Luz' and household_id = $1`, [ctx.hid])).rows[0].id
  await as(ANA, () => sql(`insert into ratings (property_id, user_id, aspect_id, stars, comment) values ($1, $2, $3, 5, 'secreto')`, [casaCiega, ANA, luz]))
  const filtrado = await as(LUIS, async () => (await sql(`select count(*)::int as n from ratings where property_id = $1 and comment = 'secreto'`, [casaCiega])).rows[0].n)
  check(filtrado === 0, 'a ciegas tampoco se ve el comentario de la estrella')
}

// ---------- ejecución ----------
try {
  await setup()
  console.log('Migraciones')
  await applyMigrations()
  await fase0()
  await fase1()
  await fase2()
  await fase3()
  await fase4()
  await despues()
  await revision()
} catch (e) {
  console.error(e)
  fallos++
}

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`)
await db.close()
process.exit(fallos ? 1 : 0)
