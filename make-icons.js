// Draws the Popup Guard icons (shield + blocked popup window) as PNGs. No dependencies.
// Usage: node make-icons.js   ->  icons/icon{16,32,48,128}.png and icons/off{16,32,48}.png
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- tiny PNG encoder ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- shapes (unit square, y down) ----------
const W = 0.37, TOP = 0.07, MID = 0.47, BOT = 0.95, R = 0.12;
function inShield(x, y) {
  const dx = Math.abs(x - 0.5);
  if (y < TOP || y > BOT) return false;
  if (y < MID) {
    if (dx > W) return false;
    // rounded top corners
    if (y < TOP + R && dx > W - R) return Math.hypot(dx - (W - R), y - (TOP + R)) <= R;
    return true;
  }
  const t = (y - MID) / (BOT - MID);
  return dx <= W * (1 - t * t) * (1 - 0.15 * t);
}
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function roundRectDist(x, y, x0, y0, x1, y1, r) { // signed distance, negative inside
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function draw(size, palette) {
  const S = 4; // supersampling
  const stroke = Math.max(0.06, 1.15 / size);          // window outline thickness
  const slash = Math.max(0.065, 1.35 / size);          // slash thickness
  const gap = slash + Math.max(0.05, 1.1 / size);      // shield-coloured gap around the slash
  const win = { x0: 0.29, y0: 0.27, x1: 0.71, y1: 0.63, r: 0.07 };
  const bar = win.y0 + Math.max(0.09, 1.6 / size);      // title bar height
  const A = [0.26, 0.71], B = [0.74, 0.21];             // slash end points

  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
      if (!inShield(x, y)) continue;
      // background gradient (top → bottom) with a soft highlight on the left half
      const t = (y - TOP) / (BOT - TOP);
      let c = palette.top.map((v, i) => v + (palette.bottom[i] - v) * t);
      const sheen = Math.max(0, 0.6 - x - 0.4 * y) * 40;
      c = c.map((v) => Math.min(255, v + sheen));

      const dSeg = distToSegment(x, y, A[0], A[1], B[0], B[1]);
      const dWin = roundRectDist(x, y, win.x0, win.y0, win.x1, win.y1, win.r);
      const inWindowInk = (dWin <= 0 && dWin > -stroke) || (dWin <= 0 && y < bar);
      let ink = false;
      if (dSeg < slash / 2) ink = true;               // the slash
      else if (dSeg < gap / 2) ink = false;           // gap around it
      else if (inWindowInk) ink = true;               // the window
      if (ink) c = palette.ink;
      r += c[0]; g += c[1]; b += c[2]; a += 1;
    }
    const n = S * S, i = (py * size + px) * 4;
    if (a) { out[i] = r / a; out[i + 1] = g / a; out[i + 2] = b / a; }
    out[i + 3] = Math.round((a / n) * 255);
  }
  return png(size, out);
}

const ON = { top: [76, 141, 255], bottom: [29, 64, 200], ink: [255, 255, 255] };
const OFF = { top: [170, 176, 186], bottom: [104, 111, 124], ink: [255, 255, 255] };

const dir = path.join(__dirname, "icons");
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `icon${s}.png`), draw(s, ON));
for (const s of [16, 32, 48]) fs.writeFileSync(path.join(dir, `off${s}.png`), draw(s, OFF));

console.log("icons written to", dir);
