// Generates the favicon + PWA icons from the user-provided square app icon
// (public/favicon.png). Detects the icon's bounding box (ignoring the white/
// glow border), crops to a centered square, and resizes to the icon sizes.
// Run: `node scripts/gen-icons-from-logo.mjs` (from web/).
import { Jimp } from 'jimp'

const SOURCE = 'public/favicon.png'
const src = await Jimp.read(SOURCE)
const { data, width, height } = src.bitmap
console.log('source:', width + 'x' + height)

// A pixel is "background" if transparent or near-white (the glow halo).
const isBg = (r, g, b, a) => a < 16 || (r > 236 && g > 236 && b > 236)

let minX = width,
  minY = height,
  maxX = 0,
  maxY = 0
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (!isBg(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
const bw = maxX - minX + 1
const bh = maxY - minY + 1
console.log('icon bbox:', bw + 'x' + bh, 'at', minX + ',' + minY)

// Centered square around the bbox with a small margin, clamped to the image.
const cx = minX + bw / 2
const cy = minY + bh / 2
let side = Math.round(Math.max(bw, bh) * 1.12)
side = Math.min(side, width, height)
let sx = Math.round(cx - side / 2)
let sy = Math.round(cy - side / 2)
sx = Math.max(0, Math.min(sx, width - side))
sy = Math.max(0, Math.min(sy, height - side))

const square = src.clone().crop({ x: sx, y: sy, w: side, h: side })
console.log('cropped square:', side + 'x' + side)

const targets = [
  ['public/favicon.png', 64],
  ['public/pwa-192x192.png', 192],
  ['public/pwa-512x512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['public/maskable-512x512.png', 512],
]

for (const [path, size] of targets) {
  const img = square.clone().resize({ w: size, h: size })
  await img.write(path)
  console.log('wrote', path, '->', size + 'x' + size)
}
console.log('done')
