// Relix v0.2: BattleScene, a Fire Emblem-style battle cut-in.
//
// The board dims and both fighters' full art (no card frame) faces off on a themed
// stage. Under each fighter's feet sit a name plate and a chunky HP bar. Everything
// is DOM + WAAPI transforms/opacity plus one 2D canvas for particles, so it stays
// cheap on phones (no extra WebGL context).
//
//   const scene = new BattleScene();
//   await scene.open({ left, right, kind, theme });
//   const rect = scene.diceArea();             // hand to DiceTray.roll({ area: rect })
//   await scene.strike('left', { dmg: 3, crit: true });
//   await scene.defeat('right', 'shatter');
//   await scene.close();
//
// Sound: fires window `relix:sfx` CustomEvents ({ name, intensity }) for
// hit, crit, miss, whoosh, ko and vs.

const ART_BASE = new URL('../assets/chars/', import.meta.url).href;
const UI_BASE = new URL('../assets/ui/', import.meta.url).href;

// Which way an art file looks. 'right' / 'left' arts get mirrored so the fighters
// face each other; 'front' (the default) art gets a slight 3D turn instead.
export const ART_FACING = {
  luke: 'right', dragonkin: 'right', shi: 'front', yessi: 'front', josue: 'front',
  chan_kong: 'front', nowtna: 'front', skeleton_warrior: 'front', trov: 'front',
  brevha: 'front', ikias_monster: 'front', skeleton_general: 'front', vore: 'front',
  raskon: 'front', enguxi: 'front', ikias_boss: 'front',
};

const DEFAULT_THEME = { name: 'The Dungeon', sky: 0x241a38, fog: 0x161022, ground: 0x2e2540, accent: 0xf2c443, light: 0xffe8b0 };

// ---------------------------------------------------------------- color utils
const hex = (c, d = '#ffffff') => (c == null ? d : typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c);
function rgbOf(c) {
  let s = hex(c).replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
const lum = (c) => { const [r, g, b] = rgbOf(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function motifOf(theme) {
  if (theme.motif) return theme.motif;
  const n = (theme.name || '').toLowerCase();
  if (/crypt|bone|tomb/.test(n)) return 'crypt';
  if (/sand|hive|desert/.test(n)) return 'sand';
  if (/ember|forge|fire|lava/.test(n)) return 'ember';
  if (/mire|gloom|swamp|bog/.test(n)) return 'mire';
  if (/shadow|sanctum|void/.test(n)) return 'sanctum';
  return 'dungeon';
}

// Seeded RNG so a theme's backdrop always looks the same.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const strSeed = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sfx = (name, intensity = 1) => window.dispatchEvent(new CustomEvent('relix:sfx', { detail: { name, intensity } }));
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cached soft round sprite per color, used for glows, motes and smoke.
const spriteCache = new Map();
function glowSprite(color, soft = 0.5) {
  const key = `${color}|${soft}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(soft * 0.5, rgba(color, 0.55));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

// =====================================================================
export class BattleScene {
  constructor(opts = {}) {
    this.opts = opts;
    this.speed = opts.speed ?? 1;           // time multiplier, like game.speed (< 0.05 = instant)
    this._rmForce = opts.reducedMotion;     // true/false overrides the OS setting
    this._open = false;
    this._gen = 0;
    this._q = Promise.resolve();
    this._anims = new Set();
    this._parts = [];
    this._raf = 0;
    this._last = 0;
    this._bgKey = '';
    this._build(opts.parent || document.body);
    this._onResize = () => { if (this._open) this._layout(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this._onVis = () => { if (!document.hidden && this._open) this._startLoop(); };
    document.addEventListener('visibilitychange', this._onVis);
  }

  get isOpen() { return this._open; }
  set reducedMotion(v) { this._rmForce = v; }
  get reducedMotion() {
    if (this._rmForce != null) return !!this._rmForce;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  get _instant() { return this.speed < 0.05; }
  _T(ms) { return this._instant ? 0 : ms * this.speed * (this.reducedMotion ? 0.6 : 1); }
  _wait(ms) { const t = this._T(ms); return t <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, t)); }

  // ------------------------------------------------------------- DOM
  _build(parent) {
    const R = (this.root = el('div', 'bt-overlay'));
    R.setAttribute('aria-hidden', 'true');
    R.style.display = 'none';
    R.innerHTML = `
      <div class="bt-dim"></div>
      <div class="bt-cam">
        <div class="bt-band">
          <canvas class="bt-bg"></canvas>
          <div class="bt-rays"></div>
          <div class="bt-arena"><div class="bt-arena-in"><i></i><i></i><i></i></div></div>
          <div class="bt-darken"></div>
        </div>
        <div class="bt-edge top"><i></i></div><div class="bt-edge bot"><i></i></div>
        <div class="bt-fighters"></div>
        <canvas class="bt-fx"></canvas>
        <div class="bt-plates"></div>
        <div class="bt-head"><span class="bt-kind"></span><span class="bt-theme"></span></div>
        <div class="bt-vs"><span>V</span><span>S</span></div>
        <div class="bt-pops"></div>
      </div>
      <div class="bt-flash"></div>
      <div class="bt-safe"></div>`;
    parent.appendChild(R);
    const q = (s) => R.querySelector(s);
    this.$ = {
      dim: q('.bt-dim'), cam: q('.bt-cam'), band: q('.bt-band'), bg: q('.bt-bg'), rays: q('.bt-rays'),
      arena: q('.bt-arena'), darken: q('.bt-darken'), fighters: q('.bt-fighters'), fx: q('.bt-fx'),
      plates: q('.bt-plates'), head: q('.bt-head'), kind: q('.bt-kind'), theme: q('.bt-theme'),
      vs: q('.bt-vs'), pops: q('.bt-pops'), flash: q('.bt-flash'), safe: q('.bt-safe'),
      edgeT: q('.bt-edge.top'), edgeB: q('.bt-edge.bot'),
    };
    this.ctx = this.$.fx.getContext('2d');
    this.F = { left: this._buildFighter('left'), right: this._buildFighter('right') };
  }

  _buildFighter(side) {
    const f = { side };
    f.root = el('div', `bt-f ${side}`);
    f.root.innerHTML = `
      <div class="bt-plat"><i class="bt-plat-glow"></i><i class="bt-plat-top"></i></div>
      <div class="bt-shadow"></div>
      <div class="bt-act"><div class="bt-idle"><div class="bt-turn">
        <img class="bt-art" alt="" draggable="false"><i class="bt-tint"></i>
      </div></div></div>`;
    f.plat = f.root.querySelector('.bt-plat');
    f.shadow = f.root.querySelector('.bt-shadow');
    f.act = f.root.querySelector('.bt-act');
    f.idle = f.root.querySelector('.bt-idle');
    f.turn = f.root.querySelector('.bt-turn');
    f.img = f.root.querySelector('.bt-art');
    f.tint = f.root.querySelector('.bt-tint');
    f.plate = el('div', `bt-plate ${side}`);
    f.plate.innerHTML = `
      <div class="bt-pennant"><i></i></div>
      <div class="bt-name"><span class="bt-nm"></span><em class="bt-tag"></em></div>
      <div class="bt-hp">
        <img class="bt-heart" src="${UI_BASE}heart.webp" alt="">
        <div class="bt-bar"><i class="bt-ghost"></i><i class="bt-fill"></i><i class="bt-ticks"></i><i class="bt-gloss"></i></div>
        <span class="bt-num"><b>0</b><small>/0</small></span>
      </div>
      <div class="bt-atk"><img src="${UI_BASE}sword.webp" alt=""><b></b></div>
      <div class="bt-ko">K.O.</div>`;
    f.fill = f.plate.querySelector('.bt-fill');
    f.ghost = f.plate.querySelector('.bt-ghost');
    f.ticks = f.plate.querySelector('.bt-ticks');
    f.bar = f.plate.querySelector('.bt-bar');
    f.numB = f.plate.querySelector('.bt-num b');
    f.numS = f.plate.querySelector('.bt-num small');
    f.pennant = f.plate.querySelector('.bt-pennant');
    f.ko = f.plate.querySelector('.bt-ko');
    this.$.fighters.appendChild(f.root);
    this.$.plates.appendChild(f.plate);
    return f;
  }

  // ------------------------------------------------------------- open
  async open({ left, right, kind = 'monster', theme } = {}) {
    this._gen++;
    this._cancelAll();
    this._parts.length = 0;
    this.kind = kind;
    this.theme = { ...DEFAULT_THEME, ...(theme || {}) };
    this.motif = motifOf(this.theme);
    const th = this.theme;
    const S = this.root.style;
    S.setProperty('--bt-sky', hex(th.sky));
    S.setProperty('--bt-fog', hex(th.fog));
    S.setProperty('--bt-accent', hex(th.accent));
    S.setProperty('--bt-light', hex(th.light));
    S.setProperty('--bt-ground', hex(th.ground));
    this.root.dataset.kind = kind;
    this.root.dataset.motif = this.motif;
    this.root.classList.toggle('bt-rm', this.reducedMotion);
    this.$.kind.textContent = kind === 'boss' ? 'Boss Battle' : kind === 'pvp' ? 'Duel' : 'Battle';
    this.$.theme.textContent = th.name || '';

    const loads = [this._setFighter(this.F.left, left || {}), this._setFighter(this.F.right, right || {})];
    this.root.style.display = 'block';
    this.root.setAttribute('aria-hidden', 'false');
    this._open = true;
    this.root.classList.remove('bt-closing');
    this.root.classList.add('bt-intro');
    await Promise.all(loads);
    this._layout();
    this._seedAmbient();
    this._startLoop();
    const gen = this._gen;
    const p = this._intro().catch((e) => console.error(e)).finally(() => { if (gen === this._gen) this.root.classList.remove('bt-intro'); });
    this._q = p;
    return p;
  }

  async _setFighter(f, d) {
    f.data = d;
    f.dead = false;
    f.hp = d.hp ?? d.maxHp ?? 1;
    f.maxHp = Math.max(1, d.maxHp ?? d.hp ?? 1);
    f.boss = this.kind === 'boss' && d.side !== 'hero';
    f.root.className = `bt-f ${f.side}${f.boss ? ' boss' : ''} ${d.side === 'hero' ? 'hero' : 'enemy'}`;
    f.plate.className = `bt-plate ${f.side}${f.boss ? ' boss' : ''} ${d.side === 'hero' ? 'hero' : 'enemy'}`;
    f.root.style.opacity = '';
    f.act.style.opacity = '';
    f.img.style.filter = '';
    f.root.querySelectorAll('.bt-ghostimg').forEach((g) => g.remove());
    const art = d.art || d.id || 'skeleton_warrior';
    const url = /[/.]/.test(art) ? art : `${ART_BASE}${art}.webp`;
    f.url = url;
    // Fighters face each other: left looks right, right looks left.
    const facing = d.facing || ART_FACING[art] || 'front';
    f.mirror = (f.side === 'left' && facing === 'left') || (f.side === 'right' && facing === 'right');
    f.turn.classList.toggle('mirror', f.mirror);
    f.turn.classList.toggle('front', facing === 'front');
    f.tint.style.webkitMaskImage = f.tint.style.maskImage = `url("${url}")`;
    f.plate.querySelector('.bt-nm').textContent = d.name || '';
    f.plate.querySelector('.bt-tag').textContent = f.boss ? 'BOSS' : d.side === 'hero' ? (d.title || '') : '';
    f.plate.querySelector('.bt-atk b').textContent = d.atk != null ? d.atk : '';
    f.plate.querySelector('.bt-atk').style.display = d.atk != null ? '' : 'none';
    // Pennant in the fighter's banner colors.
    if (d.banner) {
      f.pennant.style.display = '';
      f.pennant.style.setProperty('--pf', d.banner.field || '#2f6fd1');
      f.pennant.style.setProperty('--pa', d.banner.accent || '#f2c443');
      f.pennant.style.setProperty('--pe', d.banner.emblemColor || d.banner.accent || '#f4ecdf');
    } else f.pennant.style.display = 'none';
    const glow = d.banner?.field || (d.side === 'hero' ? '#f2c443' : hex(this.theme.accent));
    f.root.style.setProperty('--bt-glow', d.side === 'hero' ? (d.banner?.field || '#f2c443') : (f.boss ? hex(this.theme.accent) : '#e5484d'));
    f.plate.style.setProperty('--bt-side', d.side === 'hero' ? (d.banner?.field || '#3d6fd6') : (f.boss ? mix(hex(this.theme.accent), '#7a1020', 0.35) : '#b8322e'));
    f.glow = glow;
    f.ko.style.opacity = '0';
    f.plate.classList.remove('dead');
    // Ticks: one per HP for small pools, one per 10 for big ones.
    const step = f.maxHp <= 12 ? 1 : f.maxHp <= 40 ? 5 : 10;
    f.ticks.style.backgroundSize = `${(100 * step) / f.maxHp}% 100%`;
    f.ticks.style.display = f.maxHp > 1 ? '' : 'none';
    this._paintHp(f, f.hp, true);
    f.img.src = url;
    f.imgObj = f.img;
    try { await f.img.decode(); } catch { /* broken art still lays out */ }
    f.aspect = f.img.naturalWidth && f.img.naturalHeight ? f.img.naturalWidth / f.img.naturalHeight : 0.9;
    f.alphaMap = null;
  }

  // ------------------------------------------------------------- layout
  _safe() {
    const cs = getComputedStyle(this.$.safe);
    return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
  }

  _layout() {
    const W = this.root.clientWidth || innerWidth, H = this.root.clientHeight || innerHeight;
    const sa = this._safe();
    const portrait = H / W > 1.15;
    this.root.classList.toggle('portrait', portrait);
    this.root.classList.toggle('landscape', !portrait);
    const L = { W, H, portrait, sa };
    const { left: A, right: B } = this.F;
    const box = (f, S) => {
      const a = f.aspect || 0.9;
      return a >= 1 ? { w: S, h: S / a } : { w: S * a, h: S };
    };
    if (portrait) {
      L.bTop = Math.max(sa.t - 14, 10);
      L.bBot = H - Math.max(sa.b * 0.5, 10);
      const bh = L.bBot - L.bTop;
      L.horizon = L.bTop + bh * 0.3;
      const sB = B.boss ? Math.min(W * 0.76, bh * 0.37) : Math.min(W * 0.58, bh * 0.29);
      const sA = A.boss ? Math.min(W * 0.66, bh * 0.33) : Math.min(W * 0.56, bh * 0.28);
      L.right = { x: W * (B.boss ? 0.62 : 0.67), y: L.bTop + bh * (B.boss ? 0.445 : 0.41), ...box(B, sB) };
      L.left = { x: W * 0.3, y: L.bBot - Math.max(96, sa.b + 70), ...box(A, sA) };
      const pw = Math.min(W * 0.62, 260);
      L.pw = pw;
      L.plateL = { x: clamp(L.left.x - pw * 0.42, 10 + sa.l, W - pw - 10), y: L.left.y + 6 };
      L.plateR = { x: clamp(L.right.x - pw * 0.58, 10, W - pw - 10 - sa.r), y: L.right.y + 6 };
      const top = L.plateR.y + 78, bot = Math.max(top + 130, L.left.y - L.left.h * 0.62);
      L.dice = { x: W * 0.06, y: top, w: W * 0.88, h: bot - top };
      L.arena = { x: W * 0.5, y: L.dice.y + L.dice.h * 0.62, r: Math.min(W * 0.46, 200) };
    } else {
      const bh0 = Math.min(H - 16, Math.max(H * 0.86, 360));
      L.bTop = Math.max((H - bh0) / 2, sa.t);
      L.bBot = Math.min(L.bTop + bh0, H - sa.b);
      const bh = L.bBot - L.bTop;
      L.horizon = L.bTop + bh * 0.48;
      const ground = L.bTop + bh * 0.72;
      const base = Math.min(bh * 0.5, W * 0.26);
      const sA = A.boss ? Math.min(bh * 0.6, W * 0.32) : base;
      const sB = B.boss ? Math.min(bh * 0.62, W * 0.33) : base;
      L.left = { x: W * 0.24, y: ground, ...box(A, sA) };
      L.right = { x: W * 0.76, y: ground, ...box(B, sB) };
      const pw = Math.min(W * 0.3, 300);
      L.pw = pw;
      L.plateL = { x: clamp(L.left.x - pw / 2, 10 + sa.l, W - pw - 10), y: ground + 10 };
      L.plateR = { x: clamp(L.right.x - pw / 2, 10, W - pw - 10 - sa.r), y: ground + 10 };
      const x0 = L.left.x + L.left.w * 0.42, x1 = L.right.x - L.right.w * 0.42;
      const dw = Math.max(x1 - x0, W * 0.24);
      const dh = Math.min(bh * 0.46, 280);
      L.dice = { x: W / 2 - dw / 2, y: ground - dh + 12, w: dw, h: dh };
      L.arena = { x: W / 2, y: ground - 6, r: Math.min(dw * 0.55, 210) };
    }
    this.L = L;
    // Band + edges
    const band = this.$.band.style;
    band.top = `${L.bTop}px`; band.height = `${L.bBot - L.bTop}px`;
    const sl = portrait ? 18 : 26, ew = Math.hypot(L.W, sl), ang = Math.atan2(sl, L.W) * 180 / Math.PI;
    this.$.band.style.setProperty('--bt-slant', `${sl}px`);
    for (const [e, y] of [[this.$.edgeT, L.bTop + sl / 2], [this.$.edgeB, L.bBot - sl / 2]]) {
      e.style.top = `${y - 1.5}px`; e.style.width = `${ew}px`; e.style.left = `${(L.W - ew) / 2}px`;
      e.style.transform = `rotate(${-ang}deg)`;
    }
    this.$.head.style.top = `${L.bTop + (portrait ? Math.max(sa.t - L.bTop + 4, 14) : 14)}px`;
    // Fighters
    for (const side of ['left', 'right']) {
      const f = this.F[side], p = L[side];
      const s = f.root.style;
      s.left = `${p.x - p.w / 2}px`; s.top = `${p.y - p.h}px`; s.width = `${p.w}px`; s.height = `${p.h}px`;
      f.pos = p;
      const pl = side === 'left' ? L.plateL : L.plateR;
      f.plate.style.left = `${pl.x}px`; f.plate.style.top = `${pl.y}px`; f.plate.style.width = `${L.pw}px`;
    }
    // Arena ring
    const ar = this.$.arena.style;
    ar.left = `${L.arena.x - L.arena.r}px`; ar.top = `${L.arena.y - L.arena.r - L.bTop}px`;
    ar.width = ar.height = `${L.arena.r * 2}px`;
    this.$.vs.style.left = `${L.dice.x + L.dice.w / 2}px`;
    this.$.vs.style.top = `${L.dice.y + L.dice.h * 0.45}px`;
    // Canvases
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fx = this.$.fx;
    if (fx.width !== Math.round(W * dpr) || fx.height !== Math.round(H * dpr)) {
      fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
    }
    this.dpr = dpr;
    const key = `${W}x${H}|${dpr}|${JSON.stringify(this.theme)}|${this.motif}|${L.bTop}|${L.bBot}`;
    if (key !== this._bgKey) { this._bgKey = key; this._drawBackdrop(); }
  }

  diceArea() {
    if (!this.L) return new DOMRect(innerWidth * 0.2, innerHeight * 0.35, innerWidth * 0.6, innerHeight * 0.3);
    const r = this.root.getBoundingClientRect();
    const d = this.L.dice;
    return new DOMRect(r.left + d.x, r.top + d.y, d.w, d.h);
  }

  // ------------------------------------------------------------- backdrop
  _drawBackdrop() {
    const L = this.L, th = this.theme, cv = this.$.bg, dpr = Math.min(this.dpr, 1.5);
    const W = L.W, H = L.bBot - L.bTop;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = rng(strSeed(th.name + this.motif));
    const sky = hex(th.sky), fog = hex(th.fog), acc = hex(th.accent), light = hex(th.light), ground = hex(th.ground);
    const hz = L.horizon - L.bTop;
    // Sky
    let grd = g.createLinearGradient(0, 0, 0, hz);
    grd.addColorStop(0, mix(sky, '#000000', 0.55));
    grd.addColorStop(0.6, sky);
    grd.addColorStop(1, mix(sky, light, 0.28));
    g.fillStyle = grd; g.fillRect(0, 0, W, hz + 2);
    // Horizon glow
    grd = g.createRadialGradient(W / 2, hz, 0, W / 2, hz, Math.max(W, H) * 0.6);
    grd.addColorStop(0, rgba(light, 0.38)); grd.addColorStop(0.35, rgba(acc, 0.16)); grd.addColorStop(1, rgba(acc, 0));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const far = mix(fog, '#000000', 0.25), farLit = mix(fog, acc, 0.18);
    this._drawMotif(g, this.motif, W, H, hz, R, { far, farLit, acc, light, fog, sky });
    // Haze at horizon
    grd = g.createLinearGradient(0, hz - H * 0.12, 0, hz + H * 0.06);
    grd.addColorStop(0, rgba(fog, 0)); grd.addColorStop(0.7, rgba(mix(fog, light, 0.15), 0.75)); grd.addColorStop(1, rgba(fog, 0));
    g.fillStyle = grd; g.fillRect(0, hz - H * 0.12, W, H * 0.18);
    // Floor: perspective flagstones
    this._drawFloor(g, W, H, hz, R, { ground, acc, light, fog });
    // Side pillars for depth
    this._drawFrame(g, W, H, hz, R, { acc, light, fog });
    // Vignette
    grd = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }

  _drawMotif(g, motif, W, H, hz, R, c) {
    g.save();
    const base = hz + 2;
    if (motif === 'crypt' || motif === 'dungeon') {
      // Gothic arcade
      const n = Math.max(4, Math.round(W / 110)), pw = W / n;
      g.fillStyle = c.far;
      for (let i = -1; i <= n; i++) {
        const x = i * pw + pw * 0.5, top = hz - H * 0.2 - R() * H * 0.03;
        g.fillRect(x - pw * 0.09, top, pw * 0.18, base - top);
        g.beginPath();
        g.moveTo(x + pw * 0.09, top + pw * 0.1);
        g.quadraticCurveTo(x + pw * 0.5, top - pw * 0.45, x + pw * 0.91, top + pw * 0.1);
        g.lineTo(x + pw * 0.91, top - pw * 0.05); g.lineTo(x + pw * 0.09, top - pw * 0.05);
        g.fill();
      }
      g.fillRect(0, hz - H * 0.26, W, H * 0.04);
      // Glowing windows between pillars
      for (let i = 0; i < n; i++) {
        const x = i * pw + pw, y = hz - H * 0.14;
        const gr = g.createRadialGradient(x, y, 0, x, y, pw * 0.35);
        gr.addColorStop(0, rgba(c.acc, 0.35)); gr.addColorStop(1, rgba(c.acc, 0));
        g.fillStyle = gr; g.fillRect(x - pw * 0.4, y - pw * 0.4, pw * 0.8, pw * 0.8);
      }
      if (motif === 'crypt') {
        g.fillStyle = mix(c.far, '#000000', 0.25);
        for (let i = 0; i < 9; i++) {
          const x = R() * W, w = 10 + R() * 14, h = 14 + R() * 18, y = base - h;
          g.beginPath(); g.moveTo(x, base); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, base); g.fill();
          if (R() < 0.5) { g.fillRect(x + w / 2 - 1.5, y - 8, 3, 10); g.fillRect(x + w / 2 - 5, y - 5, 10, 3); }
        }
      } else {
        // torches
        for (let i = 0; i < n; i += 2) {
          const x = i * pw + pw * 0.5, y = hz - H * 0.11;
          const gr = g.createRadialGradient(x, y, 0, x, y, 40);
          gr.addColorStop(0, rgba('#ffcf70', 0.6)); gr.addColorStop(1, rgba('#ff8a2a', 0));
          g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80);
        }
      }
    } else if (motif === 'sand') {
      // Dunes and hive mounds
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = mix(c.far, c.acc, 0.08 + layer * 0.06);
        const amp = H * (0.05 - layer * 0.012), off = R() * 6;
        const y0 = hz - H * (0.1 - layer * 0.035);
        g.beginPath(); g.moveTo(0, base);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + Math.sin(x / W * (3 + layer) + off) * amp);
        g.lineTo(W, base); g.fill();
      }
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.3 + R() * 0.4) * W / 4, r = 18 + R() * 24, y = base;
        g.fillStyle = mix(c.far, '#000000', 0.15);
        g.beginPath(); g.ellipse(x, y, r, r * 1.5, 0, Math.PI, 0); g.fill();
        g.fillStyle = rgba(c.acc, 0.55);
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x - r * 0.4 + k * r * 0.4, y - r * (0.5 + (k % 2) * 0.4), 2.5, 3.5, 0, 0, 7); g.fill(); }
      }
    } else if (motif === 'ember') {
      // Jagged volcanic peaks with lava glow
      for (let layer = 0; layer < 2; layer++) {
        g.fillStyle = layer ? mix(c.far, '#000000', 0.3) : c.far;
        g.beginPath(); g.moveTo(0, base);
        let x = 0;
        while (x < W + 30) { const pk = hz - H * (0.08 + R() * (layer ? 0.1 : 0.18)); g.lineTo(x + 15, pk); x += 30 + R() * 50; g.lineTo(x, hz - H * 0.03 * R()); }
        g.lineTo(W, base); g.fill();
      }
      g.strokeStyle = rgba(c.acc, 0.7); g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        let x = R() * W, y = hz - H * 0.06 * R();
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += rand(-8, 8); y += 5 + R() * 6; g.lineTo(x, y); }
        g.stroke();
      }
      const gr = g.createLinearGradient(0, hz - 10, 0, base);
      gr.addColorStop(0, rgba(c.acc, 0)); gr.addColorStop(1, rgba(c.acc, 0.45));
      g.fillStyle = gr; g.fillRect(0, hz - 10, W, 12);
    } else if (motif === 'mire') {
      // Dead twisted trees
      const tree = (x, y, len, ang, w, d) => {
        if (d <= 0 || len < 4) return;
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        tree(x2, y2, len * 0.72, ang - 0.4 - R() * 0.3, w * 0.65, d - 1);
        tree(x2, y2, len * 0.68, ang + 0.35 + R() * 0.3, w * 0.65, d - 1);
      };
      g.strokeStyle = c.far; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * W / 6 + rand(-15, 15);
        tree(x, base, H * (0.06 + R() * 0.05), -Math.PI / 2 + rand(-0.15, 0.15), 6 + R() * 4, 5);
      }
      for (let i = 0; i < 14; i++) {
        const x = R() * W, y = hz - R() * H * 0.15;
        const gr = g.createRadialGradient(x, y, 0, x, y, 5);
        gr.addColorStop(0, rgba(c.acc, 0.9)); gr.addColorStop(1, rgba(c.acc, 0));
        g.fillStyle = gr; g.fillRect(x - 5, y - 5, 10, 10);
      }
    } else if (motif === 'sanctum') {
      // Portal ring + tall pillars + floating crystals
      const px = W / 2, py = hz - H * 0.13, pr = Math.min(W, H) * 0.2;
      let gr = g.createRadialGradient(px, py, pr * 0.2, px, py, pr * 1.4);
      gr.addColorStop(0, rgba(c.light, 0.35)); gr.addColorStop(0.5, rgba(c.acc, 0.18)); gr.addColorStop(1, rgba(c.acc, 0));
      g.fillStyle = gr; g.fillRect(px - pr * 1.5, py - pr * 1.5, pr * 3, pr * 3);
      g.strokeStyle = rgba(c.acc, 0.6); g.lineWidth = 3;
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = rgba(c.light, 0.25); g.lineWidth = 1;
      g.beginPath(); g.arc(px, py, pr * 0.82, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle = rgba(c.light, 0.5);
        g.fillRect(px + Math.cos(a) * pr * 0.91 - 2, py + Math.sin(a) * pr * 0.91 - 2, 4, 4);
      }
      g.fillStyle = c.far;
      const n = 6;
      for (let i = 0; i < n; i++) {
        if (i === 2 || i === 3) continue;
        const x = (i + 0.5) * W / n, top = hz - H * (0.26 + R() * 0.06);
        g.fillRect(x - 12, top, 24, base - top);
        g.fillRect(x - 17, top, 34, 7);
        g.fillRect(x - 17, base - 8, 34, 8);
      }
      for (let i = 0; i < 7; i++) {
        const x = R() * W, y = hz - H * (0.05 + R() * 0.25), s = 4 + R() * 6;
        g.fillStyle = rgba(c.acc, 0.75);
        g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.6); g.lineTo(x - s, y); g.fill();
      }
    }
    g.restore();
  }

  _drawFloor(g, W, H, hz, R, c) {
    const top = hz, bot = H;
    let grd = g.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, mix(c.ground, c.fog, 0.5));
    grd.addColorStop(0.4, c.ground);
    grd.addColorStop(1, mix(c.ground, '#000000', 0.45));
    g.fillStyle = grd; g.fillRect(0, top, W, bot - top);
    // flagstones
    const vx = W / 2, cols = 9, rows = 9;
    const spanBot = W * 2.4;
    const xAt = (i, y) => { const t = (y - top) / (bot - top); const xb = vx + (i / cols - 0.5) * spanBot; return vx + (xb - vx) * t; };
    const yAt = (j) => top + (bot - top) * Math.pow(j / rows, 1.9);
    for (let j = 0; j < rows; j++) {
      const y0 = yAt(j), y1 = yAt(j + 1);
      for (let i = 0; i < cols; i++) {
        const shade = (i + j) % 2 ? 0.06 : -0.04;
        const n = (R() - 0.5) * 0.05;
        g.fillStyle = shade + n > 0 ? rgba('#ffffff', shade + n) : rgba('#000000', -(shade + n));
        g.beginPath();
        g.moveTo(xAt(i, y0), y0); g.lineTo(xAt(i + 1, y0), y0); g.lineTo(xAt(i + 1, y1), y1); g.lineTo(xAt(i, y1), y1);
        g.fill();
      }
    }
    g.strokeStyle = rgba(c.acc, 0.12); g.lineWidth = 1;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(xAt(i, top), top); g.lineTo(xAt(i, bot), bot); g.stroke(); }
    for (let j = 1; j <= rows; j++) { const y = yAt(j); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (this.motif === 'ember') {
      g.strokeStyle = rgba(c.acc, 0.5); g.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        let x = R() * W, y = top + (bot - top) * (0.2 + R() * 0.8);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += rand(-25, 25); y += rand(-6, 6); g.lineTo(x, y); }
        g.stroke();
      }
    }
    if (this.motif === 'mire') {
      g.fillStyle = rgba(c.acc, 0.07);
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(R() * W, top + (bot - top) * (0.15 + R() * 0.7), 30 + R() * 60, 6 + R() * 10, 0, 0, 7); g.fill(); }
    }
    // pool of light in the middle of the arena
    grd = g.createRadialGradient(W / 2, top + (bot - top) * 0.45, 0, W / 2, top + (bot - top) * 0.45, Math.max(W, bot - top) * 0.55);
    grd.addColorStop(0, rgba(c.light, 0.22)); grd.addColorStop(1, rgba(c.light, 0));
    g.fillStyle = grd; g.fillRect(0, top, W, bot - top);
    // horizon fade
    grd = g.createLinearGradient(0, top, 0, top + (bot - top) * 0.25);
    grd.addColorStop(0, rgba(c.fog, 0.9)); grd.addColorStop(1, rgba(c.fog, 0));
    g.fillStyle = grd; g.fillRect(0, top, W, (bot - top) * 0.25);
  }

  _drawFrame(g, W, H, hz, R, c) {
    const dark = mix(c.fog, '#000000', 0.55);
    const pw = Math.max(26, W * 0.07);
    for (const side of [0, 1]) {
      const x = side ? W - pw * 0.7 : -pw * 0.3;
      const grd = g.createLinearGradient(x, 0, x + pw, 0);
      grd.addColorStop(side ? 0 : 1, rgba(dark, 0.85)); grd.addColorStop(side ? 1 : 0, rgba('#000000', 0.95));
      g.fillStyle = grd;
      g.fillRect(x, 0, pw, H);
      g.fillStyle = rgba(c.acc, 0.25);
      g.fillRect(side ? x : x + pw - 2, 0, 2, H);
      // hanging chain
      g.strokeStyle = rgba('#000000', 0.7); g.lineWidth = 2;
      const cx = side ? W - pw * 1.3 : pw * 1.3, len = (hz) * (0.4 + R() * 0.3);
      for (let y = 0; y < len; y += 9) { g.beginPath(); g.ellipse(cx, y, 2.6, 4.6, 0, 0, 7); g.stroke(); }
    }
  }

  // ------------------------------------------------------------- HP
  setHp(side, hp) {
    const f = this.F[side];
    if (!f) return;
    hp = clamp(Math.round(hp), 0, f.maxHp);
    const prev = f.hp;
    if (hp === prev) return;
    f.hp = hp;
    this._paintHp(f, hp, false, prev);
  }

  _paintHp(f, hp, instant, prev = hp) {
    const pct = hp / f.maxHp;
    f.bar.dataset.level = pct > 0.5 ? 'hi' : pct > 0.25 ? 'mid' : 'lo';
    const healing = hp > prev;
    if (instant || this._instant) {
      f.fill.style.transition = f.ghost.style.transition = 'none';
      f.fill.style.transform = f.ghost.style.transform = `scaleX(${pct})`;
      f.numB.textContent = hp; f.numS.textContent = `/${f.maxHp}`;
      return;
    }
    const d1 = this._T(320), d2 = this._T(520), lag = this._T(healing ? 380 : 420);
    f.bar.classList.toggle('heal', healing);
    if (healing) {
      f.ghost.style.transition = `transform ${d1}ms cubic-bezier(.2,.8,.2,1)`;
      f.fill.style.transition = `transform ${d2}ms cubic-bezier(.3,.7,.2,1) ${lag}ms`;
    } else {
      f.fill.style.transition = `transform ${d1}ms cubic-bezier(.2,.8,.2,1)`;
      f.ghost.style.transition = `transform ${d2}ms cubic-bezier(.5,0,.3,1) ${lag}ms`;
    }
    f.fill.style.transform = f.ghost.style.transform = `scaleX(${pct})`;
    this._a(f.bar, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 260 });
    // count the number
    const t0 = performance.now(), dur = Math.max(1, d1 + (healing ? lag : 0));
    const tick = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      f.numB.textContent = Math.round(prev + (hp - prev) * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && f.hp === hp) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    f.numB.parentElement.classList.remove('bump'); void f.numB.offsetWidth; f.numB.parentElement.classList.add('bump');
  }

  // ------------------------------------------------------------- anim helpers
  _a(node, kf, o = {}) {
    if (!node || this._instant) return Promise.resolve();
    const a = node.animate(kf, { duration: this._T(o.duration ?? 300), delay: this._T(o.delay ?? 0), easing: o.easing || 'ease', fill: o.fill || 'none', iterations: o.iterations || 1, composite: o.composite || 'replace' });
    this._anims.add(a);
    return a.finished.catch(() => {}).finally(() => this._anims.delete(a));
  }
  _cancelAll() {
    for (const a of this._anims) { try { a.cancel(); } catch { /* ignore */ } }
    this._anims.clear();
    this.root.querySelectorAll('.bt-pop,.bt-skill,.bt-ghostimg').forEach((n) => n.remove());
  }
  _enqueue(fn) {
    const gen = this._gen;
    const p = this._q.then(() => (gen === this._gen && this._open ? fn() : undefined)).catch((e) => console.error(e));
    this._q = p;
    return p;
  }
  _shake(power = 1, dur = 380) {
    if (this.reducedMotion || power <= 0) return Promise.resolve();
    const kf = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n, m = power * 9 * k;
      kf.push({ transform: i === n ? 'none' : `translate(${rand(-m, m).toFixed(1)}px,${rand(-m, m).toFixed(1)}px) rotate(${rand(-0.6, 0.6) * power * k}deg)` });
    }
    return this._a(this.$.cam, kf, { duration: dur, easing: 'linear' });
  }
  _flash(color = '#ffffff', peak = 0.85, dur = 260) {
    if (this.reducedMotion) peak *= 0.35;
    this.$.flash.style.background = color;
    return this._a(this.$.flash, [{ opacity: peak }, { opacity: 0 }], { duration: dur, easing: 'ease-out' });
  }
  // Center of a fighter in overlay coords.
  _c(f, fy = 0.5) { const p = f.pos; return { x: p.x, y: p.y - p.h * fy }; }
  _other(side) { return side === 'left' ? 'right' : 'left'; }

  // Text pop (damage numbers, MISS, BLOCKED, K.O.)
  _pop(x, y, html, cls, o = {}) {
    if (this._instant) return Promise.resolve();
    const n = el('div', `bt-pop ${cls || ''}`, html);
    n.style.left = `${x}px`; n.style.top = `${y}px`;
    this.$.pops.appendChild(n);
    const rm = this.reducedMotion;
    const life = o.life ?? 1100;
    const rise = o.rise ?? 50;
    const p = this._a(n, rm ? [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.15 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'translate(-50%,-60%) scale(1)' },
    ] : [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.2) rotate(-8deg)' },
      { opacity: 1, transform: `translate(-50%,-50%) scale(${o.peak ?? 1.45}) rotate(2deg)`, offset: 0.1, easing: 'cubic-bezier(.2,.9,.3,1)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', offset: 0.22 },
      { opacity: 1, transform: `translate(-50%,calc(-50% - ${rise * 0.4}px)) scale(1)`, offset: 0.75 },
      { opacity: 0, transform: `translate(-50%,calc(-50% - ${rise}px)) scale(.92)` },
    ], { duration: life, easing: 'linear' });
    p.then(() => n.remove());
    return p;
  }

  // ------------------------------------------------------------- intro
  async _intro() {
    const { left: A, right: B } = this.F;
    const L = this.L, rm = this.reducedMotion;
    const boss = this.kind === 'boss';
    this.$.vs.style.opacity = '0';
    for (const f of [A, B]) { f.plate.style.opacity = '0'; f.act.style.opacity = ''; }
    if (this._instant) {
      for (const f of [A, B]) f.plate.style.opacity = '';
      this.$.vs.style.opacity = '0';
      return;
    }
    const dimP = this._a(this.$.dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'both' });
    const ease = 'cubic-bezier(.2,.9,.25,1)';
    this._a(this.$.band, rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'scaleY(0)', opacity: 0.4 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 300, easing: ease, fill: 'backwards' });
    this._a(this.$.edgeT.firstChild, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 380, delay: 80, easing: ease, fill: 'backwards' });
    this._a(this.$.edgeB.firstChild, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 380, delay: 80, easing: ease, fill: 'backwards' });
    this._a(this.$.head, [{ opacity: 0, transform: 'translate(-50%,-14px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 360, delay: 220, easing: ease, fill: 'backwards' });
    this._a(this.$.arena, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 600, delay: 300, easing: ease, fill: 'backwards' });
    for (const f of [A, B]) this._a(f.plat, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: 260, easing: ease, fill: 'backwards' });
    if (!rm) this._speedLines();
    // Fighters slide in from both sides (bosses rise up heavier).
    const slide = (f, dir, delay, bossy) => {
      const kf = rm ? [{ opacity: 0 }, { opacity: 1 }]
        : bossy ? [
          { transform: `translate(${dir * L.W * 0.35}px, 0) scale(1.25)`, opacity: 0, filter: 'brightness(0)' },
          { transform: 'translate(0,0) scale(1.06)', opacity: 1, filter: 'brightness(0)', offset: 0.55 },
          { transform: 'translate(0,0) scale(.97)', opacity: 1, filter: 'brightness(0)', offset: 0.7 },
          { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        ] : [
          { transform: `translate(${dir * L.W * 0.9}px, 0) skewX(${-dir * 14}deg)`, opacity: 1 },
          { transform: `translate(${-dir * 14}px,0) skewX(${dir * 6}deg)`, opacity: 1, offset: 0.72 },
          { transform: 'translate(0,0) skewX(0deg)', opacity: 1 },
        ];
      return this._a(f.act, kf, { duration: bossy ? 780 : 520, delay, easing: bossy ? 'cubic-bezier(.3,.7,.2,1)' : ease, fill: 'backwards' });
    };
    const pa = slide(A, -1, 120, false);
    const pb = slide(B, 1, boss ? 160 : 180, boss);
    sfx('whoosh', 0.8);
    await Promise.all([pa, pb]);
    void dimP;
    if (!this._open) return;
    // Land: dust at feet
    for (const f of [A, B]) this._dust(f.pos.x, f.pos.y, f.pos.w * (f.boss ? 0.9 : 0.6), f.boss ? 26 : 14);
    if (boss) { this._shake(1.1, 420); sfx('hit', 0.6); }
    // VS slam
    this.$.vs.style.opacity = '';
    sfx('vs', boss ? 1 : 0.8);
    const vsP = this._a(this.$.vs, rm ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] : [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(3.2) rotate(-12deg)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(.92) rotate(-6deg)', offset: 0.14, easing: 'cubic-bezier(.3,1.4,.5,1)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-6deg)', offset: 0.24 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.04) rotate(-6deg)', offset: 0.7 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6) rotate(-6deg)' },
    ], { duration: 950, easing: 'linear', fill: 'forwards' });
    await this._wait(130);
    this._flash('#ffffff', 0.55, 220);
    const cx = L.dice.x + L.dice.w / 2, cy = L.dice.y + L.dice.h * 0.45;
    this._ring(cx, cy, 30, Math.min(L.W, 600) * 0.55, '#fff3c4', 0.5, 520, 3);
    this._burst(cx, cy, 22, { color: '#ffe27a', speed: 520, life: 0.5, size: 2.2 });
    this._shake(0.6, 260);
    // Plates rise in
    [A, B].forEach((f, i) => {
      f.plate.style.opacity = '';
      this._a(f.plate, [{ opacity: 0, transform: 'translateY(16px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 60 + i * 90, easing: ease, fill: 'backwards' });
    });
    await vsP;
    this.$.vs.style.opacity = '0';
    this._anims.forEach((a) => { if (a.effect?.target === this.$.vs) a.cancel(); });
  }

  // ------------------------------------------------------------- strike
  strike(from, opts = {}) { return this._enqueue(() => this._strike(from, opts)); }

  async _strike(from, { dmg = 0, crit = false, miss = false, hp } = {}) {
    const atk = this.F[from], def = this.F[this._other(from)];
    if (!atk || !def || atk.dead) return;
    const rm = this.reducedMotion;
    const A = this._c(atk, 0), D = this._c(def, 0);
    const vx = D.x - A.x, vy = D.y - A.y, dist = Math.hypot(vx, vy) || 1;
    const ux = vx / dist, uy = vy / dist;
    const portrait = this.L.portrait;
    const reach = portrait ? dist * 0.5 : Math.max(20, dist - (atk.pos.w + def.pos.w) * 0.38);
    const dx = rm ? ux * 16 : ux * reach, dy = rm ? uy * 16 : uy * reach;
    // Depth cue on the portrait diagonal: shrink going back, grow coming forward.
    const ds = portrait && !rm ? (uy < 0 ? 0.86 : 1.12) : 1;
    atk.root.style.zIndex = '6';
    const lean = Math.sign(ux || 1) * 8;
    const blocked = !miss && dmg <= 0;

    if (crit && !rm) {
      // Critical wind-up: stage darkens, attacker glows gold, glint.
      this._a(this.$.darken, [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0.55, offset: 0.8 }, { opacity: 0 }], { duration: 720 });
      this._tintPulse(atk, '#ffd34a', 0.75, 520);
      const head = this._c(atk, 0.78);
      this._star(head.x + ux * atk.pos.w * 0.12, head.y, 60, '#fff6c8', 420);
      this._a(atk.act, [{ transform: 'none' }, { transform: `translate(${-ux * 12}px,${-uy * 6}px) scale(1.04,.96)` }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
      await this._wait(360);
    }
    // Wind-up + dash
    sfx('whoosh', crit ? 1 : 0.7);
    const dash = rm ? [{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px)` }] : [
      { transform: crit ? `translate(${-ux * 12}px,${-uy * 6}px) scale(1.04,.96)` : 'none' },
      { transform: `translate(${-ux * 18}px,${-uy * 8}px) scale(1.05,.94) rotate(${-lean * 0.5}deg)`, offset: crit ? 0.15 : 0.32, easing: 'cubic-bezier(.5,0,.9,.4)' },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 26}px) scale(${0.96 * (1 + (ds - 1) * 0.6)},${1.05 * (1 + (ds - 1) * 0.6)}) rotate(${lean}deg)`, offset: 0.72 },
      { transform: `translate(${dx}px,${dy}px) scale(${1.08 * ds},${0.95 * ds}) rotate(${lean * 1.2}deg)` },
    ];
    const dashDur = crit ? 230 : 300;
    if (!rm) this._afterimages(atk, dash, dashDur);
    this._anims.forEach((a) => { if (a.effect?.target === atk.act) a.cancel(); });
    const dashAnim = this._a(atk.act, dash, { duration: dashDur, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    if (miss) {
      // Defender sidesteps just before contact.
      await this._wait(dashDur * 0.55);
      sfx('miss', 1);
      const hop = rm ? [{ opacity: 1 }, { opacity: 0.4, offset: 0.4 }, { opacity: 1 }] : [
        { transform: 'none' },
        { transform: `translate(${ux * 46}px,${uy * 30 - 34}px) rotate(${lean * 0.8}deg)`, offset: 0.35, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: `translate(${ux * 46}px,${uy * 30 - 34}px) rotate(${lean * 0.8}deg)`, offset: 0.6 },
        { transform: 'none', easing: 'cubic-bezier(.5,0,.5,1)' },
      ];
      if (!rm) this._afterimages(def, hop.slice(0, 2), 160, 2);
      this._a(def.act, hop, { duration: 700 });
      await dashAnim;
      const c = this._c(def, 0.82);
      this._pop(c.x, c.y, 'MISS', 'miss', { peak: 1.25 });
      this._streak(D.x - ux * 30, this._c(def, 0.5).y, ux, uy);
      await this._wait(200);
      await this._return(atk, dx, dy, lean, 380, true, ds);
      await this._wait(260);
      return;
    }
    await dashAnim;
    // IMPACT
    const hit = this._c(def, 0.5);
    const ix = hit.x - ux * def.pos.w * 0.22, iy = hit.y - uy * def.pos.h * 0.1;
    if (blocked) {
      sfx('hit', 0.35);
      this._shield(ix, iy, def.pos.h * 0.42, ux);
      this._burst(ix, iy, 14, { color: '#bfe4ff', speed: 340, life: 0.35, size: 1.8, spread: Math.PI * 0.8, dir: Math.atan2(-uy, -ux) });
      await this._wait(70);
      this._a(def.act, [{ transform: 'none' }, { transform: `translate(${ux * 8}px,${uy * 4}px)`, offset: 0.25 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
      const c = this._c(def, 0.82);
      this._pop(c.x, c.y, 'BLOCKED', 'blocked', { peak: 1.2 });
      await this._return(atk, dx, dy, lean, 360, false, ds);
      await this._wait(320);
      return;
    }
    sfx(crit ? 'crit' : 'hit', crit ? 1 : clamp(0.5 + dmg * 0.08, 0.5, 0.9));
    this._slash(ix, iy, crit ? def.pos.h * 0.75 : def.pos.h * 0.55, ux, crit ? '#ffe27a' : '#ffffff');
    this._burst(ix, iy, crit ? 46 : 26, { color: crit ? '#ffd34a' : '#ffe9c8', speed: crit ? 760 : 520, life: crit ? 0.6 : 0.42, size: crit ? 2.6 : 2 });
    this._star(ix, iy, crit ? 150 : 90, crit ? '#fff2a8' : '#ffffff', crit ? 260 : 180);
    if (crit) { this._flash('#fff3c4', 0.9, 320); this._ring(ix, iy, 20, def.pos.h * 1.3, '#ffd34a', 1, 460, 4); }
    else this._flash('#ffffff', 0.25, 140);
    // Hit-stop: everything freezes for a beat on contact.
    this._tintFlash(def, crit ? '#ffffff' : '#ff3030', crit);
    await this._wait(crit ? 150 : 85);
    this._shake(crit ? 1.6 : 0.65, crit ? 520 : 300);
    if (crit && !rm) this._a(this.$.cam, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.2 }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out', composite: 'add' });
    const kb = crit ? 46 : 24;
    this._a(def.act, rm ? [{ opacity: 1 }, { opacity: 0.5, offset: 0.3 }, { opacity: 1 }] : [
      { transform: 'none' },
      { transform: `translate(${ux * kb}px,${uy * kb * 0.5}px) rotate(${lean * (crit ? 1.6 : 1)}deg) scale(.96,1.03)`, offset: 0.18, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: `translate(${ux * kb * 0.6}px,${uy * kb * 0.3}px) rotate(${lean * 0.6}deg)`, offset: 0.45 },
      { transform: `translate(${-ux * 4}px,0) rotate(${-lean * 0.2}deg)`, offset: 0.8 },
      { transform: 'none' },
    ], { duration: crit ? 640 : 480 });
    const newHp = hp != null ? hp : def.hp - dmg;
    this.setHp(this._other(from), newHp);
    const c = this._c(def, 0.86);
    if (crit) {
      this._pop(c.x, c.y - 44, 'CRITICAL!', 'critlabel', { peak: 1.3, life: 1250, rise: 30 });
      this._pop(c.x, c.y + 6, String(dmg), 'dmg crit', { peak: 1.7, life: 1250 });
    } else {
      this._pop(c.x, c.y, String(dmg), 'dmg', { peak: 1.5 });
    }
    await this._return(atk, dx, dy, lean, crit ? 420 : 360, false, ds);
    await this._wait(crit ? 380 : 260);
  }

  _return(f, dx, dy, lean, dur, stumble = false, ds = 1) {
    this._anims.forEach((a) => { if (a.effect?.target === f.act) a.cancel(); });
    const kf = this.reducedMotion ? [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }] : [
      { transform: `translate(${dx}px,${dy}px) scale(${1.08 * ds},${0.95 * ds}) rotate(${lean * 1.2}deg)` },
      stumble ? { transform: `translate(${dx * 1.15}px,${dy * 1.15}px) scale(${ds}) rotate(${lean * 2}deg)`, offset: 0.25 } : { transform: `translate(${dx * 0.9}px,${dy * 0.9 - 10}px) scale(${ds}) rotate(${lean * 0.4}deg)`, offset: 0.2 },
      { transform: `translate(${dx * 0.2}px,${dy * 0.2 - 18}px) rotate(${-lean * 0.3}deg)`, offset: 0.7 },
      { transform: 'none' },
    ];
    return this._a(f.act, kf, { duration: dur, easing: 'cubic-bezier(.3,.6,.3,1)' }).then(() => { f.root.style.zIndex = ''; });
  }

  _afterimages(f, kf, dur, n = 3) {
    for (let i = 1; i <= n; i++) {
      const g = el('div', 'bt-ghostimg');
      g.innerHTML = `<div class="bt-turn ${f.turn.className.replace('bt-turn', '')}"><img src="${f.url}" alt=""></div>`;
      g.style.opacity = '0';
      f.root.insertBefore(g, f.act);
      const a = 0.5 - i * 0.12;
      const kf2 = kf.map((k) => ({ ...k, opacity: a }));
      kf2[0].opacity = 0;
      this._a(g, kf2, { duration: dur, delay: i * 30, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
        .then(() => this._a(g, [{ opacity: a }, { opacity: 0 }], { duration: 160 })).then(() => g.remove());
    }
  }

  _tintFlash(f, color, strong) {
    f.tint.style.background = color;
    return this._a(f.tint, [
      { opacity: 0.95 }, { opacity: 0.2, offset: 0.25 }, { opacity: strong ? 0.85 : 0.6, offset: 0.45 }, { opacity: 0 },
    ], { duration: strong ? 460 : 340, easing: 'linear' });
  }
  _tintPulse(f, color, peak, dur) {
    f.tint.style.background = color;
    return this._a(f.tint, [{ opacity: 0 }, { opacity: peak, offset: 0.4 }, { opacity: 0 }], { duration: dur, easing: 'ease-in-out' });
  }

  // ------------------------------------------------------------- skill banner
  skill(side, text, opts = {}) { return this._enqueue(() => this._skill(side, text, opts)); }

  async _skill(side, text, { color } = {}) {
    const f = this.F[side];
    if (!f) return;
    const t = String(text || '').toUpperCase();
    const col = color || (/HEAL|\+\d+\s*HP|REGEN/.test(t) ? '#5ef08a' : /SHIELD|BLOCK|ARMOR|GUARD|−|-\d/.test(t) && !/DMG|DAMAGE/.test(t) ? '#6fc3ff' : /RAGE|DMG|DAMAGE|POWER|ATK/.test(t) ? '#ff6a3a' : '#f2c443');
    sfx('whoosh', 0.6);
    const c = this._c(f, 1);
    const n = el('div', 'bt-skill');
    n.style.setProperty('--sk', col);
    n.innerHTML = `<div class="bt-skill-rib"></div><div class="bt-skill-txt">${escapeHtml(text)}</div><div class="bt-skill-glint"></div>`;
    const L = this.L;
    const bw = Math.min(L.W * 0.86, Math.max(220, f.pos.w * 1.25));
    const bx = clamp(c.x, bw / 2 + 8, L.W - bw / 2 - 8);
    const by = this.L.portrait && side === 'right' ? Math.max(c.y + f.pos.h * 0.12, L.bTop + 80) : c.y + f.pos.h * 0.12;
    n.style.left = `${bx}px`; n.style.top = `${by}px`; n.style.width = `${bw}px`;
    this.$.pops.appendChild(n);
    if (this._instant) { n.remove(); return; }
    // Aura on the fighter
    this._tintPulse(f, col, 0.55, 900);
    const feet = this._c(f, 0);
    this._ring(feet.x, feet.y, 10, f.pos.w * 0.75, col, 0.3, 700, 4);
    this._pillar(f, col);
    for (let i = 0; i < 26; i++) {
      this._add({ shape: 'glow', x: feet.x + rand(-f.pos.w * 0.4, f.pos.w * 0.4), y: feet.y - rand(0, f.pos.h * 0.4), vx: rand(-15, 15), vy: rand(-260, -120), drag: 0.6, life: rand(0.6, 1.1), size: rand(10, 22), size1: 2, color: col, blend: 'lighter', a: 0.9 });
    }
    if (!this.reducedMotion) this._a(f.act, [{ transform: 'none' }, { transform: 'translateY(-14px) scale(1.04)', offset: 0.3, easing: 'cubic-bezier(.2,.8,.3,1)' }, { transform: 'none' }], { duration: 560 });
    const rib = n.querySelector('.bt-skill-rib'), txt = n.querySelector('.bt-skill-txt'), gl = n.querySelector('.bt-skill-glint');
    const dir = side === 'left' ? -1 : 1;
    const ribP = this._a(rib, [
      { transform: `skewX(-14deg) scaleX(0)`, opacity: 1 },
      { transform: 'skewX(-14deg) scaleX(1.06)', offset: 0.12, easing: 'cubic-bezier(.2,.9,.3,1)' },
      { transform: 'skewX(-14deg) scaleX(1)', offset: 0.2 },
      { transform: 'skewX(-14deg) scaleX(1)', opacity: 1, offset: 0.82 },
      { transform: 'skewX(-14deg) scaleX(1) translateY(-10px)', opacity: 0 },
    ], { duration: 1500, easing: 'linear' });
    this._a(txt, [
      { transform: `translateX(${dir * 60}px) scale(1.4)`, opacity: 0, letterSpacing: '0.4em' },
      { transform: 'translateX(0) scale(1)', opacity: 1, letterSpacing: '0.04em', offset: 0.18, easing: 'cubic-bezier(.2,.9,.3,1)' },
      { transform: 'translateX(0) scale(1)', opacity: 1, letterSpacing: '0.04em', offset: 0.82 },
      { transform: 'translateY(-12px) scale(1.02)', opacity: 0, letterSpacing: '0.04em' },
    ], { duration: 1500, easing: 'linear' });
    this._a(gl, [{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: 'translateX(220%) skewX(-20deg)' }], { duration: 520, delay: 260, easing: 'ease-in-out', fill: 'both' });
    await ribP;
    n.remove();
  }

  // ------------------------------------------------------------- defeat
  defeat(side, killFx = 'none') { return this._enqueue(() => this._defeat(side, killFx)); }

  async _defeat(side, fxId) {
    const f = this.F[side];
    if (!f || f.dead) return;
    f.dead = true;
    if (f.hp > 0) this.setHp(side, 0);
    sfx('ko', 1);
    const rm = this.reducedMotion;
    if (this._instant) { f.act.style.opacity = '0'; f.plate.classList.add('dead'); return; }
    // Freeze idle so the art rect is stable for the canvas effects.
    f.root.classList.add('frozen');
    const id = rm && fxId !== 'none' ? 'fade' : fxId;
    switch (id) {
      case 'shatter': await this._koShatter(f); break;
      case 'soulburst': await this._koSoul(f); break;
      case 'lightning': await this._koLightning(f); break;
      case 'confetti': await this._koConfetti(f); break;
      case 'fade': await this._a(f.act, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 }); break;
      default: await this._koClassic(f);
    }
    f.act.style.opacity = '0';
    f.root.classList.remove('frozen');
    // K.O. stamp on the plate
    f.plate.classList.add('dead');
    this._a(f.ko, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(2.6) rotate(-14deg)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(.9) rotate(-8deg)', offset: 0.5, easing: 'cubic-bezier(.3,1.5,.5,1)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-8deg)' },
    ], { duration: 360, fill: 'forwards' });
    await this._wait(500);
  }

  _artRect(f) {
    const r = f.img.getBoundingClientRect(), o = this.root.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  }

  // Sample the art's alpha (cached) so shards / ash only come from visible pixels.
  _alpha(f) {
    if (f.alphaMap) return f.alphaMap;
    const N = 48, c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N / (f.aspect || 1));
    const g = c.getContext('2d', { willReadFrequently: true });
    let data = null;
    try { g.drawImage(f.img, 0, 0, c.width, c.height); data = g.getImageData(0, 0, c.width, c.height).data; } catch { /* tainted */ }
    f.alphaMap = { w: c.width, h: c.height, data };
    return f.alphaMap;
  }
  _sample(f, u, v) {
    const m = this._alpha(f);
    if (!m.data) return [255, 255, 255, 255];
    const x = clamp(Math.floor(u * m.w), 0, m.w - 1), y = clamp(Math.floor(v * m.h), 0, m.h - 1);
    const i = (y * m.w + x) * 4;
    return [m.data[i], m.data[i + 1], m.data[i + 2], m.data[i + 3]];
  }

  async _koClassic(f) {
    const dir = f.side === 'left' ? -1 : 1;
    this._tintFlash(f, '#ffffff', true);
    await this._wait(120);
    await this._a(f.act, [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dir * 6}px,-8px) rotate(${dir * 6}deg)`, opacity: 0.4, offset: 0.12 },
      { transform: `translate(${dir * 10}px,-4px) rotate(${dir * 10}deg)`, opacity: 1, offset: 0.24 },
      { transform: `translate(${dir * 14}px,0) rotate(${dir * 14}deg)`, opacity: 0.4, offset: 0.36 },
      { transform: `translate(${dir * 20}px,6px) rotate(${dir * 22}deg)`, opacity: 1, offset: 0.48 },
      { transform: `translate(${dir * 40}px,${f.pos.h * 0.12}px) rotate(${dir * 78}deg)`, opacity: 0.9, offset: 0.8, easing: 'cubic-bezier(.6,0,1,.6)' },
      { transform: `translate(${dir * 44}px,${f.pos.h * 0.14}px) rotate(${dir * 82}deg)`, opacity: 0 },
    ], { duration: 1050, easing: 'linear' });
    this._dust(f.pos.x + dir * f.pos.w * 0.3, f.pos.y, f.pos.w * 0.8, 22);
    this._shake(0.5, 240);
    await this._wait(250);
  }

  async _koShatter(f) {
    const r = this._artRect(f);
    const c = this._c(f, 0.5);
    // white flash + cracks
    this._tintPulse(f, '#e8fbff', 0.9, 260);
    this._cracks(c.x, c.y, r);
    sfx('crit', 0.7);
    await this._wait(260);
    const img = f.img, cols = 7, rows = Math.round(7 / (f.aspect || 1)) + 1;
    const pts = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const edge = i === 0 || j === 0 || i === cols || j === rows;
        pts.push([(i + (edge ? 0 : rand(-0.35, 0.35))) / cols, (j + (edge ? 0 : rand(-0.35, 0.35))) / rows]);
      }
    }
    const P = (i, j) => pts[j * (cols + 1) + i];
    const tris = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1);
        if ((i + j) % 2) { tris.push([a, b, cc], [a, cc, d]); } else { tris.push([a, b, d], [b, cc, d]); }
      }
    }
    f.act.style.opacity = '0';
    let made = 0;
    for (const t of tris) {
      const u = (t[0][0] + t[1][0] + t[2][0]) / 3, v = (t[0][1] + t[1][1] + t[2][1]) / 3;
      if (this._sample(f, f.mirror ? 1 - u : u, v)[3] < 30) continue;
      const cx = r.x + u * r.w, cy = r.y + v * r.h;
      const ang = Math.atan2(cy - c.y, cx - c.x), sp = rand(160, 520);
      const away = f.side === 'left' ? -1 : 1;
      this._add({
        shape: 'shard', img, mirror: f.mirror, r, tri: t.map((p) => [r.x + p[0] * r.w - cx, r.y + p[1] * r.h - cy]), u, v,
        x: cx, y: cy, vx: Math.cos(ang) * sp + away * rand(60, 200), vy: Math.sin(ang) * sp - rand(150, 380), g: 1300, drag: 0.15,
        rot: 0, vr: rand(-9, 9), life: rand(0.9, 1.4), a: 1, fadeAt: 0.6,
      });
      made++;
    }
    this._burst(c.x, c.y, 40, { color: '#dff8ff', speed: 700, life: 0.6, size: 2.4 });
    this._ring(c.x, c.y, 20, r.h, '#c8f4ff', 1, 420, 3);
    this._flash('#e8fbff', 0.5, 220);
    this._shake(1, 360);
    for (let i = 0; i < 18; i++) this._add({ shape: 'star4', x: c.x + rand(-r.w / 2, r.w / 2), y: c.y + rand(-r.h / 2, r.h / 2), vx: rand(-40, 40), vy: rand(-80, 0), life: rand(0.4, 0.9), size: rand(6, 14), color: '#ffffff', blend: 'lighter', a: 1, delay: rand(0, 0.4) });
    await this._wait(made ? 1250 : 400);
  }

  async _koSoul(f) {
    const r = this._artRect(f), feet = this._c(f, 0), mid = this._c(f, 0.5);
    const col = '#9ff3ff';
    // Body drains to a pale silhouette
    this._tintPulse(f, '#c9fbff', 0.9, 700);
    this._a(f.act, [{ opacity: 1, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(1.8) saturate(.2)', offset: 0.5 }, { opacity: 0, filter: 'brightness(2) saturate(0)' }], { duration: 900 });
    this._pillar(f, col, 1300);
    await this._wait(380);
    // Spirit rises from the body
    const spirit = this._silhouette(f, '#bff8ff');
    this._add({ shape: 'spirit', canvas: spirit, mirror: f.mirror, x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, vx: 0, vy: -110, life: 1.5, a: 0.85, wob: 1 });
    this._ring(feet.x, feet.y, 10, r.w * 1.4, col, 0.32, 900, 5);
    this._ring(mid.x, mid.y, 20, Math.max(r.w, r.h) * 1.2, '#ffffff', 1, 600, 3);
    this._flash('#d0fbff', 0.45, 300);
    sfx('whoosh', 1);
    for (let i = 0; i < 46; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 360);
      this._add({ shape: 'glow', x: mid.x, y: mid.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 60, drag: 1.8, g: -60, life: rand(0.8, 1.6), size: rand(8, 20), size1: 2, color: i % 3 ? col : '#ffffff', blend: 'lighter', a: 0.9 });
    }
    await this._wait(1500);
  }

  async _koLightning(f) {
    const r = this._artRect(f), c = this._c(f, 0.55);
    const L = this.L;
    this._a(this.$.darken, [{ opacity: 0 }, { opacity: 0.75, offset: 0.15 }, { opacity: 0.6, offset: 0.7 }, { opacity: 0 }], { duration: 1500 });
    await this._wait(220);
    // Strike: three flickers
    const tx = r.x + r.w / 2, ty = r.y + r.h * 0.25;
    for (let k = 0; k < 3; k++) {
      this._add({ shape: 'bolt', pts: this._boltPath(tx + rand(-40, 40) + (k - 1) * 30, L.bTop - 20, tx + rand(-10, 10), ty + r.h * 0.25), life: 0.22, a: 1, delay: k * 0.09 });
    }
    this._add({ shape: 'bolt', pts: this._boltPath(tx, L.bTop - 20, tx, ty + r.h * 0.4), life: 0.4, a: 1, width: 1.6 });
    sfx('crit', 1);
    this._flash('#e9f2ff', 1, 380);
    this._shake(1.8, 560);
    // Charred silhouette, electric crackle
    f.tint.style.background = '#0b0710';
    this._a(f.tint, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1 }], { duration: 900, fill: 'forwards' });
    this._ring(f.pos.x, f.pos.y, 10, r.w * 1.6, '#bcd7ff', 0.3, 520, 5);
    this._burst(c.x, c.y, 40, { color: '#cfe3ff', speed: 820, life: 0.5, size: 2.4 });
    for (let k = 0; k < 6; k++) {
      const x0 = r.x + rand(0.2, 0.8) * r.w, y0 = r.y + rand(0.2, 0.8) * r.h;
      this._add({ shape: 'bolt', pts: this._boltPath(x0, y0, x0 + rand(-40, 40), y0 + rand(-40, 40), 4), life: 0.12, a: 0.9, delay: 0.25 + k * 0.08, width: 0.6 });
    }
    await this._wait(700);
    // Crumble into ash and embers
    this._ash(f, r, ['#1a1220', '#3a2c40', '#ff9a3a', '#ffd27a']);
    this._a(f.tint, [{ opacity: 1 }, { opacity: 1 }], { duration: 10, fill: 'forwards' });
    await this._a(f.act, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scaleY(.9)' }], { duration: 420, easing: 'ease-in' });
    f.tint.style.opacity = '0';
    this._anims.forEach((a) => { if (a.effect?.target === f.tint) a.cancel(); });
    await this._wait(900);
  }

  async _koConfetti(f) {
    const r = this._artRect(f), c = this._c(f, 0.5);
    // Comic wind-up: squash, spin, pop
    await this._a(f.act, [
      { transform: 'none' },
      { transform: 'scale(1.18,.8)', offset: 0.35, easing: 'ease-out' },
      { transform: 'scale(.86,1.2) translateY(-20px) rotate(-10deg)', offset: 0.6 },
      { transform: 'scale(1.3) translateY(-30px) rotate(200deg)', opacity: 1, offset: 0.85 },
      { transform: 'scale(0) translateY(-30px) rotate(360deg)', opacity: 0 },
    ], { duration: 720, easing: 'ease-in-out' });
    f.act.style.opacity = '0';
    sfx('ko', 0.6);
    this._flash('#fff6d8', 0.4, 200);
    for (let i = 0; i < 8; i++) this._add({ shape: 'puff', x: c.x + rand(-30, 30), y: c.y + rand(-30, 30) - 20, vx: rand(-80, 80), vy: rand(-80, 20), drag: 2.5, life: rand(0.5, 0.9), size: rand(40, 70), size1: 110, color: '#ffffff', a: 0.85 });
    const cols = ['#ff4d6d', '#ffd23f', '#3bceac', '#4f7cff', '#c04dff', '#ff8a3a', '#ffffff', '#f2c443'];
    const conf = (x, y, n, ang, spread, sp) => {
      for (let i = 0; i < n; i++) {
        const a = ang + rand(-spread, spread), s = rand(sp * 0.4, sp);
        this._add({ shape: Math.random() < 0.25 ? 'streamer' : 'rect', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 700, drag: 1.4, life: rand(1.6, 2.6), w: rand(5, 9), h: rand(9, 15), rot: rand(0, 6), vr: rand(-12, 12), flip: rand(0, 6), vf: rand(6, 14), color: cols[i % cols.length], a: 1, fadeAt: 0.75 });
      }
    };
    conf(c.x, c.y - 10, 90, -Math.PI / 2, Math.PI, 760);
    const L = this.L;
    conf(-10, L.H * 0.8, 50, -Math.PI / 3, 0.35, 1100);
    conf(L.W + 10, L.H * 0.8, 50, -Math.PI * 2 / 3, 0.35, 1100);
    for (let i = 0; i < 14; i++) this._add({ shape: 'star4', x: c.x + rand(-r.w / 2, r.w / 2), y: c.y + rand(-r.h / 2, r.h / 3), vx: 0, vy: -20, life: rand(0.4, 0.8), size: rand(10, 20), color: cols[i % cols.length], blend: 'lighter', a: 1, delay: rand(0, 0.5) });
    this._pop(c.x, c.y - r.h * 0.2, 'POP!', 'party', { peak: 1.6, life: 900 });
    await this._wait(1500);
  }

  // ------------------------------------------------------------- close
  close() {
    return this._enqueue(() => this._close()).then(() => {
      // Even if a stale queue skipped the exit, make sure we end hidden.
      if (this._open) return this._close();
    });
  }

  async _close() {
    if (!this._open) return;
    const gen = ++this._gen;
    const rm = this.reducedMotion;
    this.root.classList.add('bt-closing');
    if (!this._instant) {
      sfx('whoosh', 0.5);
      const { left: A, right: B } = this.F;
      const ease = 'cubic-bezier(.6,0,.8,.4)';
      if (!rm) {
        this._a(A.act, [{ transform: 'none' }, { transform: `translateX(${-this.L.W * 0.7}px) skewX(12deg)` }], { duration: 340, easing: ease, fill: 'forwards' });
        this._a(B.act, [{ transform: 'none' }, { transform: `translateX(${this.L.W * 0.7}px) skewX(-12deg)` }], { duration: 340, easing: ease, fill: 'forwards' });
      }
      for (const f of [A, B]) this._a(f.plate, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(12px)' }], { duration: 220, fill: 'forwards' });
      this._a(this.$.head, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      await this._wait(180);
      await Promise.all([
        this._a(this.$.cam, rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleY(.0)' }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }),
        this._a(this.$.dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: 60, fill: 'forwards' }),
      ]);
    }
    if (gen !== this._gen) return;
    this._open = false;
    this._cancelAll();
    this._parts.length = 0;
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.root.style.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.classList.remove('bt-closing');
    for (const f of Object.values(this.F)) { f.act.style.opacity = ''; f.tint.style.opacity = ''; }
  }

  destroy() {
    this._gen++;
    this._open = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    this.root.remove();
  }

  // =================================================================== particles
  _add(p) {
    p.t = -(p.delay || 0);
    p.vx ??= 0; p.vy ??= 0; p.a ??= 1;
    this._parts.push(p);
    if (this._parts.length > 1400) this._parts.splice(0, this._parts.length - 1400);
    return p;
  }

  _startLoop() {
    if (this._raf || !this._open) return;
    this._last = performance.now();
    const loop = (t) => {
      this._raf = 0;
      if (!this._open || document.hidden) return;
      const dt = Math.min(0.05, (t - this._last) / 1000);
      this._last = t;
      this._step(dt);
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _seedAmbient() {
    this._amb = [];
    if (!this.L) return;
    const n = this.reducedMotion ? 10 : this.L.W * this.L.H > 600000 ? 70 : 46;
    for (let i = 0; i < n; i++) this._amb.push(this._ambient(true));
  }

  _ambient(initial) {
    const L = this.L, m = this.motif, th = this.theme;
    const acc = hex(th.accent), light = hex(th.light);
    const x = rand(0, L.W), yTop = L.bTop, yBot = L.bBot;
    const y = initial ? rand(yTop, yBot) : yBot + 10;
    const base = { x, y, t: initial ? rand(0, 4) : 0, life: rand(4, 8), ph: rand(0, 6.28) };
    switch (m) {
      case 'ember': return { ...base, vx: rand(-12, 12), vy: rand(-70, -30), size: rand(3, 7), color: Math.random() < 0.6 ? '#ff8a3a' : '#ffd27a', flick: 8 };
      case 'sand': return { ...base, x: initial ? x : -10, y: rand(yTop, yBot), vx: rand(60, 140), vy: rand(-8, 8), size: rand(1.5, 3.5), color: mix(light, '#ffffff', 0.3), dust: true };
      case 'crypt': return { ...base, vx: rand(-8, 8), vy: rand(-26, -10), size: rand(10, 22), color: acc, wisp: true };
      case 'mire': return { ...base, y: initial ? y : rand(yTop, yBot), vx: rand(-14, 14), vy: rand(-14, 6), size: rand(4, 8), color: acc, firefly: true };
      case 'sanctum': return { ...base, vx: rand(-6, 6), vy: rand(-30, -12), size: rand(3, 6), color: Math.random() < 0.5 ? acc : light, twinkle: true };
      default: return { ...base, vx: rand(-6, 6), vy: rand(-20, -6), size: rand(2, 4), color: light };
    }
  }

  _step(dt) {
    const L = this.L;
    if (!L) return;
    for (let i = 0; i < this._amb.length; i++) {
      const p = this._amb[i];
      p.t += dt;
      p.x += (p.vx + Math.sin(p.t * 1.3 + p.ph) * (p.firefly ? 22 : 8)) * dt;
      p.y += (p.vy + (p.firefly ? Math.cos(p.t * 1.7 + p.ph) * 18 : 0)) * dt;
      if (p.t > p.life || p.y < L.bTop - 20 || p.x > L.W + 20 || p.x < -20) this._amb[i] = this._ambient(false);
    }
    const P = this._parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
      if (p.vf) p.flip += p.vf * dt;
    }
  }

  _draw() {
    const g = this.ctx, dpr = this.dpr, L = this.L;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.$.fx.width, this.$.fx.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ambient (clipped to the band)
    g.save();
    g.beginPath(); g.rect(0, L.bTop, L.W, L.bBot - L.bTop); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (const p of this._amb) {
      const k = p.t / p.life;
      let a = Math.min(1, k * 4, (1 - k) * 3);
      if (p.flick) a *= 0.6 + 0.4 * Math.sin(p.t * p.flick + p.ph);
      if (p.firefly) a *= 0.5 + 0.5 * Math.max(0, Math.sin(p.t * 2.2 + p.ph));
      if (p.twinkle) a *= 0.5 + 0.5 * Math.sin(p.t * 4 + p.ph);
      if (a <= 0.01) continue;
      g.globalAlpha = a * (p.wisp ? 0.35 : p.dust ? 0.45 : 0.9);
      const s = p.size * (p.wisp ? 1 : 3);
      g.drawImage(glowSprite(p.color, p.wisp ? 0.3 : 0.15), p.x - s / 2, p.y - s / 2, s, s);
    }
    g.restore();
    // effects
    for (const p of this._parts) {
      if (p.t < 0) continue;
      const k = p.t / p.life;
      let a = p.a;
      if (p.fadeAt != null) a *= k < p.fadeAt ? 1 : 1 - (k - p.fadeAt) / (1 - p.fadeAt);
      else a *= 1 - k;
      if (a <= 0.004) continue;
      g.globalAlpha = clamp(a, 0, 1);
      g.globalCompositeOperation = p.blend || 'source-over';
      this._drawPart(g, p, k);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  _drawPart(g, p, k) {
    switch (p.shape) {
      case 'glow': case 'puff': {
        const s = p.size + ((p.size1 ?? p.size) - p.size) * k;
        g.drawImage(glowSprite(p.color, p.shape === 'puff' ? 0.9 : 0.2), p.x - s / 2, p.y - s / 2, s, s);
        break;
      }
      case 'spark': {
        const len = p.len ?? 0.035;
        g.strokeStyle = p.color; g.lineWidth = p.size * (1 - k * 0.6); g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * len, p.y - p.vy * len); g.stroke();
        break;
      }
      case 'ring': {
        const e = 1 - Math.pow(1 - k, 3);
        const r = p.r0 + (p.r1 - p.r0) * e;
        g.strokeStyle = p.color; g.lineWidth = p.width * (1 - k) + 0.5;
        g.beginPath(); g.ellipse(p.x, p.y, r, r * p.flat, 0, 0, Math.PI * 2); g.stroke();
        break;
      }
      case 'star': case 'star4': {
        const s = p.shape === 'star' ? p.size * (0.4 + Math.sin(k * Math.PI) * 0.8) : p.size * Math.sin(k * Math.PI);
        g.fillStyle = p.color;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0.3);
        g.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? s * 0.12 : s; const an = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.fill();
        g.drawImage(glowSprite(p.color, 0.3), -s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
        g.restore();
        break;
      }
      case 'slash': {
        const e = 1 - Math.pow(1 - k, 4);
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        const r = p.size * (0.7 + e * 0.35);
        const a0 = -1.25 + e * 0.15, a1 = a0 + 2.5 * Math.min(1, k * 3.5);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(0, 0, r, a0, a1); g.arc(-r * 0.22, 0, r * 0.93, a1, a0, true); g.fill();
        g.restore();
        break;
      }
      case 'streak': {
        g.strokeStyle = p.color; g.lineWidth = p.size; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); g.stroke();
        break;
      }
      case 'rect': case 'streamer': {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(1, Math.cos(p.flip));
        g.fillStyle = p.color;
        if (p.shape === 'rect') g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        else { g.fillRect(-1.5, -p.h * 1.2, 3, p.h * 2.4); }
        g.restore();
        break;
      }
      case 'shard': {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.beginPath(); g.moveTo(p.tri[0][0], p.tri[0][1]); g.lineTo(p.tri[1][0], p.tri[1][1]); g.lineTo(p.tri[2][0], p.tri[2][1]); g.closePath();
        g.save(); g.clip();
        const r = p.r, ox = -(p.u * r.w), oy = -(p.v * r.h);
        if (p.mirror) { g.scale(-1, 1); g.drawImage(p.img, -(ox + r.w) + 0, oy, r.w, r.h); } else g.drawImage(p.img, ox, oy, r.w, r.h);
        g.restore();
        g.strokeStyle = 'rgba(230,250,255,.85)'; g.lineWidth = 1; g.stroke();
        g.restore();
        break;
      }
      case 'spirit': {
        const s = 1 + k * 0.25, w = p.w * s, h = p.h * s, wob = Math.sin(p.t * 6) * 6 * p.wob;
        g.save(); g.translate(p.x + wob, p.y);
        if (p.mirror) g.scale(-1, 1);
        g.globalCompositeOperation = 'lighter';
        g.drawImage(p.canvas, -w / 2, -h / 2, w, h);
        g.globalAlpha *= 0.4;
        g.drawImage(p.canvas, -w * 0.55, -h * 0.55, w * 1.1, h * 1.1);
        g.restore();
        break;
      }
      case 'bolt': {
        const flick = Math.random() < 0.25 ? 0.4 : 1;
        g.globalAlpha *= flick;
        g.globalCompositeOperation = 'lighter';
        g.lineJoin = 'round'; g.lineCap = 'round';
        const w = p.width ?? 1;
        const pass = (col, lw) => { g.strokeStyle = col; g.lineWidth = lw * w; g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); };
        pass('rgba(120,150,255,.25)', 18); pass('rgba(160,200,255,.6)', 7); pass('#ffffff', 2.5);
        if (p.branches) for (const b of p.branches) { g.strokeStyle = 'rgba(200,225,255,.8)'; g.lineWidth = 1.5 * w; g.beginPath(); b.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
        break;
      }
      case 'crack': {
        g.strokeStyle = p.color; g.lineWidth = p.size;
        const n = Math.max(2, Math.ceil(p.pts.length * Math.min(1, k * 5)));
        g.beginPath(); for (let i = 0; i < n; i++) { const q = p.pts[i]; if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke();
        break;
      }
      case 'pillar': {
        const e = Math.sin(k * Math.PI);
        const w = p.w * (0.4 + e * 0.6);
        const grd = g.createLinearGradient(p.x - w / 2, 0, p.x + w / 2, 0);
        grd.addColorStop(0, rgba(p.color, 0)); grd.addColorStop(0.5, rgba(p.color, 0.55)); grd.addColorStop(1, rgba(p.color, 0));
        g.fillStyle = grd;
        g.fillRect(p.x - w / 2, p.top, w, p.y - p.top);
        break;
      }
      default: {
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // ---- effect builders
  _burst(x, y, n, { color = '#fff', speed = 500, life = 0.45, size = 2, spread = Math.PI, dir = 0 } = {}) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = spread >= Math.PI ? rand(0, Math.PI * 2) : dir + rand(-spread / 2, spread / 2);
      const s = rand(speed * 0.3, speed);
      this._add({ shape: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, g: 400, life: rand(life * 0.6, life), size: rand(size * 0.6, size * 1.3), color, blend: 'lighter', a: 1 });
    }
    this._add({ shape: 'glow', x, y, life: 0.25, size: speed * 0.25, size1: speed * 0.32, color, blend: 'lighter', a: 0.9 });
  }
  _ring(x, y, r0, r1, color, flat = 0.35, ms = 500, width = 3) { this._add({ shape: 'ring', x, y, r0, r1, flat, color, width, life: ms / 1000, a: 1, blend: 'lighter' }); }
  _star(x, y, size, color, ms) { this._add({ shape: 'star', x, y, size, color, life: ms / 1000, a: 1, blend: 'lighter', rot: rand(0, 0.8) }); }
  _slash(x, y, size, ux, color) {
    const rot = (ux > 0 ? 0 : Math.PI) + rand(-0.5, 0.5);
    this._add({ shape: 'slash', x, y, size, rot, color, life: 0.26, a: 1, blend: 'lighter' });
  }
  _shield(x, y, size, ux) {
    for (let i = 0; i < 2; i++) this._add({ shape: 'ring', x: x - ux * 6, y, r0: size * 0.6, r1: size * (1.05 + i * 0.25), flat: 1, color: i ? '#ffffff' : '#7fd0ff', width: 6 - i * 3, life: 0.4 + i * 0.1, a: 1, blend: 'lighter' });
    this._add({ shape: 'glow', x, y, size: size * 1.5, size1: size * 2, color: '#6fc3ff', life: 0.35, a: 0.7, blend: 'lighter' });
  }
  _dust(x, y, w, n) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    const c = mix(hex(this.theme.ground), '#d8cbb8', 0.5);
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this._add({ shape: 'puff', x: x + rand(-w / 2, w / 2) * 0.5, y: y - rand(0, 6), vx: dir * rand(40, 180), vy: rand(-50, -5), drag: 3, life: rand(0.5, 0.9), size: rand(14, 26), size1: rand(40, 60), color: c, a: 0.35 });
    }
  }
  _streak(x, y, ux, uy) {
    for (let i = 0; i < 5; i++) this._add({ shape: 'streak', x: x + rand(-10, 10), y: y + rand(-40, 40), vx: ux * 900, vy: uy * 900, life: 0.18, size: rand(1, 2.5), color: '#ffffff', a: 0.6, blend: 'lighter', delay: i * 0.02 });
  }
  _speedLines() {
    const L = this.L;
    for (let i = 0; i < 26; i++) {
      const dir = i % 2 ? 1 : -1;
      const y = rand(L.bTop + 20, L.bBot - 20);
      this._add({ shape: 'streak', x: dir > 0 ? rand(-200, L.W * 0.3) : rand(L.W * 0.7, L.W + 200), y, vx: dir * rand(1600, 2600), vy: 0, life: rand(0.2, 0.4), size: rand(1, 3), color: hex(this.theme.light), a: 0.55, blend: 'lighter', delay: 0.22 + rand(0, 0.25) });
    }
  }
  _pillar(f, color, ms = 900) {
    this._add({ shape: 'pillar', x: f.pos.x, y: f.pos.y, top: this.L.bTop, w: f.pos.w * 0.7, color, life: ms / 1000, a: 0.8, blend: 'lighter' });
  }
  _cracks(x, y, r) {
    for (let i = 0; i < 9; i++) {
      const pts = [[x, y]];
      let a = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3), px = x, py = y;
      for (let k = 0; k < 5; k++) { a += rand(-0.5, 0.5); const s = rand(8, 18) * (r.h / 200); px += Math.cos(a) * s; py += Math.sin(a) * s; pts.push([px, py]); }
      this._add({ shape: 'crack', pts, color: '#ffffff', size: 2, life: 0.32, fadeAt: 0.8, a: 1, blend: 'lighter' });
    }
  }
  _boltPath(x0, y0, x1, y1, depth = 6) {
    let pts = [[x0, y0], [x1, y1]];
    let off = Math.hypot(x1 - x0, y1 - y0) * 0.18;
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        out.push(pts[i], [(ax + bx) / 2 + rand(-off, off), (ay + by) / 2 + rand(-off, off) * 0.3]);
      }
      out.push(pts[pts.length - 1]);
      pts = out; off *= 0.55;
    }
    return pts;
  }
  _silhouette(f, color) {
    const r = this._artRect(f);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    const g = c.getContext('2d');
    g.drawImage(f.img, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-in';
    const grd = g.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, rgba(color, 0.2));
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  _ash(f, r, colors) {
    const n = this.reducedMotion ? 60 : 260;
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random();
      const s = this._sample(f, u, v);
      if (s[3] < 60) continue;
      const x = r.x + (f.mirror ? 1 - u : u) * r.w, y = r.y + v * r.h;
      const ember = Math.random() < 0.18;
      this._add({ shape: ember ? 'glow' : 'dot', x, y, vx: rand(-30, 30) + (f.side === 'left' ? -40 : 40), vy: rand(-140, -30), g: -40, drag: 0.8, life: rand(0.9, 1.8), size: ember ? rand(6, 12) : rand(1.2, 2.6), size1: 1, color: ember ? colors[2 + (i % 2)] : colors[i % 2], blend: ember ? 'lighter' : 'source-over', a: 1, delay: (1 - v) * 0.35 });
    }
  }
}

export default BattleScene;
