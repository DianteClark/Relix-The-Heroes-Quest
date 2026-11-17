// Relix v0.3: cinematic beats between moves. Turn banner, treasure / trap card
// reveals, floor intro title card, boss skill slam, relic celebration, callouts and
// one-time coach tips. Same visual language as the battle scene (js/battle.js):
// vibrant cartoon, thick ink outlines, FE-style plates, punchy WAAPI motion and a
// small 2D-canvas particle layer per beat.
//
// Every beat returns a promise. Human-facing beats wait for a tap (waitTap); bot
// beats auto-advance, scaled by speed(). prefers-reduced-motion (or
// body.reduced-motion) swaps the motion for short fades.
import { treasureCard, trapCard, cardBack, bossBack } from './cards.js';
import { heroDef, BOSSES } from './data.js';

// The battle module owns the stage painter. Load it lazily so flow still works
// (with a gradient backdrop) if the battle module is missing.
let paintStage = null;
import('./battle.js').then((m) => { paintStage = m.paintStage || null; }).catch(() => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced-motion');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const hexOf = (c, d = '#f2c443') => (c == null ? d : typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c);
const art = (a) => `assets/chars/${a}.webp`;
function rgbOf(c) {
  let s = hexOf(c).replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
const decode = (img, ms = 1500) => Promise.race([img.decode?.().catch(() => {}) ?? Promise.resolve(), sleep(ms)]);
// Shrink a single-line title until its text fits `width` (layout px, transforms ignored).
function fitText(el, max, min, width) {
  const prev = el.style.width;
  el.style.width = 'max-content';
  let s = max;
  el.style.fontSize = `${s}px`;
  while (s > min && el.offsetWidth > width) { s -= 1; el.style.fontSize = `${s}px`; }
  el.style.width = prev;
  return s;
}

// ------------------------------------------------------------------ particles
const spriteCache = new Map();
function glowSprite(color, soft = 0.3) {
  const key = `${color}|${soft}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, rgba(color, 1)); grd.addColorStop(soft * 0.5, rgba(color, 0.55)); grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

// A full-screen canvas of short-lived particles. The loop only runs while there is
// something to draw, and dies with its layer.
class Fx {
  constructor(parent, { z = 3 } = {}) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'fl-fx';
    this.cv.style.zIndex = z;
    parent.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.parts = [];
    this.raf = 0;
    this.dead = false;
    this.rm = reduced();
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight; this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
  }
  add(p) {
    if (this.dead) return p;
    p.t = -(p.delay || 0); p.vx ??= 0; p.vy ??= 0; p.a ??= 1;
    this.parts.push(p);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.loop(t)); }
    return p;
  }
  loop(t) {
    this.raf = 0;
    if (this.dead) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
      if (p.vf) p.flip = (p.flip || 0) + p.vf * dt;
    }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const p of P) {
      if (p.t < 0) continue;
      const k = p.t / p.life;
      let a = p.a * (p.fadeAt != null ? (k < p.fadeAt ? 1 : 1 - (k - p.fadeAt) / (1 - p.fadeAt)) : 1 - k);
      if (a <= 0.004) continue;
      g.globalAlpha = clamp(a, 0, 1);
      g.globalCompositeOperation = p.blend || 'source-over';
      this.draw(g, p, k);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (P.length) this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }
  draw(g, p, k) {
    switch (p.shape) {
      case 'glow': case 'puff': {
        const s = p.size + ((p.size1 ?? p.size) - p.size) * k;
        g.drawImage(glowSprite(p.color, p.shape === 'puff' ? 0.9 : 0.25), p.x - s / 2, p.y - s / 2, s, s);
        break;
      }
      case 'spark': {
        g.strokeStyle = p.color; g.lineWidth = p.size * (1 - k * 0.6); g.lineCap = 'round';
        const len = p.len ?? 0.04;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * len, p.y - p.vy * len); g.stroke();
        break;
      }
      case 'ring': {
        const e = 1 - Math.pow(1 - k, 3), r = p.r0 + (p.r1 - p.r0) * e;
        g.strokeStyle = p.color; g.lineWidth = p.width * (1 - k) + 0.5;
        g.beginPath(); g.ellipse(p.x, p.y, r, r * p.flat, 0, 0, Math.PI * 2); g.stroke();
        break;
      }
      case 'star': {
        const s = p.size * Math.sin(k * Math.PI);
        g.fillStyle = p.color;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0.3);
        g.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? s * 0.14 : s; const an = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.fill(); g.restore();
        break;
      }
      case 'coin': {
        // A gold coin spinning on its vertical axis: ink rim, face, shine.
        const w = p.size * Math.abs(Math.cos(p.flip || 0)) + 1.2, h = p.size;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0);
        g.fillStyle = '#5c3a05'; g.beginPath(); g.ellipse(0, 0, w + 1.6, h + 1.6, 0, 0, 7); g.fill();
        g.fillStyle = Math.cos(p.flip || 0) > 0 ? '#ffd34a' : '#e0a51c'; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,250,220,.85)'; g.beginPath(); g.ellipse(-w * 0.3, -h * 0.35, w * 0.28, h * 0.22, -0.5, 0, 7); g.fill();
        g.restore();
        break;
      }
      case 'rect': {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(1, Math.cos(p.flip || 0));
        g.fillStyle = p.color; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
        break;
      }
      default: {
        g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // ---- builders
  burst(x, y, n, { color = '#ffe27a', speed = 520, life = 0.5, size = 2.2, spread = Math.PI, dir = 0, g = 300, len } = {}) {
    if (this.rm) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = spread >= Math.PI ? rand(0, Math.PI * 2) : dir + rand(-spread / 2, spread / 2), s = rand(speed * 0.3, speed);
      this.add({ shape: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.6, g, life: rand(life * 0.6, life), size: rand(size * 0.6, size * 1.3), color, blend: 'lighter', len });
    }
    this.add({ shape: 'glow', x, y, life: 0.3, size: speed * 0.25, size1: speed * 0.34, color, blend: 'lighter', a: 0.85 });
  }
  ring(x, y, r0, r1, color = '#fff3c4', flat = 1, ms = 500, width = 4) { this.add({ shape: 'ring', x, y, r0, r1, flat, color, width, life: ms / 1000, blend: 'lighter' }); }
  stars(x, y, w, h, n, colors = ['#fff6c8', '#ffe27a'], delay = 0.5) {
    if (this.rm) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) this.add({ shape: 'star', x: x + rand(-w / 2, w / 2), y: y + rand(-h / 2, h / 2), vy: rand(-30, 0), life: rand(0.4, 0.8), size: rand(7, 15), color: colors[i % colors.length], blend: 'lighter', delay: rand(0, delay), rot: rand(0, 1) });
  }
  dust(x, y, w, n, color = '#d8cbb8') {
    if (this.rm) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const d = Math.random() < 0.5 ? -1 : 1;
      this.add({ shape: 'puff', x: x + rand(-w / 2, w / 2) * 0.6, y: y - rand(0, 8), vx: d * rand(60, 260), vy: rand(-70, -5), drag: 3, life: rand(0.5, 1), size: rand(16, 30), size1: rand(50, 80), color, a: 0.42 });
    }
  }
  coins(x, y, n, { up = 900, spread = 1.1 } = {}) {
    if (this.rm) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-spread / 2, spread / 2), s = rand(up * 0.55, up);
      this.add({ shape: 'coin', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 1500, drag: 0.4, life: rand(1.3, 2), size: rand(7, 11), flip: rand(0, 6), vf: rand(9, 16), rot: rand(-0.3, 0.3), fadeAt: 0.75, delay: rand(0, 0.25) });
    }
  }
  confetti(x, y, n, ang, spread, sp) {
    if (this.rm) n = Math.ceil(n / 3);
    const cols = ['#ff4d6d', '#ffd23f', '#3bceac', '#4f7cff', '#c04dff', '#ff8a3a', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(sp * 0.45, sp);
      this.add({ shape: 'rect', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 700, drag: 1.3, life: rand(1.6, 2.6), w: rand(5, 9), h: rand(8, 14), rot: rand(0, 6), vr: rand(-12, 12), flip: rand(0, 6), vf: rand(6, 14), color: cols[i % cols.length], fadeAt: 0.75 });
    }
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.parts.length = 0; this.cv.remove(); }
}

// ------------------------------------------------------------------ Flow
export class Flow {
  constructor({ sfx = () => {}, haptics = null, speed = () => 1 } = {}) {
    this.sfx = sfx;
    this.haptics = haptics;
    this.speed = speed;
    this.root = document.createElement('div');
    this.root.id = 'flow';
    document.body.appendChild(this.root);
  }

  // Waits for a deliberate tap anywhere on the overlay (ignores the first 350ms so
  // a tap that triggered the beat can't skip it by accident).
  waitTap(el, maxMs = 9000) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let down = null;
      const done = () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); clearTimeout(timer); resolve(); };
      const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = (e) => {
        if (performance.now() - t0 < 350) return;
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 24) return;
        this.haptics?.tap();
        this.sfx('tap');
        done();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      const timer = setTimeout(done, maxMs);
    });
  }

  layer(cls, html) {
    const el = document.createElement('div');
    el.className = `flow-layer ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    el._anims = new Set();
    return el;
  }
  async remove(el, ms = 260) {
    el.classList.add('out');
    await sleep(reduced() ? 0 : ms);
    el._fx?.destroy();
    for (const a of el._anims || []) { try { a.cancel(); } catch { /* ignore */ } }
    el.remove();
  }

  // WAAPI helper bound to a layer (so remove() can cancel everything). `k` scales
  // the duration (bots at high game speed play beats faster).
  _a(layer, node, kf, o = {}) {
    if (!node || !node.animate) return Promise.resolve();
    const k = o.k ?? 1;
    const a = node.animate(kf, { duration: Math.max(1, (o.duration ?? 300) * k), delay: (o.delay ?? 0) * k, easing: o.easing || 'ease', fill: o.fill || 'none', iterations: o.iterations || 1, composite: o.composite || 'replace' });
    layer._anims?.add(a);
    return a.finished.catch(() => {}).finally(() => layer._anims?.delete(a));
  }
  _fx(layer) { if (!layer._fx) layer._fx = new Fx(layer); return layer._fx; }
  // Damped camera shake on a node; with a direction it kicks along the blow first.
  _shake(layer, node, power = 1, dur = 380, ux = 0, uy = 0) {
    if (reduced() || power <= 0) return Promise.resolve();
    const kf = [], n = 12, amp = power * 10, has = !!(ux || uy);
    for (let i = 0; i <= n; i++) {
      const t = i / n, k = Math.pow(1 - t, 2.2);
      if (i === n) { kf.push({ transform: 'none' }); break; }
      const osc = Math.cos(t * Math.PI * 5.5) * k * amp;
      const jx = rand(-1, 1) * amp * k * (has ? 0.35 : 1), jy = rand(-1, 1) * amp * k * (has ? 0.35 : 1);
      kf.push({ transform: `translate(${(has ? ux * osc + jx : jx).toFixed(1)}px,${(has ? uy * osc + jy : jy).toFixed(1)}px) rotate(${(rand(-0.5, 0.5) * power * k).toFixed(2)}deg)` });
    }
    return this._a(layer, node, kf, { duration: dur, easing: 'linear' });
  }
  _flash(layer, color = '#fff', peak = 0.7, dur = 260) {
    let f = layer.querySelector(':scope > .fl-flash');
    if (!f) { f = document.createElement('div'); f.className = 'fl-flash'; layer.appendChild(f); }
    f.style.background = color;
    return this._a(layer, f, [{ opacity: reduced() ? peak * 0.35 : peak }, { opacity: 0 }], { duration: dur, easing: 'ease-out' });
  }
  _center(node) { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
  // Bot beats speed up with the game; human beats always play at full length.
  _k(human) { return human ? 1 : clamp(this.speed(), 0.35, 1); }

  // ================================================================ turn banner
  async turn(p, { human, guild } = {}) {
    const sp = this.speed(), rm = reduced(), k = this._k(human);
    const hero = heroDef(p.hero);
    const col = hexOf(guild?.color || p.banner?.field || '#f2c443');
    const el = this.layer(`turn ${human ? 'mine' : ''}`, `
      <div class="tb" style="--tc:${col};--tcd:${mix(col, '#000000', 0.55)}">
        <div class="tb-band"><i class="tb-lines"></i><i class="tb-shine"></i></div>
        <div class="tb-medal"><i class="tb-disc"></i><img class="tb-art" src="${art(hero.art)}" alt=""></div>
        <div class="tb-text"><small>${human ? 'Your move' : esc(hero.role || 'Rival')}</small><b><span>${esc(p.name)}</span><em>'s turn</em></b></div>
      </div>`);
    const tb = el.querySelector('.tb'), band = el.querySelector('.tb-band'), medal = el.querySelector('.tb-medal'),
      img = el.querySelector('.tb-art'), text = el.querySelector('.tb-text'), shine = el.querySelector('.tb-shine');
    const name = el.querySelector('.tb-text b');
    await decode(img, 220);
    fitText(name, innerWidth >= 900 ? 52 : Math.min(42, innerWidth * 0.105), 18, text.clientWidth - 4);
    this.sfx('turn');
    if (human) this.haptics?.select();
    const ease = 'cubic-bezier(.2,.9,.25,1)';
    if (rm) {
      await this._a(el, tb, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    } else {
      const bandP = this._a(el, band, [{ transform: 'translateX(-105%) skewX(-18deg)' }, { transform: 'translateX(3%) skewX(-6deg)', offset: 0.7 }, { transform: 'translateX(0) skewX(0)' }], { duration: 300, easing: ease, fill: 'backwards', k });
      this._a(el, medal, [{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1.18) rotate(6deg)', offset: 0.6 }, { transform: 'scale(1) rotate(0)' }], { duration: 380, delay: 90, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards', k });
      this._a(el, img, [{ transform: 'translateY(40%) scale(.7)', opacity: 0 }, { transform: 'translateY(-8%) scale(1.06)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 150, easing: ease, fill: 'backwards', k });
      const textP = this._a(el, text, [{ transform: 'translateX(70px) skewX(-14deg)', opacity: 0 }, { transform: 'translateX(-6px) skewX(4deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: 140, easing: ease, fill: 'backwards', k });
      this._a(el, shine, [{ transform: 'translateX(-120%) skewX(-24deg)' }, { transform: 'translateX(320%) skewX(-24deg)' }], { duration: 560, delay: 300, easing: 'ease-in-out', fill: 'both', k });
      this._a(el, el.querySelector('.tb-lines'), [{ backgroundPosition: '0 0' }, { backgroundPosition: '-400px 0' }], { duration: 1200, iterations: 3, easing: 'linear' });
      await bandP;
      this._shake(el, tb, human ? 0.45 : 0.25, 260, 1, 0);
      // Hold counts from when the entrance has actually played (slow first frames
      // on a busy device must not eat the banner).
      await textP;
    }
    await sleep(human ? 700 : Math.max(120, 520 * sp));
    if (!rm) {
      this._a(el, tb, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(60%) skewX(-16deg)', opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards', k });
      await sleep(200 * k);
    }
    await this.remove(el, 60);
  }

  // ================================================================ card reveal
  _cardSize(n) {
    const W = innerWidth, H = innerHeight, portrait = H / W > 1.15, R = 1095 / 726;
    let per = n, rows = 1;
    if (portrait && n >= 3) { per = n >= 5 ? 3 : 2; rows = Math.ceil(n / per); }
    if (!portrait && n > 5) { per = Math.ceil(n / 2); rows = 2; }
    const gap = 14;
    const byW = (W - 32 - gap * (per - 1)) / per;
    const byH = ((H * (portrait ? 0.58 : 0.5)) - gap * (rows - 1)) / rows / R;
    const cap = n === 1 ? 240 : n === 2 ? 210 : 180;
    return Math.floor(Math.max(84, Math.min(cap, byW, byH)));
  }

  _revealShell(cls, title, why, n, html, hint) {
    const w = this._cardSize(n);
    const el = this.layer(`reveal ${cls}`, `
      <div class="fl-dim"></div><div class="fl-rays"></div>
      <div class="rv-stage">
        <div class="rv-head"><div class="rv-ribbon"><b>${title}</b></div>${why ? `<small>${esc(why)}</small>` : ''}</div>
        <div class="rv-cards" style="--cw:${w}px">${html}</div>
        ${hint ? `<div class="rv-hint">${hint}</div>` : ''}
      </div>`);
    return el;
  }

  _flipHtml(back, front, i) {
    return `<div class="flip" style="--i:${i}"><div class="flip-pose"><div class="flip-in">
      <div class="flip-face back">${back}</div>
      ${front ? `<div class="flip-face front">${front}<i class="flip-shine"></i></div>` : ''}
    </div></div></div>`;
  }

  // Deal cards in from the top, one after another, landing with a squash.
  async _deal(el, k, from = 'top') {
    const flips = [...el.querySelectorAll('.flip')];
    if (reduced()) { await this._a(el, el.querySelector('.rv-cards'), [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return flips; }
    const ps = flips.map((f, i) => {
      const dir = i % 2 ? 1 : -1;
      const start = from === 'top' ? `translate(${dir * 40}px,-75vh) rotate(${dir * 28}deg) scale(.7)` : 'translateY(-30vh) scale(2.4) rotate(-10deg)';
      return this._a(el, f, [
        { transform: start, opacity: 1 },
        { transform: 'translate(0,6px) rotate(0) scale(1.05,.94)', offset: 0.72, easing: 'cubic-bezier(.3,0,.5,1)' },
        { transform: 'translate(0,-4px) scale(.98,1.03)', offset: 0.86 },
        { transform: 'none' },
      ], { duration: 460, delay: i * 110, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'backwards', k });
    });
    await Promise.all(ps);
    return flips;
  }

  // Flip one card face-up with a pop, a burst of sparkles and a shine sweep.
  async _flipCard(el, f, { color = '#ffe27a', k = 1, delay = 0 } = {}) {
    const fin = f.querySelector('.flip-in');
    if (reduced()) { fin.style.transform = 'rotateY(180deg)'; f.classList.add('lit'); return; }
    const p = this._a(el, fin, [
      { transform: 'rotateY(0) scale(1)' },
      { transform: 'rotateY(90deg) scale(1.16)', offset: 0.45, easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: 'rotateY(196deg) scale(1.06)', offset: 0.8 },
      { transform: 'rotateY(180deg) scale(1)' },
    ], { duration: 520, delay, easing: 'cubic-bezier(.4,0,.5,1)', fill: 'forwards', k });
    await sleep((delay + 230) * k);
    this.sfx('card_flip');
    const c = this._center(f), fx = this._fx(el);
    fx.burst(c.x, c.y, 26, { color, speed: 560, life: 0.55, size: 2.4, g: 200 });
    fx.ring(c.x, c.y, c.w * 0.3, c.w * 1.1, color, 1, 480, 4);
    fx.stars(c.x, c.y, c.w, c.h, 8, ['#ffffff', color], 0.5);
    await p;
    fin.style.transform = 'rotateY(180deg)';
    f.classList.add('lit');
    const sh = f.querySelector('.flip-shine');
    if (sh) this._a(el, sh, [{ transform: 'translateX(-130%) skewX(-20deg)', opacity: 1 }, { transform: 'translateX(260%) skewX(-20deg)', opacity: 1 }], { duration: 620, easing: 'ease-in-out', fill: 'both', k });
  }

  // Fly cards to a HUD target (the hand button for your own draws, a player chip for
  // others), leaving a sparkle trail and bumping the target on arrival.
  async _collect(el, flips, target, k, { trail = '#ffe27a' } = {}) {
    const fx = this._fx(el), rm = reduced();
    const tr = target && target.getBoundingClientRect();
    const ok = tr && tr.width > 0 && tr.height > 0 && getComputedStyle(target).visibility !== 'hidden';
    const T = ok ? { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 } : { x: innerWidth - 44, y: innerHeight - 60 };
    this._a(el, el.querySelector('.fl-dim'), [{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 160, fill: 'forwards', k });
    this._a(el, el.querySelector('.fl-rays'), [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards', k });
    for (const n of el.querySelectorAll('.rv-head,.rv-hint')) this._a(el, n, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 220, fill: 'forwards', k });
    if (rm) { await this._a(el, el.querySelector('.rv-cards'), [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }); return; }
    const ps = flips.map((f, i) => {
      const c = this._center(f);
      const dx = T.x - c.x, dy = T.y - c.y, sc = clamp(44 / c.w, 0.12, 0.4);
      const delay = i * 90;
      // Sparkle trail: sample along the curve while the card flies.
      const dur = 520 * k, t0 = performance.now() + delay * k;
      const tick = () => {
        const t = (performance.now() - t0) / dur;
        if (t > 1 || el._fx?.dead) return;
        if (t > 0) {
          const e = t * t, x = c.x + dx * e, y = c.y + dy * e - Math.sin(t * Math.PI) * 60;
          fx.add({ shape: 'glow', x: x + rand(-8, 8), y: y + rand(-8, 8), life: 0.35, size: 16, size1: 3, color: trail, blend: 'lighter', a: 0.8 });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return this._a(el, f, [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx * 0.06}px,${dy * 0.06 - 40}px) scale(1.08) rotate(${i % 2 ? 4 : -4}deg)`, offset: 0.22, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(${i % 2 ? 24 : -24}deg)`, opacity: 0.95 },
      ], { duration: 520, delay, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards', k }).then(() => {
        f.style.opacity = '0';
        fx.burst(T.x, T.y, 12, { color: trail, speed: 300, life: 0.4, size: 2, g: 100 });
        fx.ring(T.x, T.y, 6, 36, trail, 1, 360, 3);
        this.sfx('coin');
        if (ok) this._a(el, target, [{ transform: 'scale(1)' }, { transform: 'scale(1.28) rotate(-6deg)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      });
    });
    await Promise.all(ps);
    await sleep(220 * k);
  }

  async cards(p, cards, { human, why, hidden } = {}) {
    if (!cards.length) return;
    if (hidden) return this.hiddenCards(p, cards.length, why);
    const sp = this.speed(), k = this._k(human);
    const n = cards.length;
    const title = `${esc(p.name)} ${n > 1 ? `draws ${n} treasures` : 'finds a treasure'}`;
    const el = this._revealShell('treasure', title, why, n, cards.map((c, i) => this._flipHtml(cardBack('Treasure'), treasureCard(c.id), i)).join(''), human ? 'Tap to collect' : '');
    this._intro(el, k);
    this.sfx('card_draw');
    const flips = await this._deal(el, k);
    for (let i = 0; i < flips.length; i++) {
      const last = i === flips.length - 1;
      const pr = this._flipCard(el, flips[i], { color: '#ffd34a', k });
      if (last) await pr; else await sleep(150 * k);
    }
    if (human) this.haptics?.success();
    this._a(el, el.querySelector('.fl-rays'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, fill: 'forwards' });
    await sleep(160 * k);
    if (human) await this.waitTap(el);
    else await sleep(Math.max(250, 650 * sp));
    await this._collect(el, flips, document.querySelector('#me .me-cards'), k);
    await this.remove(el, 120);
  }

  // Dim + title ribbon slam shared by the reveal beats.
  _intro(el, k) {
    if (reduced()) return;
    this._a(el, el.querySelector('.fl-dim'), [{ opacity: 0 }, { opacity: 1 }], { duration: 240, fill: 'backwards', k });
    this._a(el, el.querySelector('.rv-ribbon'), [{ transform: 'scale(2.2) rotate(-6deg)', opacity: 0 }, { transform: 'scale(.94) rotate(-2deg)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(.3,1.4,.5,1)' }, { transform: 'rotate(-2deg)', opacity: 1 }], { duration: 380, delay: 60, fill: 'backwards', k });
    const sm = el.querySelector('.rv-head small');
    if (sm) this._a(el, sm, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 260, fill: 'backwards', k });
  }

  // Another player's draw: everyone sees that cards were drawn, nobody sees which.
  async hiddenCards(p, n, why) {
    const k = this._k(false);
    const title = `${esc(p.name)} ${n > 1 ? `draws ${n} treasures` : 'draws a treasure'}`;
    const el = this._revealShell('treasure hidden', title, why, n, Array.from({ length: n }, (_, i) => this._flipHtml(cardBack('Treasure'), '', i)).join(''), '');
    this._intro(el, k);
    this.sfx('card_draw');
    const flips = await this._deal(el, k);
    // A little "peek" wobble so it reads as someone else's secret.
    if (!reduced()) flips.forEach((f, i) => this._a(el, f.querySelector('.flip-pose'), [{ transform: 'none' }, { transform: 'rotate(-4deg) translateY(-6px)', offset: 0.3 }, { transform: 'rotate(3deg)', offset: 0.65 }, { transform: 'none' }], { duration: 420, delay: i * 60, k }));
    await sleep(Math.max(200, 450 * this.speed()));
    const chip = [...document.querySelectorAll(`[data-pid="${p.id}"]`)].find((x) => x.getBoundingClientRect().width > 0);
    await this._collect(el, flips, chip || null, k, { trail: '#c9b6ff' });
    await this.remove(el, 100);
  }

  // ================================================================ trap reveal
  async trap(p, card, { human } = {}) {
    const sp = this.speed(), k = this._k(human), rm = reduced();
    const w = this._cardSize(1);
    const el = this.layer('reveal trap', `
      <div class="fl-dim"></div><div class="tr-alarm"></div>
      <div class="tr-hazard top"></div><div class="tr-hazard bot"></div>
      <div class="rv-stage">
        <div class="rv-head"><div class="tr-title">TRAP!</div><small>${esc(p.name)} sets it off</small></div>
        <div class="rv-cards" style="--cw:${w}px">${this._flipHtml(cardBack('Trap'), trapCard(card.id), 0)}</div>
        ${human ? '<div class="rv-hint">Tap to continue</div>' : ''}
      </div>`);
    const stage = el.querySelector('.rv-stage'), title = el.querySelector('.tr-title');
    this.sfx('trap');
    this.haptics?.impact(2);
    if (!rm) {
      this._flash(el, '#ff2a2a', 0.55, 380);
      this._a(el, el.querySelector('.fl-dim'), [{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' });
      this._a(el, el.querySelector('.tr-alarm'), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0.35, offset: 0.45 }, { opacity: 1, offset: 0.6 }, { opacity: 0.45 }], { duration: 1100, fill: 'forwards' });
      for (const h of el.querySelectorAll('.tr-hazard')) this._a(el, h, [{ transform: 'rotate(-3deg) scaleY(0)' }, { transform: 'rotate(-3deg) scaleY(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
      this._a(el, title, [
        { transform: 'scale(3.4) rotate(-12deg)', opacity: 0 },
        { transform: 'scale(.9) rotate(-4deg)', opacity: 1, offset: 0.55, easing: 'cubic-bezier(.3,1.5,.5,1)' },
        { transform: 'scale(1) rotate(-4deg)', opacity: 1 },
      ], { duration: 340, fill: 'backwards', k });
      await sleep(180 * k);
      this._shake(el, stage, 1.4, 460, 0, 1);
      const tc = this._center(title);
      this._fx(el).burst(tc.x, tc.y, 22, { color: '#ff6a55', speed: 620, life: 0.45, size: 2.6 });
    }
    const flips = await this._deal(el, k, 'slam');
    if (!rm) this._shake(el, stage, 0.9, 320, 0, 1);
    await sleep(120 * k);
    await this._flipCard(el, flips[0], { color: '#ff5a4a', k });
    if (!rm) { this._flash(el, '#ff4040', 0.3, 260); this._shake(el, stage, 0.6, 260); }
    this.haptics?.impact(2);
    await sleep(240 * k);
    if (human) await this.waitTap(el);
    else await sleep(Math.max(350, 850 * sp));
    if (!rm) await this._a(el, flips[0], [{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) scale(.85) rotate(6deg)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards', k });
    await this.remove(el, 200);
  }

  // ================================================================ floor intro
  // A boss reveal title card: the floor's stage painted by the battle painter, the
  // floor name slams down, the boss drops onto its platform as a silhouette (dust,
  // shake), lights up, and its FE-style plate and skill slide in.
  async floor(f, boss, { human } = {}) {
    const t = boss.theme || {};
    const acc = hexOf(t.accent), light = hexOf(t.light, '#ffe8b0');
    const W = innerWidth, H = innerHeight, portrait = H / W > 1.15, rm = reduced();
    const skill = String(boss.skill || '').replace(/^Every third battle roll /, 'Every 3rd roll: ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const el = this.layer('floor-intro', `
      <canvas class="fi-stage"></canvas>
      <div class="fi-tint" style="--acc:${acc};--light:${light}"></div>
      <div class="fi-rays" style="--acc:${acc};--light:${light}"></div>
      <div class="fi-bars"><i></i><i></i></div>
      <div class="fi-top"><small>Floor ${f} of 5</small><h1>${esc(t.name || 'The Dungeon')}</h1><i class="fi-rule"></i></div>
      <div class="fi-boss"><div class="fi-base"><i class="fi-glow" style="--acc:${acc}"></i><i class="fi-plat" style="--acc:${acc}"></i></div>
        <div class="fi-act"><div class="fi-idle"><img src="${art(boss.art)}" alt=""></div></div></div>
      <div class="fi-plate" style="--acc:${acc}">
        <div class="fi-nm"><em>Boss</em><b>${esc(boss.name)}</b></div>
        <div class="fi-hp"><img src="assets/ui/heart.webp" alt=""><div class="fi-bar"><i></i><i class="fi-gloss"></i></div><span><b>0</b><small>/${boss.hp}</small></span></div>
        <div class="fi-atk"><img src="assets/ui/sword.webp" alt=""><b>${boss.atk}</b></div>
      </div>
      <div class="fi-skill" style="--acc:${acc}"><small>Boss skill</small><p>${esc(skill)}</p></div>
      ${human ? '<div class="rv-hint">Tap to enter the dungeon</div>' : ''}`);
    el.classList.toggle('land', !portrait);
    const $ = (s) => el.querySelector(s);
    const cv = $('.fi-stage'), img = $('.fi-boss img'), bossBox = $('.fi-boss'), act = $('.fi-act');
    // Backdrop: the same stage the boss fight will be on.
    const paint = () => {
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      if (paintStage) paintStage(cv, t, { width: W, height: H, horizon: portrait ? 0.5 : 0.56 });
      else el.classList.add('no-stage');
    };
    if (!paintStage) await sleep(60);   // give the lazy import a moment on first use
    paint();
    await decode(img);
    const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.95;
    // Layout: portrait stacks title / boss / plate / skill; landscape puts the boss left.
    let feetY, bh, bx;
    if (portrait) {
      bh = Math.min(H * 0.34, (W * 0.8) / aspect, 420);
      feetY = H * 0.6; bx = W / 2;
    } else {
      bh = Math.min(H * 0.6, (W * 0.4) / aspect, 520);
      feetY = H * 0.86; bx = W * 0.3;
    }
    const bw = bh * aspect;
    Object.assign(bossBox.style, { left: `${bx - bw / 2}px`, top: `${feetY - bh}px`, width: `${bw}px`, height: `${bh}px` });
    fitText($('.fi-top h1'), portrait ? Math.min(64, W * 0.13) : 54, 24, portrait ? W - 28 : Math.min(W * 0.46, 460));
    const plate = $('.fi-plate'), sk = $('.fi-skill');
    if (portrait) {
      const pw = Math.min(W - 28, 360);
      Object.assign(plate.style, { left: `${(W - pw) / 2}px`, top: `${feetY + 18}px`, width: `${pw}px` });
      Object.assign(sk.style, { left: `${(W - pw) / 2 + 6}px`, top: `${feetY + 104}px`, width: `${pw - 12}px` });
    } else {
      const cx = W * 0.72, pw = Math.min(W * 0.44, 420);
      $('.fi-top').style.cssText = `left:${cx}px;width:${pw + 20}px`;
      const top = $('.fi-top');
      const py = Math.max(H * 0.3, top.offsetTop + top.offsetHeight + 16);
      Object.assign(plate.style, { left: `${cx - pw / 2}px`, top: `${py}px`, width: `${pw}px` });
      Object.assign(sk.style, { left: `${cx - pw / 2 + 6}px`, top: `${py + 90}px`, width: `${pw - 12}px` });
    }
    fitText($('.fi-nm b'), 30, 16, plate.clientWidth - 36 - 54 - $('.fi-nm em').offsetWidth - 10);
    const fx = this._fx(el);
    this.haptics?.impact(2);
    const ease = 'cubic-bezier(.2,.9,.25,1)';
    if (rm) {
      await this._a(el, el, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
      this._fillBar(el, boss.hp, 0);
      this.sfx('boss_roar');
    } else {
      // 1. stage fades up from black with a slow push-in
      this._a(el, cv, [{ opacity: 0, transform: 'scale(1.12)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1400, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
      for (const [i, b] of [...el.querySelectorAll('.fi-bars i')].entries()) this._a(el, b, [{ transform: 'scaleY(2.5)' }, { transform: 'scaleY(1)' }], { duration: 700, easing: ease, fill: 'backwards', delay: i * 30 });
      // 2. title
      this._a(el, $('.fi-top small'), [{ opacity: 0, letterSpacing: '14px' }, { opacity: 1, letterSpacing: '5px' }], { duration: 520, delay: 200, easing: ease, fill: 'backwards' });
      this._a(el, $('.fi-top h1'), [{ opacity: 0, transform: 'translateY(-30px) scale(1.7)' }, { opacity: 1, transform: 'translateY(4px) scale(.96)', offset: 0.65, easing: 'cubic-bezier(.3,1.4,.5,1)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 380, fill: 'backwards' });
      this._a(el, $('.fi-rule'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 500, delay: 620, easing: ease, fill: 'backwards' });
      this._a(el, $('.fi-base'), [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: 500, easing: ease, fill: 'backwards' });
      await sleep(620);
      // 3. the boss drops in as a silhouette and slams the platform
      this._a(el, img, [{ filter: 'brightness(0) drop-shadow(0 0 2px rgba(255,255,255,.7))' }, { filter: 'brightness(0) drop-shadow(0 0 2px rgba(255,255,255,.7))' }], { duration: 560, fill: 'backwards' });
      await this._a(el, act, [
        { transform: `translateY(${-(feetY + 40)}px) scale(.9,1.15)` },
        { transform: 'translateY(0) scale(.92,1.1)', offset: 0.7, easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: 'translateY(0) scale(1.16,.82)', offset: 0.82 },
        { transform: 'translateY(-10px) scale(.97,1.04)', offset: 0.92 },
        { transform: 'none' },
      ], { duration: 560, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'backwards' });
      this.sfx('hit');
      this.sfx('boss_roar');
      this.haptics?.impact(2);
      fx.dust(bx, feetY, bw, 26, mix(hexOf(t.ground, '#2e2540'), '#d8cbb8', 0.55));
      fx.ring(bx, feetY, 10, bw * 0.95, light, 0.3, 600, 5);
      fx.ring(bx, feetY, 10, bw * 1.5, acc, 0.3, 800, 3);
      this._shake(el, el, 1.6, 560, 0, 1);
      this._flash(el, '#ffffff', 0.55, 260);
      // 4. light up: silhouette → full color with a rim of light and a burst
      this._a(el, img, [{ filter: 'brightness(0) drop-shadow(0 0 2px rgba(255,255,255,.7))' }, { filter: 'brightness(2.4) drop-shadow(0 0 22px #fff)', offset: 0.35 }, { filter: 'brightness(1) drop-shadow(0 12px 18px rgba(0,0,0,.55))' }], { duration: 760, delay: 140, easing: 'ease-out', fill: 'backwards' });
      this._a(el, $('.fi-rays'), [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, delay: 140, easing: ease, fill: 'backwards' });
      setTimeout(() => { if (!fx.dead) { fx.burst(bx, feetY - bh * 0.5, 40, { color: light, speed: 760, life: 0.6, size: 2.6, g: 120 }); fx.stars(bx, feetY - bh * 0.5, bw, bh, 12, ['#ffffff', light, acc], 0.6); } }, 240);
      // 5. plate + skill slide in, HP bar fills
      this._a(el, plate, [{ opacity: 0, transform: 'translateX(-60px) skewX(-12deg)' }, { opacity: 1, transform: 'translateX(4px) skewX(2deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 380, easing: ease, fill: 'backwards' });
      this._a(el, $('.fi-nm em'), [{ transform: 'scale(2.4) rotate(-10deg)', opacity: 0 }, { transform: 'scale(1) rotate(-4deg)', opacity: 1 }], { duration: 300, delay: 700, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
      this._fillBar(el, boss.hp, 640);
      this._a(el, sk, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 760, easing: ease, fill: 'backwards' });
      const hint = $('.rv-hint');
      if (hint) this._a(el, hint, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1200, fill: 'backwards' });
      await sleep(900);
    }
    if (human) await this.waitTap(el, 12000);
    else await sleep(Math.max(600, 1600 * this.speed()));
    if (!rm) await this._a(el, el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    await this.remove(el, 40);
  }

  _fillBar(el, max, delay) {
    const fill = el.querySelector('.fi-bar i'), num = el.querySelector('.fi-hp span b');
    if (!fill) return;
    if (reduced()) { fill.style.transform = 'scaleX(1)'; num.textContent = max; return; }
    this._a(el, fill, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, delay, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' });
    const t0 = performance.now() + delay;
    const tick = (tt) => {
      const k = clamp((tt - t0) / 700, 0, 1);
      num.textContent = Math.round(max * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ================================================================ boss skill
  async bossSkill(boss) {
    const sp = this.speed(), k = this._k(false), rm = reduced();
    const acc = hexOf(boss.theme?.accent, '#ff4a4a');
    const w = this._cardSize(1) * 0.86;
    const el = this.layer('boss-skill', `
      <div class="fl-dim red"></div><div class="tr-alarm"></div>
      <div class="bs-rays" style="--acc:${acc}"></div>
      <img class="bs-boss" src="${art(boss.art)}" alt="">
      <div class="bs-stage">
        <div class="bs-title"><small>${esc(boss.name)}</small><b>Boss Skill!</b></div>
        <div class="bs-card" style="width:${w}px">${bossBack(boss)}</div>
      </div>`);
    const stage = el.querySelector('.bs-stage'), card = el.querySelector('.bs-card'), title = el.querySelector('.bs-title'), bimg = el.querySelector('.bs-boss');
    this.sfx('boss_skill');
    this.haptics?.impact(2);
    if (rm) {
      await this._a(el, el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    } else {
      this._flash(el, '#ff3030', 0.6, 360);
      this._a(el, el.querySelector('.tr-alarm'), [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.4, offset: 0.55 }, { opacity: 0.9 }], { duration: 900, fill: 'forwards', k });
      this._a(el, el.querySelector('.bs-rays'), [{ opacity: 0, transform: 'scale(.3) rotate(0)' }, { opacity: 1, transform: 'scale(1) rotate(20deg)' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards', k });
      this._a(el, bimg, [{ opacity: 0, transform: 'translateX(-50%) translateY(30%) scale(1.3)', filter: 'brightness(0)' }, { opacity: .95, transform: 'translateX(-50%) scale(1)', filter: 'brightness(.9) saturate(1.2)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards', k });
      this._a(el, title, [{ transform: 'scale(2.6) rotate(-8deg)', opacity: 0 }, { transform: 'scale(.92) rotate(-3deg)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(.3,1.5,.5,1)' }, { transform: 'rotate(-3deg)', opacity: 1 }], { duration: 340, delay: 120, fill: 'backwards', k });
      await this._a(el, card, [{ transform: 'translateY(-40vh) scale(2.2) rotate(-14deg)', opacity: 0 }, { transform: 'scale(.94,1.06) rotate(2deg)', opacity: 1, offset: 0.7, easing: 'cubic-bezier(.4,0,.6,1)' }, { transform: 'scale(1.06,.94)', offset: 0.85 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 200, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'backwards', k });
      const c = this._center(card), fx = this._fx(el);
      fx.burst(c.x, c.y, 36, { color: '#ff7a5a', speed: 760, life: 0.55, size: 2.6 });
      fx.ring(c.x, c.y, c.w * 0.3, Math.max(innerWidth, innerHeight) * 0.6, '#ffb08a', 1, 560, 5);
      this._shake(el, stage, 1.5, 480, 0, 1);
      this._shake(el, bimg, 0.6, 600);
      this.sfx('hit');
    }
    await sleep(Math.max(400, 850 * sp));
    if (!rm) await this._a(el, stage, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.8)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards', k });
    await this.remove(el);
  }

  // ================================================================ relic claim
  async relic(p, relic, { human } = {}) {
    const hero = heroDef(p.hero), rm = reduced();
    const bossDef = BOSSES.find((b) => b.id === relic.boss);
    const gemCol = hexOf(bossDef?.theme?.accent, '#f2c443');
    const W = innerWidth, H = innerHeight, portrait = H / W > 1.15;
    const el = this.layer('relic-scene', `
      <div class="rl-bg"></div><div class="rl-rays a"></div><div class="rl-rays b"></div>
      <div class="rl-text"><div class="rl-ribbon"><b>Relic claimed!</b></div><h1>${esc(relic.name)}</h1><p>${esc(p.name)} landed the killing blow!</p></div>
      <div class="rl-hero"><div class="rl-base"><i class="rl-glow"></i><i class="rl-plat"></i></div><div class="rl-act"><div class="rl-idle"><img src="${art(hero.art)}" alt=""></div></div></div>
      <div class="rl-gem" style="--gem:${gemCol};--gemd:${mix(gemCol, '#000000', 0.45)};--geml:${mix(gemCol, '#ffffff', 0.6)}"><div class="rl-spin">${GEM_SVG}</div><i class="rl-halo"></i></div>
      ${human ? '<div class="rv-hint">Tap to continue</div>' : ''}`);
    const $ = (s) => el.querySelector(s);
    const img = $('.rl-hero img'), heroBox = $('.rl-hero'), gem = $('.rl-gem');
    await decode(img);
    const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.9;
    const bh = portrait ? Math.min(H * 0.3, 300) : Math.min(H * 0.5, 320);
    const bw = bh * aspect;
    const feetY = portrait ? H * 0.78 : H * 0.88, hx = portrait ? W / 2 : W * 0.3;
    Object.assign(heroBox.style, { left: `${hx - bw / 2}px`, top: `${feetY - bh}px`, width: `${bw}px`, height: `${bh}px` });
    const gs = portrait ? Math.min(W * 0.3, 120) : Math.min(H * 0.24, 110);
    const gy = feetY - bh - gs * 0.75;
    Object.assign(gem.style, { left: `${hx - gs / 2}px`, top: `${gy - gs / 2}px`, width: `${gs}px`, height: `${gs}px` });
    const tx = $('.rl-text');
    if (!portrait) tx.style.cssText = `left:${W * 0.52}px;right:16px;top:${H * 0.24}px;text-align:center`;
    fitText($('.rl-text h1'), portrait ? Math.min(52, W * 0.12) : 50, 22, portrait ? W - 32 : W * 0.44);
    for (const r of el.querySelectorAll('.rl-rays')) r.style.cssText = `left:${hx}px;top:${gy}px`;
    const fx = this._fx(el);
    this.sfx('relic');
    this.haptics?.success();
    const ease = 'cubic-bezier(.2,.9,.25,1)';
    if (rm) {
      await this._a(el, el, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    } else {
      this._flash(el, '#fff6d8', 0.9, 420);
      this._a(el, $('.rl-bg'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'backwards' });
      for (const r of el.querySelectorAll('.rl-rays')) this._a(el, r, [{ opacity: 0, scale: '0.2' }, { opacity: 1, scale: '1' }], { duration: 800, easing: ease, fill: 'backwards' });
      this._a(el, $('.rl-base'), [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 400, delay: 120, easing: ease, fill: 'backwards' });
      this._a(el, $('.rl-act'), [
        { transform: `translateY(${-H * 0.5}px) scale(.9,1.15)`, opacity: 1 },
        { transform: 'translateY(0) scale(.92,1.1)', offset: 0.68, easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: 'scale(1.14,.84)', offset: 0.8 }, { transform: 'translateY(-8px) scale(.98,1.03)', offset: 0.9 }, { transform: 'none' },
      ], { duration: 560, delay: 160, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'backwards' });
      setTimeout(() => { if (!fx.dead) { fx.dust(hx, feetY, bw, 16); this.sfx('hit'); } }, 560);
      // Gem descends spinning fast, then slows into a floating spin.
      this._a(el, gem, [
        { transform: `translateY(${-gy - gs}px) scale(.5)`, opacity: 1 },
        { transform: 'translateY(14px) scale(1.15)', offset: 0.75, easing: 'cubic-bezier(.3,0,.5,1)' },
        { transform: 'translateY(-4px) scale(.96)', offset: 0.9 }, { transform: 'none' },
      ], { duration: 900, delay: 380, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' });
      this._a(el, $('.rl-text'), [{ opacity: 0, transform: 'translateY(-20px) scale(1.2)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 900, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
      this._a(el, $('.rl-ribbon'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 360, delay: 820, easing: ease, fill: 'backwards' });
      await sleep(1150);
      // Big payoff: burst, rings, coin fountain, confetti from both corners.
      const gc = this._center(gem);
      this._flash(el, '#fffbe6', 0.6, 300);
      this._shake(el, el, 0.8, 400, 0, 1);
      fx.burst(gc.x, gc.y, 46, { color: '#fff1b0', speed: 820, life: 0.65, size: 2.8, g: 150 });
      fx.ring(gc.x, gc.y, 10, Math.max(W, H) * 0.55, '#fff3c4', 1, 700, 6);
      fx.ring(gc.x, gc.y, 10, Math.max(W, H) * 0.35, gemCol, 1, 560, 4);
      fx.coins(hx, feetY - bh * 0.35, 36, { up: Math.min(1100, H * 1.2) });
      fx.confetti(-10, H * 0.85, 46, -Math.PI / 3, 0.35, Math.min(1200, H * 1.4));
      fx.confetti(W + 10, H * 0.85, 46, -Math.PI * 2 / 3, 0.35, Math.min(1200, H * 1.4));
      fx.stars(gc.x, gc.y, gs * 3, gs * 3, 16, ['#ffffff', '#ffe27a', gemCol], 0.8);
      [0, 120, 260, 420].forEach((d) => setTimeout(() => !fx.dead && this.sfx('coin'), d));
      this.haptics?.impact(2);
      // Victory hops
      this._a(el, $('.rl-act'), [{ transform: 'none' }, { transform: 'translateY(-26px) scale(.96,1.06)', offset: 0.25, easing: 'cubic-bezier(.2,.8,.4,1)' }, { transform: 'scale(1.06,.94)', offset: 0.5 }, { transform: 'translateY(-14px)', offset: 0.72 }, { transform: 'none' }], { duration: 900, easing: 'ease-in' });
      // Occasional twinkles while the player looks.
      const twinkle = () => { if (fx.dead || !el.isConnected) return; const c = this._center(gem); fx.stars(c.x, c.y, gs * 1.4, gs * 1.4, 2, ['#ffffff', gemCol], 0.2); setTimeout(twinkle, 380); };
      setTimeout(twinkle, 800);
      await sleep(500);
    }
    if (human) await this.waitTap(el);
    else await sleep(Math.max(900, 1800 * this.speed()));
    if (!rm) await this._a(el, el, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
    await this.remove(el, 40);
  }

  // ================================================================ coach tips
  // One-time coach tips. Stored per device so each shows once.
  async tip(key, title, text, artId) {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('relix.tips.v1') || '{}'); } catch { /* ignore */ }
    if (seen[key]) return;
    seen[key] = 1;
    try { localStorage.setItem('relix.tips.v1', JSON.stringify(seen)); } catch { /* ignore */ }
    const el = this.layer('tip', `<div class="tip-card">${artId ? `<div class="tip-art"><img src="${art(artId)}" alt=""></div>` : ''}<div class="tip-body"><span class="tip-stamp">Tip</span><b>${esc(title)}</b><p>${esc(text)}</p><span class="tip-go">Tap to continue</span></div></div>`);
    this.sfx('open');
    const card = el.querySelector('.tip-card'), a = el.querySelector('.tip-art img'), stamp = el.querySelector('.tip-stamp');
    if (!reduced()) {
      this._a(el, el, [{ backgroundColor: 'rgba(6,4,10,0)' }, { backgroundColor: 'rgba(6,4,10,.55)' }], { duration: 260, fill: 'backwards' });
      this._a(el, card, [{ transform: 'translateY(120%) rotate(4deg)' }, { transform: 'translateY(-10px) rotate(-1deg)', offset: 0.7 }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
      if (a) this._a(el, a, [{ transform: 'translateY(40px) scale(.4)', opacity: 0 }, { transform: 'translateY(-10px) scale(1.1)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 460, delay: 240, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
      this._a(el, stamp, [{ transform: 'scale(2.6) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1) rotate(-8deg)', opacity: 1 }], { duration: 300, delay: 380, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
    }
    await this.waitTap(el, 20000);
    if (!reduced()) await this._a(el, card, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px) scale(.96)', opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    await this.remove(el, 80);
  }

  // ================================================================ callout
  // A slammed callout ("PvP!", errors, skill names). `text` may contain markup.
  async banner(text, color = '') {
    const rm = reduced();
    const el = this.layer(`callout ${color}`, `<div class="co"><i class="co-band"></i><div class="co-txt">${text}</div></div>`);
    const co = el.querySelector('.co'), band = el.querySelector('.co-band'), txt = el.querySelector('.co-txt');
    if (!rm) {
      this._a(el, band, [{ transform: 'scaleX(0) skewX(-16deg)' }, { transform: 'scaleX(1) skewX(-16deg)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
      await this._a(el, txt, [{ transform: 'scale(2.6) rotate(-8deg)', opacity: 0 }, { transform: 'scale(.92) rotate(-3deg)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(.3,1.5,.5,1)' }, { transform: 'rotate(-3deg)', opacity: 1 }], { duration: 320, fill: 'backwards' });
      const c = this._center(txt);
      const col = color === 'red' ? '#ff6a55' : color === 'gold' ? '#ffe27a' : '#c9b6ff';
      this._fx(el).burst(c.x, c.y, 22, { color: col, speed: 600, life: 0.45, size: 2.4 });
      this._shake(el, co, 0.6, 300, 0, 1);
    }
    await sleep(Math.max(480, 900 * this.speed()));
    if (!rm) await this._a(el, co, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30px) scale(1.06)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    await this.remove(el, 40);
  }
}

// A cut gem (table, crown and pavilion facets); colored through CSS vars.
const GEM_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g stroke="#1a0f24" stroke-width="3.5" stroke-linejoin="round">
    <polygon points="22,18 78,18 96,40 50,94 4,40" fill="var(--gem)"/>
    <polygon points="22,18 36,40 4,40" fill="var(--geml)"/>
    <polygon points="22,18 50,18 36,40" fill="var(--geml)" opacity=".85"/>
    <polygon points="50,18 78,18 64,40" fill="var(--gem)"/>
    <polygon points="78,18 96,40 64,40" fill="var(--gemd)"/>
    <polygon points="36,40 64,40 50,18" fill="#ffffff" opacity=".55"/>
    <polygon points="4,40 36,40 50,94" fill="var(--gem)"/>
    <polygon points="36,40 64,40 50,94" fill="var(--geml)" opacity=".7"/>
    <polygon points="64,40 96,40 50,94" fill="var(--gemd)"/>
  </g>
  <polygon points="28,24 38,24 30,34" fill="#fff" opacity=".9"/>
</svg>`;
