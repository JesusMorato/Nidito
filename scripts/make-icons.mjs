// Genera los iconos de la app (PNG) y el favicon (SVG) a partir del logo (la casita en el nido).
// Uso: npm run icons   (necesita `sharp`, instalado como devDependency)
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const tile = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${200 + padding * 2} ${200 + padding * 2}">
  <rect x="${-padding}" y="${-padding}" width="${200 + padding * 2}" height="${200 + padding * 2}" rx="${padding ? 0 : 44}" fill="#b0583c"/>
  <ellipse cx="100" cy="118" rx="62" ry="13" fill="#e8c9b2"/>
  <rect x="72" y="76" width="56" height="48" fill="#ffffff"/>
  <polygon points="100,42 60,82 140,82" fill="#2f6b73"/>
  <rect x="92" y="98" width="16" height="26" rx="3" fill="#b0583c"/>
  <path d="M38 118 Q100 150 162 118 L152 154 Q100 182 48 154 Z" fill="#fbe9d8"/>
  <path d="M56 136 Q100 162 144 136" fill="none" stroke="#e8c9b2" stroke-width="4" stroke-linecap="round"/>
  <path d="M64 150 Q100 172 136 150" fill="none" stroke="#e8c9b2" stroke-width="4" stroke-linecap="round"/>
</svg>`

mkdirSync('public/icons', { recursive: true })

// Favicon: baldosa redondeada (los navegadores no recortan)
writeFileSync('public/favicon.svg', tile(0).trim())

// Iconos "any": baldosa con esquinas redondeadas
for (const size of [192, 512]) {
  await sharp(Buffer.from(tile(0))).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
}
// iOS: sin esquinas redondeadas (iOS las pone), con un poco de margen
await sharp(Buffer.from(tile(20))).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')
// Maskable (Android): zona segura amplia
await sharp(Buffer.from(tile(40))).resize(512, 512).png().toFile('public/icons/maskable-512.png')

console.log('iconos generados en public/icons')
