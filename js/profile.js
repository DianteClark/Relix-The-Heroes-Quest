// Player profile: cosmetics, coins, owned items and settings, persisted in localStorage.
//
// Owned items are stored as namespaced keys because cosmetic ids repeat across
// categories ('flames' is both a banner pattern and a throw effect):
//   'pattern:<id>'  'emblem:<id>'  'dice:<id>'  'throw:<id>'  'kill:<id>'
// Use itemKey(kind, id) to build one.

import { BANNER_PATTERNS, BANNER_EMBLEMS, BANNER_COLORS, DICE_SKINS, THROW_FX, KILL_FX, DEFAULT_BANNER } from './cosmetics.js';

export const PROFILE_KEY = 'relix.profile.v1';

// kind → catalog, plus which profile field equips it (banner parts live inside profile.banner).
export const CATALOG = {
  pattern: { list: BANNER_PATTERNS, label: 'Pattern' },
  emblem: { list: BANNER_EMBLEMS, label: 'Emblem' },
  dice: { list: DICE_SKINS, label: 'Dice' },
  throw: { list: THROW_FX, label: 'Throw FX' },
  kill: { list: KILL_FX, label: 'Kill FX' },
};

export const itemKey = (kind, id) => `${kind}:${id}`;

export const DEFAULT_SETTINGS = { music: 0.7, sfx: 0.9, haptics: true, swipeDice: true, speed: 0.5, reducedMotion: false };

function freeItems() {
  const out = [];
  for (const [kind, { list }] of Object.entries(CATALOG)) for (const it of list) if (!it.price) out.push(itemKey(kind, it.id));
  return out;
}

export function defaultProfile() {
  return {
    name: '',
    banner: { ...DEFAULT_BANNER },
    dice: 'bone',
    throwFx: 'dust',
    killFx: 'none',
    coins: 300,
    owned: freeItems(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

const has = (list, id) => list.some((x) => x.id === id);
const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

// Repair anything missing or invalid so callers can trust the shape.
function sanitize(raw) {
  const d = defaultProfile();
  if (!raw || typeof raw !== 'object') return d;
  const p = { ...d, ...raw };
  p.name = typeof raw.name === 'string' ? raw.name.slice(0, 16) : '';
  const b = { ...DEFAULT_BANNER, ...(raw.banner || {}) };
  if (!isColor(b.field)) b.field = DEFAULT_BANNER.field;
  if (!isColor(b.accent)) b.accent = DEFAULT_BANNER.accent;
  if (!isColor(b.emblemColor)) b.emblemColor = DEFAULT_BANNER.emblemColor;
  if (!has(BANNER_PATTERNS, b.pattern)) b.pattern = DEFAULT_BANNER.pattern;
  if (!has(BANNER_EMBLEMS, b.emblem)) b.emblem = DEFAULT_BANNER.emblem;
  b.name = typeof b.name === 'string' ? b.name.slice(0, 18) : '';
  p.banner = b;
  if (!has(DICE_SKINS, p.dice)) p.dice = d.dice;
  if (!has(THROW_FX, p.throwFx)) p.throwFx = d.throwFx;
  if (!has(KILL_FX, p.killFx)) p.killFx = d.killFx;
  p.coins = Math.max(0, Math.floor(num(raw.coins, d.coins, 0, 1e9)));
  p.owned = [...new Set([...(Array.isArray(raw.owned) ? raw.owned.filter((x) => typeof x === 'string') : []), ...d.owned])];
  const s = raw.settings || {};
  p.settings = {
    music: num(s.music, DEFAULT_SETTINGS.music, 0, 1),
    sfx: num(s.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    haptics: typeof s.haptics === 'boolean' ? s.haptics : DEFAULT_SETTINGS.haptics,
    swipeDice: typeof s.swipeDice === 'boolean' ? s.swipeDice : DEFAULT_SETTINGS.swipeDice,
    speed: num(s.speed, DEFAULT_SETTINGS.speed, 0.05, 1),
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
  };
  return p;
}

let cache = null;

/** Returns the live profile object (same instance on every call until saveProfile replaces it). */
export function loadProfile() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { raw = null; }
  cache = sanitize(raw);
  return cache;
}

/** Persists the profile and fires window 'relix:profile' with the profile as detail. */
export function saveProfile(p = loadProfile()) {
  cache = sanitize(p);
  // keep callers' references valid: copy sanitized values back onto their object
  if (p && p !== cache) { Object.assign(p, cache); cache = p; }
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(cache)); } catch { /* private mode / quota: keep in memory */ }
  try { window.dispatchEvent(new CustomEvent('relix:profile', { detail: cache })); } catch { /* non-DOM */ }
  return cache;
}

/** Adds (or with a negative n, removes) coins. Returns the new total. */
export function awardCoins(n) {
  const p = loadProfile();
  p.coins = Math.max(0, Math.floor(p.coins + (+n || 0)));
  saveProfile(p);
  return p.coins;
}

/** Grants an item without charging. key = 'kind:id' (see itemKey). */
export function own(key) {
  const p = loadProfile();
  if (!p.owned.includes(key)) { p.owned.push(key); saveProfile(p); }
  return true;
}

/** True if the item is owned. key = 'kind:id'. */
export function owns(key) { return loadProfile().owned.includes(key); }

/** Buys an item. Returns true when bought (or already owned), false when coins are short. */
export function buy(key, price) {
  const p = loadProfile();
  if (p.owned.includes(key)) return true;
  price = Math.max(0, Math.floor(+price || 0));
  if (p.coins < price) return false;
  p.coins -= price;
  p.owned.push(key);
  saveProfile(p);
  return true;
}

/** Price of a catalog item (0 if unknown). */
export function priceOf(key) {
  const [kind, id] = key.split(':');
  const it = CATALOG[kind]?.list.find((x) => x.id === id);
  return it ? it.price || 0 : 0;
}

/** Wipes the stored profile back to defaults. */
export function resetProfile() {
  cache = defaultProfile();
  return saveProfile(cache);
}

export { BANNER_COLORS };
