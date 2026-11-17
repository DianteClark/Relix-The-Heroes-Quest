// Guild moments: the invitation scroll and the guild naming scroll.
//
//   await inviteScroll({ from:{name, art, banner}, to:{name, art}, guildName }) → 'yes' | 'no'
//   await nameGuild({ leader:{name, art}, banner, suggested }) → string (never empty)
//
// Full-screen overlays at z-index 50. Styles live in css/menus.css (.g-*).
// Sounds go out as window 'relix:sfx' events ('scroll', 'guild', 'tap', 'back').

import { onTap, reducedMotion } from './menus.js';
import { drawEmblem, animateBanner, mix } from './banner.js';
import { DEFAULT_BANNER } from './cosmetics.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sfx = (name, intensity = 1) => { try { window.dispatchEvent(new CustomEvent('relix:sfx', { detail: { name, intensity } })); } catch (e) { /* no DOM */ } };
const artUrl = (a) => `assets/chars/${a}.webp`;
const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* none */ } };

/** Draws a wax seal (irregular blob in the banner's field color with the emblem embossed). */
export function drawSeal(canvas, banner, size = 92) {
  const b = { ...DEFAULT_BANNER, ...(banner || {}) };
  const dpr = Math.min(3, devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2, cy = size / 2, R = size * 0.46;
  const wax = b.field, dark = mix(wax, '#000000', 0.45), light = mix(wax, '#ffffff', 0.35);
  // drips / irregular edge
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = R * (0.93 + 0.07 * Math.sin(a * 5 + 1) + 0.04 * Math.sin(a * 11));
    i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.closePath();
  const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
  g.addColorStop(0, light); g.addColorStop(0.55, wax); g.addColorStop(1, dark);
  c.fillStyle = g;
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = size * 0.08; c.shadowOffsetY = size * 0.04;
  c.fill();
  c.shadowColor = 'transparent';
  // pressed inner ring
  c.lineWidth = size * 0.035;
  c.strokeStyle = dark;
  c.beginPath(); c.arc(cx, cy + 1, R * 0.7, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.25)';
  c.beginPath(); c.arc(cx, cy - 1, R * 0.7, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  // embossed emblem: dark offset + light top
  drawEmblem(c, b.emblem, cx, cy + 1.2, R * 1.08, dark, { shadow: false, outline: 'rgba(0,0,0,0)', outlineWidth: 0 });
  drawEmblem(c, b.emblem, cx, cy, R * 1.08, mix(wax, '#ffffff', 0.18), { shadow: false, outline: mix(wax, '#000000', 0.3), outlineWidth: 5 });
}

function mount(html, cls) {
  const el = document.createElement('div');
  el.className = `g-ov ${cls}`;
  el.innerHTML = html;
  document.body.appendChild(el);
  if (reducedMotion()) el.classList.add('g-reduced');
  return el;
}
async function open(el) {
  void el.offsetWidth;
  el.classList.add('in');
  const r = reducedMotion();
  await sleep(r ? 30 : 420);
  sfx('scroll');
  el.classList.add('unroll');
  await sleep(r ? 30 : 750);
}
async function close(el) {
  sfx('scroll', 0.6);
  el.classList.remove('unroll');
  el.classList.add('out');
  await sleep(reducedMotion() ? 30 : 520);
  el.remove();
}

/** The invitation. Resolves 'yes' or 'no'. */
export async function inviteScroll({ from = {}, to = {}, guildName = 'The Guild' } = {}) {
  const fb = { ...DEFAULT_BANNER, ...(from.banner || {}) };
  const el = mount(`<div class="g-dim"></div>
    <div class="g-scroll" role="dialog" aria-modal="true" aria-label="Guild invitation">
      <div class="g-rod"></div>
      <div class="g-paper"><div class="g-paper-in">
        <div class="g-kicker">Guild Invitation</div>
        <div class="g-ports">
          <div class="g-who"><div class="g-port" style="--ring:${fb.field};--ring2:${fb.accent}">${from.art ? `<img src="${artUrl(from.art)}" alt="">` : ''}</div><span>${esc(from.name)}</span></div>
          <div class="g-to"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="g-who small"><div class="g-port small">${to.art ? `<img src="${artUrl(to.art)}" alt="">` : ''}</div><span>${esc(to.name)}</span></div>
        </div>
        <h2 class="g-guild">${esc(guildName)}</h2>
        <p class="g-text"><b>${esc(from.name)}</b> invites <b>${esc(to.name)}</b> to join <b>${esc(guildName)}</b>.</p>
        <p class="g-perks">Guild members never fight each other, share rerolls and pool their Relics.</p>
        <div class="g-seal-slot"><canvas class="g-seal"></canvas></div>
        <div class="g-btns"><button class="m-btn stone" data-act="no">Decline</button><button class="m-btn gold" data-act="yes">Accept</button></div>
      </div></div>
      <div class="g-rod bottom"></div>
    </div>`, 'g-invite');
  drawSeal(el.querySelector('.g-seal'), fb, 88);
  await open(el);
  el.classList.add('stamp');
  await sleep(reducedMotion() ? 0 : 260);
  sfx('guild'); buzz([20, 30, 40]);
  el.classList.add('stamped');
  return new Promise((resolve) => {
    let done = false;
    const finish = async (v) => {
      if (done) return; done = true;
      sfx(v === 'yes' ? 'tap' : 'back');
      window.removeEventListener('keydown', key);
      el.classList.add(v === 'yes' ? 'accepted' : 'declined');
      await sleep(reducedMotion() ? 0 : 180);
      await close(el);
      resolve(v);
    };
    const key = (e) => { if (e.key === 'Escape') finish('no'); if (e.key === 'Enter') finish('yes'); };
    window.addEventListener('keydown', key);
    onTap(el, '[data-act]', (b) => finish(b.dataset.act));
  });
}

const ADJ = ['Iron', 'Crimson', 'Golden', 'Shadow', 'Ember', 'Silver', 'Storm', 'Wild', 'Bone', 'Dread', 'Gloom', 'Rune', 'Thorn', 'Ash'];
const NOUN = ['Wolves', 'Lions', 'Ravens', 'Fangs', 'Blades', 'Wardens', 'Dragons', 'Crowns', 'Hounds', 'Vipers', 'Owls', 'Oaths', 'Shields', 'Bears'];
export function randomGuildName() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)], n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return Math.random() < 0.7 ? `${a} ${n}` : `The ${a} ${n}`.slice(0, 18);
}

/** Lets the guild leader name the guild. Resolves the chosen name (falls back to the suggestion). */
export async function nameGuild({ leader = {}, banner, suggested } = {}) {
  const fallback = (suggested || randomGuildName()).slice(0, 18);
  const b = { ...DEFAULT_BANNER, ...(banner || {}) };
  const el = mount(`<div class="g-dim"></div>
    <div class="g-scroll" role="dialog" aria-modal="true" aria-label="Name your guild">
      <div class="g-rod"></div>
      <div class="g-paper"><div class="g-paper-in">
        <div class="g-kicker">A Guild Is Founded</div>
        <div class="g-found">
          <div class="g-who"><div class="g-port" style="--ring:${b.field};--ring2:${b.accent}">${leader.art ? `<img src="${artUrl(leader.art)}" alt="">` : ''}</div><span>${esc(leader.name)}</span></div>
          <canvas class="g-flag"></canvas>
        </div>
        <p class="g-text"><b>${esc(leader.name || 'Leader')}</b>, name your guild:</p>
        <div class="g-namerow">
          <input class="m-input g-name" maxlength="18" value="${esc(fallback)}" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Guild name">
          <button class="m-btn stone g-dice" data-act="shuffle" aria-label="Random name"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4.5" fill="currentColor"/><g fill="#2a1a05"><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></g></svg></button>
        </div>
        <div class="g-btns one"><button class="m-btn gold big" data-act="ok">Raise the Banner</button></div>
      </div></div>
      <div class="g-rod bottom"></div>
    </div>`, 'g-name-ov');
  const input = el.querySelector('.g-name');
  const flagBanner = () => ({ ...b, name: input.value.trim() || fallback });
  const anim = animateBanner(el.querySelector('.g-flag'), flagBanner, { w: 96, h: 138, reduced: reducedMotion });
  // keep the scroll above the on-screen keyboard
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    el.style.height = `${vv.height}px`;
    el.style.top = `${vv.offsetTop}px`;
    el.classList.toggle('kb', vv.height < window.innerHeight * 0.8);
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();
  input.addEventListener('focus', () => setTimeout(() => { fit(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300));
  await open(el);
  return new Promise((resolve) => {
    let done = false;
    const finish = async () => {
      if (done) return; done = true;
      input.blur();
      const name = (input.value.trim() || fallback).slice(0, 18);
      sfx('guild'); buzz([20, 30, 40]);
      el.classList.add('accepted');
      await sleep(reducedMotion() ? 0 : 450);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      anim.stop();
      await close(el);
      resolve(name);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } });
    onTap(el, '[data-act]', (btn) => {
      if (btn.dataset.act === 'shuffle') { input.value = randomGuildName(); sfx('tap'); btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
      else finish();
    });
  });
}
