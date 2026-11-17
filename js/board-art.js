// Hand-drawn cartoon art for the board, generated in code: canvas-painted
// textures (flat colours, ink lines, crisp highlight strips), toon materials,
// prop builders and a static-geometry batcher with inverted-hull ink outlines.
import * as THREE from '../vendor/three.module.min.js';
import { makeRng } from './board.js';

export const INK = '#1a1026';
const INK_HEX = 0x1a1026;

// ---------------------------------------------------------------- palettes
// One vibrant palette per floor. Colour, not darkness, carries the mood.
export const PALETTES = {
  1: { // Bone Crypt
    key: 'crypt', sky: ['#5b3f9e', '#b46fc4', '#ffb3a0', '#ffe28a'],
    tile: '#a6dcc8', tileSide: '#5f9f8f', tileDeep: '#3f7266',
    floor: '#7774ad', floorAlt: '#6a67a0', floorLine: '#5a5690',
    wall: '#8a84c4', wallAlt: '#7a74b4', wallDeep: '#4d4785', cap: '#a6dcc8', capSide: '#5f9f8f',
    accent: '#7dffa8', moss: '#7fd86a', mossDeep: '#4aa34a', trim: '#ffc94a',
    flame: ['#fff6b0', '#ffc23a', '#ff7a2a'], boss: '#ff5a7a', bossFlame: ['#e8fff0', '#7dffa8', '#2fb87a'],
    hemiSky: 0xfff2e6, hemiGround: 0x8a7ac8, sun: 0xfff0d8,
    motes: { color: 0xd8ffe0, n: 70, size: 0.16, vy: 0.25, sway: 0.25 },
  },
  2: { // Sand Hive
    key: 'hive', sky: ['#c4568a', '#f08a7a', '#ffc070', '#fff0a0'],
    tile: '#ffe9b0', tileSide: '#dca457', tileDeep: '#9a6430',
    floor: '#d98a48', floorAlt: '#cf7f40', floorLine: '#a85e2a',
    wall: '#f6b444', wallAlt: '#eaa236', wallDeep: '#9a5a14', cap: '#ffd98e', capSide: '#d49a4e',
    accent: '#ffe04a', moss: '#ffd23a', mossDeep: '#e09a20', trim: '#fff0b0',
    flame: ['#fffbd0', '#ffd23a', '#ff8a1a'], boss: '#ffb020', bossFlame: ['#fffbd0', '#ffd23a', '#ff8a1a'],
    hemiSky: 0xfff4dc, hemiGround: 0xd0905a, sun: 0xfff2d0,
    motes: { color: 0xffe9a0, n: 110, size: 0.11, vy: 0.04, vx: 0.8, sway: 0.25 },
  },
  3: { // Ember Forge
    key: 'forge', sky: ['#7a2a6a', '#d8445a', '#ff8a3a', '#ffd86a'],
    tile: '#ffa772', tileSide: '#c95a40', tileDeep: '#8a3428',
    floor: '#6a4466', floorAlt: '#5d3a5c', floorLine: '#45284a',
    wall: '#a44c48', wallAlt: '#934040', wallDeep: '#5a2230', cap: '#ffa772', capSide: '#c95a40',
    accent: '#ffd23a', moss: '#ff9a2a', mossDeep: '#ff5a1a', trim: '#ffd23a',
    flame: ['#fffbd0', '#ffd23a', '#ff6a1a'], boss: '#ff6a2a', bossFlame: ['#fffbd0', '#ffd23a', '#ff4a1a'],
    hemiSky: 0xffeedd, hemiGround: 0xa0506a, sun: 0xffe8d0,
    motes: { color: 0xffb040, n: 110, size: 0.12, vy: 0.9, sway: 0.4 },
  },
  4: { // Gloom Mire
    key: 'mire', sky: ['#3a5aa8', '#4aa8b0', '#9ae0a0', '#f2ff9a'],
    tile: '#86e6d0', tileSide: '#3f9e90', tileDeep: '#2a6e66',
    floor: '#62b268', floorAlt: '#56a35e', floorLine: '#3f8048',
    wall: '#68a8a0', wallAlt: '#5a9a92', wallDeep: '#33665e', cap: '#86e6d0', capSide: '#3f9e90',
    accent: '#f4ff6a', moss: '#a4f05a', mossDeep: '#5ab83a', trim: '#f4ff6a',
    flame: ['#ffffd0', '#f4ff6a', '#9ad02a'], boss: '#f4ff6a', bossFlame: ['#ffffe0', '#f4ff6a', '#8ad02a'],
    hemiSky: 0xf4fff0, hemiGround: 0x5aa07a, sun: 0xfffbe6,
    motes: { color: 0xf4ff6a, n: 46, size: 0.2, vy: 0.06, sway: 0.7, blink: true },
  },
  5: { // Shadow Sanctum
    key: 'sanctum', sky: ['#2e2280', '#7a4ad0', '#e07ad8', '#ffd0a0'],
    tile: '#c4aaff', tileSide: '#7c5ec8', tileDeep: '#4e3a90',
    floor: '#5244a0', floorAlt: '#483a92', floorLine: '#352a78',
    wall: '#8466cc', wallAlt: '#765abe', wallDeep: '#43308a', cap: '#c4aaff', capSide: '#7c5ec8',
    accent: '#ff7ae0', moss: '#ffcf4a', mossDeep: '#e0a020', trim: '#ffcf4a',
    flame: ['#fff0ff', '#ff9af0', '#b05aff'], boss: '#ff7ae0', bossFlame: ['#fff0ff', '#ff9af0', '#a04aff'],
    hemiSky: 0xfff0ff, hemiGround: 0x7a5ac8, sun: 0xfff0f6,
    motes: { color: 0xffb0f4, n: 80, size: 0.13, vy: 0.35, sway: 0.5 },
  },
};

// ---------------------------------------------------------------- helpers
const col = (c) => new THREE.Color(c);
export const shade = (c, l, s = 0) => '#' + col(c).offsetHSL(0, s, l).getHexString();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTex(c, { repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// A cartoon stone: flat fill, crisp light strip on the upper-left inside edge,
// shade strip on the lower-right, ink outline.
function paintStone(g, pts, base, R, { lw = 5, hl = 0.12, sh = -0.12, band = 0.16, ink = INK } = {}) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const d = Math.min(w, h) * band * 0.5;
  const path = (dx = 0, dy = 0) => { pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.closePath(); };
  g.save();
  g.beginPath(); path(); g.clip();
  g.fillStyle = shade(base, sh); g.beginPath(); path(); g.fill();
  g.fillStyle = base; g.beginPath(); path(-d, -d); g.fill();
  g.fillStyle = shade(base, hl); g.beginPath(); path(); path(d, d); g.fill('evenodd');
  g.restore();
  g.beginPath(); path(); g.strokeStyle = ink; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke();
}
function crack(g, x, y, len, R, lw = 4) {
  g.strokeStyle = INK; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y);
  let a = R() * Math.PI * 2;
  for (let s = 0; s < 3; s++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3; g.lineTo(x, y); if (s === 1 && R() < 0.6) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1) * len / 5, y + Math.sin(a + 1) * len / 5); g.moveTo(x, y); } }
  g.stroke();
}
function blobs(g, x, y, n, r, colors, R) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.beginPath(); g.arc(x + (R() - 0.5) * r * 3, y + (R() - 0.5) * r * 1.6, r * (0.4 + R() * 0.6), 0, 7); g.fill();
  }
}
function themeSpeck(g, pal, x, y, s, R) {
  switch (pal.key) {
    case 'crypt': case 'mire': blobs(g, x, y, 7, s, [pal.moss, pal.mossDeep, shade(pal.moss, 0.12)], R); break;
    case 'hive': for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff2c0' : shade(pal.tileSide, -0.05); g.beginPath(); g.arc(x + (R() - 0.5) * s * 4, y + (R() - 0.5) * s * 2, 2 + R() * 3, 0, 7); g.fill(); } break;
    case 'forge': { g.strokeStyle = '#ffd23a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 1.2, y + s * 0.5); g.lineTo(x + s * 2, y + s * 0.2); g.stroke(); g.strokeStyle = '#fff4c0'; g.lineWidth = 2; g.stroke(); break; }
    case 'sanctum': { g.fillStyle = pal.trim; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6); g.restore(); break; }
  }
}

// ---------------------------------------------------------------- textures
// Path tile tops: 2x2 atlas of variants.
export function tileTopAtlas(pal, seed = 1) {
  const R = makeRng(seed * 31 + 7).next;
  const N = 512, c = canvas(N * 2, N * 2), g = c.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * N, oy = Math.floor(v / 2) * N;
    g.save(); g.translate(ox, oy);
    g.fillStyle = pal.tile; g.fillRect(0, 0, N, N);
    const m = 30, w = (a) => a + (R() - 0.5) * 10;
    const pts = [[w(m + 30), w(m)], [w(N / 2), w(m - 4)], [w(N - m - 30), w(m)], [w(N - m), w(m + 30)], [w(N - m + 4), w(N / 2)], [w(N - m), w(N - m - 30)], [w(N - m - 30), w(N - m)], [w(N / 2), w(N - m + 4)], [w(m + 30), w(N - m)], [w(m), w(N - m - 30)], [w(m - 4), w(N / 2)], [w(m), w(m + 30)]];
    const base = shade(pal.tile, (R() - 0.5) * 0.04);
    paintStone(g, pts, base, R, { lw: 8, hl: 0.1, sh: -0.09, band: 0.1 });
    // chips and cracks
    g.save(); poly(g, pts); g.clip();
    for (let k = 0; k < 1 + Math.floor(R() * 2); k++) crack(g, 120 + R() * 270, 120 + R() * 270, 90 + R() * 70, R, 5);
    for (let k = 0; k < 3; k++) { g.fillStyle = shade(base, 0.08); const x = 80 + R() * 350, y = 80 + R() * 350; g.beginPath(); g.ellipse(x, y, 10 + R() * 14, 5 + R() * 6, R() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 18; k++) { g.fillStyle = shade(base, -0.07); g.beginPath(); g.arc(60 + R() * 390, 60 + R() * 390, 2 + R() * 4, 0, 7); g.fill(); }
    const corner = pts[[0, 3, 6, 9][Math.floor(R() * 4)]];
    themeSpeck(g, pal, corner[0] + (N / 2 - corner[0]) * 0.18, corner[1] + (N / 2 - corner[1]) * 0.18, 16, R);
    g.restore();
    g.restore();
  }
  const t = canvasTex(c, { aniso: 8 });
  return t;
}

// Painted icon stickers: 2x2 atlas (monster, treasure, trap, blank).
export const STICKER_INDEX = { monster: 0, treasure: 1, trap: 2, blank: 3 };
export function drawSkull(g, s = 1) {
  g.save(); g.scale(s, s);
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = INK; g.fillStyle = '#fff6e4';
  g.beginPath(); g.moveTo(-72, -6); g.bezierCurveTo(-78, -96, 78, -96, 72, -6); g.bezierCurveTo(70, 26, 50, 34, 44, 40); g.lineTo(44, 70); g.lineTo(-44, 70); g.lineTo(-44, 40); g.bezierCurveTo(-50, 34, -70, 26, -72, -6); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d8cbb8'; g.beginPath(); g.moveTo(-40, 42); g.lineTo(40, 42); g.lineTo(40, 66); g.lineTo(-40, 66); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-30, -56, 22, 10, -0.5, 0, 7); g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(-30, -4, 22, 25, 0.25, 0, 7); g.fill();
  g.beginPath(); g.ellipse(30, -4, 22, 25, -0.25, 0, 7); g.fill();
  g.fillStyle = '#ff5a6a'; g.beginPath(); g.arc(-26, -2, 7, 0, 7); g.arc(34, -2, 7, 0, 7); g.fill();
  g.fillStyle = INK; g.beginPath(); g.moveTo(-9, 30); g.lineTo(0, 14); g.lineTo(9, 30); g.closePath(); g.fill();
  g.lineWidth = 7; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 22, 44); g.lineTo(i * 22, 68); g.stroke(); }
  g.restore();
}
export function drawBag(g, s = 1) {
  g.save(); g.scale(s, s);
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = INK;
  // coins behind
  const coin = (x, y, r) => { g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, 7); g.fill(); g.lineWidth = 9; g.stroke(); g.fillStyle = '#fff2a0'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.35, r * 0.2, -0.4, 0, 7); g.fill(); };
  coin(62, 60, 30); coin(-66, 64, 26);
  g.lineWidth = 12;
  g.fillStyle = '#c47a34';
  g.beginPath(); g.moveTo(-30, -62); g.quadraticCurveTo(0, -48, 30, -62); g.lineTo(20, -34); g.bezierCurveTo(86, -10, 80, 78, 0, 80); g.bezierCurveTo(-80, 78, -86, -10, -20, -34); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e8a050'; g.beginPath(); g.ellipse(-26, 6, 18, 30, 0.3, 0, 7); g.fill();
  g.fillStyle = '#ff5a6a'; g.beginPath(); g.moveTo(-26, -36); g.quadraticCurveTo(0, -24, 26, -36); g.lineTo(26, -26); g.quadraticCurveTo(0, -14, -26, -26); g.closePath(); g.fill(); g.lineWidth = 8; g.stroke();
  g.fillStyle = '#ffd23a'; g.font = '900 78px "Luckiest Guy", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeText('$', 0, 30); g.fillText('$', 0, 30);
  coin(30, 78, 24);
  g.restore();
}
function drawSaw(g, s = 1) {
  g.save(); g.scale(s, s);
  g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 12;
  const teeth = 12;
  g.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.55) / teeth) * Math.PI * 2, a2 = ((i + 1) / teeth) * Math.PI * 2;
    const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
    const [x0, y0] = p(a0, 66), [x1, y1] = p(a1, 92), [x2, y2] = p(a2, 66);
    if (i === 0) g.moveTo(x0, y0);
    g.lineTo(x1, y1); g.lineTo(x2, y2);
  }
  g.closePath(); g.fillStyle = '#e4ecff'; g.fill(); g.stroke();
  g.fillStyle = '#b8c4e8'; g.beginPath(); g.arc(0, 0, 52, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 52, Math.PI * 1.05, Math.PI * 1.6); g.arc(0, 0, 36, Math.PI * 1.6, Math.PI * 1.05, true); g.fill();
  g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 52, 0, 7); g.stroke();
  g.fillStyle = '#7a3ad0'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill(); g.stroke();
  g.restore();
}
function drawRune(g, s = 1, color = INK, alpha = 0.32) {
  g.save(); g.scale(s, s); g.globalAlpha = alpha; g.strokeStyle = color; g.lineCap = 'round';
  g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 74, 0, 7); g.stroke();
  g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 50, 0, 7); g.stroke();
  for (let i = 0; i < 8; i++) { g.save(); g.rotate((i / 8) * Math.PI * 2); g.beginPath(); g.moveTo(0, -54); g.lineTo(0, -70); g.stroke(); g.restore(); }
  g.beginPath(); g.moveTo(0, -30); g.lineTo(24, 0); g.lineTo(0, 30); g.lineTo(-24, 0); g.closePath(); g.stroke();
  g.restore();
}
export function stickerAtlas(pal) {
  const N = 512, c = canvas(N * 2, N * 2), g = c.getContext('2d');
  const disc = (fill, ring) => {
    g.fillStyle = 'rgba(26,16,38,.35)'; g.beginPath(); g.arc(8, 14, 200, 0, 7); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 202, 0, 7); g.fill();
    g.fillStyle = ring; g.beginPath(); g.arc(0, 0, 190, 0, 7); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 164, 0, 7); g.fill();
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, 156, 0, 7); g.fill();
    g.fillStyle = shade(fill, 0.1); g.beginPath(); g.arc(0, 0, 156, Math.PI * 0.95, Math.PI * 1.7); g.arc(0, 0, 124, Math.PI * 1.7, Math.PI * 0.95, true); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-92, -110, 26, 12, -0.7, 0, 7); g.fill();
  };
  const cell = (i, fn) => { g.save(); g.translate((i % 2) * N + N / 2, Math.floor(i / 2) * N + N / 2); fn(); g.restore(); };
  cell(0, () => { disc('#ee3a52', '#fff3dc'); drawSkull(g, 1.25); });
  cell(1, () => { disc('#ffbe2e', '#fff3dc'); drawBag(g, 1.2); });
  cell(2, () => { disc('#8f52ea', '#fff3dc'); drawSaw(g, 1.3); });
  cell(3, () => { drawRune(g, 1.7, INK, 0.28); g.translate(-4, -5); drawRune(g, 1.7, '#ffffff', 0.22); });
  const t = canvasTex(c, { aniso: 8 });
  return t;
}

export function labelTex(text, fill = '#ffffff', stroke = INK) {
  const c = canvas(512, 160), g = c.getContext('2d');
  g.font = '110px "Luckiest Guy", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = stroke; g.strokeText(text, 256, 88);
  g.fillStyle = fill; g.fillText(text, 256, 88);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(text, 252, 82);
  g.fillStyle = fill; g.save(); g.beginPath(); g.rect(0, 92, 512, 80); g.clip(); g.fillStyle = shade(fill, -0.12); g.fillText(text, 256, 88); g.restore();
  return canvasTex(c);
}

// Round platform tops (start / boss) painted radially.
export function platformTex(pal, kind) {
  const N = 512, c = canvas(N, N), g = c.getContext('2d');
  const R = makeRng(kind === 'start' ? 5 : 9).next;
  g.translate(N / 2, N / 2);
  const base = kind === 'start' ? pal.tile : shade(pal.tileSide, 0.06);
  g.fillStyle = base; g.fillRect(-N, -N, 2 * N, 2 * N);
  // ring of wedge stones
  const ringStones = (r0, r1, n, color, off = 0) => {
    for (let i = 0; i < n; i++) {
      const a0 = ((i + off) / n) * Math.PI * 2 + 0.02, a1 = ((i + 1 + off) / n) * Math.PI * 2 - 0.02;
      const pts = [];
      for (let k = 0; k <= 4; k++) { const a = a0 + (a1 - a0) * k / 4; pts.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
      for (let k = 4; k >= 0; k--) { const a = a0 + (a1 - a0) * k / 4; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
      paintStone(g, pts, shade(color, (R() - 0.5) * 0.05), R, { lw: 6, band: 0.25 });
    }
  };
  ringStones(196, 254, 14, shade(base, -0.02));
  ringStones(120, 196, 10, shade(base, 0.03), 0.5);
  paintStone(g, Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * Math.PI * 2) * 120, Math.sin(i / 16 * Math.PI * 2) * 120]), shade(base, 0.05), R, { lw: 6, band: 0.12 });
  if (kind === 'start') {
    g.globalAlpha = 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    g.beginPath(); g.arc(0, 0, 86, 0, 7); g.stroke();
    g.fillStyle = '#7ab8ff'; g.strokeStyle = INK; g.lineWidth = 6;
    for (let i = 0; i < 6; i++) { g.save(); g.rotate(i / 6 * Math.PI * 2); g.beginPath(); g.moveTo(0, -76); g.lineTo(16, -48); g.lineTo(0, -36); g.lineTo(-16, -48); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = pal.boss; g.strokeStyle = INK; g.lineWidth = 6;
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * Math.PI * 2); g.beginPath(); g.moveTo(0, -104); g.lineTo(12, -84); g.lineTo(0, -64); g.lineTo(-12, -84); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  }
  return canvasTex(c, { aniso: 8 });
}

// Big cartoon flagstones for the room floor.
export function floorTex(pal, seed = 3) {
  const R = makeRng(seed * 17 + 3).next;
  const N = 1024, c = canvas(N, N), g = c.getContext('2d');
  g.fillStyle = pal.floorLine; g.fillRect(0, 0, N, N);
  const cells = 4, s = N / cells;
  const jit = Array.from({ length: cells + 1 }, () => Array.from({ length: cells + 1 }, () => [(R() - 0.5) * 50, (R() - 0.5) * 50]));
  for (let i = 0; i <= cells; i++) { jit[i][cells] = jit[i][0]; jit[cells][i] = jit[0][i]; }
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const P = (a, b) => [a * s + jit[a][b][0], b * s + jit[a][b][1]];
    const gap = 9;
    const [a, b, cc, d] = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    const inset = (p, q) => [p[0] + (q[0] - p[0]) * 0.04 + 0, p[1] + (q[1] - p[1]) * 0.04];
    const ctr = [(a[0] + cc[0]) / 2, (a[1] + cc[1]) / 2];
    const pts = [a, b, cc, d].map((p) => [p[0] + (ctr[0] - p[0]) * (gap / s) * 2, p[1] + (ctr[1] - p[1]) * (gap / s) * 2]);
    // chamfer corners
    const ch = [];
    pts.forEach((p, k) => { const q = pts[(k + 3) % 4], r = pts[(k + 1) % 4]; ch.push([p[0] + (q[0] - p[0]) * 0.1, p[1] + (q[1] - p[1]) * 0.1], [p[0] + (r[0] - p[0]) * 0.1, p[1] + (r[1] - p[1]) * 0.1]); });
    void inset;
    const base = R() < 0.5 ? pal.floor : pal.floorAlt;
    paintStone(g, ch, shade(base, (R() - 0.5) * 0.03), R, { lw: 5, hl: 0.045, sh: -0.05, band: 0.06, ink: pal.floorLine });
    g.save(); poly(g, ch); g.clip();
    if (R() < 0.18) crack(g, ctr[0] + (R() - 0.5) * 120, ctr[1] + (R() - 0.5) * 120, 70 + R() * 50, R, 4);
    for (let k = 0; k < 5; k++) { g.fillStyle = shade(base, -0.05); g.beginPath(); g.arc(ctr[0] + (R() - 0.5) * 200, ctr[1] + (R() - 0.5) * 200, 2 + R() * 5, 0, 7); g.fill(); }
    if (R() < 0.35) themeSpeck(g, pal, ch[0][0] + 30, ch[0][1] + 30, 18, R);
    g.restore();
  }
  // wrap seams: tile repeats cleanly because jitter wraps
  const t = canvasTex(c, { repeat: true, aniso: 8 });
  return t;
}

// Stylised bricks (or honeycomb for the hive) for the back walls.
export function wallTex(pal, seed = 5) {
  const R = makeRng(seed * 13 + 1).next;
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = pal.wallDeep; g.fillRect(0, 0, W, H);
  if (pal.key === 'hive') {
    const r = 46, hh = r * Math.sqrt(3);
    for (let cx = 0, i = 0; cx < W + r * 2; cx += r * 1.5, i++) {
      for (let cy = (i % 2) * hh / 2 - hh; cy < H + hh; cy += hh) {
        const pts = Array.from({ length: 6 }, (_, k) => [cx + Math.cos(k * Math.PI / 3) * (r - 4), cy + Math.sin(k * Math.PI / 3) * (r - 4)]);
        const honey = R() < 0.22;
        paintStone(g, pts, honey ? '#ffcf3a' : shade(R() < 0.5 ? pal.wall : pal.wallAlt, (R() - 0.5) * 0.04), R, { lw: 6, band: 0.2, hl: honey ? 0.15 : 0.1 });
        if (honey) { g.fillStyle = '#fff6c0'; g.beginPath(); g.ellipse(cx - 12, cy - 12, 10, 5, -0.6, 0, 7); g.fill(); }
      }
    }
    // the 1.5r step doesn't tile at 512 exactly: repaint a seam-free edge by mirroring
    g.drawImage(c, 0, 0, 8, H, W - 8, 0, 8, H);
  } else {
    const bh = 64, bw = 128;
    for (let r = 0; r < H / bh; r++) {
      const off = (r % 2) * (bw / 2);
      for (let x = -off; x < W; x += bw) {
        const x0 = x + 5, y0 = r * bh + 5, x1 = x + bw - 5, y1 = r * bh + bh - 5;
        const w = () => (R() - 0.5) * 5;
        const pts = [[x0 + 6 + w(), y0 + w()], [x1 - 6 + w(), y0 + w()], [x1 + w(), y0 + 6], [x1 + w(), y1 - 6], [x1 - 6, y1 + w()], [x0 + 6, y1 + w()], [x0 + w(), y1 - 6], [x0 + w(), y0 + 6]];
        const k = R();
        const base = k < 0.45 ? pal.wall : k < 0.85 ? pal.wallAlt : shade(pal.wall, 0.06);
        paintStone(g, pts, shade(base, (R() - 0.5) * 0.03), R, { lw: 6, band: 0.22, hl: 0.11, sh: -0.1 });
        if (R() < 0.18) crack(g, x0 + 20 + R() * 70, y0 + 10 + R() * 30, 40, R, 4);
        if (pal.key === 'forge' && R() < 0.12) themeSpeck(g, pal, x0 + 30, y0 + 25, 20, R);
        if (pal.key === 'sanctum' && R() < 0.08) themeSpeck(g, pal, (x0 + x1) / 2, (y0 + y1) / 2, 22, R);
      }
    }
    // wrap the half-bricks that straddle the right edge
    g.drawImage(c, 0, 0, 64, H, W, 0, 64, H);
  }
  // moss / vines / drips along the top
  if (pal.key === 'crypt' || pal.key === 'mire') {
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 100 + R() * 40;
      const len = 80 + R() * 200;
      g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, -4); g.bezierCurveTo(x + 20, len * 0.3, x - 20, len * 0.6, x + 6, len); g.stroke();
      g.strokeStyle = pal.mossDeep; g.lineWidth = 5; g.stroke();
      for (let l = 30; l < len; l += 34) {
        const t = l / len, lx = x + Math.sin(t * 6) * 10, side = (l / 34) % 2 ? 1 : -1;
        g.fillStyle = pal.moss; g.strokeStyle = INK; g.lineWidth = 4;
        g.beginPath(); g.ellipse(lx + side * 13, l, 13, 7, side * 0.5, 0, 7); g.fill(); g.stroke();
      }
    }
  } else if (pal.key === 'hive') {
    for (let i = 0; i < 6; i++) {
      const x = 30 + i * 86 + R() * 30, len = 40 + R() * 110;
      g.fillStyle = '#ffc020'; g.strokeStyle = INK; g.lineWidth = 6;
      g.beginPath(); g.moveTo(x - 16, -4); g.lineTo(x - 10, len - 14); g.arc(x, len - 10, 12, Math.PI, 0, true); g.lineTo(x + 14, -4); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff2b0'; g.fillRect(x - 6, 8, 5, len - 26);
    }
  }
  return canvasTex(c, { repeat: true, aniso: 8 });
}

export function skyTex(pal) {
  const c = canvas(4, 512), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  pal.sky.forEach((s, i) => gr.addColorStop(i / (pal.sky.length - 1), s));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  return canvasTex(c);
}

let _glow;
export function glowTex() {
  if (_glow) return _glow;
  const c = canvas(64, 64), g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  _glow = canvasTex(c);
  return _glow;
}
// Crisp four-point sparkle for motes and bursts.
let _spark;
export function sparkTex() {
  if (_spark) return _spark;
  const c = canvas(64, 64), g = c.getContext('2d');
  g.translate(32, 32);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 6 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  _spark = canvasTex(c);
  return _spark;
}
const _flames = {};
export function flameTex(colors) {
  const key = colors.join();
  if (_flames[key]) return _flames[key];
  const c = canvas(128, 192), g = c.getContext('2d');
  const shape = (s, dy) => {
    g.beginPath(); g.moveTo(64, 10 + dy);
    g.bezierCurveTo(64 + 30 * s, 60 + dy, 64 + 56 * s, 96, 64 + 50 * s, 136);
    g.bezierCurveTo(64 + 44 * s, 176, 64 - 44 * s, 176, 64 - 50 * s, 136);
    g.bezierCurveTo(64 - 56 * s, 96, 64 - 18 * s, 80 + dy, 64 - 8 * s, 40 + dy);
    g.bezierCurveTo(64 - 4 * s, 50 + dy, 60, 30 + dy, 64, 10 + dy); g.closePath();
  };
  g.lineJoin = 'round';
  shape(1, 0); g.fillStyle = colors[2]; g.fill(); g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
  g.save(); g.translate(0, 34); g.translate(64, 150); g.scale(0.66, 0.66); g.translate(-64, -150); shape(1, 10); g.fillStyle = colors[1]; g.fill(); g.restore();
  g.save(); g.translate(64, 150); g.scale(0.34, 0.34); g.translate(-64, -150); shape(1, 30); g.fillStyle = colors[0]; g.fill(); g.restore();
  _flames[key] = canvasTex(c);
  return _flames[key];
}
let _shadow;
export function shadowTex() {
  if (_shadow) return _shadow;
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = 'rgba(30,14,48,.5)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.fillStyle = 'rgba(30,14,48,.25)'; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.fill();
  _shadow = canvasTex(c);
  return _shadow;
}
// Bouncing "pick me" marker: chunky gold arrow with ink and highlight.
let _marker;
export function markerTex() {
  if (_marker) return _marker;
  const c = canvas(128, 160), g = c.getContext('2d');
  const pts = [[30, 14], [98, 14], [98, 70], [122, 70], [64, 146], [6, 70], [30, 70]];
  g.lineJoin = 'round';
  poly(g, pts); g.fillStyle = '#ffd23a'; g.fill(); g.lineWidth = 12; g.strokeStyle = INK; g.stroke();
  g.save(); poly(g, pts); g.clip();
  g.fillStyle = '#ff9a1a'; g.beginPath(); g.moveTo(64, 146); g.lineTo(122, 70); g.lineTo(98, 70); g.lineTo(98, 14); g.lineTo(78, 14); g.lineTo(78, 84); g.lineTo(100, 84); g.closePath(); g.fill();
  g.fillStyle = '#fff6c0'; g.fillRect(38, 22, 12, 46); g.beginPath(); g.moveTo(22, 78); g.lineTo(40, 78); g.lineTo(56, 100); g.closePath(); g.fill();
  g.restore();
  poly(g, pts); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
  _marker = canvasTex(c);
  return _marker;
}
let _bag;
export function bagTex() {
  if (_bag) return _bag;
  const c = canvas(256, 256), g = c.getContext('2d');
  g.translate(128, 124); drawBag(g, 1.15);
  _bag = canvasTex(c);
  return _bag;
}

// Wall banner per theme.
export function bannerTex(pal) {
  const c = canvas(160, 400), g = c.getContext('2d');
  const color = { crypt: '#d8324a', hive: '#e0602a', forge: '#3a3a6a', mire: '#7a3ab0', sanctum: '#ff6ad0' }[pal.key];
  g.lineJoin = 'round';
  g.fillStyle = '#6a4024'; g.fillRect(4, 8, 152, 18); g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(4, 8, 152, 18);
  const pts = [[16, 26], [144, 26], [144, 370], [80, 320], [16, 370]];
  poly(g, pts); g.fillStyle = color; g.fill();
  g.save(); poly(g, pts); g.clip(); g.fillStyle = shade(color, 0.1); g.fillRect(16, 26, 24, 360); g.fillStyle = shade(color, -0.1); g.fillRect(120, 26, 24, 360);
  g.strokeStyle = pal.trim; g.lineWidth = 10; g.beginPath(); g.moveTo(30, 40); g.lineTo(130, 40); g.stroke(); g.beginPath(); g.moveTo(16, 340); g.lineTo(80, 292); g.lineTo(144, 340); g.stroke();
  g.restore();
  poly(g, pts); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
  g.save(); g.translate(80, 160);
  if (pal.key === 'crypt') drawSkull(g, 0.6);
  else { g.fillStyle = pal.trim; g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 22 : 50; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
  g.restore();
  return canvasTex(c);
}
// Stained window for the sanctum / glowing vent for the forge.
export function windowTex(pal) {
  const c = canvas(200, 300), g = c.getContext('2d');
  const shapeP = () => { g.beginPath(); g.moveTo(14, 290); g.lineTo(14, 100); g.arc(100, 100, 86, Math.PI, 0); g.lineTo(186, 290); g.closePath(); };
  shapeP(); g.fillStyle = INK; g.fill();
  g.save(); shapeP(); g.clip();
  const cols = pal.key === 'forge' ? ['#ffd23a', '#ff8a1a', '#ff5a1a'] : pal.key === 'sanctum' ? ['#ff7ae0', '#6ae8ff', '#ffcf4a', '#b07aff'] : ['#ffe28a', '#ffc070', '#9ae0ff'];
  const R = makeRng(4).next;
  for (let y = 20; y < 300; y += 46) for (let x = 0; x < 200; x += 46) {
    g.fillStyle = cols[Math.floor(R() * cols.length)];
    g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + 42, y + 4 + (R() - 0.5) * 8); g.lineTo(x + 42, y + 42); g.lineTo(x + 4, y + 42); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(30, 60, 14, 200);
  g.restore();
  shapeP(); g.lineWidth = 12; g.strokeStyle = INK; g.stroke();
  g.lineWidth = 6; g.strokeStyle = pal.trim; g.beginPath(); g.moveTo(100, 14); g.lineTo(100, 290); g.moveTo(14, 170); g.lineTo(186, 170); g.stroke();
  return canvasTex(c);
}
// Scrolling liquid (lava / water / honey) with cartoon blobs.
export function liquidTex(kind) {
  const N = 256, c = canvas(N, N), g = c.getContext('2d');
  const R = makeRng(kind.length * 11).next;
  const P = kind === 'lava' ? ['#ff6a1a', '#ffb020', '#fff27a'] : kind === 'water' ? ['#3ac8f0', '#7ae8ff', '#e8ffff'] : ['#ffb020', '#ffd23a', '#fff6b0'];
  g.fillStyle = P[0]; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 26; i++) {
    const x = R() * N, y = R() * N, r = 10 + R() * 26;
    for (const [dx, dy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      g.fillStyle = P[1]; g.beginPath(); g.ellipse(x + dx, y + dy, r, r * 0.6, 0.3, 0, 7); g.fill();
      if (r > 22) { g.fillStyle = P[2]; g.beginPath(); g.ellipse(x + dx - r * 0.2, y + dy - r * 0.1, r * 0.4, r * 0.2, 0.3, 0, 7); g.fill(); }
    }
  }
  return canvasTex(c, { repeat: true });
}

// ---------------------------------------------------------------- materials
let _ramp;
export function toonRamp() {
  if (_ramp) return _ramp;
  // Crisp two-tone with a thin bright highlight band.
  const d = new Uint8Array([150, 150, 150, 255, 150, 150, 150, 255, 222, 222, 222, 255, 222, 222, 222, 255, 222, 222, 222, 255, 255, 255, 255, 255]);
  _ramp = new THREE.DataTexture(d, 6, 1, THREE.RGBAFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}
export const toon = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...opts });
export const inkMaterial = () => new THREE.MeshBasicMaterial({ color: INK_HEX, side: THREE.BackSide });

// ---------------------------------------------------------------- batching
// Collects static geometry by material key, bakes transforms and vertex
// colours, and emits one mesh per key plus one merged ink-hull mesh.
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color();
export class Batcher {
  constructor() { this.groups = {}; this.ink = []; }
  add(geom, matrix, { key = 'lit', color = 0xffffff, colorFn = null, ink = 0, flat = false, uvFn = null } = {}) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (flat) g.computeVertexNormals();
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const pos = g.attributes.position, colors = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      if (colorFn) { _v.fromBufferAttribute(pos, i); colorFn(_v, _c); }
      colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (uvFn) {
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { _v.fromBufferAttribute(pos, i); const [u, w] = uvFn(_v); uv[i * 2] = u; uv[i * 2 + 1] = w; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    if (ink > 0) {
      g.computeBoundingBox();
      const b = g.boundingBox, sz = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      const s = new THREE.Vector3(1 + 2 * ink / Math.max(sz.x, 0.02), 1 + 2 * ink / Math.max(sz.y, 0.02), 1 + 2 * ink / Math.max(sz.z, 0.02));
      const hull = new THREE.Matrix4().makeTranslation(ctr.x, ctr.y, ctr.z).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z));
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', g.attributes.position.clone());
      hg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, hull));
      this.ink.push(hg);
    }
    g.applyMatrix4(matrix);
    (this.groups[key] ||= []).push(g);
    return this;
  }
  static merge(list, attrs) {
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const a of attrs) {
      const size = list[0].attributes[a]?.itemSize ?? (a === 'uv' ? 2 : 3);
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const g of list) {
        const src = g.attributes[a];
        if (src) arr.set(src.array.subarray(0, src.count * size), o);
        o += g.attributes.position.count * size;
      }
      out.setAttribute(a, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    return out;
  }
  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [key, list] of Object.entries(this.groups)) {
      if (!list.length) continue;
      const hasUv = list.some((g) => g.attributes.uv);
      const geo = Batcher.merge(list, hasUv ? ['position', 'normal', 'color', 'uv'] : ['position', 'normal', 'color']);
      const mat = materials[key];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow && !mat.userData?.noShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.userData.batchKey = key;
      meshes.push(mesh);
    }
    if (this.ink.length) {
      const mesh = new THREE.Mesh(Batcher.merge(this.ink, ['position']), materials.ink);
      mesh.userData.batchKey = 'ink';
      meshes.push(mesh);
    }
    return meshes;
  }
}

// ---------------------------------------------------------------- props
// A prop is a list of parts in local space plus flame anchors; bounds are
// computed so the board can keep props clear of sprites and walls.
export class Prop {
  constructor() { this.parts = []; this.flames = []; this.glows = []; }
  part(geom, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], ink = 0.03, key = 'lit', flat = false, colorFn = null } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    this.parts.push({ geom, color, m, ink, key, flat, colorFn });
    return this;
  }
  flame(x, y, z, size = 0.35, colors = null) { this.flames.push({ p: [x, y, z], size, colors }); return this; }
  bounds() {
    const box = new THREE.Box3();
    for (const pt of this.parts) {
      pt.geom.computeBoundingBox();
      box.union(pt.geom.boundingBox.clone().applyMatrix4(pt.m));
    }
    for (const f of this.flames) box.expandByPoint(new THREE.Vector3(f.p[0], f.p[1] + f.size, f.p[2]));
    return box;
  }
  addTo(batch, world) {
    for (const pt of this.parts) batch.add(pt.geom, new THREE.Matrix4().multiplyMatrices(world, pt.m), { color: pt.color, ink: pt.ink, key: pt.key, flat: pt.flat, colorFn: pt.colorFn });
  }
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg),
  sph: (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h),
  rock: (r, detail = 0) => new THREE.DodecahedronGeometry(r, detail),
  ico: (r) => new THREE.IcosahedronGeometry(r, 0),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  cone: (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  tor: (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
};
export { G };

export function boulder(pal, size = 0.4, R = Math.random, color = null) {
  const pr = new Prop();
  const c = color || (R() < 0.5 ? pal.cap : shade(pal.cap, -0.05));
  pr.part(G.rock(size), c, { s: [1 + R() * 0.3, 0.65 + R() * 0.25, 1 + R() * 0.2], r: [R() * 0.4, R() * 6, R() * 0.4], p: [0, size * 0.45, 0], flat: true, ink: 0.035 });
  return pr;
}
export function boulderPile(pal, R, n = 3, size = 0.32) {
  const pr = new Prop();
  for (let i = 0; i < n; i++) {
    const s = size * (0.6 + R() * 0.6), a = R() * 6.28, d = i ? size * (0.7 + R() * 0.5) : 0;
    pr.part(G.rock(s), R() < 0.5 ? pal.cap : shade(pal.cap, -0.06), { s: [1.1, 0.7, 1], r: [R() * 0.5, R() * 6, R() * 0.5], p: [Math.cos(a) * d, s * 0.5, Math.sin(a) * d], flat: true, ink: 0.03 });
  }
  return pr;
}
function candle(pr, pal, x, z, h, y = 0) {
  pr.part(G.cyl(0.07, 0.08, h, 10), '#fff1d6', { p: [x, y + h / 2, z], ink: 0.022 });
  pr.part(G.cyl(0.085, 0.085, 0.03, 10), '#f4dcb0', { p: [x, y + h - 0.04, z], ink: 0 });
  pr.flame(x, y + h + 0.02, z, 0.22);
}

// Theme prop sets ------------------------------------------------------------
export const THEME_PROPS = {
  crypt: {
    big: [
      (pal, R) => { // coffin lying down
        const pr = new Prop();
        const s = new THREE.Shape(); s.moveTo(0, -0.62); s.lineTo(0.2, -0.52); s.lineTo(0.28, 0.12); s.lineTo(0.18, 0.62); s.lineTo(-0.18, 0.62); s.lineTo(-0.28, 0.12); s.lineTo(-0.2, -0.52); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); g.rotateX(-Math.PI / 2);
        pr.part(g, '#9a5f3a', { p: [0, 0.03, 0], ink: 0.035 });
        const lid = g.clone(); pr.part(lid, '#b97a4a', { p: [0.03, 0.27, -0.02], s: [0.92, 0.25, 0.94], r: [0, 0.08, 0], ink: 0.03 });
        pr.part(G.box(0.07, 0.03, 0.42), '#ffc94a', { p: [0.03, 0.36, -0.1], ink: 0.015 });
        pr.part(G.box(0.26, 0.03, 0.07), '#ffc94a', { p: [0.03, 0.36, -0.2], ink: 0.015 });
        return pr;
      },
      (pal, R) => { // gravestone
        const pr = new Prop();
        const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(-0.3, 0.55); s.absarc(0, 0.55, 0.3, Math.PI, 0, true); s.lineTo(0.3, 0); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 8 });
        pr.part(g, shade(pal.wall, 0.12), { p: [0, 0, -0.07], r: [-0.08, (R() - 0.5) * 0.4, (R() - 0.5) * 0.15], ink: 0.03 });
        pr.part(G.box(0.06, 0.3, 0.02), '#5a5490', { p: [0, 0.5, 0.1], ink: 0 });
        pr.part(G.box(0.2, 0.06, 0.02), '#5a5490', { p: [0, 0.56, 0.1], ink: 0 });
        pr.part(G.rock(0.12), pal.moss, { p: [0.2, 0.05, 0.08], s: [1.4, 0.5, 1], flat: true, ink: 0.02 });
        return pr;
      },
      (pal, R) => { // candle cluster
        const pr = new Prop();
        pr.part(G.cyl(0.32, 0.36, 0.08, 14), '#f4e2c0', { p: [0, 0.04, 0], ink: 0.025 });
        candle(pr, pal, 0, 0, 0.45, 0.08); candle(pr, pal, 0.17, 0.1, 0.28, 0.08); candle(pr, pal, -0.15, 0.12, 0.2, 0.08);
        return pr;
      },
      (pal, R) => { // urn
        const pts = [[0, 0], [0.16, 0], [0.26, 0.15], [0.28, 0.32], [0.18, 0.5], [0.14, 0.58], [0.2, 0.64], [0, 0.64]].map(([x, y]) => new THREE.Vector2(x, y));
        return new Prop().part(new THREE.LatheGeometry(pts, 14), '#5ac0a8', { ink: 0.03 }).part(G.tor(0.21, 0.025, 6, 16), '#ffc94a', { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0], ink: 0 });
      },
    ],
    small: [
      (pal, R) => { // skull
        const pr = new Prop();
        pr.part(G.sph(0.15, 12, 10), '#fff6e4', { p: [0, 0.14, 0], s: [1, 0.9, 1.05], ink: 0.025 });
        pr.part(G.box(0.15, 0.08, 0.1), '#efe2c8', { p: [0, 0.05, 0.07], ink: 0.02 });
        pr.part(G.sph(0.045, 8, 6), '#1a1026', { p: [-0.06, 0.15, 0.12], ink: 0 }).part(G.sph(0.045, 8, 6), '#1a1026', { p: [0.06, 0.15, 0.12], ink: 0 });
        return pr;
      },
      (pal, R) => { // bones
        const pr = new Prop();
        for (let i = 0; i < 2; i++) {
          const a = R() * 3, m = [Math.cos(a) * 0.22, Math.sin(a) * 0.22];
          pr.part(G.cyl(0.035, 0.035, 0.44, 6), '#fff1d6', { p: [0, 0.05 + i * 0.05, 0], r: [Math.PI / 2, 0, a], ink: 0.02 });
          pr.part(G.sph(0.06, 6, 5), '#fff1d6', { p: [m[1], 0.05 + i * 0.05, m[0]], ink: 0.02 }).part(G.sph(0.06, 6, 5), '#fff1d6', { p: [-m[1], 0.05 + i * 0.05, -m[0]], ink: 0.02 });
        }
        return pr;
      },
      (pal, R) => { const pr = new Prop(); candle(pr, pal, 0, 0, 0.18 + R() * 0.2); return pr; },
    ],
  },
  hive: {
    big: [
      (pal, R) => { // beehive dome
        const pr = new Prop();
        for (let i = 0; i < 4; i++) pr.part(G.tor(0.36 - i * 0.07, 0.11, 8, 18), i % 2 ? '#f0a83a' : '#ffc24a', { p: [0, 0.1 + i * 0.17, 0], r: [Math.PI / 2, 0, 0], ink: 0.025 });
        pr.part(G.sph(0.12, 10, 8), '#ffc24a', { p: [0, 0.72, 0], ink: 0.025 });
        pr.part(G.cyl(0.09, 0.09, 0.04, 12), '#5a2a10', { p: [0, 0.22, 0.34], r: [Math.PI / 2, 0, 0], ink: 0 });
        return pr;
      },
      (pal, R) => { // amber crystal cluster
        const pr = new Prop();
        for (let i = 0; i < 4; i++) {
          const h = 0.35 + R() * 0.45, a = R() * 6.28, d = i ? 0.14 : 0;
          pr.part(G.cone(0.1 + R() * 0.05, h, 6), i % 2 ? '#ffb020' : '#ff8a1a', { key: 'glow', p: [Math.cos(a) * d, h / 2, Math.sin(a) * d], r: [(R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6], ink: 0.025, flat: true });
        }
        pr.part(G.rock(0.22), pal.cap, { p: [0, 0.06, 0], s: [1.2, 0.5, 1.2], flat: true, ink: 0.025 });
        return pr;
      },
      (pal, R) => { // honey pot
        const pts = [[0, 0], [0.2, 0], [0.3, 0.16], [0.3, 0.3], [0.2, 0.44], [0.22, 0.5], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
        return new Prop().part(new THREE.LatheGeometry(pts, 14), '#c46a34', { ink: 0.03 })
          .part(G.cyl(0.19, 0.19, 0.04, 14), '#ffcf3a', { key: 'glow', p: [0, 0.47, 0], ink: 0 })
          .part(G.cyl(0.05, 0.03, 0.22, 8), '#ffcf3a', { key: 'glow', p: [0.25, 0.32, 0], ink: 0.015 });
      },
      (pal, R) => { // broken sandstone column
        const pr = new Prop(); const h = 0.5 + R() * 0.5;
        pr.part(G.cyl(0.26, 0.28, h, 10), shade(pal.tile, -0.02), { p: [0, h / 2 + 0.08, 0], ink: 0.03, flat: true });
        pr.part(G.box(0.7, 0.12, 0.7), pal.tileSide, { p: [0, 0.06, 0], ink: 0.03 });
        return pr;
      },
    ],
    small: [
      (pal, R) => boulder(pal, 0.2, R, shade(pal.tile, -0.04)),
      (pal, R) => new Prop().part(G.sph(0.35, 12, 6), shade(pal.floor, 0.06), { s: [1.4, 0.35, 1], ink: 0.02 }),
      (pal, R) => new Prop().part(G.oct(0.12), '#ffb020', { key: 'glow', p: [0, 0.1, 0], s: [1, 1.6, 1], ink: 0.02, flat: true }),
    ],
  },
  forge: {
    big: [
      (pal, R) => { // anvil
        const pr = new Prop();
        pr.part(G.box(0.36, 0.22, 0.3), '#4a4466', { p: [0, 0.11, 0], ink: 0.03 });
        pr.part(G.box(0.18, 0.18, 0.18), '#5a5478', { p: [0, 0.3, 0], ink: 0.025 });
        pr.part(G.box(0.66, 0.14, 0.26), '#6e6a94', { p: [0.04, 0.44, 0], ink: 0.03 });
        pr.part(G.cone(0.13, 0.26, 4), '#6e6a94', { p: [-0.4, 0.44, 0], r: [0, 0, Math.PI / 2], ink: 0.025, flat: true });
        pr.part(G.box(0.5, 0.03, 0.2), '#a8a4d0', { p: [0.04, 0.52, 0], ink: 0 });
        return pr;
      },
      (pal, R) => { // barrel
        const pr = new Prop();
        pr.part(G.cyl(0.24, 0.24, 0.6, 12), '#a8643a', { p: [0, 0.3, 0], s: [1, 1, 1], ink: 0.03, colorFn: (v, c) => c.set(Math.abs(v.y) > 0.17 && Math.abs(v.y) < 0.23 ? '#4a4466' : '#a8643a') });
        pr.part(G.cyl(0.22, 0.22, 0.02, 12), '#ffb020', { key: 'glow', p: [0, 0.6, 0], ink: 0 });
        return pr;
      },
      (pal, R) => { // weapon rack
        const pr = new Prop();
        pr.part(G.box(0.9, 0.08, 0.12), '#7a4a2a', { p: [0, 0.75, 0], ink: 0.025 });
        pr.part(G.box(0.08, 0.8, 0.12), '#7a4a2a', { p: [-0.42, 0.4, 0], ink: 0.025 }).part(G.box(0.08, 0.8, 0.12), '#7a4a2a', { p: [0.42, 0.4, 0], ink: 0.025 });
        for (let i = -1; i <= 1; i++) {
          pr.part(G.box(0.06, 0.62, 0.02), '#d8e0ff', { p: [i * 0.22, 0.42, 0.08], ink: 0.018 });
          pr.part(G.box(0.18, 0.04, 0.04), '#ffc94a', { p: [i * 0.22, 0.76, 0.08], ink: 0.015 });
        }
        return pr;
      },
      (pal, R) => { // coal brazier bowl
        const pr = new Prop();
        pr.part(G.cyl(0.36, 0.22, 0.3, 10), '#4a4466', { p: [0, 0.15, 0], ink: 0.03 });
        for (let i = 0; i < 6; i++) pr.part(G.rock(0.09), i % 2 ? '#ff8a1a' : '#ffd23a', { key: 'glow', p: [(R() - 0.5) * 0.36, 0.3, (R() - 0.5) * 0.36], flat: true, ink: 0.015 });
        pr.flame(0, 0.36, 0, 0.45);
        return pr;
      },
    ],
    small: [
      (pal, R) => { const pr = new Prop(); for (let i = 0; i < 4; i++) pr.part(G.rock(0.1), i % 2 ? '#3a3050' : '#2a2440', { p: [(R() - 0.5) * 0.3, 0.06, (R() - 0.5) * 0.3], flat: true, ink: 0.015 }); pr.part(G.rock(0.06), '#ffb020', { key: 'glow', p: [0, 0.1, 0], flat: true, ink: 0 }); return pr; },
      (pal, R) => new Prop().part(G.box(0.4, 0.06, 0.12), '#d8e0ff', { p: [0, 0.03, 0], r: [0, R() * 3, 0], ink: 0.018 }),
      (pal, R) => boulder(pal, 0.2, R, shade(pal.tileSide, 0.05)),
    ],
  },
  mire: {
    big: [
      (pal, R) => { // mushrooms
        const pr = new Prop();
        const cols = ['#ff5a7a', '#b06aff', '#ff8a3a'];
        for (let i = 0; i < 3; i++) {
          const h = 0.25 + R() * 0.45, a = R() * 6.28, d = i ? 0.22 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, r = 0.14 + h * 0.35;
          pr.part(G.cyl(0.05, 0.07, h, 8), '#fff1d6', { p: [x, h / 2, z], ink: 0.02 });
          pr.part(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cols[i % 3], { p: [x, h - 0.02, z], s: [1, 0.75, 1], ink: 0.025 });
          for (let k = 0; k < 3; k++) { const b = k * 2.1 + a; pr.part(G.sph(0.03, 6, 4), '#ffffff', { p: [x + Math.cos(b) * r * 0.55, h + r * 0.45, z + Math.sin(b) * r * 0.55], ink: 0 }); }
        }
        return pr;
      },
      (pal, R) => { // stump with roots
        const pr = new Prop();
        pr.part(G.cyl(0.3, 0.36, 0.45, 10), '#9a6a40', { p: [0, 0.22, 0], ink: 0.03, flat: true });
        pr.part(G.cyl(0.27, 0.27, 0.02, 10), '#e8c08a', { p: [0, 0.46, 0], ink: 0 });
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6 + R(), curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(Math.cos(a) * 0.4, 0.12, Math.sin(a) * 0.4), new THREE.Vector3(Math.cos(a + 0.4) * 0.7, 0.02, Math.sin(a + 0.4) * 0.7)]);
          pr.part(new THREE.TubeGeometry(curve, 8, 0.06, 6), '#8a5a34', { ink: 0.02 });
        }
        pr.part(G.rock(0.16), pal.moss, { p: [0.1, 0.46, 0], s: [1.3, 0.4, 1.1], flat: true, ink: 0.02 });
        return pr;
      },
      (pal, R) => { // reeds
        const pr = new Prop();
        for (let i = 0; i < 6; i++) { const h = 0.45 + R() * 0.5; pr.part(G.cone(0.035, h, 5), i % 2 ? '#7ad04a' : '#5ab83a', { p: [(R() - 0.5) * 0.4, h / 2, (R() - 0.5) * 0.4], r: [(R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3], ink: 0.015 }); if (i % 2) pr.part(G.cyl(0.05, 0.05, 0.16, 6), '#8a5a34', { p: [(R() - 0.5) * 0.3, h * 0.8, (R() - 0.5) * 0.3], ink: 0.015 }); }
        return pr;
      },
      (pal, R) => boulderPile(pal, R, 3, 0.3),
    ],
    small: [
      (pal, R) => { const pr = new Prop(); const h = 0.15 + R() * 0.15; pr.part(G.cyl(0.03, 0.04, h, 6), '#fff1d6', { p: [0, h / 2, 0], ink: 0.015 }); pr.part(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ff5a7a', { p: [0, h, 0], s: [1, 0.7, 1], ink: 0.018 }); return pr; },
      (pal, R) => new Prop().part(G.rock(0.16), pal.moss, { p: [0, 0.04, 0], s: [1.5, 0.4, 1.2], flat: true, ink: 0.02 }),
    ],
  },
  sanctum: {
    big: [
      (pal, R) => { // crystal cluster
        const pr = new Prop();
        const cols = ['#ff7ae0', '#6ae8ff', '#c49aff'];
        for (let i = 0; i < 5; i++) {
          const h = 0.35 + R() * 0.6, a = R() * 6.28, d = i ? 0.16 : 0;
          pr.part(G.oct(0.12 + R() * 0.05), cols[i % 3], { key: 'glow', p: [Math.cos(a) * d, h / 2, Math.sin(a) * d], s: [1, h / 0.22, 1], r: [(R() - 0.5) * 0.5, R(), (R() - 0.5) * 0.5], ink: 0.022, flat: true });
        }
        pr.part(G.rock(0.24), pal.cap, { p: [0, 0.06, 0], s: [1.2, 0.5, 1.2], flat: true, ink: 0.025 });
        return pr;
      },
      (pal, R) => { // pedestal with orb
        const pr = new Prop();
        pr.part(G.box(0.5, 0.12, 0.5), pal.tileSide, { p: [0, 0.06, 0], ink: 0.03 });
        pr.part(G.cyl(0.14, 0.18, 0.6, 8), pal.tile, { p: [0, 0.42, 0], ink: 0.03, flat: true });
        pr.part(G.cyl(0.24, 0.16, 0.1, 8), pal.trim, { p: [0, 0.76, 0], ink: 0.025 });
        pr.part(G.sph(0.16, 14, 10), '#6ae8ff', { key: 'glow', p: [0, 0.96, 0], ink: 0.025 });
        return pr;
      },
      (pal, R) => { // broken column
        const pr = new Prop(); const h = 0.5 + R() * 0.6;
        pr.part(G.cyl(0.24, 0.26, h, 8), shade(pal.tile, -0.04), { p: [0, h / 2 + 0.1, 0], ink: 0.03, flat: true });
        pr.part(G.box(0.62, 0.14, 0.62), pal.tileSide, { p: [0, 0.07, 0], ink: 0.03 });
        pr.part(G.tor(0.25, 0.03, 6, 12), pal.trim, { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0], ink: 0 });
        return pr;
      },
    ],
    small: [
      (pal, R) => new Prop().part(G.oct(0.12), R() < 0.5 ? '#ff7ae0' : '#6ae8ff', { key: 'glow', p: [0, 0.12, 0], s: [1, 1.7, 1], ink: 0.02, flat: true }),
      (pal, R) => boulder(pal, 0.18, R),
    ],
  },
};

// Brazier used on the boss dais (built as a live group, not batched).
export function brazierProp(pal) {
  const pr = new Prop();
  pr.part(G.cyl(0.08, 0.14, 0.9, 8), '#4a3a5a', { p: [0, 0.45, 0], ink: 0.025 });
  pr.part(G.cyl(0.3, 0.3, 0.06, 10), '#4a3a5a', { p: [0, 0.03, 0], ink: 0.025 });
  pr.part(G.cyl(0.38, 0.18, 0.28, 10), '#6a5a7a', { p: [0, 1.0, 0], ink: 0.03 });
  pr.part(G.tor(0.36, 0.04, 6, 14), pal.trim, { p: [0, 1.12, 0], r: [Math.PI / 2, 0, 0], ink: 0 });
  pr.flame(0, 1.12, 0, 0.8, pal.bossFlame);
  return pr;
}
// Wall torch (bracket + bowl).
export function torchProp(pal) {
  const pr = new Prop();
  pr.part(G.box(0.1, 0.36, 0.1), '#4a3a5a', { p: [0, 0, 0.05], ink: 0.02 });
  pr.part(G.box(0.08, 0.08, 0.3), '#4a3a5a', { p: [0, 0.1, 0.18], ink: 0.02 });
  pr.part(G.cyl(0.16, 0.08, 0.16, 8), '#6a5a7a', { p: [0, 0.2, 0.32], ink: 0.022 });
  pr.flame(0, 0.27, 0.32, 0.5);
  return pr;
}

// Cartoon dust puff (soft cloud with a faint ink rim).
let _puff;
export function puffTex() {
  if (_puff) return _puff;
  const c = canvas(128, 128), g = c.getContext('2d');
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); };
  g.fillStyle = 'rgba(26,16,38,.35)';
  for (const [x, y, r] of [[64, 70, 40], [38, 78, 26], [90, 76, 28], [58, 46, 28], [82, 52, 22]]) { blob(x, y + 3, r + 3); g.fill(); }
  g.fillStyle = '#ffffff';
  for (const [x, y, r] of [[64, 70, 40], [38, 78, 26], [90, 76, 28], [58, 46, 28], [82, 52, 22]]) { blob(x, y, r); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.08)'; blob(70, 84, 30); g.fill();
  _puff = canvasTex(c);
  return _puff;
}
// Gold coin for treasure showers.
let _coin;
export function coinTex() {
  if (_coin) return _coin;
  const c = canvas(64, 64), g = c.getContext('2d');
  g.lineWidth = 6; g.strokeStyle = INK;
  g.fillStyle = '#e09a1a'; g.beginPath(); g.ellipse(32, 34, 25, 25, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(30, 31, 19, 19, 0, 0, 7); g.fill();
  g.fillStyle = '#fff6b0'; g.beginPath(); g.ellipse(24, 24, 7, 4, -0.7, 0, 7); g.fill();
  g.strokeStyle = '#c47a14'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 20); g.lineTo(30, 42); g.stroke();
  _coin = canvasTex(c);
  return _coin;
}
