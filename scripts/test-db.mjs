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
    end $$;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
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
  await db.exec('grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to anon, authenticated;')
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

// ---------- ejecución ----------
try {
  await setup()
  console.log('Migraciones')
  await applyMigrations()
  await fase0()
  await fase1()
  await fase2()
} catch (e) {
  console.error(e)
  fallos++
}

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`)
await db.close()
process.exit(fallos ? 1 : 0)
