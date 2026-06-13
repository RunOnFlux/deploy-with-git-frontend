/**
 * One-off generator for the PWA / Apple touch icons, rasterised from the brand
 * SVG (public/orbit-icon.svg) onto the theme navy background so transparent
 * areas don't render black on iOS home screens. Run manually when the brand mark
 * or palette changes; the PNG outputs are committed, so this is NOT part of the
 * build:
 *
 *   node scripts/gen-icons.mjs
 *
 * Requires `sharp` (already present transitively via vite-plugin-image-optimizer).
 */

import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '..', 'public')
const SOURCE = path.join(publicDir, 'orbit-icon.svg')
const BG = '#080c18' // matches <meta name="theme-color">

// size, output filename, and the fraction of the canvas the glyph fills.
// Maskable needs its content inside the inner ~80% "safe zone", so it gets more
// padding than the standard ("any") icons.
const ICONS = [
  { size: 180, file: 'apple-touch-icon.png', inner: 0.66 },
  { size: 192, file: 'icon-192.png', inner: 0.66 },
  { size: 512, file: 'icon-512.png', inner: 0.66 },
  { size: 512, file: 'icon-maskable-512.png', inner: 0.5 },
]

for (const { size, file, inner } of ICONS) {
  const glyphSize = Math.round(size * inner)
  // Render the SVG crisply at the target glyph size, then centre it on the navy
  // canvas. High density keeps the thin strokes sharp when scaled up.
  const glyph = await sharp(SOURCE, { density: 600 })
    .resize(glyphSize, glyphSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: glyph, gravity: 'center' }])
    // Drop the (fully-opaque) alpha channel: iOS expects no transparency on
    // touch icons, and it shaves a few bytes everywhere else.
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(path.join(publicDir, file))

  console.log(`✓ ${file} (${size}x${size}, glyph ${glyphSize}px)`)
}
