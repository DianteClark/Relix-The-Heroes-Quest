// Player profile: cosmetics, coins, owned items and settings, persisted in localStorage.
//
// Progression (v0.3): xp/level, stats, achievements, daily chest, featured offers, bundles.
//   awardGame(result) → { xp, coins, level, levelUps, unlocks, achievements, ... }   (end of game)
//   achievementsFor(event, data) → newly unlocked achievements (fires window 'relix:achievement')
//   unlockAchievement(id) → the achievement if newly unlocked, else null
//   dailyStatus() / claimDaily()      featuredOffers() / buyOffer(key)      bundleOffer(id) / buyBundle(id)
//
// Owned items are stored as namespaced keys because cosmetic ids repeat across
// categories ('flames' is both a banner pattern and a throw effect):
//   'pattern:<id>'  'emblem:<id>'  'dice:<id>'  'throw:<id>'  'kill:<id>'
// Use itemKey(kind, id) to build one.

import { BANNER_PATTERNS, BANNER_EMBLEMS, BANNER_COLORS, DICE_SKINS, THROW_FX, KILL_FX, DEFAULT_BANNER, BUNDLES } from './cosmetics.js';
import { levelOf, levelCoins, LEVEL_ITEMS, gameRewards, ACHIEVEMENTS, MAX_LEVEL } from './progression.js';

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
  for (const [kind, { list }] of Object.entries(CATALOG)) for (const it of list) if (it.price === 0) out.push(itemKey(kind, it.id));
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
    xp: 0,
    stats: defaultStats(),
    achievements: {},
    daily: { last: '', streak: 0 },
    pending: [],
  };
}
const defaultStats = () => ({ games: 0, wins: 0, relics: 0, kills: 0, monsterKills: 0, bossKills: 0, pvpWins: 0, bossesSlain: [], heroWins: [] });

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
  p.xp = Math.max(0, Math.floor(num(raw.xp, 0, 0, 1e9)));
  const st = { ...defaultStats(), ...(raw.stats && typeof raw.stats === 'object' ? raw.stats : {}) };
  for (const k of Object.keys(defaultStats())) {
    if (Array.isArray(defaultStats()[k])) st[k] = Array.isArray(st[k]) ? [...new Set(st[k].filter((x) => typeof x === 'string'))] : [];
    else st[k] = Math.max(0, Math.floor(num(st[k], 0, 0, 1e9)));
  }
  p.stats = st;
  p.achievements = raw.achievements && typeof raw.achievements === 'object' ? Object.fromEntries(Object.entries(raw.achievements).filter(([k, v]) => ACHIEVEMENTS.some((a) => a.id === k) && typeof v === 'number')) : {};
  p.daily = { last: typeof raw.daily?.last === 'string' ? raw.daily.last : '', streak: Math.floor(num(raw.daily?.streak, 0, 0, 9999)) };
  p.pending = Array.isArray(raw.pending) ? raw.pending.filter((x) => x && typeof x === 'object').slice(-20) : [];
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
  const out = [];
  checkStats(p, out);
  saveProfile(p);
  for (const a of out) emit('relix:achievement', a);
  return true;
}

/** Catalog entry for a key, or null. */
export function itemOf(key) {
  const [kind, id] = String(key).split(':');
  const it = CATALOG[kind]?.list.find((x) => x.id === id);
  return it ? { ...it, kind, key } : null;
}
/** 'Level 5' style hint when an item can't be bought (level reward), else ''. */
export function unlockHint(key) { const it = itemOf(key); return it && it.level && !owns(key) ? `Level ${it.level}` : ''; }

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

// ================================================================ progression
export { levelOf, MAX_LEVEL };
/** { level, into, need, frac, xp } for the stored profile. */
export function levelInfo() { const p = loadProfile(); return { ...levelOf(p.xp), xp: p.xp }; }

const emit = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* non-DOM */ } };
const statVal = (p, stat) => {
  if (stat === 'level') return levelOf(p.xp).level;
  if (stat === 'owned') return p.owned.length;
  const v = p.stats[stat];
  return Array.isArray(v) ? v.length : v || 0;
};
/** Progress of one achievement: { have, goal, done, at }. */
export function achievementProgress(id) {
  const p = loadProfile(), a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  const at = p.achievements[id] || 0;
  const goal = a.goal || 1;
  const have = at ? goal : a.stat ? Math.min(goal, statVal(p, a.stat)) : 0;
  return { have, goal, done: !!at, at };
}

// grants an item key; returns true if newly owned
function grantItem(p, key) {
  if (!key || p.owned.includes(key) || !itemOf(key)) return false;
  p.owned.push(key);
  return true;
}

// unlock inside a batch (no save); returns the record or null
function unlockIn(p, id, out) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || p.achievements[id]) return null;
  p.achievements[id] = Date.now();
  p.coins += a.coins || 0;
  const items = [];
  if (a.item && grantItem(p, a.item)) items.push(a.item);
  const rec = { id: a.id, name: a.name, desc: a.desc, icon: a.icon, coins: a.coins || 0, items };
  out.push(rec);
  return rec;
}
// achievements driven purely by stats
function checkStats(p, out) {
  for (const a of ACHIEVEMENTS) if (a.stat && !p.achievements[a.id] && statVal(p, a.stat) >= a.goal) unlockIn(p, a.id, out);
}
function finish(p, out) {
  if (!out.length) return out;
  checkStats(p, out); // e.g. coins bought nothing, but 'collector' may follow an item grant
  saveProfile(p);
  for (const a of out) emit('relix:achievement', a);
  return out;
}

/** Unlocks one achievement by id. Returns it if newly unlocked, else null. */
export function unlockAchievement(id) {
  const p = loadProfile(), out = [];
  unlockIn(p, id, out);
  finish(p, out);
  return out[0] || null;
}

/**
 * In-game hook. Fire for the local human player only. Returns the newly unlocked achievements
 * (each also fires window 'relix:achievement', which the menus show as a toast).
 *   'relic' {count}  'roll' {values}  'kill' {target, bossId}  'pvp_win'  'hp' {hp}
 *   'trap' {id}  'pet' {id}  'guild'  'hand' {count}
 */
export function achievementsFor(event, data = {}) {
  const p = loadProfile(), out = [];
  const u = (id) => unlockIn(p, id, out);
  switch (event) {
    case 'relic': u('first_relic'); if ((data.count | 0) >= 3) u('relic_trio'); break;
    case 'roll': {
      const v = (Array.isArray(data.values) ? data.values : []).map((x) => x | 0);
      if (v.length >= 5) {
        const counts = {}; v.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
        if (Object.values(counts).some((c) => c >= 5)) u('five_kind');
        if ((counts[6] || 0) >= 5) u('all_sixes');
      }
      break;
    }
    case 'kill':
      p.stats.kills++;
      if (data.target === 'monster') p.stats.monsterKills++;
      if (data.target === 'boss') {
        p.stats.bossKills++; u('first_boss');
        if (data.bossId && !p.stats.bossesSlain.includes(data.bossId)) p.stats.bossesSlain.push(String(data.bossId));
      }
      checkStats(p, out);
      saveProfile(p);
      break;
    case 'pvp_win': p.stats.pvpWins++; u('brawler'); saveProfile(p); break;
    case 'hp': if ((data.hp | 0) === 1) u('last_stand'); break;
    case 'trap': if (data.id === 'endless_pit') u('pit_diver'); break;
    case 'pet': u('beast_tamer'); break;
    case 'guild': u('guild_founder'); break;
    case 'hand': if ((data.count | 0) >= 6) u('hoarder'); break;
    default: break;
  }
  return finish(p, out);
}

// applies level-ups between two xp totals; returns [{ level, coins, items }]
function applyLevels(p, fromXp, toXp) {
  const a = levelOf(fromXp).level, b = levelOf(toXp).level, ups = [];
  for (let L = a + 1; L <= b; L++) {
    const up = { level: L, coins: levelCoins(L), items: [] };
    const key = LEVEL_ITEMS[L];
    if (key) {
      if (grantItem(p, key)) up.items.push(key);
      else { const it = itemOf(key); up.coins += Math.round((it?.price || 100) / 2); } // already owned: half its price instead
    }
    p.coins += up.coins;
    ups.push(up);
  }
  return ups;
}

/**
 * End-of-game rewards for the local player.
 * result = { placement, relics, kills, bossKills, won, mode, players, hero?, deaths?, bossIds? }
 *   placement 1-based; players = number of players/teams ranked; hero = hero id (for 'Hall of Heroes');
 *   deaths (for 'Untouchable'); bossIds = boss ids this player slew (for 'Master of Floors').
 * Returns { xp, coins, level, levelUps:[{level, coins, items}], unlocks:[keys], achievements:[...],
 *           before:{level,into,need}, after:{level,into,need} }.
 * Coins and xp are already added to the profile. Level-ups are also queued for the title screen.
 */
export function awardGame(result = {}) {
  const p = loadProfile();
  const { xp, coins } = gameRewards(result);
  const before = levelOf(p.xp);
  const fromXp = p.xp;
  p.xp += xp;
  p.coins += coins;
  const st = p.stats;
  st.games++;
  if (result.won) st.wins++;
  st.relics += result.relics | 0;
  if (result.won && result.hero && !st.heroWins.includes(result.hero)) st.heroWins.push(String(result.hero));
  for (const id of Array.isArray(result.bossIds) ? result.bossIds : []) if (!st.bossesSlain.includes(id)) st.bossesSlain.push(String(id));
  const levelUps = applyLevels(p, fromXp, p.xp);
  const out = [];
  unlockIn(p, 'first_game', out);
  if (result.won) {
    unlockIn(p, 'first_win', out);
    if (result.deaths === 0) unlockIn(p, 'flawless', out);
    if (result.mode === 'elimination') unlockIn(p, 'elim_win', out);
  }
  if ((result.relics | 0) >= 3) unlockIn(p, 'relic_trio', out);
  if ((result.relics | 0) >= 1) unlockIn(p, 'first_relic', out);
  checkStats(p, out);
  if (levelUps.length) p.pending.push({ type: 'levels', levelUps, at: Date.now() });
  saveProfile(p);
  for (const a of out) emit('relix:achievement', a);
  const unlocks = [...levelUps.flatMap((u) => u.items), ...out.flatMap((a) => a.items)];
  return { xp, coins, level: levelOf(p.xp).level, levelUps, unlocks, achievements: out, before, after: levelOf(p.xp),
    totalCoins: coins + levelUps.reduce((n, u) => n + u.coins, 0) + out.reduce((n, a) => n + a.coins, 0) };
}

/** Takes (and clears) queued celebrations: [{ type:'levels', levelUps }]. */
export function takePending() {
  const p = loadProfile();
  const q = p.pending.slice();
  if (q.length) { p.pending = []; saveProfile(p); }
  return q;
}

// ================================================================ daily chest
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prevDay = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - 1); return dayKey(x); };
const msToMidnight = (d = new Date()) => { const x = new Date(d); x.setHours(24, 0, 0, 0); return x - d; };
const dailyCoins = (streak) => 50 + 15 * (Math.min(7, Math.max(1, streak)) - 1);

/** { ready, streak (the streak the next claim would give), coins, nextIn (ms until the next chest) } */
export function dailyStatus(now = new Date()) {
  const p = loadProfile(), today = dayKey(now);
  const ready = p.daily.last !== today;
  const streak = ready ? (p.daily.last === prevDay(now) ? p.daily.streak + 1 : 1) : p.daily.streak;
  return { ready, streak, coins: dailyCoins(streak), bonusDay: streak % 7 === 0, nextIn: ready ? 0 : msToMidnight(now) };
}

/** Claims today's chest. Returns { coins, items:[keys], streak } or null when already claimed. */
export function claimDaily(now = new Date()) {
  const st = dailyStatus(now);
  if (!st.ready) return null;
  const p = loadProfile();
  p.daily = { last: dayKey(now), streak: st.streak };
  let coins = st.coins;
  const items = [];
  if (st.bonusDay) { // every 7th day: a random shop item worth up to 300
    const pool = shopItems().filter((it) => !p.owned.includes(it.key) && it.price <= 300);
    if (pool.length) { const it = pool[Math.floor(Math.random() * pool.length)]; p.owned.push(it.key); items.push(it.key); }
    else coins += 200;
  }
  p.coins += coins;
  const out = [];
  checkStats(p, out);
  saveProfile(p);
  for (const a of out) emit('relix:achievement', a);
  return { coins, items, streak: st.streak };
}

// ================================================================ shop: featured + bundles
/** Every buyable catalog item as { kind, id, key, name, price }. */
export function shopItems() {
  const out = [];
  for (const [kind, { list }] of Object.entries(CATALOG)) for (const it of list) if (it.price > 0) out.push({ ...it, kind, key: itemKey(kind, it.id) });
  return out;
}
const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const FEATURED_DISCOUNT = 0.3;
/**
 * Today's featured offers: up to 3 unowned items at 30% off, rotating at local midnight.
 * Returns { offers:[{ key, kind, id, name, price, was }], nextIn }.
 */
export function featuredOffers(now = new Date()) {
  const day = dayKey(now), p = loadProfile();
  const pool = shopItems().filter((it) => !p.owned.includes(it.key)).sort((a, b) => hash(day + a.key) - hash(day + b.key));
  const picked = [], kinds = new Set();
  for (const it of pool) { if (picked.length >= 3) break; if (!kinds.has(it.kind)) { picked.push(it); kinds.add(it.kind); } }
  for (const it of pool) { if (picked.length >= 3) break; if (!picked.includes(it)) picked.push(it); }
  const offers = picked.map((it) => ({ ...it, was: it.price, price: Math.round((it.price * (1 - FEATURED_DISCOUNT)) / 5) * 5, owned: p.owned.includes(it.key) }));
  return { offers, nextIn: msToMidnight(now) };
}
/** Buys a featured offer at its discounted price. Returns true when bought. */
export function buyOffer(key, now = new Date()) {
  const o = featuredOffers(now).offers.find((x) => x.key === key);
  return o ? buy(key, o.price) : false;
}
/** { bundle, items:[{key, owned, ...item}], price, was, owned:boolean } — owned share is discounted. */
export function bundleOffer(id) {
  const b = BUNDLES.find((x) => x.id === id);
  if (!b) return null;
  const p = loadProfile();
  const items = b.items.map((k) => ({ ...itemOf(k), owned: p.owned.includes(k) })).filter((x) => x.key);
  const full = items.reduce((n, it) => n + (it.price || 0), 0) || 1;
  const missing = items.filter((it) => !it.owned).reduce((n, it) => n + (it.price || 0), 0);
  const price = Math.round((b.price * (missing / full)) / 5) * 5;
  return { bundle: b, items, price, was: missing, owned: missing === 0 };
}
/** Buys all missing items of a bundle. Returns true when bought. */
export function buyBundle(id) {
  const o = bundleOffer(id);
  if (!o || o.owned) return false;
  const p = loadProfile();
  if (p.coins < o.price) return false;
  p.coins -= o.price;
  for (const it of o.items) if (!it.owned) p.owned.push(it.key);
  const out = [];
  checkStats(p, out);
  saveProfile(p);
  for (const a of out) emit('relix:achievement', a);
  return true;
}
