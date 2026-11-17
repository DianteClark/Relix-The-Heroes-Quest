// Relix menus: title, party setup, customize, shop, settings, how to play, card gallery.
//
//   initMenus({ startGame, audio, haptics? })  → takes over #title and #setup, creates the other screens
//   showMenu(id)   id: 'title' | 'setup' | 'customize' | 'shop' | 'settings' | 'howto' | 'gallery'
//   handleBack()   → true if a menu layer was closed (for a native/hardware back button)
//   onTap(root, selector, fn)  robust delegated tap handler (shared with guildui.js)
//
// Touch: taps are recognised from touchstart/touchend with a 14px slop, so a finger that
// drifts while tapping still triggers; the synthetic click is suppressed. Mouse uses click.
// Navigation pushes history entries so the browser / Android back button walks back.

import { HEROES, MONSTERS, BOSSES, TREASURES, TRAPS, MODES, heroDef, sumCounts } from './data.js';
import { heroFront, heroBack, treasureCard, trapCard, monsterCard, bossFront, bossBack, cardBack } from './cards.js';
import { BANNER_COLORS, BANNER_PATTERNS, BANNER_EMBLEMS, DICE_SKINS, THROW_FX, KILL_FX, SEAT_BANNERS, byId } from './cosmetics.js';
import { loadProfile, saveProfile, buy, owns, itemKey, resetProfile } from './profile.js';
import { drawBanner, animateBanner, bannerFontsReady } from './banner.js';

const VERSION = 'v0.2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artUrl = (a) => `assets/chars/${a}.webp`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- environment
let AUDIO = null, HAPTICS = null, START = null;
const sfx = (name) => { try { AUDIO?.sfx?.(name); } catch (e) { /* audio is optional */ } };
let musicNow = null;
const music = (id) => { if (musicNow === id) return; musicNow = id; try { AUDIO?.music?.(id); } catch (e) { /* optional */ } };
function buzz(kind = 'tap') {
  if (!loadProfile().settings.haptics) return;
  try {
    if (HAPTICS?.[kind]) return HAPTICS[kind]();
    navigator.vibrate?.(kind === 'heavy' ? [18, 40, 28] : kind === 'error' ? [30, 50, 30] : 8);
  } catch (e) { /* no haptics */ }
}
const mqReduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reducedMotion = () => loadProfile().settings.reducedMotion || mqReduce.matches;

// ---------------------------------------------------------------- tap handling
const SLOP = 14;
let lastTouchTap = 0;
/**
 * Delegated tap: fn(el, event) runs when an element matching `selector` inside `root` is tapped.
 * Works with finger drift up to SLOP px, never blocks scrolling, adds .is-pressed while held.
 */
export function onTap(root, selector, fn) {
  let st = null;
  const find = (t) => { const el = t && t.closest ? t.closest(selector) : null; return el && root.contains(el) ? el : null; };
  const disabled = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true';
  root.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) { if (st) st.el.classList.remove('is-pressed'); st = null; return; }
    const el = find(e.target);
    if (!el) return;
    const t = e.touches[0];
    st = { el, x: t.clientX, y: t.clientY, time: performance.now(), moved: false };
    if (!disabled(el)) el.classList.add('is-pressed');
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!st) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - st.x, t.clientY - st.y) > SLOP) { st.moved = true; st.el.classList.remove('is-pressed'); }
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!st) return;
    const s = st; st = null;
    s.el.classList.remove('is-pressed');
    const t = e.changedTouches[0];
    if (s.moved || Math.hypot(t.clientX - s.x, t.clientY - s.y) > SLOP || performance.now() - s.time > 1200) return;
    if (e.cancelable) e.preventDefault(); // no delayed synthetic click / ghost taps
    lastTouchTap = performance.now();
    if (disabled(s.el)) return;
    fn(s.el, e);
  }, { passive: false });
  root.addEventListener('touchcancel', () => { if (st) st.el.classList.remove('is-pressed'); st = null; }, { passive: true });
  root.addEventListener('click', (e) => {
    const el = find(e.target);
    if (!el) return;
    if (performance.now() - lastTouchTap < 800) { e.preventDefault(); return; }
    if (disabled(el)) return;
    fn(el, e);
  });
}

// ---------------------------------------------------------------- icons
const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 1 0 0-7.4z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5.2C3 4 4 3 5.2 3c2.6 0 4.6.6 5.8 1.8V21c-1.3-1-3.2-1.5-5.8-1.5C4 19.5 3 18.6 3 17.4zM13 4.8C14.2 3.6 16.2 3 18.8 3 20 3 21 4 21 5.2v12.2c0 1.2-1 2.1-2.2 2.1-2.6 0-4.5.5-5.8 1.5z"/></svg>',
  cards: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="11" height="16" rx="2" transform="rotate(-12 8.5 13)" fill="currentColor" opacity=".55"/><rect x="9" y="3" width="11" height="16" rx="2" transform="rotate(8 14.5 11)" fill="currentColor"/></svg>',
  banner: '<svg viewBox="0 0 24 24"><path d="M3 3.5h18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path fill="currentColor" d="M5.5 5h13v16l-6.5-4.2L5.5 21z"/><path d="M12 8.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#2a1a05" opacity=".55"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9.5h18l-1.6 10.2c-.2 1-1 1.8-2 1.8H6.6c-1 0-1.8-.8-2-1.8z"/><path d="M8 9.5V7a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15" r="2.4" fill="#2a1a05" opacity=".5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="2.8"/><rect x="4.5" y="10" width="15" height="11.5" rx="2.6" fill="currentColor"/><circle cx="12" cy="15.2" r="1.8" fill="#1a1222"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.2c0-1 1.1-1.6 2-1.1l11 7c.8.5.8 1.7 0 2.2l-11 7c-.9.5-2-.1-2-1.1z"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4.5" fill="currentColor"/><g fill="#2a1a05"><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></g></svg>',
  bot: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor"/><path d="M12 3v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="2.8" r="1.8" fill="currentColor"/><circle cx="9" cy="13" r="1.9" fill="#1a1222"/><circle cx="15" cy="13" r="1.9" fill="#1a1222"/></svg>',
  human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5" fill="currentColor"/><path fill="currentColor" d="M3.5 21c.6-4.6 4-7.5 8.5-7.5s7.9 2.9 8.5 7.5z"/></svg>',
  off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M6.5 17.5l11-11" stroke="currentColor" stroke-width="2.6"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.8 0 3.1-1.6 4.2-3.6M21 7h-3.5c-1.8 0-3.1 1.6-4.2 3.6M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const MODE_ICON = {
  standard: '<svg viewBox="0 0 48 48"><path d="M8 36 5 14l11 9 8-15 8 15 11-9-3 22z" fill="#f2c443" stroke="#2a1a05" stroke-width="2.5" stroke-linejoin="round"/><rect x="8" y="35" width="32" height="6" rx="1.5" fill="#d9a21c" stroke="#2a1a05" stroke-width="2.5"/><circle cx="24" cy="27" r="3.4" fill="#c9302c"/></svg>',
  elimination: '<svg viewBox="0 0 48 48"><path d="M24 5C13 5 7 13 7 22c0 6 3 10 8 12v6c0 1.5 1 2.5 2.5 2.5h13c1.5 0 2.5-1 2.5-2.5v-6c5-2 8-6 8-12 0-9-6-17-17-17z" fill="#f4ecdf" stroke="#2a1a05" stroke-width="2.5"/><ellipse cx="17.5" cy="23" rx="4.6" ry="5.2" fill="#2a1a05"/><ellipse cx="30.5" cy="23" rx="4.6" ry="5.2" fill="#2a1a05"/><path d="M24 29l-3 5h6z" fill="#2a1a05"/><path d="M20 37v5M24 37v5M28 37v5" stroke="#2a1a05" stroke-width="2"/></svg>',
  pvr: '<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z" fill="#2f6fd1" stroke="#0e1a33" stroke-width="2.5" stroke-linejoin="round"/><circle cx="17" cy="20" r="4" fill="#f4ecdf"/><circle cx="31" cy="20" r="4" fill="#f4ecdf"/><circle cx="24" cy="17" r="4.6" fill="#f2c443"/><path d="M10 33c2-5 5-7 7-7s4 1 5 3M38 33c-2-5-5-7-7-7s-4 1-5 3M15 36c2-6 5-8 9-8s7 2 9 8" fill="#f4ecdf" stroke="#0e1a33" stroke-width="1.5"/></svg>',
  onestop: '<svg viewBox="0 0 48 48"><path d="M24 42S6 31 6 18c0-6 4.5-10 9.5-10 3.7 0 6.6 2 8.5 5 1.9-3 4.8-5 8.5-5C37.5 8 42 12 42 18c0 13-18 24-18 24z" fill="#e5484d" stroke="#3a0a0d" stroke-width="2.5"/><text x="24" y="30" text-anchor="middle" font-family="Luckiest Guy, sans-serif" font-size="17" fill="#fff">1</text></svg>',
};
const FX_ICON = {
  'throw:none': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="none" stroke="#8a7a9a" stroke-width="4"/><path d="M14 34 34 14" stroke="#8a7a9a" stroke-width="4"/></svg>',
  'throw:dust': '<svg viewBox="0 0 48 48"><circle cx="16" cy="30" r="9" fill="#9c8a70"/><circle cx="29" cy="26" r="11" fill="#bfae92"/><circle cx="36" cy="34" r="7" fill="#8a785e"/><circle cx="22" cy="18" r="6" fill="#d6c8ae"/></svg>',
  'throw:sparks': '<svg viewBox="0 0 48 48"><path d="M24 3l3.5 17.5L45 24l-17.5 3.5L24 45l-3.5-17.5L3 24l17.5-3.5z" fill="#ffe27a"/><path d="M24 12l1.6 10.4L36 24l-10.4 1.6L24 36l-1.6-10.4L12 24l10.4-1.6z" fill="#fff"/><circle cx="39" cy="9" r="2.5" fill="#ffb347"/><circle cx="9" cy="39" r="2" fill="#ffb347"/></svg>',
  'throw:flames': '<svg viewBox="0 0 48 48"><defs><linearGradient id="fxfl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c9302c"/><stop offset=".55" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ffe27a"/></linearGradient></defs><path d="M24 3c3 9 14 14 14 27a14 14 0 0 1-28 0c0-7 3-11 7-14 0 5 2 9 6 10-1-9 0-16 1-23z" fill="url(#fxfl)"/><path d="M24 22c2 5 7 8 7 13a7 7 0 0 1-14 0c0-4 2-6 4-8 0 3 1 4 3 5 0-4 0-7 0-10z" fill="#fff4b0"/></svg>',
  'throw:frost': '<svg viewBox="0 0 48 48"><g stroke="#bfe6ff" stroke-width="3.4" stroke-linecap="round"><path d="M24 4v40M6.7 14l34.6 20M6.7 34l34.6-20"/><path d="M24 11l-5-4M24 11l5-4M24 37l-5 4M24 37l5 4M12 17.5l-6 1M12 17.5l-2-6M36 30.5l6-1M36 30.5l2 6M12 30.5l-6-1M12 30.5l-2 6M36 17.5l6 1M36 17.5l2-6" stroke-width="2.4"/></g><circle cx="24" cy="24" r="4" fill="#fff"/></svg>',
  'throw:stars': '<svg viewBox="0 0 48 48"><path d="M22 6l4.6 9.6 10.4 1.5-7.5 7.3 1.8 10.4L22 29.9l-9.3 4.9 1.8-10.4L7 17.1l10.4-1.5z" fill="#f2c443" stroke="#8a5a0a" stroke-width="1.6" stroke-linejoin="round"/><path d="M38 30l1.6 3.4 3.7.5-2.7 2.6.6 3.7L38 38.4l-3.2 1.8.6-3.7-2.7-2.6 3.7-.5z" fill="#fff"/><circle cx="10" cy="40" r="2" fill="#fff"/></svg>',
  'kill:none': '<svg viewBox="0 0 48 48"><path d="M36 4l8 0 0 8L20 36l-8-8z" fill="#e8e4f0" stroke="#3a3048" stroke-width="2"/><path d="M10 26l12 12-4 4-3-3-6 6-3-3 6-6-3-3z" fill="#f2c443" stroke="#3a3048" stroke-width="2"/></svg>',
  'kill:shatter': '<svg viewBox="0 0 48 48"><path d="M8 10l14-4 2 14-12 6z" fill="#bfe6ff"/><path d="M26 5l15 6-6 12-9-3z" fill="#e8f6ff"/><path d="M10 30l13-6 3 18-14 1z" fill="#8fc8f0"/><path d="M29 25l12 2-2 15-11-4z" fill="#d4eeff"/></svg>',
  'kill:soulburst': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="#a97bff" stroke-width="2.5" opacity=".6"/><path d="M13 42V22a11 11 0 0 1 22 0v20l-4.4-3.3-3.3 3.3-3.3-3.3-3.3 3.3-3.3-3.3z" fill="#c9a8ff"/><ellipse cx="20" cy="22" rx="2.6" ry="3.6" fill="#2a1a66"/><ellipse cx="28" cy="22" rx="2.6" ry="3.6" fill="#2a1a66"/></svg>',
  'kill:lightning': '<svg viewBox="0 0 48 48"><path d="M28 2L9 27h12l-4 19L39 18H27z" fill="#ffe27a" stroke="#8a5a0a" stroke-width="2" stroke-linejoin="round"/></svg>',
  'kill:confetti': '<svg viewBox="0 0 48 48"><rect x="8" y="8" width="7" height="12" rx="1.5" transform="rotate(-25 11 14)" fill="#e5484d"/><rect x="30" y="6" width="7" height="12" rx="1.5" transform="rotate(30 33 12)" fill="#3fa34d"/><rect x="18" y="26" width="7" height="12" rx="1.5" transform="rotate(15 21 32)" fill="#2f6fd1"/><rect x="34" y="28" width="7" height="12" rx="1.5" transform="rotate(-40 37 34)" fill="#f2c443"/><circle cx="24" cy="15" r="3" fill="#a8327e"/><circle cx="9" cy="36" r="3" fill="#1f8a8a"/></svg>',
};

const coinHTML = (n, cls = '') => `<span class="m-coin ${cls}"><i class="m-coin-ic"></i><b>${n}</b></span>`;
const coinsPill = () => `<button class="m-coins" data-act="go" data-to="shop" aria-label="Coins">${coinHTML(loadProfile().coins)}</button>`;
function refreshCoins(animate = false) {
  const n = loadProfile().coins;
  $$('.m-coins b, .m-coin-live').forEach((b) => {
    const from = +b.textContent || 0;
    if (!animate || from === n || reducedMotion()) { b.textContent = n; return; }
    const t0 = performance.now(), dur = 700;
    const step = (now) => { const k = Math.min(1, (now - t0) / dur); b.textContent = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const pill = b.closest('.m-coins');
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  });
}

// ---------------------------------------------------------------- CSS dice
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function dieHTML(skinId, cls = '') {
  const s = byId(DICE_SKINS, skinId);
  const face = (n) => `<div class="f f${n}">${Array.from({ length: 9 }, (_, i) => (PIPS[n].includes(i) ? '<i></i>' : '<span></span>')).join('')}</div>`;
  return `<div class="m-die fin-${s.finish} ${cls}" style="--body:${s.body};--pip:${s.pip};--edge:${s.edge}"><div class="cube">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div>`;
}

// ---------------------------------------------------------------- navigation
const SCREENS = { title: 'title', setup: 'setup', customize: 'm-customize', shop: 'm-shop', settings: 'm-settings', howto: 'm-howto', gallery: 'm-gallery' };
const ON_SHOW = {};
let current = null;
const layers = []; // {kind:'screen', from} | {kind:'overlay', close}
const popWaiters = [];
let popSeq = 0;
const elOf = (id) => document.getElementById(SCREENS[id] || id);
const menusVisible = () => !!current && !!elOf(current)?.classList.contains('active');

function setScreen(id, dir = 0) {
  const el = elOf(id);
  if (!el) return;
  $$('.screen').forEach((s) => s.classList.toggle('active', s === el));
  el.classList.remove('m-in-fwd', 'm-in-back');
  if (dir && !reducedMotion()) { void el.offsetWidth; el.classList.add(dir > 0 ? 'm-in-fwd' : 'm-in-back'); }
  current = id;
  ON_SHOW[id]?.();
  music(id === 'title' ? 'title' : 'menu');
}
function pushLayer(layer) {
  layers.push(layer);
  try { history.pushState({ relixMenu: layers.length }, ''); } catch (e) { /* sandboxed */ }
}
function unwindTo(depth) {
  popSeq++;
  while (layers.length > depth) {
    const l = layers.pop();
    if (l.kind === 'overlay') l.close(); else setScreen(l.from, -1);
  }
  while (popWaiters.length) popWaiters.shift()();
}
/** Go back one layer (overlay or screen). Resolves once it has happened. */
function goBack() {
  return new Promise((res) => {
    if (!layers.length) {
      if (current && current !== 'title') setScreen('title', -1);
      res(); return;
    }
    popWaiters.push(res);
    const n = layers.length, seq = popSeq;
    try { history.back(); } catch (e) { /* ignore */ }
    // Safety net: if popstate never comes (embedded webviews), unwind ourselves.
    setTimeout(() => { if (popSeq === seq && layers.length === n) unwindTo(n - 1); }, 450);
  });
}
function navTo(id) {
  if (id === current) return;
  pushLayer({ kind: 'screen', from: current });
  setScreen(id, 1);
}
window.addEventListener('popstate', (e) => {
  if (!menusVisible() && !layers.some((l) => l.kind === 'overlay')) return; // in-game: not ours
  const depth = (e.state && e.state.relixMenu) || 0;
  if (depth < layers.length) unwindTo(depth);
});

/** Shows a menu screen (resets menu history). Used by the lead after a game ends. */
export function showMenu(id = 'title') {
  if (!SCREENS[id]) id = 'title';
  closeAllOverlays();
  layers.length = 0;
  try { history.replaceState({ relixMenu: 0 }, ''); } catch (e) { /* ignore */ }
  setScreen(id, 0);
  if (id !== 'title') { // let Back return to the title
    layers.push({ kind: 'screen', from: 'title' });
    try { history.pushState({ relixMenu: 1 }, ''); } catch (e) { /* ignore */ }
  }
}
/** For a native back button: returns true if the menus handled it. */
export function handleBack() {
  if (!menusVisible() && !layers.some((l) => l.kind === 'overlay')) return false;
  if (!layers.length && current === 'title') return false;
  goBack();
  return true;
}

// ---------------------------------------------------------------- overlays
let ovRoot = null;
const openOverlays = new Set();
function overlay(cls, html, { onClose, dismissable = true } = {}) {
  const el = document.createElement('div');
  el.className = `m-ov ${cls}`;
  el.innerHTML = html;
  ovRoot.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openOverlays.delete(close);
    el.classList.add('closing');
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 220);
    onClose?.();
  };
  openOverlays.add(close);
  pushLayer({ kind: 'overlay', close });
  if (dismissable) el.addEventListener('click', (e) => { if (e.target === el) goBack(); });
  requestAnimationFrame(() => el.classList.add('open'));
  return { el, close: () => goBack() };
}
function closeAllOverlays() { [...openOverlays].forEach((c) => c()); }

function confirmDialog({ title, html = '', ok = 'OK', cancel = 'Cancel', okCls = 'gold', icon = '' }) {
  return new Promise((resolve) => {
    let result = false;
    const { el } = overlay('m-dialog', `<div class="m-dlg">${icon ? `<div class="m-dlg-ic">${icon}</div>` : ''}<h2>${esc(title)}</h2><div class="m-dlg-body">${html}</div>
      <div class="m-dlg-btns">${cancel ? `<button class="m-btn stone" data-act="dlg-no">${esc(cancel)}</button>` : ''}<button class="m-btn ${okCls}" data-act="dlg-yes">${ok}</button></div></div>`,
    { onClose: () => resolve(result) });
    onTap(el, '[data-act]', (b) => { sfx(b.dataset.act === 'dlg-yes' ? 'tap' : 'back'); result = b.dataset.act === 'dlg-yes'; goBack(); });
  });
}

let toastTimer = 0;
function toast(msg, kind = '') {
  let t = $('.m-toast', ovRoot);
  if (!t) { t = document.createElement('div'); t.className = 'm-toast'; ovRoot.appendChild(t); }
  t.className = `m-toast show ${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function shake(el) { if (!el) return; el.classList.remove('m-shake'); void el.offsetWidth; el.classList.add('m-shake'); }

// ---------------------------------------------------------------- screen scaffolding
function screenShell(id, title, { coins = true, foot = '', cls = '' } = {}) {
  return `<section class="screen m-screen ${cls}" id="${id}">
    <div class="m-bg"></div>
    <header class="m-head">
      <button class="m-back" data-act="back" aria-label="Back">${I.back}</button>
      <h1>${title}</h1>
      ${coins ? coinsPill() : '<span class="m-head-sp"></span>'}
    </header>
    <div class="m-body"></div>
    ${foot ? `<footer class="m-foot">${foot}</footer>` : ''}
  </section>`;
}

// ================================================================= TITLE
const LINEUP = [
  { id: 'shi', x: 13, row: 'back', h: 0.5 },
  { id: 'josue', x: 87, row: 'back', h: 0.5 },
  { id: 'nowtna', x: 50, row: 'back', h: 0.46 },
  { id: 'yessi', x: 25, row: 'front', h: 0.62 },
  { id: 'chan_kong', x: 75, row: 'front', h: 0.64 },
  { id: 'luke', x: 50, row: 'front', h: 0.72, hero: true },
];
const T = { raf: 0, emb: [], sprite: null, px: 0, py: 0, tx: 0, ty: 0, last: 0, cv: null, ctx: null, w: 0, h: 0, intro: false };

function buildTitle(el) {
  el.className = 'screen m-screen m-title' + (el.classList.contains('active') ? ' active' : '');
  el.innerHTML = `
    <div class="t-sky"></div>
    <div class="t-layer t-dragon" data-depth="0.012"></div>
    <div class="t-layer t-rays" data-depth="0.02"></div>
    <div class="t-fog t-fog1"></div>
    <canvas class="t-embers"></canvas>
    <div class="t-top">
      <button class="t-me" data-act="go" data-to="customize" aria-label="Customize banner"><canvas class="t-me-banner"></canvas><span><small>Your banner</small><b class="t-me-name"></b></span></button>
      ${coinsPill()}
    </div>
    <div class="t-logo-wrap t-layer" data-depth="-0.01">
      <h1 class="t-logo" aria-label="Relix"><span class="t-logo-back" aria-hidden="true">RELIX</span><span class="t-logo-face">RELIX</span><span class="t-logo-shine" aria-hidden="true">RELIX</span></h1>
      <div class="t-sub"><span>The Heroes' Quest</span></div>
    </div>
    <div class="t-stage">
      <div class="t-glow"></div>
      ${LINEUP.map((h, i) => `<div class="t-hero t-${h.row} ${h.hero ? 'lead' : ''} t-layer" data-depth="${h.row === 'front' ? 0.035 : 0.018}" style="--x:${h.x}%;--h:${h.h};--i:${i}">
        <button class="t-hero-btn" data-act="poke" aria-label="${esc(heroDef(h.id).name)}"><img src="${artUrl(heroDef(h.id).art)}" alt="" draggable="false"></button></div>`).join('')}
      <div class="t-fog t-fog2"></div>
    </div>
    <nav class="t-menu">
      <button class="m-btn gold t-play" data-act="go" data-to="setup"><span class="t-play-ic">${I.play}</span><span>Play</span></button>
      <div class="t-row2">
        <button class="m-btn stone t-btn2" data-act="go" data-to="customize"><i>${I.banner}</i><span>Customize</span></button>
        <button class="m-btn stone t-btn2" data-act="go" data-to="shop"><i>${I.shop}</i><span>Shop</span></button>
      </div>
      <div class="t-row3">
        <button class="t-tile" data-act="go" data-to="howto"><i>${I.book}</i><span>How to Play</span></button>
        <button class="t-tile" data-act="go" data-to="gallery"><i>${I.cards}</i><span>Cards</span></button>
        <button class="t-tile" data-act="go" data-to="settings"><i>${I.gear}</i><span>Settings</span></button>
      </div>
    </nav>
    <small class="t-ver">${VERSION}</small>`;
  T.cv = $('.t-embers', el);
  T.ctx = T.cv.getContext('2d');
  const sp = document.createElement('canvas');
  sp.width = sp.height = 32;
  const g = sp.getContext('2d'), rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,240,190,1)'); rg.addColorStop(0.25, 'rgba(255,170,60,.85)'); rg.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  T.sprite = sp;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    T.tx = (e.clientX / innerWidth) * 2 - 1; T.ty = (e.clientY / innerHeight) * 2 - 1;
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    T.tx = clamp(e.gamma / 30, -1, 1); T.ty = clamp((e.beta - 45) / 30, -1, 1);
  });
  ON_SHOW.title = () => {
    const p = loadProfile();
    $('.t-me-name', el).textContent = p.name || p.banner.name || 'Hero';
    drawBanner($('.t-me-banner', el), p.banner, { w: 34, h: 46 });
    refreshCoins();
    if (!T.intro) { T.intro = true; el.classList.add('t-intro'); setTimeout(() => el.classList.remove('t-intro'), 2600); }
    startTitleLoop();
  };
}

function resizeEmbers() {
  const r = Math.min(2, devicePixelRatio || 1);
  T.w = T.cv.clientWidth; T.h = T.cv.clientHeight;
  T.cv.width = Math.round(T.w * r); T.cv.height = Math.round(T.h * r);
  T.ctx.setTransform(r, 0, 0, r, 0, 0);
}
function startTitleLoop() { if (!T.raf) { T.last = performance.now(); T.raf = requestAnimationFrame(titleLoop); } }
function titleLoop(now) {
  T.raf = 0;
  const el = elOf('title');
  if (!el || !el.classList.contains('active') || document.hidden) return;
  const dt = Math.min(0.05, (now - T.last) / 1000);
  T.last = now;
  if (T.cv.clientWidth !== T.w || T.cv.clientHeight !== T.h) resizeEmbers();
  const red = reducedMotion();
  // parallax
  const t = now / 1000;
  const ax = T.tx + (red ? 0 : Math.sin(t * 0.35) * 0.35), ay = T.ty + (red ? 0 : Math.cos(t * 0.27) * 0.25);
  T.px += (ax - T.px) * Math.min(1, dt * 3); T.py += (ay - T.py) * Math.min(1, dt * 3);
  const W = innerWidth, H = innerHeight;
  for (const l of el.querySelectorAll('.t-layer')) {
    const d = +l.dataset.depth || 0;
    l.style.setProperty('--px', `${(T.px * d * W).toFixed(1)}px`);
    l.style.setProperty('--py', `${(T.py * d * H * 0.5).toFixed(1)}px`);
  }
  // embers
  const c = T.ctx, max = red ? 14 : 46;
  if (T.emb.length < max && Math.random() < (red ? 0.1 : 0.5)) {
    T.emb.push({ x: Math.random() * T.w, y: T.h + 10, vx: (Math.random() - 0.5) * 12, vy: -(18 + Math.random() * 42), life: 0, max: 4 + Math.random() * 5, s: 3 + Math.random() * 7, ph: Math.random() * 6 });
  }
  c.clearRect(0, 0, T.w, T.h);
  c.globalCompositeOperation = 'lighter';
  for (let i = T.emb.length - 1; i >= 0; i--) {
    const p = T.emb[i];
    p.life += dt;
    p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 14) * dt;
    p.y += p.vy * dt;
    if (p.life > p.max || p.y < -20) { T.emb.splice(i, 1); continue; }
    const k = p.life / p.max;
    c.globalAlpha = Math.min(1, k * 5) * (1 - k) * (0.6 + 0.4 * Math.sin(t * 9 + p.ph));
    const s = p.s * (1 - k * 0.5);
    c.drawImage(T.sprite, p.x - s, p.y - s, s * 2, s * 2);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  T.raf = requestAnimationFrame(titleLoop);
}

// ================================================================= SETUP
const SETUP_KEY = 'relix.setup.v1';
const SEAT_TYPES = [['human', 'Human', I.human], ['bot', 'Bot', I.bot], ['off', 'Off', I.off]];
const setup = (() => {
  const d = { mode: 'standard', seats: [{ type: 'human', hero: 'random', name: '' }, { type: 'bot', hero: 'random', name: '' }, { type: 'bot', hero: 'random', name: '' }, { type: 'bot', hero: 'random', name: '' }, { type: 'off', hero: 'random', name: '' }, { type: 'off', hero: 'random', name: '' }] };
  try {
    const s = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null');
    if (s && MODES.some((m) => m.id === s.mode) && Array.isArray(s.seats) && s.seats.length === 6) {
      d.mode = s.mode;
      d.seats = s.seats.map((x) => ({ type: ['human', 'bot', 'off'].includes(x.type) ? x.type : 'off', hero: x.hero === 'random' || heroDef(x.hero) ? x.hero : 'random', name: String(x.name || '').slice(0, 16) }));
    }
  } catch (e) { /* defaults */ }
  return d;
})();
const saveSetup = () => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) { /* ignore */ } };
const seatBanner = (i) => (i === 0 && setup.seats[0].type === 'human' ? loadProfile().banner : SEAT_BANNERS[i % SEAT_BANNERS.length]);
const SPEEDS = [[1, 'Relaxed'], [0.5, 'Fast'], [0.15, 'Turbo']];
const speedSeg = (act) => {
  const sp = loadProfile().settings.speed;
  const near = SPEEDS.reduce((a, b) => (Math.abs(b[0] - sp) < Math.abs(a[0] - sp) ? b : a))[0];
  return `<div class="m-seg">${SPEEDS.map(([v, l]) => `<button class="${v === near ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
};

function buildSetup(el) {
  el.className = 'screen m-screen m-setup' + (el.classList.contains('active') ? ' active' : '');
  el.innerHTML = `<div class="m-bg"></div>
    <header class="m-head"><button class="m-back" data-act="back" aria-label="Back">${I.back}</button><h1>Gather Your Party</h1><span class="m-head-sp"></span></header>
    <div class="m-body">
      <div class="m-wrap">
        <h3 class="m-h">Game Mode</h3>
        <div class="su-modes"></div>
        <div class="su-mode-desc"></div>
        <h3 class="m-h">Party <small class="su-count"></small></h3>
        <div class="su-seats"></div>
        <h3 class="m-h">Bot Speed</h3>
        <div class="su-speed"></div>
      </div>
    </div>
    <footer class="m-foot"><button class="m-btn gold big su-begin" data-act="begin"><span>Begin the Quest</span><small class="su-sum"></small></button></footer>`;
  ON_SHOW.setup = renderSetup;
  el.addEventListener('input', (e) => {
    const i = e.target.dataset.name;
    if (i != null) { setup.seats[+i].name = e.target.value.slice(0, 16); saveSetup(); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
}

function renderSetup() {
  const el = elOf('setup');
  const mode = MODES.find((m) => m.id === setup.mode) || MODES[0];
  $('.su-modes', el).innerHTML = MODES.map((m) => `<button class="su-mode ${m.id === setup.mode ? 'on' : ''}" data-act="mode" data-id="${m.id}"><i>${MODE_ICON[m.id] || ''}</i><b>${esc(m.name)}</b></button>`).join('');
  $('.su-mode-desc', el).innerHTML = `<i>${MODE_ICON[mode.id] || ''}</i><div><b>${esc(mode.name)}</b><p>${esc(mode.text)}</p></div>`;
  renderSeats();
  $('.su-speed', el).innerHTML = speedSeg('speed');
}
function renderSeats() {
  const el = elOf('setup');
  const p = loadProfile();
  $('.su-seats', el).innerHTML = setup.seats.map((s, i) => {
    const h = s.hero !== 'random' ? heroDef(s.hero) : null;
    const ph = i === 0 && s.type === 'human' && p.name ? p.name : h ? h.short || h.name : `Player ${i + 1}`;
    return `<div class="su-seat ${s.type}" data-seat="${i}">
      <button class="su-port" data-act="pick" data-i="${i}" aria-label="Choose hero for seat ${i + 1}">
        ${h ? `<img src="${artUrl(h.art)}" alt="" draggable="false">` : `<span class="su-rand">${I.dice}</span>`}
        <canvas class="su-flag"></canvas>
        <em>${h ? esc(h.short || h.name) : 'Random'}</em>
      </button>
      <div class="su-mid">
        <div class="su-line"><span class="su-num">Seat ${i + 1}</span><span class="su-role">${h ? esc(h.role) : 'Any hero'}</span></div>
        <input class="m-input" data-name="${i}" value="${esc(s.name)}" placeholder="${esc(ph)}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" ${s.type === 'off' ? 'disabled' : ''}>
        <div class="m-seg su-type">${SEAT_TYPES.map(([t, l, ic]) => `<button class="${s.type === t ? 'on' : ''}" data-act="seat-type" data-i="${i}" data-t="${t}">${ic}<span>${l}</span></button>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
  $$('.su-flag', el).forEach((c, i) => drawBanner(c, seatBanner(i), { w: 26, h: 36 }));
  const act = setup.seats.filter((s) => s.type !== 'off');
  const humans = act.filter((s) => s.type === 'human').length;
  $('.su-count', el).textContent = `${act.length} / 6`;
  const mode = MODES.find((m) => m.id === setup.mode) || MODES[0];
  $('.su-sum', el).textContent = act.length ? `${act.length} hero${act.length > 1 ? 'es' : ''} · ${humans} human${humans === 1 ? '' : 's'} · ${mode.name}` : 'Add at least one hero';
  $('.su-begin', el).setAttribute('aria-disabled', act.length ? 'false' : 'true');
}
function setSeatType(i, t) {
  const s = setup.seats[i];
  s.type = t;
  if (t !== 'off' && s.hero !== 'random' && setup.seats.some((o, j) => j !== i && o.type !== 'off' && o.hero === s.hero)) s.hero = 'random';
  saveSetup();
  renderSeats();
}

function heroPicker(i) {
  const takenBy = (id) => setup.seats.findIndex((s, j) => j !== i && s.type !== 'off' && s.hero === id);
  let focus = setup.seats[i].hero;
  const { el } = overlay('m-sheet m-picker', `
    <div class="m-sheet-in">
      <header class="m-ov-head"><h2>Choose Your Hero</h2><button class="m-x" data-act="x" aria-label="Close">${I.close}</button></header>
      <div class="pk-strip">${['random', ...HEROES.map((h) => h.id)].map((id) => {
        const h = id === 'random' ? null : heroDef(id), tb = h ? takenBy(id) : -1;
        return `<button class="pk-chip ${tb >= 0 ? 'taken' : ''}" data-act="focus" data-id="${id}">${h ? `<img src="${artUrl(h.art)}" alt="" draggable="false">` : `<span class="su-rand">${I.dice}</span>`}<b>${h ? esc(h.short || h.name) : 'Random'}</b>${tb >= 0 ? `<small>Seat ${tb + 1}</small>` : ''}</button>`;
      }).join('')}</div>
      <div class="pk-main"><div class="pk-title"></div><div class="pk-cards"></div></div>
      <footer class="m-ov-foot"><button class="m-btn gold big pk-choose" data-act="choose"></button></footer>
    </div>`);
  const render = () => {
    const h = focus === 'random' ? null : heroDef(focus), tb = h ? takenBy(focus) : -1;
    $$('.pk-chip', el).forEach((c) => c.classList.toggle('on', c.dataset.id === focus));
    $('.pk-title', el).innerHTML = h ? `<b>${esc(h.name)}</b><span>${esc(h.role)}</span>` : '<b>Random Hero</b><span>Fate decides</span>';
    $('.pk-cards', el).innerHTML = h ? `<div class="pk-card">${heroFront(h.id)}</div><div class="pk-card">${heroBack(h.id)}</div>` : `<div class="pk-card">${cardBack('Hero')}</div>`;
    const b = $('.pk-choose', el);
    b.innerHTML = tb >= 0 ? `Taken by Seat ${tb + 1}` : `Choose ${h ? esc(h.short || h.name) : 'Random'}`;
    b.setAttribute('aria-disabled', tb >= 0 ? 'true' : 'false');
    const chip = $('.pk-chip.on', el);
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  render();
  onTap(el, '[data-act]', (b) => {
    const a = b.dataset.act;
    if (a === 'x') { sfx('back'); goBack(); }
    else if (a === 'focus') { focus = b.dataset.id; sfx('card_flip'); buzz(); render(); }
    else if (a === 'choose') {
      setup.seats[i].hero = focus;
      if (setup.seats[i].type === 'off') setup.seats[i].type = 'human';
      saveSetup(); sfx('tap'); buzz();
      goBack().then(renderSeats);
    }
  });
}

async function beginQuest() {
  const act = setup.seats.map((s, i) => ({ ...s, i })).filter((s) => s.type !== 'off');
  if (!act.length) { sfx('error'); buzz('error'); shake($('.su-seats', elOf('setup'))); toast('Add at least one hero'); return; }
  const used = new Set(act.map((s) => s.hero).filter((h) => h !== 'random'));
  const pool = HEROES.map((h) => h.id).filter((h) => !used.has(h)).sort(() => Math.random() - 0.5);
  const p = loadProfile();
  const players = act.map((s) => {
    const hero = s.hero === 'random' ? pool.pop() : s.hero;
    const def = heroDef(hero);
    const fallback = s.i === 0 && s.type === 'human' && p.name ? p.name : def.short || def.name;
    return { hero, bot: s.type === 'bot', name: s.name.trim() || fallback, banner: { ...seatBanner(s.i) } };
  });
  const config = { mode: setup.mode, speed: p.settings.speed, players };
  sfx('open'); buzz('heavy');
  const btn = $('.su-begin', elOf('setup'));
  btn.classList.add('launch');
  await sleep(reducedMotion() ? 0 : 260);
  btn.classList.remove('launch');
  closeAllOverlays();
  layers.length = 0;
  current = null; // menus are no longer in charge
  if (START) START(config);
}

// ================================================================= FX preview stage (throw + kill)
class FxStage {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mode = 'throw'; this.fx = 'dust'; this.skin = 'bone';
    this.parts = []; this.raf = 0; this.visible = false; this.t0 = performance.now();
    this.img = new Image(); this.img.src = artUrl('skeleton_warrior');
    this.tints = {};
    this.io = new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; this.kick(); });
    this.io.observe(canvas);
    document.addEventListener('visibilitychange', () => this.kick());
  }
  set(o) { Object.assign(this, o); this.parts = []; this.t0 = performance.now(); this.phase = -1; this.kick(); }
  kick() { if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame((t) => this.frame(t)); }
  size() {
    const r = Math.min(2, devicePixelRatio || 1), w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * r) || this.cv.height !== Math.round(h * r)) { this.cv.width = Math.round(w * r); this.cv.height = Math.round(h * r); }
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
    this.w = w; this.h = h;
  }
  tint(color) {
    if (this.tints[color]) return this.tints[color];
    if (!this.img.complete || !this.img.naturalWidth) return null;
    const c = document.createElement('canvas'); c.width = this.img.naturalWidth; c.height = this.img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(this.img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return (this.tints[color] = c);
  }
  emit(n, f) { for (let i = 0; i < n; i++) this.parts.push(f(i)); }
  frame(now) {
    this.raf = 0;
    if (!this.visible || document.hidden) return;
    this.size();
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
    const red = reducedMotion();
    const T = this.mode === 'throw' ? 2.6 : 3.2;
    const t = (((now - this.t0) / 1000) * (red ? 0.6 : 1)) % T;
    if (t < (this.lastT ?? 0)) { this.phase = -1; this.parts = this.parts.filter((p) => p.keep); }
    this.lastT = t;
    if (this.mode === 'throw') this.drawThrow(c, t, dt); else this.drawKill(c, t, dt);
    this.drawParts(c, dt);
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }
  // ---- throw
  drawThrow(c, t, dt) {
    const { w, h } = this, fx = this.fx, skin = byId(DICE_SKINS, this.skin);
    const fly = 1.0, x0 = w * 0.1, y0 = h * 0.9, x1 = w * 0.56, y1 = h * 0.66;
    let x, y, rot, face;
    // floor shadow line
    const fl = c.createRadialGradient(w * 0.56, y1 + 26, 4, w * 0.56, y1 + 26, w * 0.4);
    fl.addColorStop(0, 'rgba(255,220,150,.10)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fl; c.fillRect(0, 0, w, h);
    if (t < fly) {
      const k = t / fly;
      x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * h * 0.5;
      rot = k * 9; face = 1 + (Math.floor(k * 14) % 6);
      this.trail(fx, x, y, dt);
    } else {
      const k = Math.min(1, (t - fly) / 0.5);
      const bounce = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 22;
      x = x1 + k * w * 0.06; y = y1 - bounce; rot = 9 + k * 1.2 * (1 - k); face = 6;
      if (this.phase < 1) { this.phase = 1; this.burst(fx, x1, y1 + 20); }
    }
    // shadow
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(x, y1 + 26, 22, 6, 0, 0, Math.PI * 2); c.fill();
    this.drawDie2d(c, x, y, 40, rot, face, skin);
  }
  drawDie2d(c, x, y, s, rot, face, skin) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const r = s * 0.2, hs = s / 2;
    c.beginPath(); c.roundRect ? c.roundRect(-hs, -hs, s, s, r) : c.rect(-hs, -hs, s, s);
    const g = c.createLinearGradient(-hs, -hs, hs, hs);
    g.addColorStop(0, mixHex(skin.body, '#ffffff', skin.finish === 'matte' ? 0.15 : 0.4)); g.addColorStop(0.5, skin.body); g.addColorStop(1, mixHex(skin.body, '#000000', 0.3));
    c.fillStyle = g;
    if (skin.finish === 'glow') { c.shadowColor = skin.edge; c.shadowBlur = 18; }
    c.fill(); c.shadowBlur = 0;
    c.lineWidth = 3; c.strokeStyle = skin.edge; c.stroke();
    c.fillStyle = skin.pip;
    for (const i of PIPS[face]) { const px = ((i % 3) - 1) * s * 0.27, py = (Math.floor(i / 3) - 1) * s * 0.27; c.beginPath(); c.arc(px, py, s * 0.085, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  trail(fx, x, y, dt) {
    const R = Math.random;
    if (fx === 'dust' && R() < 0.6) this.parts.push({ k: 'puff', x, y, vx: (R() - 0.5) * 20, vy: (R() - 0.5) * 20, s: 6 + R() * 6, g: 26, life: 0, max: 0.8, c: '#b8a68a' });
    if (fx === 'sparks') this.emit(2, () => ({ k: 'spark', x, y, vx: (R() - 0.5) * 160, vy: (R() - 0.5) * 160 + 40, ay: 300, life: 0, max: 0.45 + R() * 0.3, c: R() < 0.5 ? '#fff6c0' : '#ffb347' }));
    if (fx === 'flames') this.emit(2, () => ({ k: 'flame', x: x + (R() - 0.5) * 14, y: y + (R() - 0.5) * 14, vx: (R() - 0.5) * 30, vy: -40 - R() * 40, s: 12 + R() * 8, g: -14, life: 0, max: 0.55 }));
    if (fx === 'frost') { if (R() < 0.7) this.parts.push({ k: 'flake', x, y, vx: (R() - 0.5) * 50, vy: 20 + R() * 30, s: 4 + R() * 4, rot: R() * 6, vr: (R() - 0.5) * 6, life: 0, max: 0.9 }); if (R() < 0.4) this.parts.push({ k: 'puff', x, y, vx: 0, vy: 0, s: 8, g: 22, life: 0, max: 0.7, c: '#cfefff' }); }
    if (fx === 'stars' && R() < 0.8) this.parts.push({ k: 'star', x: x + (R() - 0.5) * 16, y: y + (R() - 0.5) * 16, vx: (R() - 0.5) * 40, vy: (R() - 0.5) * 40 + 20, s: 4 + R() * 6, rot: R() * 6, vr: (R() - 0.5) * 8, life: 0, max: 0.9, c: R() < 0.6 ? '#f2c443' : '#ffffff' });
  }
  burst(fx, x, y) {
    const R = Math.random, ring = (c, s = 1) => this.parts.push({ k: 'ring', x, y, s: 6, g: 160 * s, life: 0, max: 0.5, c });
    if (fx === 'dust') { this.emit(12, (i) => { const a = (i / 12) * Math.PI * 2; return { k: 'puff', x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 18 - 10, s: 8 + R() * 6, g: 30, life: 0, max: 0.9, c: '#a8977c' }; }); }
    if (fx === 'sparks') { ring('#ffe27a'); this.emit(26, () => { const a = R() * Math.PI * 2, v = 120 + R() * 200; return { k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, ay: 420, life: 0, max: 0.5 + R() * 0.4, c: R() < 0.5 ? '#fff6c0' : '#ffb347' }; }); }
    if (fx === 'flames') { ring('#ff8a2a', 1.2); this.emit(22, () => { const a = R() * Math.PI * 2; return { k: 'flame', x: x + Math.cos(a) * 10, y, vx: Math.cos(a) * 80, vy: -60 - R() * 120, s: 16 + R() * 12, g: -16, life: 0, max: 0.8 }; }); }
    if (fx === 'frost') { ring('#bfe6ff', 1.2); this.emit(14, (i) => { const a = (i / 14) * Math.PI * 2; return { k: 'shardf', x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 60 - 40, ay: 200, s: 7 + R() * 5, rot: a, vr: (R() - 0.5) * 8, life: 0, max: 0.8 }; }); this.emit(6, () => ({ k: 'puff', x, y, vx: (R() - 0.5) * 60, vy: -R() * 20, s: 12, g: 30, life: 0, max: 1, c: '#e6f7ff' })); }
    if (fx === 'stars') { ring('#f2c443', 1.4); this.emit(18, () => { const a = R() * Math.PI * 2, v = 80 + R() * 160; return { k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, ay: 120, s: 5 + R() * 8, rot: R() * 6, vr: (R() - 0.5) * 10, life: 0, max: 1, c: R() < 0.6 ? '#f2c443' : '#ffffff' }; }); }
  }
  // ---- kill
  drawKill(c, t, dt) {
    const { w, h } = this, fx = this.fx, img = this.img;
    if (!img.complete || !img.naturalWidth) return;
    const mh = h * 0.78, mw = mh * (img.naturalWidth / img.naturalHeight), mx = w / 2 - mw / 2, my = h * 0.94 - mh;
    const cx = w / 2, cy = my + mh * 0.5;
    const hitT = 0.7, end = 2.5;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, h * 0.94, mw * 0.36, 8, 0, 0, Math.PI * 2); c.fill();
    if (t < hitT) { // idle + respawn fade-in
      c.globalAlpha = Math.min(1, t / 0.3);
      c.drawImage(img, mx, my + Math.sin(t * 6) * 2, mw, mh);
      c.globalAlpha = 1;
      return;
    }
    const k = t - hitT;
    if (this.phase < 1) { // the hit
      this.phase = 1;
      this.parts.push({ k: 'slash', x: cx, y: cy, life: 0, max: 0.25 });
      if (fx === 'none') this.emit(8, () => ({ k: 'puff', x: cx + (Math.random() - 0.5) * mw * 0.6, y: h * 0.92, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 20, s: 10, g: 30, life: 0, max: 0.9, c: '#a8977c', delay: 0.3 }));
      if (fx === 'shatter') this.shatter(mx, my, mw, mh);
      if (fx === 'soulburst') { this.parts.push({ k: 'ring', x: cx, y: cy, s: 10, g: 260, life: 0, max: 0.7, c: '#b07aff' }); this.parts.push({ k: 'ghost', x: cx, y: cy, life: 0, max: 1.6 }); this.emit(30, () => { const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120; return { k: 'soul', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: -40, s: 6 + Math.random() * 6, life: 0, max: 1 + Math.random() * 0.5 }; }); }
      if (fx === 'lightning') { this.parts.push({ k: 'bolt', x: cx, y: cy, life: 0, max: 0.45 }); this.parts.push({ k: 'flash', life: 0, max: 0.35 }); this.emit(18, () => { const a = Math.random() * Math.PI * 2, v = 100 + Math.random() * 200; return { k: 'spark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, ay: 400, life: 0, max: 0.6, c: '#fff6c0' }; }); }
      if (fx === 'confetti') { this.parts.push({ k: 'ring', x: cx, y: cy, s: 10, g: 220, life: 0, max: 0.5, c: '#ffffff' }); const cols = ['#e5484d', '#f2c443', '#3fa34d', '#2f6fd1', '#a8327e', '#1f8a8a', '#ffffff']; this.emit(70, (i) => { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 160 + Math.random() * 260; return { k: 'conf', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 380, drag: 1.6, s: 5 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, life: 0, max: 1.8, c: cols[i % cols.length] }; }); }
    }
    if (k > end - hitT) return;
    // the monster itself during the effect
    const flash = k < 0.12;
    if (fx === 'none') {
      const a = Math.min(1, k / 0.5);
      c.save(); c.translate(cx + mw * 0.1, h * 0.94); c.rotate(a * 1.35); c.globalAlpha = 1 - Math.max(0, (k - 0.5) / 0.6);
      c.drawImage(flash ? this.tint('#ffffff') || img : img, -mw / 2 - mw * 0.1, -mh, mw, mh); c.restore(); c.globalAlpha = 1;
    } else if (fx === 'soulburst') {
      c.globalAlpha = Math.max(0, 1 - k / 0.7);
      c.drawImage(this.tint('#5b3fbf') || img, mx, my, mw, mh); c.globalAlpha = 1;
    } else if (fx === 'lightning') {
      if (k < 0.5) c.drawImage(this.tint(k < 0.25 && Math.floor(k * 30) % 2 ? '#ffffff' : '#1a1020') || img, mx, my, mw, mh);
      else if (this.phase < 2) { this.phase = 2; this.emit(60, () => ({ k: 'ash', x: mx + mw * (0.2 + Math.random() * 0.6), y: my + mh * (0.1 + Math.random() * 0.85), vx: (Math.random() - 0.5) * 40 + 20, vy: -Math.random() * 30, ay: 60, s: 2 + Math.random() * 3, life: 0, max: 1.2 + Math.random() * 0.6 })); }
    } else if (fx === 'confetti') {
      const s = k < 0.15 ? 1 + k : Math.max(0, 1.15 - (k - 0.15) * 6);
      if (s > 0) { c.save(); c.translate(cx, cy); c.scale(s, s); c.drawImage(this.tint('#ffffff') || img, -mw / 2, -mh / 2, mw, mh); c.restore(); }
    }
  }
  shatter(mx, my, mw, mh) {
    const n = 12, cx = mx + mw / 2, cy = my + mh * 0.5, R = Math.max(mw, mh);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2, v = 90 + Math.random() * 120;
      this.parts.push({ k: 'shard', pts: [[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]], ox: 0, oy: 0, vx: Math.cos(am) * v, vy: Math.sin(am) * v - 120, ay: 520, rot: 0, vr: (Math.random() - 0.5) * 5, ccx: cx, ccy: cy, life: 0, max: 1.3, box: [mx, my, mw, mh] });
    }
    this.emit(20, () => { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 180; return { k: 'shardf', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, ay: 400, s: 4 + Math.random() * 4, rot: a, vr: 6, life: 0, max: 0.8 }; });
    this.parts.push({ k: 'flash', life: 0, max: 0.2 });
  }
  drawParts(c, dt) {
    const { w, h } = this;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life += dt;
      if (p.life > p.max) { this.parts.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.vx != null) {
        if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt * 0.6; }
        p.vy += (p.ay || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (p.vr) p.rot += p.vr * dt;
      c.save();
      switch (p.k) {
        case 'puff': { const s = p.s + p.g * p.life; c.globalAlpha = 0.55 * (1 - k); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, s, 0, Math.PI * 2); c.fill(); break; }
        case 'spark': c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = p.c; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke(); break;
        case 'flame': { const s = Math.max(1, p.s + p.g * p.life); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, s); g.addColorStop(0, `rgba(255,240,170,${0.9 * (1 - k)})`); g.addColorStop(0.4, `rgba(255,140,40,${0.7 * (1 - k)})`); g.addColorStop(1, 'rgba(200,40,20,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, s, 0, Math.PI * 2); c.fill(); break; }
        case 'flake': case 'shardf': {
          c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = 1 - k; c.strokeStyle = '#e6f7ff'; c.fillStyle = '#bfe6ff'; c.lineWidth = 1.6;
          if (p.k === 'flake') { for (let j = 0; j < 3; j++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-p.s, 0); c.lineTo(p.s, 0); c.stroke(); } }
          else { c.beginPath(); c.moveTo(-p.s, -p.s * 0.3); c.lineTo(p.s, 0); c.lineTo(-p.s * 0.6, p.s * 0.5); c.closePath(); c.fill(); c.stroke(); }
          break;
        }
        case 'star': { c.translate(p.x, p.y); c.rotate(p.rot); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * (0.7 + 0.3 * Math.sin(p.life * 30)); c.fillStyle = p.c; starPath(c, p.s); c.fill(); break; }
        case 'ring': c.globalAlpha = 1 - k; c.strokeStyle = p.c; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.ellipse(p.x, p.y, p.s + p.g * p.life, (p.s + p.g * p.life) * 0.45, 0, 0, Math.PI * 2); c.stroke(); break;
        case 'slash': c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = '#fff'; c.lineWidth = 6 * (1 - k) + 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x - 60, p.y - 50 + k * 10); c.lineTo(p.x + 60, p.y + 40); c.stroke(); break;
        case 'flash': c.globalAlpha = 0.7 * (1 - k); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); break;
        case 'soul': { c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 2); g.addColorStop(0, `rgba(230,210,255,${1 - k})`); g.addColorStop(1, 'rgba(120,60,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.s * 2, 0, Math.PI * 2); c.fill(); p.vx *= 0.97; break; }
        case 'ghost': {
          const y = p.y - k * h * 0.45, a = Math.sin(k * Math.PI);
          c.globalAlpha = a * 0.85; c.translate(p.x + Math.sin(k * 10) * 6, y);
          c.fillStyle = '#d8c0ff'; c.beginPath(); c.moveTo(-16, 22); c.lineTo(-16, 0); c.arc(0, 0, 16, Math.PI, 0); c.lineTo(16, 22);
          for (let j = 0; j < 4; j++) c.lineTo(16 - (j + 0.5) * 8, j % 2 ? 22 : 16); c.closePath(); c.fill();
          c.fillStyle = '#2a1a66'; c.beginPath(); c.ellipse(-6, 0, 3, 4.5, 0, 0, 7); c.ellipse(6, 0, 3, 4.5, 0, 0, 7); c.fill();
          break;
        }
        case 'bolt': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * (Math.random() < 0.8 ? 1 : 0.3);
          const pts = [[p.x + (Math.random() - 0.5) * 40, -10]]; let yy = -10;
          while (yy < p.y) { yy += 18 + Math.random() * 16; pts.push([p.x + (Math.random() - 0.5) * 46, Math.min(yy, p.y)]); }
          for (const [lw, col] of [[14, 'rgba(160,140,255,.35)'], [6, 'rgba(255,240,170,.9)'], [2.5, '#ffffff']]) { c.lineWidth = lw; c.strokeStyle = col; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
          break;
        }
        case 'ash': c.globalAlpha = 1 - k; c.fillStyle = k < 0.3 ? '#ff8a2a' : '#3a3038'; c.fillRect(p.x, p.y, p.s, p.s); p.vx += Math.sin(p.life * 5) * 2; break;
        case 'conf': c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.life * 12)); c.globalAlpha = Math.min(1, (1 - k) * 2); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s, p.s, p.s * 2); break;
        case 'shard': {
          p.ox += p.vx * dt; p.oy += p.vy * dt; p.vy += p.ay * dt; p.rot += p.vr * dt;
          c.globalAlpha = 1 - Math.max(0, (k - 0.5) * 2);
          c.translate(p.ccx + p.ox, p.ccy + p.oy); c.rotate(p.rot); c.translate(-p.ccx, -p.ccy);
          c.beginPath(); p.pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
          const [bx, by, bw, bh] = p.box; c.drawImage(this.img, bx, by, bw, bh);
          c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(190,230,255,.35)'; c.fillRect(bx, by, bw, bh);
          break;
        }
        default: break;
      }
      c.restore();
    }
  }
}
function starPath(c, s) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s, a = -Math.PI / 2 + (i * Math.PI) / 5; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ================================================================= CUSTOMIZE
const CZ = { tab: 'banner', preview: null, anim: null, stage: null };
const czBanner = () => {
  const b = { ...loadProfile().banner };
  if (CZ.preview?.kind === 'pattern') b.pattern = CZ.preview.id;
  if (CZ.preview?.kind === 'emblem') b.emblem = CZ.preview.id;
  return b;
};
const TABS = [['banner', 'Banner'], ['dice', 'Dice'], ['throw', 'Throw FX'], ['kill', 'Kill FX']];
const equippedOf = (kind) => { const p = loadProfile(); return { pattern: p.banner.pattern, emblem: p.banner.emblem, dice: p.dice, throw: p.throwFx, kill: p.killFx }[kind]; };
function equip(kind, id) {
  const p = loadProfile();
  if (kind === 'pattern') p.banner.pattern = id;
  else if (kind === 'emblem') p.banner.emblem = id;
  else if (kind === 'dice') p.dice = id;
  else if (kind === 'throw') p.throwFx = id;
  else if (kind === 'kill') p.killFx = id;
  saveProfile(p);
}
const LISTS = { pattern: BANNER_PATTERNS, emblem: BANNER_EMBLEMS, dice: DICE_SKINS, throw: THROW_FX, kill: KILL_FX };

function buildCustomize() {
  const html = screenShell('m-customize', 'Customize', { foot: '<div class="cz-buy"></div>', cls: 'm-cz' });
  ovRoot.insertAdjacentHTML('beforebegin', html);
  const el = elOf('customize');
  $('.m-body', el).innerHTML = `
    <div class="cz-stage">
      <div class="cz-pedestal"></div>
      <canvas class="cz-banner"></canvas>
      <div class="cz-dice"></div>
      <canvas class="cz-fx"></canvas>
      <div class="cz-cap"></div>
    </div>
    <div class="cz-panel">
      <div class="m-tabs cz-tabs">${TABS.map(([id, l]) => `<button data-act="cz-tab" data-id="${id}">${l}</button>`).join('')}</div>
      <div class="cz-content"></div>
    </div>`;
  const wide = matchMedia('(orientation: landscape) and (min-width: 820px)').matches;
  CZ.anim = animateBanner($('.cz-banner', el), czBanner, { w: wide ? 210 : 150, h: wide ? 300 : 214, reduced: reducedMotion });
  CZ.stage = new FxStage($('.cz-fx', el));
  el.addEventListener('input', (e) => {
    if (e.target.matches('.cz-name')) { const p = loadProfile(); p.banner.name = e.target.value.slice(0, 18); saveProfile(p); }
    if (e.target.matches('.cz-pname')) { const p = loadProfile(); p.name = e.target.value.slice(0, 16); saveProfile(p); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  ON_SHOW.customize = () => { CZ.preview = null; renderCustomize(); refreshCoins(); };
}
function renderCustomize() {
  const el = elOf('customize');
  const p = loadProfile();
  el.dataset.tab = CZ.tab;
  $$('.cz-tabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.id === CZ.tab));
  const content = $('.cz-content', el);
  const lockTag = (key, price) => (owns(key) ? '' : `<span class="m-lock">${I.lock}${price}</span>`);
  if (CZ.tab === 'banner') {
    const sw = (field) => `<div class="cz-swatches">${BANNER_COLORS.map((c) => `<button class="cz-sw ${p.banner[field] === c ? 'on' : ''}" style="--c:${c}" data-act="cz-color" data-f="${field}" data-c="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    content.innerHTML = `
      <label class="m-field"><span>Banner name</span><input class="m-input cz-name" value="${esc(p.banner.name)}" maxlength="18" placeholder="Name your banner" autocomplete="off" autocapitalize="words" enterkeyhint="done"></label>
      <label class="m-field"><span>Your name</span><input class="m-input cz-pname" value="${esc(p.name)}" maxlength="16" placeholder="Hero" autocomplete="off" autocapitalize="words" enterkeyhint="done"></label>
      <h4 class="m-h4">Field</h4>${sw('field')}
      <h4 class="m-h4">Accent</h4>${sw('accent')}
      <h4 class="m-h4">Emblem color</h4>${sw('emblemColor')}
      <h4 class="m-h4">Pattern</h4>
      <div class="cz-grid cz-bgrid">${BANNER_PATTERNS.map((x) => `<button class="cz-item ${p.banner.pattern === x.id ? 'on' : ''} ${owns(itemKey('pattern', x.id)) ? '' : 'locked'} ${CZ.preview?.kind === 'pattern' && CZ.preview.id === x.id ? 'pv' : ''}" data-act="cz-item" data-kind="pattern" data-id="${x.id}"><canvas data-pat="${x.id}"></canvas><b>${esc(x.name)}</b>${lockTag(itemKey('pattern', x.id), x.price)}</button>`).join('')}</div>
      <h4 class="m-h4">Emblem</h4>
      <div class="cz-grid cz-bgrid">${BANNER_EMBLEMS.map((x) => `<button class="cz-item ${p.banner.emblem === x.id ? 'on' : ''} ${owns(itemKey('emblem', x.id)) ? '' : 'locked'} ${CZ.preview?.kind === 'emblem' && CZ.preview.id === x.id ? 'pv' : ''}" data-act="cz-item" data-kind="emblem" data-id="${x.id}"><canvas data-emb="${x.id}"></canvas><b>${esc(x.name)}</b>${lockTag(itemKey('emblem', x.id), x.price)}</button>`).join('')}</div>`;
    $$('canvas[data-pat]', content).forEach((c) => drawBanner(c, { ...p.banner, name: '', pattern: c.dataset.pat }, { w: 44, h: 60, pole: false }));
    $$('canvas[data-emb]', content).forEach((c) => drawBanner(c, { ...p.banner, name: '', emblem: c.dataset.emb }, { w: 44, h: 60, pole: false }));
  } else {
    const kind = CZ.tab, list = LISTS[kind], eq = equippedOf(kind);
    content.innerHTML = `<div class="cz-grid cz-igrid">${list.map((x) => {
      const key = itemKey(kind, x.id);
      const thumb = kind === 'dice' ? dieHTML(x.id, 'tilt') : `<span class="m-fxic">${FX_ICON[key] || ''}</span>`;
      return `<button class="cz-item ${eq === x.id ? 'on' : ''} ${owns(key) ? '' : 'locked'} ${CZ.preview?.kind === kind && CZ.preview.id === x.id ? 'pv' : ''}" data-act="cz-item" data-kind="${kind}" data-id="${x.id}"><span class="cz-th">${thumb}</span><b>${esc(x.name)}</b>${lockTag(key, x.price)}${eq === x.id ? `<span class="m-eq">${I.check}</span>` : ''}</button>`;
    }).join('')}</div>
    <p class="m-note">Tap a locked item to preview it. Earn coins by playing.</p>`;
  }
  renderCzStage();
  renderCzBuy();
}
function renderCzStage() {
  const el = elOf('customize');
  const p = loadProfile();
  const pv = CZ.preview;
  const cap = $('.cz-cap', el);
  if (CZ.tab === 'banner') { CZ.anim.redraw(); cap.textContent = p.banner.name || 'Your banner'; }
  if (CZ.tab === 'dice') {
    const id = pv?.kind === 'dice' ? pv.id : p.dice;
    $('.cz-dice', el).innerHTML = dieHTML(id, 'spin big');
    cap.textContent = byId(DICE_SKINS, id).name;
  }
  if (CZ.tab === 'throw' || CZ.tab === 'kill') {
    const kind = CZ.tab;
    const id = pv?.kind === kind ? pv.id : kind === 'throw' ? p.throwFx : p.killFx;
    CZ.stage.set({ mode: kind, fx: id, skin: p.dice });
    cap.textContent = byId(LISTS[kind], id).name;
  }
}
function renderCzBuy() {
  const el = elOf('customize');
  const box = $('.cz-buy', el);
  const pv = CZ.preview;
  el.classList.toggle('has-buy', !!pv);
  if (!pv) { box.innerHTML = ''; return; }
  const it = byId(LISTS[pv.kind], pv.id);
  const afford = loadProfile().coins >= it.price;
  box.innerHTML = `<div class="cz-buy-in"><div><small>Previewing</small><b>${esc(it.name)}</b></div>
    <button class="m-btn gold" data-act="cz-buy" ${afford ? '' : 'aria-disabled="true"'}>${I.lock}<span>Unlock</span>${coinHTML(it.price, 'dark')}</button></div>`;
}
async function purchase(kind, id, { confirm = true } = {}) {
  const it = byId(LISTS[kind], id), key = itemKey(kind, id);
  const p = loadProfile();
  if (owns(key)) return true;
  if (p.coins < it.price) {
    sfx('error'); buzz('error');
    toast(`You need ${it.price - p.coins} more coins`, 'bad');
    return false;
  }
  if (confirm) {
    const ok = await confirmDialog({ title: `Unlock ${it.name}?`, html: `<div class="m-dlg-thumb">${thumbHTML(kind, id)}</div><p>Spend ${coinHTML(it.price)} — you have ${coinHTML(p.coins)}</p>`, ok: `Buy ${coinHTML(it.price, 'dark')}`, cancel: 'Not now' });
    if (!ok) return false;
  }
  if (!buy(key, it.price)) { sfx('error'); return false; }
  sfx('coin'); buzz('heavy');
  refreshCoins(true);
  const equipNow = await celebrate(kind, id);
  if (equipNow) equip(kind, id);
  return true;
}
function thumbHTML(kind, id) {
  if (kind === 'dice') return dieHTML(id, 'tilt');
  if (kind === 'pattern' || kind === 'emblem') return `<canvas class="m-thumb-banner" data-kind="${kind}" data-id="${id}"></canvas>`;
  return `<span class="m-fxic">${FX_ICON[itemKey(kind, id)] || ''}</span>`;
}
function paintThumbs(root) {
  const b = loadProfile().banner;
  $$('canvas.m-thumb-banner', root).forEach((c) => drawBanner(c, { ...b, name: '', [c.dataset.kind]: c.dataset.id }, { w: 70, h: 98, pole: false }));
}
function celebrate(kind, id) {
  const it = byId(LISTS[kind], id);
  return new Promise((resolve) => {
    let res = false;
    const { el } = overlay('m-celebrate', `<div class="cb-rays"></div><div class="cb-in">
      <div class="cb-title">Unlocked!</div>
      <div class="cb-item">${thumbHTML(kind, id)}</div>
      <div class="cb-name">${esc(it.name)}</div>
      <div class="cb-btns"><button class="m-btn gold big" data-act="cb-equip">Equip now</button><button class="m-btn stone" data-act="cb-later">Later</button></div>
    </div><div class="cb-confetti">${Array.from({ length: 28 }, (_, i) => `<i style="--a:${(i * 37) % 360}deg;--d:${0.4 + ((i * 7) % 10) / 14}s;--c:${['#f2c443', '#fff', '#e5484d', '#3fa34d', '#2f6fd1', '#a8327e'][i % 6]}"></i>`).join('')}</div>`,
    { onClose: () => resolve(res) });
    paintThumbs(el);
    setTimeout(() => sfx('relic'), 180);
    onTap(el, '[data-act]', (b) => { res = b.dataset.act === 'cb-equip'; sfx(res ? 'tap' : 'back'); goBack(); });
  });
}
async function czItem(kind, id) {
  const key = itemKey(kind, id);
  if (owns(key)) {
    CZ.preview = null;
    equip(kind, id);
    sfx('tap'); buzz();
  } else {
    CZ.preview = CZ.preview?.kind === kind && CZ.preview.id === id ? null : { kind, id };
    sfx('card_flip'); buzz();
  }
  renderCustomize();
}

// ================================================================= SHOP
const SHOP_TABS = [['banners', 'Banners'], ['dice', 'Dice'], ['throw', 'Throw FX'], ['kill', 'Kill FX']];
const SHOP = { tab: 'banners' };
function buildShop() {
  ovRoot.insertAdjacentHTML('beforebegin', screenShell('m-shop', 'Shop', { cls: 'm-shopscr' }));
  const el = elOf('shop');
  $('.m-body', el).innerHTML = `<div class="m-wrap">
    <div class="sh-hero"><div class="sh-pile"><i class="m-coin-ic"></i><i class="m-coin-ic"></i><i class="m-coin-ic"></i></div>
      <div><b>Relix Coins</b><p>Win battles and claim relics to earn coins. <em>Real shop coming soon.</em></p></div></div>
    <div class="m-tabs sh-tabs">${SHOP_TABS.map(([id, l]) => `<button data-act="sh-tab" data-id="${id}">${l}</button>`).join('')}</div>
    <div class="sh-grid"></div></div>`;
  ON_SHOW.shop = () => { renderShop(); refreshCoins(); };
}
function shopItems() {
  if (SHOP.tab === 'banners') return [...BANNER_PATTERNS.map((x) => ['pattern', x]), ...BANNER_EMBLEMS.map((x) => ['emblem', x])];
  return LISTS[SHOP.tab].map((x) => [SHOP.tab, x]);
}
function renderShop() {
  const el = elOf('shop');
  $$('.sh-tabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.id === SHOP.tab));
  const p = loadProfile();
  $('.sh-grid', el).innerHTML = shopItems().map(([kind, x]) => {
    const key = itemKey(kind, x.id), have = owns(key), eq = equippedOf(kind) === x.id;
    const state = eq ? `<span class="sh-state eq">${I.check}Equipped</span>` : have ? `<span class="sh-state own">Owned · Equip</span>` : `<span class="sh-price ${p.coins < x.price ? 'short' : ''}">${coinHTML(x.price, 'dark')}</span>`;
    return `<button class="sh-item ${have ? 'have' : ''} ${eq ? 'eq' : ''}" data-act="sh-item" data-kind="${kind}" data-id="${x.id}">
      <span class="sh-th">${thumbHTML(kind, x.id)}</span>
      <span class="sh-kind">${kind === 'pattern' ? 'Pattern' : kind === 'emblem' ? 'Emblem' : kind === 'dice' ? 'Dice' : kind === 'throw' ? 'Throw FX' : 'Kill FX'}</span>
      <b>${esc(x.name)}</b>${state}</button>`;
  }).join('');
  paintThumbs(el);
}
function shopDetail(kind, id) {
  const it = byId(LISTS[kind], id), key = itemKey(kind, id);
  const have = owns(key), eq = equippedOf(kind) === id;
  const p = loadProfile();
  const afford = p.coins >= it.price;
  let stage = null, anim = null;
  let next = null;
  const { el } = overlay('m-sheet m-detail', `<div class="m-sheet-in">
    <header class="m-ov-head"><h2>${esc(it.name)}</h2><button class="m-x" data-act="x" aria-label="Close">${I.close}</button></header>
    <div class="dt-stage">${kind === 'dice' ? dieHTML(id, 'spin big') : kind === 'throw' || kind === 'kill' ? '<canvas class="dt-fx"></canvas>' : '<canvas class="dt-banner"></canvas>'}</div>
    <p class="dt-desc">${kind === 'pattern' ? 'Banner pattern, shown in your accent color.' : kind === 'emblem' ? 'Banner emblem, the crest your guild rallies behind.' : kind === 'dice' ? 'Dice skin for every roll you make.' : kind === 'throw' ? 'Trail and landing burst when your dice fly.' : 'Plays when your hero defeats a foe.'}</p>
    <footer class="m-ov-foot">${eq ? `<button class="m-btn stone big" data-act="x">${I.check} Equipped</button>` : have ? `<button class="m-btn gold big" data-act="dt-equip">Equip</button>` : `<button class="m-btn gold big" data-act="dt-buy" ${afford ? '' : 'aria-disabled="true"'}>Buy ${coinHTML(it.price, 'dark')}</button>${afford ? '' : `<p class="m-note">You need ${it.price - p.coins} more coins.</p>`}`}</footer>
  </div>`, { onClose: () => { anim?.stop(); if (stage) stage.visible = false; } });
  if (kind === 'throw' || kind === 'kill') { stage = new FxStage($('.dt-fx', el)); stage.set({ mode: kind, fx: id, skin: p.dice }); }
  if (kind === 'pattern' || kind === 'emblem') anim = animateBanner($('.dt-banner', el), () => ({ ...loadProfile().banner, [kind]: id }), { w: 130, h: 186, reduced: reducedMotion });
  onTap(el, '[data-act]', async (b) => {
    const a = b.dataset.act;
    if (a === 'x') { sfx('back'); goBack(); return; }
    if (a === 'dt-equip') { equip(kind, id); sfx('tap'); buzz(); await goBack(); renderShop(); return; }
    if (a === 'dt-buy') {
      if (b.getAttribute('aria-disabled') === 'true') return;
      next = 'buy';
      await goBack();
      await purchase(kind, id, { confirm: false });
      renderShop();
    }
  });
  el.addEventListener('click', () => {}, { passive: true });
  return next;
}

// ================================================================= SETTINGS
function buildSettings() {
  ovRoot.insertAdjacentHTML('beforebegin', screenShell('m-settings', 'Settings', { coins: false }));
  const el = elOf('settings');
  ON_SHOW.settings = renderSettings;
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.vol;
    if (!k) return;
    const p = loadProfile();
    p.settings[k] = +e.target.value / 100;
    e.target.style.setProperty('--v', e.target.value + '%');
    $(`[data-volv="${k}"]`, el).textContent = `${e.target.value}%`;
    try { AUDIO?.setVolume?.({ music: p.settings.music, sfx: p.settings.sfx }); } catch (er) { /* optional */ }
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.vol) { saveProfile(); if (e.target.dataset.vol === 'sfx') sfx('tap'); }
    if (e.target.matches('.st-name')) { const p = loadProfile(); p.name = e.target.value.slice(0, 16); saveProfile(p); }
  });
}
function renderSettings() {
  const el = elOf('settings');
  const s = loadProfile().settings;
  const slider = (k, label) => `<div class="st-row"><span class="st-l st-ls">${label}</span><input type="range" class="m-range" min="0" max="100" step="1" value="${Math.round(s[k] * 100)}" data-vol="${k}" style="--v:${Math.round(s[k] * 100)}%" aria-label="${label}"><b class="st-v" data-volv="${k}">${Math.round(s[k] * 100)}%</b></div>`;
  const tog = (k, label, sub) => `<button class="st-row st-tog" data-act="st-tog" data-k="${k}" role="switch" aria-checked="${!!s[k]}"><span class="st-l">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="m-switch ${s[k] ? 'on' : ''}"><i></i></span></button>`;
  $('.m-body', el).innerHTML = `<div class="m-wrap">
    <section class="m-panel"><h3 class="m-h">Audio</h3>${slider('music', 'Music')}${slider('sfx', 'Sound effects')}</section>
    <section class="m-panel"><h3 class="m-h">Gameplay</h3>
      <div class="st-row st-col"><span class="st-l">Game speed<small>How fast bots and effects play</small></span>${speedSeg('st-speed')}</div>
      ${tog('swipeDice', 'Swipe to roll', 'Flick the dice yourself')}
      ${tog('haptics', 'Haptics', 'Vibrate on taps and hits')}
      ${tog('reducedMotion', 'Reduced motion', 'Calmer animations')}
    </section>
    <section class="m-panel"><h3 class="m-h">Profile</h3>
      <label class="m-field"><span>Your name</span><input class="m-input st-name" value="${esc(loadProfile().name)}" maxlength="16" placeholder="Hero" autocomplete="off" autocapitalize="words" enterkeyhint="done"></label>
      <button class="st-row st-danger" data-act="st-reset"><span class="st-l">Reset progress<small>Coins, unlocks and settings</small></span><span class="st-arrow">${I.back}</span></button>
    </section>
    <p class="m-note">Relix: The Heroes' Quest · ${VERSION}</p></div>`;
}
function applyReduced() { document.documentElement.classList.toggle('m-reduced', reducedMotion()); }

// ================================================================= HOW TO PLAY
function buildHowto() {
  ovRoot.insertAdjacentHTML('beforebegin', screenShell('m-howto', 'How to Play', { coins: false }));
  const el = elOf('howto');
  const die = (n, cls) => `<span class="ht-die ${cls}">${n}</span>`;
  $('.m-body', el).innerHTML = `<div class="m-wrap ht">
    <section class="ht-card ht-goal"><h3>The Goal</h3><p>Fight through <b>five dungeon floors</b>. Whoever lands the killing blow on a floor's boss claims its <b>Relic</b>. When the fifth boss falls, the player or guild holding the most Relics wins.</p></section>
    <section class="ht-card"><h3><span class="ht-n">1</span>Your Turn</h3><ol>
      <li>Pets are equipped automatically. Play any treasure cards you want.</li>
      <li>Roll 2 dice and move by one of them. On doubles you may move the total. Moving is mandatory and you never need an exact roll for the Boss Room.</li>
      <li>Resolve the tile: <b class="c-mon">Monster</b> (fight), <b class="c-tre">Treasure</b> (draw), <b class="c-trap">Trap</b> (suffer it), or a safe room.</li></ol>
      <div class="ht-tiles"><img src="assets/tiles/monster.webp" alt="Monster tile"><img src="assets/tiles/treasure.webp" alt="Treasure tile"><img src="assets/tiles/trap.webp" alt="Trap tile"><img src="assets/tiles/start.webp" alt="Start tile"></div></section>
    <section class="ht-card"><h3><span class="ht-n">2</span>Combat</h3>
      <p>Play treasures, roll your <b>Skill Check</b> (your hero's numbers trigger the skill once per battle), then roll battle dice.</p>
      <div class="ht-rolls">
        <div>${die(6, 'crit')}<b>Critical hit</b><span>Deal 2</span></div>
        <div>${die('4–5', 'hit')}<b>Hit</b><span>Deal 1</span></div>
        <div>${die('2–3', 'miss')}<b>Miss</b><span>Take the enemy's attack</span></div>
        <div>${die(1, 'cmiss')}<b>Critical miss</b><span>Take double</span></div>
      </div>
      <p><b>Monsters:</b> roll one die per HP they have left and keep rolling until one of you falls. Beat it to draw a treasure.</p>
      <p><b>Bosses:</b> roll 5 dice, one round per turn. Every 3rd roll in the room (counted across all players) the boss's skill fires.</p></section>
    <section class="ht-card"><h3><span class="ht-n">3</span>PvP</h3><p>Land on a tile with other players (not Start or the Boss Room) and everyone not in your guild fights. Highest roll deals 5 damage to everyone else. Ties re-roll for +5 more each time.</p></section>
    <section class="ht-card"><h3><span class="ht-n">4</span>Death</h3><p>Respawn at Start with 40 HP and draw a fresh treasure. A player who kills you takes everything. A monster sends your treasures to the discard. A boss keeps them in the Boss Room for whoever beats it. A trap leaves them on the tile.</p></section>
    <section class="ht-card"><h3><span class="ht-n">5</span>Guilds</h3><p>4+ players only. Play a <b>Guild Banner</b> to invite others (max half the players). Guild members don't fight each other, can reroll each other's failed dice once per battle, and count their Relics together.</p></section>
    <section class="ht-card"><h3>Game Modes</h3>${MODES.map((m) => `<div class="ht-mode"><i>${MODE_ICON[m.id] || ''}</i><div><b>${esc(m.name)}</b><p>${esc(m.text)}</p></div></div>`).join('')}</section>
  </div>`;
}

// ================================================================= GALLERY
const GAL_TABS = [['heroes', 'Heroes'], ['monsters', 'Monsters'], ['bosses', 'Bosses'], ['treasures', 'Treasures'], ['traps', 'Traps'], ['backs', 'Backs']];
const GAL = { tab: 'heroes' };
function buildGallery() {
  ovRoot.insertAdjacentHTML('beforebegin', screenShell('m-gallery', 'Card Gallery', { coins: false }));
  const el = elOf('gallery');
  $('.m-body', el).innerHTML = `<div class="ga-tabs-wrap"><div class="m-tabs ga-tabs">${GAL_TABS.map(([id, l]) => `<button data-act="ga-tab" data-id="${id}">${l}</button>`).join('')}</div></div><div class="m-wrap"><p class="ga-sub"></p><div class="ga-grid"></div></div>`;
  ON_SHOW.gallery = renderGallery;
}
function renderGallery() {
  const el = elOf('gallery');
  $$('.ga-tabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.id === GAL.tab));
  const cell = (html, kind, id, cnt) => `<button class="ga-cell" data-act="zoom" data-kind="${kind}" data-id="${id}">${html}${cnt ? `<span class="ga-cnt">×${cnt}</span>` : ''}</button>`;
  let items = [], sub = '';
  if (GAL.tab === 'heroes') { items = HEROES.map((h) => cell(heroFront(h.id), 'hero', h.id)); sub = `${HEROES.length} heroes · tap to see their skill`; }
  if (GAL.tab === 'monsters') { items = MONSTERS.map((m) => cell(monsterCard(m.id), 'monster', m.id, m.count)); sub = `${sumCounts(MONSTERS)} monster cards`; }
  if (GAL.tab === 'bosses') { items = BOSSES.map((b) => cell(bossFront(b), 'boss', b.id)); sub = 'One boss guards each floor · tap to see their skill'; }
  if (GAL.tab === 'treasures') { items = TREASURES.map((t) => cell(treasureCard(t.id), 'treasure', t.id, t.count)); sub = `${sumCounts(TREASURES)} treasure cards`; }
  if (GAL.tab === 'traps') { items = TRAPS.map((t) => cell(trapCard(t.id), 'trap', t.id, t.count)); sub = `${sumCounts(TRAPS)} trap cards`; }
  if (GAL.tab === 'backs') { items = ['Hero', 'Monster', 'Boss', 'Treasure', 'Trap', 'Pet'].map((w) => cell(cardBack(w), 'back', w)); sub = 'Card backs'; }
  $('.ga-sub', el).textContent = sub;
  $('.ga-grid', el).innerHTML = items.join('');
  $('.m-body', el).scrollTop = 0;
}
function zoomCard(kind, id, src) {
  let front = '', back = '';
  if (kind === 'hero') { front = heroFront(id); back = heroBack(id); }
  else if (kind === 'boss') { const b = BOSSES.find((x) => x.id === id); front = bossFront(b); back = bossBack(b); }
  else if (kind === 'monster') front = monsterCard(id);
  else if (kind === 'treasure') front = treasureCard(id);
  else if (kind === 'trap') front = trapCard(id);
  else front = cardBack(id);
  const flippable = !!back;
  const srcCard = src && $('.card', src);
  const rm = reducedMotion();
  let stage = null;
  const fly = (toSrc) => {
    if (rm || !stage) return;
    const r = srcCard?.getBoundingClientRect(), d = stage.getBoundingClientRect();
    const visible = r && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    const from = visible ? `translate(${r.left + r.width / 2 - (d.left + d.width / 2)}px, ${r.top + r.height / 2 - (d.top + d.height / 2)}px) scale(${r.width / d.width})` : 'scale(.6)';
    const k = [{ transform: from, opacity: visible ? 1 : 0 }, { transform: 'none', opacity: 1 }];
    stage.animate(toSrc ? k.reverse() : k, toSrc ? { duration: 220, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' } : { duration: 460, easing: 'cubic-bezier(.2,1.25,.35,1)' });
  };
  const { el } = overlay('m-zoom', `<div class="zm-stage ${flippable ? 'can-flip' : ''}" role="img" aria-label="Card">
      <div class="zm-flip"><div class="zm-face zm-front">${front}</div>${flippable ? `<div class="zm-face zm-back">${back}</div>` : ''}</div></div>
    ${flippable ? `<div class="zm-ctrl"><button class="m-btn stone zm-flipbtn" data-act="zm-flip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M18.5 2.5v4.6h-4.6M5.5 21.5v-4.6h4.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Flip</span></button></div>` : ''}
    <button class="m-x zm-x" data-act="x" aria-label="Close">${I.close}</button>
    <p class="zm-hint">${flippable ? 'Swipe or tap the card to flip · tap outside to close' : 'Tap outside to close'}</p>`,
  { onClose: () => { fly(true); if (srcCard) setTimeout(() => { src.style.visibility = ''; }, rm ? 0 : 230); } });
  stage = $('.zm-stage', el);
  const flip = $('.zm-flip', el);
  if (srcCard && !rm) src.style.visibility = 'hidden';
  fly(false);
  sfx('card_flip');

  // ---- flip: follow the finger, snap to the nearest face
  let angle = 0;
  const setAngle = (a, anim = true) => { flip.classList.toggle('drag', !anim); flip.style.transform = `rotateY(${a}deg)`; };
  const turn = (dir = 1) => { if (!flippable) return; angle += 180 * dir; setAngle(angle); sfx('card_flip'); buzz(); };
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0 };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    if (flippable) setAngle(angle + Math.max(-200, Math.min(200, drag.dx * 0.75)), false);
    else setAngle(Math.max(-14, Math.min(14, drag.dx * 0.12)), false);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx } = drag, moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    drag = null;
    if (!flippable) { setAngle(0); return; }
    if (Math.abs(dx) > 50) turn(dx > 0 ? 1 : -1);
    else if (moved < 10 && e.type === 'pointerup') turn(1);
    else setAngle(angle);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('click', (e) => e.stopPropagation());
  onTap(el, '[data-act]', (b) => {
    if (b.dataset.act === 'zm-flip') { turn(1); return; }
    sfx('back'); goBack();
  });
}

// ================================================================= actions
async function act(b) {
  const a = b.dataset.act;
  switch (a) {
    case 'back': sfx('back'); buzz(); goBack(); break;
    case 'go': sfx('tap'); buzz(); navTo(b.dataset.to); break;
    case 'poke': {
      const h = b.closest('.t-hero'); sfx('tap'); buzz();
      h.classList.remove('poked'); void h.offsetWidth; h.classList.add('poked');
      break;
    }
    case 'mode': setup.mode = b.dataset.id; saveSetup(); sfx('tap'); buzz(); renderSetup(); break;
    case 'seat-type': sfx('tap'); buzz(); setSeatType(+b.dataset.i, b.dataset.t); break;
    case 'pick': sfx('open'); buzz(); heroPicker(+b.dataset.i); break;
    case 'speed': case 'st-speed': {
      const p = loadProfile(); p.settings.speed = +b.dataset.v; saveProfile(p); sfx('tap'); buzz();
      $$(`[data-act="${a}"]`).forEach((x) => x.classList.toggle('on', x === b));
      break;
    }
    case 'begin': beginQuest(); break;
    case 'cz-tab': CZ.tab = b.dataset.id; CZ.preview = null; sfx('tap'); buzz(); renderCustomize(); $('.m-body', elOf('customize')).scrollTop = 0; break;
    case 'cz-color': { const p = loadProfile(); p.banner[b.dataset.f] = b.dataset.c; saveProfile(p); sfx('tap'); buzz(); renderCustomize(); break; }
    case 'cz-item': czItem(b.dataset.kind, b.dataset.id); break;
    case 'cz-buy': {
      const pv = CZ.preview; if (!pv) break;
      if (b.getAttribute('aria-disabled') === 'true') { const it = byId(LISTS[pv.kind], pv.id); sfx('error'); buzz('error'); shake(b); toast(`You need ${it.price - loadProfile().coins} more coins`, 'bad'); break; }
      sfx('tap');
      if (await purchase(pv.kind, pv.id)) CZ.preview = null;
      renderCustomize();
      break;
    }
    case 'sh-tab': SHOP.tab = b.dataset.id; sfx('tap'); buzz(); renderShop(); break;
    case 'sh-item': sfx('open'); buzz(); shopDetail(b.dataset.kind, b.dataset.id); break;
    case 'st-tog': {
      const p = loadProfile(), k = b.dataset.k; p.settings[k] = !p.settings[k]; saveProfile(p);
      b.setAttribute('aria-checked', String(p.settings[k])); $('.m-switch', b).classList.toggle('on', p.settings[k]);
      if (k === 'reducedMotion') applyReduced();
      sfx('tap'); buzz();
      break;
    }
    case 'st-reset': {
      sfx('open');
      const ok = await confirmDialog({ title: 'Reset progress?', html: '<p>Your coins, unlocks, banner and settings go back to the start. This cannot be undone.</p>', ok: 'Reset', okCls: 'red', cancel: 'Keep' });
      if (ok) { resetProfile(); applyReduced(); renderSettings(); refreshCoins(); toast('Progress reset'); try { AUDIO?.setVolume?.({ music: loadProfile().settings.music, sfx: loadProfile().settings.sfx }); } catch (e) { /* optional */ } }
      break;
    }
    case 'ga-tab': GAL.tab = b.dataset.id; sfx('tap'); buzz(); renderGallery(); break;
    case 'zoom': zoomCard(b.dataset.kind, b.dataset.id, b); break;
    default: break;
  }
}

// ================================================================= init
let inited = false;
/**
 * Builds every menu screen and shows the title.
 * opts.startGame(config) is called by "Begin the Quest";
 * opts.audio is the audio module (optional); opts.haptics { tap(), heavy(), error() } (optional).
 */
export function initMenus({ startGame, audio, haptics } = {}) {
  START = startGame || null;
  AUDIO = audio || null;
  HAPTICS = haptics || null;
  if (inited) return { showMenu, handleBack };
  inited = true;
  document.documentElement.classList.add('m-ready');
  applyReduced();
  mqReduce.addEventListener?.('change', applyReduced);

  let title = document.getElementById('title');
  let setupEl = document.getElementById('setup');
  if (!title) { title = document.createElement('section'); title.id = 'title'; document.body.prepend(title); }
  if (!setupEl) { setupEl = document.createElement('section'); setupEl.id = 'setup'; title.after(setupEl); }
  // replace the nodes so stale listeners from older code are dropped
  const fresh = (el) => { const n = el.cloneNode(false); el.replaceWith(n); return n; };
  title = fresh(title); setupEl = fresh(setupEl);

  let root = document.getElementById('menuRoot');
  if (!root) { root = document.createElement('div'); root.id = 'menuRoot'; document.body.appendChild(root); }
  root.innerHTML = '<div class="m-ovs"></div>';
  ovRoot = root.firstChild;

  buildTitle(title);
  buildSetup(setupEl);
  buildCustomize();
  buildShop();
  buildSettings();
  buildHowto();
  buildGallery();

  for (const el of [title, setupEl, ...$$('.m-screen', root)]) onTap(el, '[data-act]', act);

  try { AUDIO?.setVolume?.({ music: loadProfile().settings.music, sfx: loadProfile().settings.sfx }); } catch (e) { /* optional */ }
  const unlock = () => { try { AUDIO?.unlock?.(); } catch (e) { /* optional */ } };
  document.addEventListener('touchend', unlock, { once: true, capture: true });
  document.addEventListener('click', unlock, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current === 'title') startTitleLoop(); });
  window.addEventListener('relix:profile', () => refreshCoins());
  bannerFontsReady().then(() => { if (current === 'title') ON_SHOW.title(); });

  showMenu('title');
  return { showMenu, handleBack };
}
