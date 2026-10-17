// ============================================================
// Nidito · ingest-email
// Recibe un correo (lo manda el Apps Script de Gmail de cada uno, con su código
// secreto), saca las casas que contiene y las guarda con ingest_email (SQL), que
// las pasa por los criterios: a la Bandeja o a Descartadas.
//
// Cómo se lee:
//   1. Alertas de portales (Idealista, Fotocasa, pisos.com, Habitaclia): formato fijo.
//      Se parte el texto por cada enlace de anuncio y cada trozo pasa por el lector de
//      reglas (parseListing.ts, el mismo que "Pegar texto" en la app).
//   2. Correos de inmobiliarias: si hay ANTHROPIC_API_KEY, un modelo pequeño de Claude
//      devuelve las fichas en JSON. Si no, el lector de reglas sobre el texto entero
//      (una sola ficha) y, si no encuentra ni precio ni metros, el correo se ignora.
//
// No lleva verify_jwt: el Apps Script no tiene sesión. El código secreto del cuerpo es
// lo que identifica a la persona; sin él, ingest_email falla y no se guarda nada.
// ============================================================
import { parseListing } from './parseListing.ts'
import type { PropertyInput } from './types.ts'

// Las variables se leen así para que el archivo también cargue en Vitest (Node), donde
// no existe Deno: ahí solo se prueban las funciones puras.
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void } | undefined
const env = (k: string) => (typeof Deno === 'undefined' ? '' : Deno.env.get(k) ?? '')
const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const ANTHROPIC_KEY = env('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = env('ANTHROPIC_MODEL') || 'claude-haiku-5-5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Incoming {
  token?: string
  message_id?: string
  from?: string
  subject?: string
  received_at?: string
  body_text?: string
  body_html?: string
}

// ---------- texto ----------
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

const PORTALS = /idealista|fotocasa|pisos\.com|habitaclia|yaencontre|kyero/i
const LISTING_URL = /https?:\/\/(?:www\.)?(?:idealista\.com\/(?:[a-z]{2}\/)?inmueble\/\d+|fotocasa\.es\/[^\s]*\/\d+|pisos\.com\/[^\s]*|habitaclia\.com\/[^\s]*)[^\s)>"]*/gi

/** Alertas de portales: un trozo de texto por cada enlace de anuncio. */
export function splitPortalAlert(text: string): Array<{ url: string; chunk: string }> {
  const matches = [...text.matchAll(LISTING_URL)]
  const seen = new Set<string>()
  const out: Array<{ url: string; chunk: string }> = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const url = m[0].replace(/[?#].*$/, '')
    if (seen.has(url)) continue
    seen.add(url)
    // El texto del anuncio suele ir ANTES de su enlace (título, precio, m²…): se coge
    // desde el enlace anterior hasta un poco después de este.
    const start = i === 0 ? Math.max(0, m.index! - 600) : matches[i - 1].index! + matches[i - 1][0].length
    const end = Math.min(text.length, m.index! + m[0].length + 80)
    out.push({ url, chunk: text.slice(start, end) })
  }
  return out
}

function hasData(p: PropertyInput): boolean {
  return p.price != null || p.m2 != null
}

// ---------- Claude para correos de inmobiliarias ----------
async function readWithClaude(text: string, subject: string): Promise<PropertyInput[] | null> {
  if (!ANTHROPIC_KEY) return null
  const prompt = `Eres el lector de correos de una app para buscar casa en Madrid. Del correo siguiente, extrae CADA vivienda en venta que se ofrezca y devuelve SOLO un JSON (sin texto alrededor) con esta forma:
{"casas":[{"title":"...","price":385000,"m2":92,"m2_useful":null,"rooms":3,"baths":2,"floor":"4","type":"piso|atico|bajo|duplex|estudio|chalet|otro","exterior":true,"address":"calle y número si aparece","neighborhood":"barrio o zona","extras":{"ascensor":true,"terraza":false,"garaje":null,"trastero":null,"piscina":null,"calefaccion":null,"aire":null,"orientacion":"sur","certificado":"E"},"community_fee":80,"ibi":420,"url":"https://...","external_ref":"referencia del anuncio","agency":"nombre de la inmobiliaria","contact":"teléfono o nombre"}]}
Reglas: null en lo que no aparezca; precios y metros como números; "title" corto y descriptivo; si el correo no ofrece ninguna vivienda concreta (saludo, cita, factura), devuelve {"casas":[]}.

Asunto: ${subject}

Correo:
${text.slice(0, 12000)}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const raw = (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []
  const parsed = JSON.parse(json) as { casas?: PropertyInput[] }
  return (parsed.casas ?? []).filter((c) => c && typeof c === 'object' && c.title).map((c) => ({ ...c, title: String(c.title).slice(0, 120) }))
}

// ---------- lectura ----------
export async function extractProperties(from: string, subject: string, text: string): Promise<{ properties: PropertyInput[]; how: string }> {
  const chunks = splitPortalAlert(text)
  if (PORTALS.test(from) || chunks.length >= 2) {
    const props = chunks
      .map(({ url, chunk }) => ({ ...parseListing(chunk), url, raw_text: chunk.trim() }))
      .map((p) => {
        const ideal = p.url?.match(/idealista\.com\/(?:[a-z]{2}\/)?inmueble\/(\d+)/)
        return ideal ? { ...p, external_ref: `idealista:${ideal[1]}` } : p
      })
      .filter(hasData)
    if (props.length) return { properties: props, how: 'alerta de portal' }
  }
  try {
    const viaClaude = await readWithClaude(text, subject)
    if (viaClaude) return { properties: viaClaude.map((c) => ({ ...c, raw_text: text.slice(0, 8000) })), how: 'modelo' }
  } catch (e) {
    console.error('Claude', (e as Error).message)
  }
  const one = parseListing(`${subject}\n${text}`)
  return { properties: hasData(one) ? [one] : [], how: 'reglas' }
}

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    const json = (cuerpo: unknown, status = 200) =>
      new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    try {
      const m = (await req.json().catch(() => ({}))) as Incoming
      if (!m.token || !m.message_id) return json({ error: 'Faltan token o message_id' }, 400)
      const text = (m.body_text && m.body_text.trim()) || (m.body_html ? htmlToText(m.body_html) : '')
      const from = m.from ?? ''
      const subject = m.subject ?? ''
      let properties: PropertyInput[] = []
      let how = ''
      let status = 'done'
      let detail: string | null = null
      try {
        const r = await extractProperties(from, subject, text)
        properties = r.properties
        how = r.how
        if (!properties.length) {
          status = 'ignored'
          detail = 'Sin casas reconocibles'
        } else {
          detail = `${properties.length} ${properties.length === 1 ? 'casa' : 'casas'} (${how})`
        }
      } catch (e) {
        status = 'error'
        detail = (e as Error).message
      }
      const result = await rpc('ingest_email', {
        p_token: m.token,
        p_message: { message_id: m.message_id, from, subject, received_at: m.received_at ?? null, body: text, status, detail },
        p_properties: properties,
      })
      return json({ estado: status, detalle: detail, resultado: result })
    } catch (e) {
      console.error((e as Error).message)
      return json({ error: (e as Error).message }, /no válido/.test((e as Error).message) ? 403 : 500)
    }
  })
}
