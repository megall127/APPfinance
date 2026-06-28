/**
 * Generates PWA placeholder icons using pngjs (pure JS, no native builds needed).
 * Creates a soft-green (#4CAF82) rounded square with a white "Le" text approximation.
 * Run: node web/scripts/generate-icons.mjs
 */
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

// Brand colours
const BRAND_GREEN = { r: 0x4c, g: 0xaf, b: 0x82, a: 255 }; // #4CAF82
const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

/** Set a pixel at (x, y) to colour c */
function setPixel(png, x, y, c) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx] = c.r;
  png.data[idx + 1] = c.g;
  png.data[idx + 2] = c.b;
  png.data[idx + 3] = c.a;
}

/** Draw a filled rectangle */
function fillRect(png, x0, y0, w, h, c) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x0 + dx, y0 + dy, c);
    }
  }
}

/** Draw a rounded rectangle (filled) using simple distance-to-corner test */
function fillRoundedRect(png, x0, y0, w, h, radius, c) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x0 + dx;
      const py = y0 + dy;
      // distance to nearest corner arc
      const cx = dx < radius ? radius : dx > w - 1 - radius ? w - 1 - radius : dx;
      const cy = dy < radius ? radius : dy > h - 1 - radius ? h - 1 - radius : dy;
      const dist = Math.sqrt((dx - cx) ** 2 + (dy - cy) ** 2);
      if (dist <= radius) {
        setPixel(png, px, py, c);
      }
    }
  }
}

/** Draw a thick horizontal line segment */
function hLine(png, x0, x1, y, thick, c) {
  for (let t = -Math.floor(thick / 2); t <= Math.floor(thick / 2); t++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(png, x, y + t, c);
    }
  }
}

/** Draw a thick vertical line segment */
function vLine(png, x, y0, y1, thick, c) {
  for (let t = -Math.floor(thick / 2); t <= Math.floor(thick / 2); t++) {
    for (let y = y0; y <= y1; y++) {
      setPixel(png, x + t, y, c);
    }
  }
}

/**
 * Draw a simple "Le" lettermark scaled to the icon size.
 * "L" → vertical bar + bottom horizontal bar
 * "e" → simplified E shape (three horizontals + left vertical)
 */
function drawLettermark(png, size) {
  const scale = size / 192; // baseline design at 192 px
  const th = Math.max(2, Math.round(10 * scale)); // stroke thickness

  // --- "L" ---
  const lx = Math.round(30 * scale);
  const ty = Math.round(46 * scale);
  const by = Math.round(146 * scale);
  const lw = Math.round(54 * scale); // bottom bar width

  vLine(png, lx, ty, by, th, WHITE);         // vertical
  hLine(png, lx, lx + lw, by, th, WHITE);     // bottom bar

  // --- "e" (simplified, right of L) ---
  const ex = Math.round(96 * scale);
  const ey_top = Math.round(70 * scale);
  const ey_bot = Math.round(146 * scale);
  const ew = Math.round(60 * scale);
  const ey_mid = Math.round((ey_top + ey_bot) / 2);

  vLine(png, ex, ey_top, ey_bot, th, WHITE);               // left bar
  hLine(png, ex, ex + ew, ey_top, th, WHITE);               // top bar
  hLine(png, ex, ex + ew, ey_mid, th, WHITE);               // mid bar
  hLine(png, ex, ex + ew, ey_bot, th, WHITE);               // bottom bar
}

function generateIcon(size, filename, maskable = false) {
  const png = new PNG({ width: size, height: size, filterType: -1 });
  png.data = Buffer.alloc(size * size * 4, 0);

  if (maskable) {
    // Maskable: fill entire canvas (safe zone is inner 80%)
    fillRect(png, 0, 0, size, size, BRAND_GREEN);
  } else {
    // Regular: rounded square with transparent corners
    fillRoundedRect(png, 0, 0, size, size, Math.round(size * 0.15), BRAND_GREEN);
  }

  drawLettermark(png, size);

  const outPath = path.join(publicDir, filename);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ ${filename} (${size}×${size})`);
}

// Ensure public dir exists
fs.mkdirSync(publicDir, { recursive: true });

generateIcon(192, 'pwa-192x192.png');
generateIcon(512, 'pwa-512x512.png');
generateIcon(512, 'maskable-512x512.png', true); // maskable: full bleed
generateIcon(180, 'apple-touch-icon.png');        // Apple touch icon

console.log('Done — icons written to web/public/');
