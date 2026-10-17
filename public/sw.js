// Service worker de Nidito: permite abrir la app sin conexión.
//  - La página (index.html) se pide a la red y, si no hay, se sirve la última copia.
//  - Los archivos de /assets/ llevan un hash en el nombre (no cambian nunca), así que
//    se sirven de la caché y solo se descargan la primera vez.
//  - Las fuentes de Google se sirven de caché y se renuevan por detrás.
//  - Todo lo demás (Supabase, teselas del mapa) va directo a la red. Las teselas NO se
//    guardan: la política de OpenStreetMap prohíbe el uso sin conexión.
const VERSION = 'nidito-v1'
const PAGES = `${VERSION}-pages`
const ASSETS = `${VERSION}-assets`
const FONTS = `${VERSION}-fonts`
const SCOPE = self.registration.scope // https://…/Nidito/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.add(new Request(SCOPE, { cache: 'reload' })).catch(() => {})).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Los assets cambian de nombre en cada publicación: no dejar que se acumulen.
async function prune(cacheName, max) {
  const c = await caches.open(cacheName)
  const keys = await c.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Navegación (abrir la app): red primero, copia guardada si no hay red.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(PAGES).then((c) => c.put(SCOPE, copy))
          return res
        })
        .catch(() => caches.match(SCOPE)),
    )
    return
  }

  // Archivos de la propia app (con hash en el nombre): caché primero.
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(ASSETS).then((c) => c.put(req, copy)).then(() => prune(ASSETS, 40))
            return res
          }),
      ),
    )
    return
  }

  // Iconos y manifest: igual que los assets.
  if (url.origin === self.location.origin && /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(ASSETS).then((c) => c.put(req, copy))
        return res
      })),
    )
    return
  }

  // Fuentes de Google: lo guardado, y se renueva por detrás.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req)
        const refresh = fetch(req).then((res) => { c.put(req, res.clone()); return res }).catch(() => hit)
        return hit ?? refresh
      }),
    )
  }
})
