// ============================================================
// Nidito · notify-partner
// Avisa a la otra persona del hogar de que ha pasado algo con una casa: la han
// añadido, la han valorado, la han comentado o ha bajado de precio. La llama la
// propia app justo después de guardar.
//
// Quien llama va identificado por su sesión: Supabase comprueba el token antes de
// llegar aquí (verify_jwt) y la función lo vuelve a comprobar con Auth por si acaso,
// así que solo se puede avisar de casas del propio hogar.
//
// Con { prueba: true } no avisa a nadie más: se manda el aviso a los aparatos de
// quien llama y devuelve qué ha contestado el servicio de avisos.
//
// El envío es Web Push estándar, hecho a mano con WebCrypto (webpush.ts, probado
// con Vitest). Copiado de GasTitos.
// ============================================================
import { cabeceraVapid, cifrar } from './webpush.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

interface Config {
  publica: string
  privada: string
  sujeto: string
}

function config(): Config {
  return {
    publica: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privada: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    sujeto: Deno.env.get('VAPID_SUBJECT') ?? 'https://jesusmorato.github.io/Nidito/',
  }
}

function nombresVapid(): string[] {
  try {
    return Object.keys(Deno.env.toObject()).filter((k) => k.toUpperCase().includes('VAPID')).sort()
  } catch {
    return []
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Suscripcion {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  aparato: string
}

async function consultar<T>(ruta: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`consulta ${ruta}: ${res.status} ${await res.text()}`)
  return await res.json()
}

async function borrarSuscripcion(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}

function suscripcionesDe(userId: string) {
  return consultar<Suscripcion>(`push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth,aparato`)
}

interface Resultado {
  aparato: string
  servicio: string
  codigo: number
  detalle: string
}

async function enviar(s: Suscripcion, mensaje: string, cfg: Config): Promise<Resultado> {
  const servicio = new URL(s.endpoint).hostname
  try {
    const res = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
        Authorization: await cabeceraVapid({ endpoint: s.endpoint, clavePublica: cfg.publica, clavePrivada: cfg.privada, sujeto: cfg.sujeto }),
      },
      body: await cifrar(s.p256dh, s.auth, mensaje),
    })
    const detalle = res.ok ? '' : (await res.text()).slice(0, 300)
    if (!res.ok) console.error('push', servicio, res.status, detalle)
    if (res.status === 404 || res.status === 410) await borrarSuscripcion(s.id)
    return { aparato: s.aparato, servicio, codigo: res.status, detalle }
  } catch (e) {
    const detalle = (e as Error).message
    console.error('push', servicio, detalle)
    return { aparato: s.aparato, servicio, codigo: 0, detalle }
  }
}

/**
 * Quién llama, comprobado de verdad: se le pide a Supabase Auth que valide el token
 * (firma y caducidad). Así la función no depende solo del verify_jwt de la plataforma.
 */
async function usuarioDelToken(cabecera: string | null): Promise<string | null> {
  const token = (cabecera ?? '').replace(/^Bearer\s+/i, '').trim()
  if (token.split('.').length !== 3) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const u = (await res.json()) as { id?: unknown }
    return typeof u.id === 'string' && ES_UUID.test(u.id) ? u.id : null
  } catch {
    return null
  }
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

interface Casa {
  id: string
  household_id: string
  title: string
  price: number | null
}

type Kind = 'casa' | 'valoracion' | 'comentario' | 'precio'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const quien = await usuarioDelToken(req.headers.get('Authorization'))
    if (!quien) return json({ error: 'Sin sesión' }, 401)

    const peticion = (await req.json().catch(() => ({}))) as { kind?: unknown; property_id?: unknown; text?: unknown; old_price?: unknown; prueba?: unknown }
    const cfg = config()
    const claves = Boolean(cfg.publica && cfg.privada)

    // ---------- prueba: me aviso a mí mismo ----------
    if (peticion.prueba === true) {
      const mias = await suscripcionesDe(quien)
      const visto = nombresVapid()
      if (!claves || mias.length === 0) {
        return json({ estado: 'prueba', claves, sujeto: cfg.sujeto, aparatos: mias.length, secretos: visto, resultados: [] })
      }
      const mensaje = JSON.stringify({ titulo: 'Prueba de envío', cuerpo: 'Si ves esto, los avisos llegan bien.', etiqueta: 'nidito-prueba-envio', hash: '#/ajustes' })
      const resultados = []
      for (const s of mias) resultados.push(await enviar(s, mensaje, cfg))
      return json({ estado: 'prueba', claves, sujeto: cfg.sujeto, aparatos: mias.length, secretos: visto, resultados })
    }

    if (!claves) return json({ estado: 'sin-configurar' })

    const kind = peticion.kind as Kind
    const propertyId = peticion.property_id
    if (!['casa', 'valoracion', 'comentario', 'precio'].includes(kind) || typeof propertyId !== 'string' || !ES_UUID.test(propertyId)) {
      return json({ error: 'Faltan kind o property_id' }, 400)
    }

    // 1 · la casa
    const casas = await consultar<Casa>(`properties?id=eq.${propertyId}&select=id,household_id,title,price`)
    const casa = casas[0]
    if (!casa) return json({ error: 'Casa no encontrada' }, 404)

    // 2 · los dos miembros del hogar; quien llama tiene que ser uno de ellos
    const miembros = await consultar<{ user_id: string; display_name: string }>(
      `household_members?household_id=eq.${casa.household_id}&select=user_id,display_name`,
    )
    if (!miembros.some((m) => m.user_id === quien)) return json({ error: 'No es tu hogar' }, 403)
    const pareja = miembros.find((m) => m.user_id !== quien)
    if (!pareja) return json({ estado: 'sin-pareja' })
    const yo = miembros.find((m) => m.user_id === quien)?.display_name ?? 'Tu pareja'

    // 3 · el texto
    const precio = casa.price != null ? eur.format(Number(casa.price)) : 'sin precio'
    let titulo: string
    let cuerpo: string
    switch (kind) {
      case 'casa':
        titulo = 'Nueva casa'
        cuerpo = `${yo} ha añadido ${casa.title} (${precio}).`
        break
      case 'valoracion': {
        // A ciegas: no se revela la nota; solo que ya ha puntuado.
        const hogar = await consultar<{ blind_rating: boolean }>(`households?id=eq.${casa.household_id}&select=blind_rating`)
        const aCiegas = hogar[0]?.blind_rating !== false
        const suyas = await consultar<{ stars: number }>(`ratings?property_id=eq.${casa.id}&user_id=eq.${pareja.user_id}&select=stars`)
        const mias = await consultar<{ stars: number }>(`ratings?property_id=eq.${casa.id}&user_id=eq.${quien}&select=stars`)
        const media = mias.length ? (mias.reduce((a, r) => a + Number(r.stars), 0) / mias.length).toFixed(1).replace('.', ',') : null
        titulo = `${yo} ha valorado ${casa.title}`
        cuerpo = aCiegas && suyas.length === 0 ? 'Valora tú para ver sus estrellas.' : media ? `Le pone un ${media} de 5.` : 'Entra para ver sus estrellas.'
        break
      }
      case 'comentario':
        titulo = `${yo} sobre ${casa.title}`
        cuerpo = typeof peticion.text === 'string' && peticion.text.trim() ? peticion.text.trim().slice(0, 140) : 'Ha dejado un comentario.'
        break
      case 'precio': {
        const antes = typeof peticion.old_price === 'number' ? eur.format(peticion.old_price) : null
        titulo = 'Bajada de precio'
        cuerpo = antes ? `${casa.title}: de ${antes} a ${precio}.` : `${casa.title} ahora cuesta ${precio}.`
        break
      }
    }

    // 4 · a todos los aparatos de la pareja
    const suscripciones = await suscripcionesDe(pareja.user_id)
    if (suscripciones.length === 0) return json({ estado: 'pareja-sin-avisos' })

    const mensaje = JSON.stringify({ titulo, cuerpo, etiqueta: `${kind}-${casa.id}`, hash: `#/casa/${casa.id}` })
    const resultados = []
    for (const s of suscripciones) resultados.push(await enviar(s, mensaje, cfg))

    return json({ estado: 'ok', enviados: resultados.filter((r) => r.codigo >= 200 && r.codigo < 300).length, resultados })
  } catch (e) {
    // El detalle (rutas internas, texto de Postgres) va al registro, no al que llama.
    console.error((e as Error).message)
    return json({ error: 'Error interno' }, 500)
  }
})
