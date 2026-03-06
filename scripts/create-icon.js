const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SIZE = 256;

// Rounded rect SDF
function sdfRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) - r;
}

// Distance from point to line segment
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

const png = new PNG({ width: SIZE, height: SIZE });

// F shape segments
const segments = [
  [88, 74, 88, 182],   // Vertical stroke
  [88, 74, 178, 74],   // Top horizontal
  [88, 122, 162, 122], // Middle horizontal
];
const strokeWidth = 20;
const halfStroke = strokeWidth / 2;

// Background color: warm amber #D97706
const bgR = 0xD9, bgG = 0x77, bgB = 0x06;

// Rounded rect params
const cx = SIZE / 2, cy = SIZE / 2;
const hw = SIZE / 2, hh = SIZE / 2;
const cornerRadius = 48;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const px = x + 0.5;
    const py = y + 0.5;

    // Background SDF
    const bgDist = sdfRoundedRect(px, py, cx, cy, hw, hh, cornerRadius);
    const bgAlpha = Math.max(0, Math.min(1, 0.5 - bgDist));

    if (bgAlpha <= 0) {
      // Fully transparent outside the rounded rect
      png.data[idx] = 0;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 0;
      continue;
    }

    // F shape SDF: minimum distance to any segment minus half stroke
    let minDist = Infinity;
    for (const [ax, ay, bx, by] of segments) {
      const d = distToSegment(px, py, ax, ay, bx, by);
      if (d < minDist) minDist = d;
    }
    const mAlpha = Math.max(0, Math.min(1, 0.5 - (minDist - halfStroke)));

    // Composite: white F over amber background
    const r = bgR * (1 - mAlpha) + 255 * mAlpha;
    const g = bgG * (1 - mAlpha) + 255 * mAlpha;
    const b = bgB * (1 - mAlpha) + 255 * mAlpha;

    png.data[idx] = Math.round(r);
    png.data[idx + 1] = Math.round(g);
    png.data[idx + 2] = Math.round(b);
    png.data[idx + 3] = Math.round(bgAlpha * 255);
  }
}

const outPath = path.join(__dirname, 'build', 'icon.png');
const buffer = PNG.sync.write(png);
fs.writeFileSync(outPath, buffer);
console.log(`Icon created: ${outPath} (${SIZE}x${SIZE})`);
