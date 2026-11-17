// Heraldic guild banners: a swallow-tailed gonfalon hanging from a crossbar.
//
//   drawBanner(canvas, banner, { w, h, wave, dpr, pole, amp })
//     w, h   logical (CSS) size. The canvas backing store becomes w*dpr × h*dpr.
//     dpr    pixel ratio (default: devicePixelRatio, capped at 3). Pass 1 for textures.
//     wave   false/0 = hanging still; a number = animation time in seconds (cloth ripples);
//            true = a frozen gentle ripple.
//     pole   draw the crossbar, finials and tassels (default true). false = cloth only
//            (fills the canvas; good for 3D flag textures).
//     amp    ripple strength multiplier (default 1).
//   bannerDataURL(banner, w, h, opts?) → PNG data URL (dpr 1 unless opts.dpr).
//   animateBanner(canvas, () => banner, { w, h, ... }) → { stop() }: RAF loop, auto-pauses when
//     the canvas is off screen / hidden or the tab is hidden.
//   drawEmblem(ctx, id, cx, cy, size, color, { outline, field }) draws one emblem centered.
//   bannerFontsReady() → Promise that resolves when the ribbon font is loaded.
//
// banner = { name, field, accent, pattern, emblem, emblemColor } (ids from cosmetics.js)

import { DEFAULT_BANNER } from './cosmetics.js';

// ---------- color helpers ----------
const hexRgb = (h) => {
  const s = String(h || '#000').replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const luma = (c) => { const [r, g, b] = hexRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const rgba = (c, a) => { const [r, g, b] = hexRgb(c); return `rgba(${r},${g},${b},${a})`; };

// ---------- emblem geometry (100×100 box) ----------
const P = (d) => new Path2D(d);
function poly(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; }
function circle(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; }
function ellipse(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; }
function capsule(x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1), p = new Path2D();
  p.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
  p.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  p.closePath();
  return p;
}
function bone(x1, y1, x2, y2, r) {
  const p = capsule(x1, y1, x2, y2, r);
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * r * 0.95, ny = Math.cos(a) * r * 0.95;
  const ax = Math.cos(a) * r * 0.6, ay = Math.sin(a) * r * 0.6;
  for (const [x, y, s] of [[x1, y1, 1], [x2, y2, -1]]) {
    p.addPath(circle(x + nx + ax * s, y + ny + ay * s, r * 1.15));
    p.addPath(circle(x - nx + ax * s, y - ny + ay * s, r * 1.15));
  }
  return p;
}

// Each emblem: list of [tone, Path2D]. Tones: base | shade | light | cut.
// The silhouette outline is stroked around every non-cut layer.
let EMB = null;
function emblems() {
  if (EMB) return EMB;
  const star = [];
  { const cx = 50, cy = 54, R = 47, r = 19, outer = [], inner = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5, b = a + Math.PI / 5;
      outer.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); inner.push([cx + Math.cos(b) * r, cy + Math.sin(b) * r]);
    }
    const all = []; for (let i = 0; i < 5; i++) all.push(outer[i], inner[i]);
    star.push(['base', poly(all)]);
    for (let i = 0; i < 5; i++) {
      star.push(['light', poly([[cx, cy], outer[i], inner[(i + 4) % 5]])]);
      star.push(['shade', poly([[cx, cy], outer[i], inner[i]])]);
    }
  }
  const rays = new Path2D();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 9), c = Math.cos(a), s = Math.sin(a), w = 0.12;
    const len = i % 2 ? 44 : 49;
    rays.addPath(poly([[50 + Math.cos(a - w) * 30, 54 + Math.sin(a - w) * 30], [50 + c * len, 54 + s * len], [50 + Math.cos(a + w) * 30, 54 + Math.sin(a + w) * 30]]));
  }
  EMB = {
    dragon: [
      ['shade', P('M40 37 L26 5 L52 30 Z')],
      ['base', P('M30 97 C24 84 20 70 26 58 C30 50 34 44 38 40 L14 12 L46 30 C54 26 63 26 70 30 L88 36 C95 38 97 46 92 49 L74 53 L66 55 L86 63 C90 65 88 70 83 69 L62 68 C56 75 54 85 57 97 Z')],
      ['base', P('M27 56 L8 53 L24 67 Z M23 71 L5 74 L23 81 Z M25 85 L8 93 L29 94 Z M37 43 L20 36 L33 51 Z')],
      ['shade', P('M62 68 C56 75 54 85 57 97 L48 97 C46 86 49 76 55 69 Z')],
      ['shade', P('M46 30 C54 27 63 28 69 32 L65 34 C58 32 52 33 46 36 Z')],
      ['light', P('M71 53.5 L72.5 60 L75 52.8 Z M79 51.8 L80.5 57.5 L83 51 Z M73 67.6 L75.5 61.5 L78 67.8 Z')],
      ['cut', P('M54 38.5 C58 35 63 34 67 34.5 C65 38 61 40.5 56 40.5 Z')],
      ['light', circle(62.5, 36.6, 1.5)],
      ['cut', circle(88.5, 41.5, 1.9)],
      ['shade', P('M30 62 C34 72 38 82 40 95 L36 95 C34 84 31 74 27 66 Z')],
    ],
    sword: [
      ['base', P('M50 3 L57 14 L57 66 L43 66 L43 14 Z')],
      ['light', P('M50 5 L50 66 L43 66 L43 14 Z')],
      ['cut', P('M49 19 L51 19 L51 60 L49 60 Z')],
      ['base', P('M22 63 C28 60 33 65 38 65 L62 65 C67 65 72 60 78 63 L78 71 C72 69 67 74 62 74 L38 74 C33 74 28 69 22 71 Z')],
      ['shade', P('M38 70 L62 70 C67 70 72 66 78 67 L78 71 C72 69 67 74 62 74 L38 74 C33 74 28 69 22 71 L22 67 C28 66 33 70 38 70 Z')],
      ['shade', P('M44.5 74 L55.5 74 L55.5 88 L44.5 88 Z')],
      ['cut', P('M44.5 77 L55.5 79 L55.5 80.6 L44.5 78.6 Z M44.5 82 L55.5 84 L55.5 85.6 L44.5 83.6 Z')],
      ['base', circle(50, 92, 6.5)],
      ['cut', circle(50, 92, 2.6)],
    ],
    skull: [
      ['base', bone(15, 92, 85, 44, 4.6)],
      ['base', bone(85, 92, 15, 44, 4.6)],
      ['base', P('M50 6 C30 6 19 21 19 39 C19 50 24 57 32 60 L32 70 C32 73 34 75 37 75 L63 75 C66 75 68 73 68 70 L68 60 C76 57 81 50 81 39 C81 21 70 6 50 6 Z')],
      ['shade', P('M68 60 C76 57 81 50 81 39 C81 27 75 17 66 11 C72 21 73 35 67 47 Z')],
      ['light', P('M30 18 C34 12 42 10 47 11 C40 14 35 18 32 25 Z')],
      ['cut', ellipse(38.5, 40, 8.5, 9.5, -0.15)],
      ['cut', ellipse(61.5, 40, 8.5, 9.5, 0.15)],
      ['cut', P('M50 51 L44.5 60 L55.5 60 Z')],
      ['cut', P('M41.6 65 L44 65 L44 75 L41.6 75 Z M48.8 65 L51.2 65 L51.2 75 L48.8 75 Z M56 65 L58.4 65 L58.4 75 L56 75 Z')],
    ],
    crown: [
      ['base', P('M13 78 L8 30 L30 50 L50 18 L70 50 L92 30 L87 78 Z')],
      ['shade', P('M50 18 L70 50 L92 30 L87 70 L50 70 Z')],
      ['base', P('M11 68 L89 68 L88 86 L12 86 Z')],
      ['shade', P('M12 80 L88 80 L88 86 L12 86 Z')],
      ['base', circle(8, 28, 5.5)], ['base', circle(50, 15, 6.5)], ['base', circle(92, 28, 5.5)],
      ['light', circle(48, 13, 2.2)],
      ['cut', circle(30, 76, 4)], ['cut', ellipse(50, 76, 6, 4.6)], ['cut', circle(70, 76, 4)],
      ['light', P('M30 50 L50 18 L45 44 Z')],
    ],
    star,
    shield: [
      ['base', P('M17 10 L83 10 L83 44 C83 68 69 83 50 95 C31 83 17 68 17 44 Z')],
      ['cut', P('M27 20 L73 20 L73 44 C73 62 63 74 50 83 C37 74 27 62 27 44 Z')],
      ['base', P('M45 22 L55 22 L55 80 L45 80 Z M29 37 L71 37 L71 47 L29 47 Z')],
      ['light', P('M17 10 L50 10 L50 20 L27 20 L27 44 C27 62 37 74 50 83 L50 95 C31 83 17 68 17 44 Z')],
      ['light', circle(50, 42, 6)],
    ],
    gem: [
      ['base', poly([[28, 18], [72, 18], [90, 40], [50, 92], [10, 40]])],
      ['light', poly([[28, 18], [72, 18], [62, 40], [38, 40]])],
      ['shade', poly([[72, 18], [90, 40], [62, 40]])],
      ['base', poly([[28, 18], [38, 40], [10, 40]])],
      ['shade', poly([[10, 40], [38, 40], [50, 92]])],
      ['light', poly([[38, 40], [62, 40], [50, 92]])],
      ['cut', poly([[62, 40], [90, 40], [50, 92]])],
      ['light', poly([[33, 22], [44, 22], [38, 30]])],
    ],
    eye: [
      ['base', rays],
      ['base', P('M5 56 C23 27 77 27 95 56 C77 85 23 85 5 56 Z')],
      ['shade', circle(50, 56, 18)],
      ['cut', ellipse(50, 56, 4.8, 14.5)],
      ['light', circle(57, 48.5, 3.8)],
      ['light', circle(43.5, 63, 1.8)],
    ],
    moon: [
      ['base', P('M64 6 C36 8 16 30 16 55 C16 80 37 97 63 96 C45 86 36 70 36 51 C36 32 46 16 64 6 Z')],
      ['shade', P('M63 96 C45 86 36 70 36 51 C36 40 40 29 46 21 C32 32 26 46 27 60 C28 78 42 92 63 96 Z')],
      ['light', P('M30 36 C34 26 42 18 50 14 C42 22 37 30 35 40 Z')],
      ['base', poly([[78, 30], [82, 42], [94, 44], [84, 51], [87, 63], [78, 56], [69, 63], [72, 51], [62, 44], [74, 42]])],
      ['light', circle(66, 78, 3.4)],
    ],
    heart: [
      ['base', P('M50 92 C30 76 8 62 8 38 C8 22 20 12 33 12 C41 12 47 16 50 22 C53 16 59 12 67 12 C80 12 92 22 92 38 C92 62 70 76 50 92 Z')],
      ['shade', P('M50 92 C70 76 92 62 92 38 C92 28 87 20 80 16 C84 42 70 66 50 80 Z')],
      ['light', P('M20 30 C22 22 29 18 35 19 C30 23 26 28 25 35 Z')],
      ['cut', P('M50 34 L44 48 L54 56 L46 70 L49 71 L58 56 L48 48 L53 35 Z')],
    ],
    key: [
      ['base', circle(50, 26, 22)],
      ['cut', circle(50, 26, 9)],
      ['base', P('M43 44 L57 44 L57 94 L43 94 Z')],
      ['base', P('M57 66 L74 66 L74 75 L57 75 Z M57 82 L68 82 L68 92 L57 92 Z')],
      ['shade', P('M51 44 L57 44 L57 94 L51 94 Z')],
      ['light', P('M33 18 C36 11 43 7 49 7 C43 11 39 15 37 22 Z')],
    ],
    tower: [
      ['base', P('M28 32 L72 32 L68 94 L32 94 Z')],
      ['base', P('M22 10 L34 10 L34 18 L44 18 L44 10 L56 10 L56 18 L66 18 L66 10 L78 10 L78 34 L22 34 Z')],
      ['shade', P('M60 32 L72 32 L68 94 L62 94 Z M70 10 L78 10 L78 34 L70 34 Z')],
      ['light', P('M30 36 L36 36 L35 88 L33 88 Z')],
      ['cut', P('M42 94 L42 76 C42 66 58 66 58 76 L58 94 Z')],
      ['cut', P('M46 42 L54 42 L54 56 L46 56 Z')],
    ],
    bolt: [
      ['base', P('M60 3 L20 56 L46 56 L36 97 L82 38 L55 38 Z')],
      ['light', P('M60 3 L20 56 L32 56 L54 22 Z')],
      ['shade', P('M55 38 L82 38 L36 97 L62 46 Z')],
    ],
    flame: [
      ['base', P('M50 4 C58 22 82 34 82 60 C82 80 67 95 50 95 C33 95 18 80 18 60 C18 46 26 38 33 31 C33 44 37 50 44 52 C40 36 44 20 50 4 Z')],
      ['shade', P('M67 30 C76 40 82 50 82 60 C82 80 67 95 50 95 C64 86 72 72 72 58 C72 48 70 38 67 30 Z')],
      ['light', P('M50 46 C54 56 64 62 64 72 C64 82 58 89 50 89 C42 89 36 82 36 72 C36 64 41 60 44 56 C46 62 48 64 51 64 C49 58 48 52 50 46 Z')],
    ],
  };
  return EMB;
}
export const EMBLEM_IDS = ['dragon', 'sword', 'skull', 'crown', 'star', 'shield', 'gem', 'eye', 'moon', 'heart', 'key', 'tower', 'bolt', 'flame'];

/** Draws an emblem centered on (cx, cy) inside a size×size box. */
export function drawEmblem(ctx, id, cx, cy, size, color = '#f4ecdf', opts = {}) {
  const layers = emblems()[id] || emblems().dragon;
  const dark = luma(color) < 0.32;
  const tone = {
    base: color,
    shade: mix(color, dark ? '#ffffff' : '#000000', dark ? 0.16 : 0.22),
    light: mix(color, '#ffffff', dark ? 0.32 : 0.42),
    cut: dark ? mix(color, '#ffffff', 0.42) : mix(color, '#120a18', 0.68),
  };
  const outline = opts.outline ?? (dark ? mix(opts.field || '#888888', '#ffffff', 0.55) : 'rgba(18,10,24,0.88)');
  const s = size / 100;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.shadow !== false) {
    ctx.save();
    ctx.translate(0, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [t, p] of layers) if (t !== 'cut') { ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(p); ctx.fill(p); }
    ctx.restore();
  }
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.outlineWidth ?? 8;
  for (const [t, p] of layers) if (t !== 'cut') ctx.stroke(p);
  for (const [t, p] of layers) { ctx.fillStyle = tone[t]; ctx.fill(p); }
  ctx.restore();
}

// ---------- cloth ----------
function clothPath(W, H, notch) {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.lineTo(W, 0);
  p.lineTo(W, H);
  p.lineTo(W / 2, H - notch);
  p.lineTo(0, H);
  p.closePath();
  return p;
}

function drawPattern(ctx, b, W, H, notch, cloth) {
  const acc = b.accent;
  ctx.fillStyle = acc;
  ctx.strokeStyle = acc;
  switch (b.pattern) {
    case 'chevron': {
      const top = H * 0.5, side = H * 0.8, t = H * 0.12;
      ctx.fill(poly([[0, side], [W / 2, top], [W, side], [W, side + t], [W / 2, top + t], [0, side + t]]));
      const t2 = H * 0.03;
      ctx.fill(poly([[0, side - t2 * 2.2], [W / 2, top - t2 * 2.2], [W, side - t2 * 2.2], [W, side - t2 * 1.2], [W / 2, top - t2 * 1.2], [0, side - t2 * 1.2]]));
      break;
    }
    case 'stripes': {
      const n = 7, sw = W / n;
      for (let i = 1; i < n; i += 2) ctx.fillRect(i * sw, 0, sw, H);
      break;
    }
    case 'quarters':
      ctx.fillRect(0, 0, W / 2, H * 0.42);
      ctx.fillRect(W / 2, H * 0.42, W / 2, H);
      break;
    case 'saltire': {
      ctx.lineWidth = W * 0.2;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(-W * 0.1, -H * 0.06); ctx.lineTo(W * 1.1, H * 0.86);
      ctx.moveTo(W * 1.1, -H * 0.06); ctx.lineTo(-W * 0.1, H * 0.86);
      ctx.stroke();
      break;
    }
    case 'border':
      ctx.lineWidth = W * 0.2;
      ctx.lineJoin = 'miter';
      ctx.stroke(cloth);
      break;
    case 'flames': {
      const n = 4, base = H + 2;
      const tongue = (scale, color, offset) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-W * 0.05, base);
        for (let i = 0; i <= n; i++) {
          const x0 = (i / n) * W, x1 = ((i + 1) / n) * W - W * 0.02, xm = (x0 + x1) / 2 + offset;
          const peak = H - (H * (0.58 + 0.12 * Math.sin(i * 2.3 + 1)) * scale);
          ctx.bezierCurveTo(x0 + W * 0.02, H - (H - peak) * 0.4, xm - W * 0.13, peak + H * 0.12, xm + W * 0.04, peak);
          ctx.bezierCurveTo(xm - W * 0.02, peak + H * 0.12, x1 + W * 0.04, H - (H - peak) * 0.45, x1, H - (H - peak) * 0.1);
        }
        ctx.lineTo(W * 1.05, base);
        ctx.closePath();
        ctx.fill();
      };
      tongue(1, acc, 0);
      tongue(0.6, mix(acc, '#ffffff', 0.45), -W * 0.02);
      break;
    }
    case 'pale': ctx.fillRect(W * 0.34, 0, W * 0.32, H); break;
    case 'chief': ctx.fillRect(0, 0, W, H * 0.27); break;
    case 'bend': {
      ctx.lineWidth = W * 0.26;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-W * 0.15, -H * 0.05); ctx.lineTo(W * 1.15, H * 0.92); ctx.stroke();
      break;
    }
    case 'checky': {
      const cols = 4, cw = W / cols, rows = Math.ceil(H / cw);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2) ctx.fillRect(c * cw, r * cw, cw + 0.5, cw + 0.5);
      break;
    }
    case 'lozenge': {
      const cw = W / 3, ch = cw * 1.3;
      for (let y = -ch / 2, r = 0; y < H + ch; y += ch / 2, r++) {
        for (let x = r % 2 ? cw / 2 : 0; x < W + cw; x += cw) ctx.fill(poly([[x, y - ch * 0.42], [x + cw * 0.38, y], [x, y + ch * 0.42], [x - cw * 0.38, y]]));
      }
      break;
    }
    case 'wavy': {
      const bands = [0.22, 0.5, 0.78], amp = H * 0.035, th = H * 0.075;
      for (const f of bands) {
        const y0 = H * f;
        ctx.beginPath();
        ctx.moveTo(-2, y0);
        for (let x = 0; x <= W + 2; x += 2) ctx.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 4) * amp);
        for (let x = W + 2; x >= -2; x -= 2) ctx.lineTo(x, y0 + th + Math.sin((x / W) * Math.PI * 4) * amp);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'starry': {
      const pts = [[0.2, 0.12], [0.78, 0.16], [0.5, 0.3], [0.14, 0.46], [0.86, 0.44], [0.3, 0.66], [0.72, 0.7], [0.5, 0.86], [0.12, 0.84], [0.9, 0.88]];
      for (const [fx, fy] of pts) {
        const cx = fx * W, cy = fy * H, R = W * (0.055 + 0.03 * ((fx * 7 + fy * 3) % 1)), r = R * 0.42, pp = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; pp.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        ctx.fill(poly(pp));
      }
      break;
    }
    default: break;
  }
}

const clothCache = new Map();

function renderCloth(b, W, H, dpr, withName) {
  const key = [b.field, b.accent, b.pattern, b.emblem, b.emblemColor, withName ? b.name : '', W, H, dpr].join('|');
  const hit = clothCache.get(key);
  if (hit) return hit;
  const mx = Math.round(W * 0.1);
  const cw = Math.ceil((W + mx * 2) * dpr), ch = Math.ceil(H * dpr);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, mx * dpr, 0);
  const notch = H * 0.2;
  const cloth = clothPath(W, H, notch);
  const small = W < 70;

  ctx.save();
  ctx.clip(cloth);
  // field
  ctx.fillStyle = b.field;
  ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, b, W, H, notch, cloth);
  // weave texture
  if (!small) {
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
    const g = Math.max(2.5, W / 60);
    ctx.beginPath();
    for (let x = -H; x < W; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x + H, H); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // cloth light: top shadow under the bar, side vignette, soft sheen
  let gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(0,0,0,0.45)');
  gr.addColorStop(0.08, 'rgba(0,0,0,0.08)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  gr.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  gr = ctx.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.32)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.08)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0)');
  gr.addColorStop(0.85, 'rgba(0,0,0,0.12)');
  gr.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // stitched hem
  if (!small) {
    ctx.save();
    ctx.translate(W * 0.5, 0);
    ctx.scale(0.9, 1);
    ctx.translate(-W * 0.5, 0);
    ctx.setLineDash([W * 0.03, W * 0.025]);
    ctx.strokeStyle = rgba(luma(b.field) > 0.6 ? '#000000' : '#ffffff', 0.35);
    ctx.lineWidth = Math.max(0.8, W * 0.012);
    const inset = W * 0.055;
    ctx.beginPath();
    ctx.moveTo(inset * 1.1, H * 0.05);
    ctx.lineTo(inset * 1.1, H - inset * 2.2);
    ctx.lineTo(W / 2, H - notch - inset * 1.3);
    ctx.lineTo(W - inset * 1.1, H - inset * 2.2);
    ctx.lineTo(W - inset * 1.1, H * 0.05);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // emblem
  const hasName = withName && b.name;
  const ey = hasName ? H * 0.36 : H * 0.42;
  const es = W * (small ? 0.8 : hasName ? 0.68 : 0.74);
  drawEmblem(ctx, b.emblem, W / 2, ey, es, b.emblemColor, { field: b.field, outlineWidth: small ? 10 : 8 });

  // outline of the cloth
  ctx.lineJoin = 'round';
  ctx.strokeStyle = mix(b.field, '#0b0610', 0.62);
  ctx.lineWidth = Math.max(1, W * (small ? 0.05 : 0.025));
  ctx.stroke(cloth);

  // name ribbon
  if (hasName) drawRibbon(ctx, b.name, W, H * 0.7, W * 1.12, Math.max(12, H * 0.115), mx);
  const out = { canvas: c, mx, notch };
  if (clothCache.size > 60) clothCache.delete(clothCache.keys().next().value);
  clothCache.set(key, out);
  return out;
}

function drawRibbon(ctx, text, W, cy, rw, rh, mx) {
  const x0 = W / 2 - rw / 2, x1 = W / 2 + rw / 2, tail = Math.min(mx * 0.95, rh * 0.8);
  const paper = '#f4e6c4', paperDark = '#c9a76a', ink = '#3b2412';
  // folded tails behind
  ctx.fillStyle = paperDark;
  for (const s of [-1, 1]) {
    const ex = s < 0 ? x0 : x1;
    ctx.beginPath();
    ctx.moveTo(ex, cy - rh * 0.2);
    ctx.lineTo(ex + s * tail, cy - rh * 0.2);
    ctx.lineTo(ex + s * tail * 0.6, cy + rh * 0.4);
    ctx.lineTo(ex + s * tail, cy + rh * 0.95);
    ctx.lineTo(ex, cy + rh * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,8,.75)'; ctx.lineWidth = Math.max(1, rh * 0.06); ctx.stroke();
  }
  // main band, slightly arched
  const arch = rh * 0.25;
  const band = new Path2D();
  band.moveTo(x0, cy - rh / 2);
  band.quadraticCurveTo(W / 2, cy - rh / 2 - arch, x1, cy - rh / 2);
  band.lineTo(x1, cy + rh / 2);
  band.quadraticCurveTo(W / 2, cy + rh / 2 - arch, x0, cy + rh / 2);
  band.closePath();
  const g = ctx.createLinearGradient(0, cy - rh, 0, cy + rh);
  g.addColorStop(0, '#fff6dc'); g.addColorStop(0.5, paper); g.addColorStop(1, '#d9bd84');
  ctx.fillStyle = g; ctx.fill(band);
  ctx.strokeStyle = 'rgba(40,20,8,.8)'; ctx.lineWidth = Math.max(1, rh * 0.07); ctx.stroke(band);
  // text
  const t = String(text).toUpperCase();
  let fs = rh * 0.68;
  ctx.font = `${fs}px 'Luckiest Guy', 'Lilita One', system-ui, sans-serif`;
  const maxW = rw * 0.86;
  const tw = ctx.measureText(t).width;
  if (tw > maxW) { fs *= maxW / tw; ctx.font = `${fs}px 'Luckiest Guy', 'Lilita One', system-ui, sans-serif`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.fillText(t, W / 2, cy - arch * 0.45 + fs * 0.08);
}

// Reused scratch canvases for the warp pass.
let scratch = null;
function getScratch(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  return scratch;
}

function drawBar(ctx, x0, x1, y, t) {
  // tassel cords
  const wood = ctx.createLinearGradient(0, y - t / 2, 0, y + t / 2);
  wood.addColorStop(0, '#9a6a3c'); wood.addColorStop(0.45, '#6b4423'); wood.addColorStop(1, '#2f1c0d');
  ctx.fillStyle = wood;
  ctx.strokeStyle = '#1a0f07';
  ctx.lineWidth = Math.max(0.8, t * 0.12);
  const r = t / 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x0, y - r, x1 - x0, t, r) : ctx.rect(x0, y - r, x1 - x0, t);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x0 + r, y - r * 0.55, x1 - x0 - 2 * r, r * 0.35);
  // gold finials
  for (const x of [x0, x1]) {
    const R = t * 0.95;
    const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.45, '#f2c443'); g.addColorStop(1, '#8a5a0a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2208'; ctx.lineWidth = Math.max(0.8, t * 0.1); ctx.stroke();
  }
}

function drawTassel(ctx, x, y, len, sway, t) {
  ctx.strokeStyle = '#c9952a';
  ctx.lineWidth = Math.max(0.8, t * 0.22);
  const ex = x + sway, ey = y + len;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway * 0.2, y + len * 0.5, ex, ey); ctx.stroke();
  const hw = t * 0.75, hl = len * 0.45;
  const g = ctx.createLinearGradient(ex - hw, 0, ex + hw, 0);
  g.addColorStop(0, '#8a5a0a'); g.addColorStop(0.4, '#f2c443'); g.addColorStop(1, '#8a5a0a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ex - hw * 0.35, ey);
  ctx.lineTo(ex + hw * 0.35, ey);
  ctx.lineTo(ex + hw + sway * 0.15, ey + hl);
  ctx.lineTo(ex - hw + sway * 0.15, ey + hl);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2c443';
  ctx.beginPath(); ctx.arc(ex, ey, hw * 0.55, 0, Math.PI * 2); ctx.fill();
}

const norm = (b) => ({ ...DEFAULT_BANNER, ...(b || {}) });

/** Draw a banner. See header for options. */
export function drawBanner(canvas, banner, opts = {}) {
  const b = norm(banner);
  const w = opts.w ?? (canvas.clientWidth || canvas.width);
  const h = opts.h ?? (canvas.clientHeight || canvas.height);
  const dpr = opts.dpr ?? Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const pole = opts.pole !== false;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  if (opts.setStyle !== false && canvas.style && !canvas.dataset?.noStyle) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bw, bh);

  const animated = typeof opts.wave === 'number' && opts.wave !== 0;
  const waving = animated || opts.wave === true;
  const time = animated ? opts.wave : 0.6;
  const amp = waving ? (opts.amp ?? 1) : 0;

  // layout (logical px)
  const barT = pole ? Math.max(2.5, w * 0.06) : 0;
  const barY = pole ? Math.max(barT * 1.1, h * 0.05) : 0;
  const sidePad = pole ? w * 0.14 : (waving ? w * 0.06 * amp : 0);
  const W = w - sidePad * 2;
  const top = pole ? barY : 0;
  const H = h - top - (pole ? h * 0.012 : 0);
  const withName = opts.ribbon !== false && H >= 90;
  const cl = renderCloth(b, W, H, dpr, withName);

  const A = w * 0.045 * amp; // ripple amplitude (px)
  const ox = (sidePad - cl.mx) * dpr, oy = top * dpr;
  const src = cl.canvas;

  if (!waving) {
    ctx.drawImage(src, Math.round(ox), Math.round(oy));
  } else {
    const sc = getScratch(bw, bh);
    const sx = sc.getContext('2d');
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, bw, bh);
    const step = Math.max(1, Math.round(src.height / 170));
    const rows = [];
    for (let y = 0; y < src.height; y += step) {
      const yn = y / src.height;
      const f = Math.pow(yn, 1.15);
      const ph1 = time * 2.4 - yn * 5.2, ph2 = time * 1.35 - yn * 2.3 + 1.7;
      const dx = (Math.sin(ph1) * 0.75 + Math.sin(ph2) * 0.45) * A * f * dpr + Math.sin(time * 0.9) * A * 0.25 * f * dpr;
      const sh = Math.min(step + 1, src.height - y);
      sx.drawImage(src, 0, y, src.width, sh, Math.round(ox + dx), oy + y, src.width, sh);
      rows.push([y, sh, Math.cos(ph1) * f]);
    }
    // ripple light on cloth only
    sx.globalCompositeOperation = 'source-atop';
    for (const [y, sh, s] of rows) {
      const a = Math.min(0.28, Math.abs(s) * 0.3);
      if (a < 0.015) continue;
      sx.fillStyle = s > 0 ? `rgba(255,240,220,${a * 0.7})` : `rgba(0,0,0,${a})`;
      sx.fillRect(0, oy + y, bw, sh);
    }
    // vertical folds
    if (w >= 60) {
      const g = sx.createLinearGradient(ox + cl.mx * dpr, 0, ox + (cl.mx + W) * dpr, 0);
      for (let i = 0; i <= 10; i++) {
        const v = Math.sin(i * 1.9 + time * 1.6) * 0.5 + Math.sin(i * 0.7 - time) * 0.5;
        g.addColorStop(i / 10, v > 0 ? `rgba(255,255,255,${v * 0.07 * amp})` : `rgba(0,0,0,${-v * 0.16 * amp})`);
      }
      sx.fillStyle = g;
      sx.fillRect(0, oy, bw, bh - oy);
    }
    sx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sc, 0, 0);
  }

  if (pole) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // cord to hook
    const cx = w / 2;
    ctx.strokeStyle = '#c9952a';
    ctx.lineWidth = Math.max(0.8, barT * 0.22);
    ctx.beginPath();
    ctx.moveTo(sidePad + W * 0.08, barY); ctx.lineTo(cx, Math.max(1, barY - barT * 1.0)); ctx.lineTo(w - sidePad - W * 0.08, barY);
    ctx.stroke();
    // sleeve band over the top of the cloth
    ctx.fillStyle = mix(b.field, '#000', 0.35);
    ctx.fillRect(sidePad, barY, W, barT * 0.9);
    ctx.fillStyle = b.accent;
    ctx.fillRect(sidePad, barY + barT * 0.9, W, Math.max(1, barT * 0.28));
    drawBar(ctx, w * 0.07, w * 0.93, barY, barT);
    if (w >= 60) {
      const sway = waving ? Math.sin(time * 1.7) * w * 0.02 * amp : 0;
      drawTassel(ctx, w * 0.07, barY + barT * 0.6, h * 0.16, sway, barT);
      drawTassel(ctx, w * 0.93, barY + barT * 0.6, h * 0.16, sway * 0.8, barT);
    }
    // hook ring
    ctx.strokeStyle = '#f2c443';
    ctx.lineWidth = Math.max(0.8, barT * 0.25);
    ctx.beginPath(); ctx.arc(cx, Math.max(barT * 0.4, barY - barT * 1.1), barT * 0.4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** PNG data URL of a banner (dpr 1 by default, so w×h is the exact pixel size). */
export function bannerDataURL(banner, w = 128, h = 192, opts = {}) {
  const c = document.createElement('canvas');
  drawBanner(c, banner, { dpr: 1, ...opts, w, h, setStyle: false });
  return c.toDataURL('image/png');
}

/** Resolves once the ribbon font has loaded (call before drawing static banners with names). */
export function bannerFontsReady() {
  try { return document.fonts.load("40px 'Luckiest Guy'").then(() => true, () => false); } catch { return Promise.resolve(false); }
}

/**
 * Keeps a banner waving. getBanner() is read every frame so edits show live.
 * Pauses automatically when the canvas is hidden/off screen or the tab is hidden.
 */
export function animateBanner(canvas, getBanner, opts = {}) {
  let raf = 0, visible = false, stopped = false;
  const t0 = performance.now() - Math.random() * 4000;
  const reduced = () => (typeof opts.reduced === 'function' ? opts.reduced() : !!opts.reduced);
  const frame = (now) => {
    raf = 0;
    if (stopped || !visible || document.hidden) return;
    const t = (now - t0) / 1000;
    drawBanner(canvas, typeof getBanner === 'function' ? getBanner() : getBanner, { ...opts, wave: reduced() ? true : t * (opts.speed ?? 1) });
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible && !stopped && !document.hidden) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; kick(); });
  io.observe(canvas);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  // draw once immediately so it never flashes empty
  drawBanner(canvas, typeof getBanner === 'function' ? getBanner() : getBanner, { ...opts, wave: true });
  return {
    stop() { stopped = true; io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (raf) cancelAnimationFrame(raf); },
    redraw() { drawBanner(canvas, typeof getBanner === 'function' ? getBanner() : getBanner, { ...opts, wave: true }); },
  };
}
