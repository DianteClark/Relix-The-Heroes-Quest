// Relix card renderer: "Stone & Sky", built from the designer's own card layers
// (assets/ui/v3: brick wall, boulder frame, sunset window mask, banner nameplate).
//
// Every card is a <div class="card cs k-KIND"> sized only by its width (aspect 732:1101).
// All inner sizes use container-query units, so the same markup is crisp from a 52px
// hand thumbnail up to a full-screen zoom. Styles live in css/cards.css, which this
// module injects on import if the page did not link it already.
//
// Public API (unchanged signatures):
//   charCard({ art, name, atk, hp, maxHp, cls, kind?, tag?, mid?, floor? })
//   textCard({ title, lines, cls, foot })     generic text card (ability style)
//   cardBack(word, cls)                       dragon emblem back ('Hero','Monster','Boss','Treasure','Trap','Pet')
//   heroFront(id, hp)  heroBack(id)
//   treasureCard(id, cls)  trapCard(id, cls)
//   monsterCard(id, hp)
//   bossFront(boss, hp)  bossBack(boss)
import { HEROES, MONSTERS, BOSSES, heroDef, treasureDef, trapDef } from './data.js';
import { treasureArt, trapArt } from './card-art.js';

const ASSETS = new URL('../assets/', import.meta.url).href;
const UI = `${ASSETS}ui/`;
const charUrl = (art) => `${ASSETS}chars/${art}.webp`;

// css/cards.css is self-injected so callers only need the JS import.
if (typeof document !== 'undefined' && !document.querySelector('link[data-cards-css], link[href$="css/cards.css"]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../css/cards.css', import.meta.url).href;
  l.dataset.cardsCss = '';
  document.head.appendChild(l);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KINDS = ['hero', 'monster', 'boss', 'treasure', 'trap', 'pet'];
const PET_ART = { pet_golem: 'golem_1', pet_tezuki: 'kitsune_3', pet_kezz: 'goblin_3' };
const HERO_ARTS = new Set(HEROES.map((h) => h.art));
const BOSS_ARTS = new Set(BOSSES.map((b) => b.art));
const BOSS_SHORT = { skeleton_general: '+5 damage', vore: 'Hurl to trap', raskon: '10 to all', enguxi: '−1 die', ikias_boss: 'Double misses' };

/** banner name size in cqw: as large as fits the plate */
const nameSize = (s) => Math.min(9.6, +(62 / (Math.max(4, s.length) * 0.6)).toFixed(2));
/** effect text size in cqw for the panel under the banner */
const textSize = (n) => (n <= 18 ? 7.4 : n <= 34 ? 6.6 : n <= 55 ? 5.8 : n <= 80 ? 5.2 : n <= 110 ? 4.7 : 4.3);
/** ability panel text size in cqw */
const abilitySize = (n) => (n <= 70 ? 7 : n <= 110 ? 6.4 : n <= 160 ? 5.8 : n <= 200 ? 5.1 : 4.8);

const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
const dieIcon = (n, cls = '') => `<svg class="cs-d ${cls}" viewBox="0 0 100 100" aria-label="${n}"><rect x="7" y="7" width="86" height="86" rx="22" fill="#fff8e8" stroke="#140c1e" stroke-width="11"/>${(PIPS[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#140c1e"/>`).join('')}</svg>`;

const sky = () => '<div class="cs-win"><i class="cs-sun"></i><i class="cs-rays"></i><i class="cs-hill"></i></div>';
const frame = () => `<img class="cs-frame" src="${UI}v3/rockframe.webp" alt="" draggable="false">`;
const banner = (name, tag) => `<div class="cs-ban"><img src="${UI}v3/banner.webp" alt="" draggable="false"><b style="font-size:${nameSize(name)}cqw">${esc(name)}</b>${tag ? `<small>${esc(tag)}</small>` : ''}</div>`;
const extras = (legend) => `${legend ? '<span class="cs-leg">Legendary</span><i class="cs-foil"></i>' : ''}<i class="cs-shine"></i>`;
const shell = (kind, cls, inner, { legend = false, label = '' } = {}) => `<div class="card cs k-${kind} ${legend ? 'cs-legend' : ''} ${cls}" data-kind="${kind}"${label ? ` aria-label="${esc(label)}"` : ''}><div class="cs-in"><div class="cs-wall"></div>${inner}${extras(legend)}</div></div>`;

const stat = (type, v, hurt) => `<div class="cs-stat cs-${type}${hurt ? ' hurt' : ''}"><img src="${UI}${type === 'atk' ? 'sword' : 'heart'}.webp" alt="${type === 'atk' ? 'Attack' : 'Health'}" draggable="false"><b>${esc(v)}</b></div>`;

const kindOfArt = (art) => (HERO_ARTS.has(art) ? 'hero' : BOSS_ARTS.has(art) ? 'boss' : 'monster');

/** Character card: hero, monster or boss front. */
export function charCard({ art, name, atk, hp, maxHp, cls = '', kind, tag, mid = '', floor, legend = false }) {
  const k = kind || kindOfArt(art);
  const hurt = maxHp != null && hp < maxHp;
  const inner = `${sky()}<div class="cs-art"><img src="${charUrl(art)}" alt="${esc(name)}" draggable="false"></div>${frame()}
    ${banner(name, tag ?? (k === 'boss' ? 'Boss' : k === 'hero' ? 'Hero' : 'Monster'))}
    <div class="cs-stats">${stat('atk', atk)}${mid ? `<div class="cs-mid">${mid}</div>` : ''}${stat('hp', hp, hurt)}</div>
    ${floor ? `<span class="cs-floor">Floor ${esc(floor)}</span>` : ''}`;
  return shell(k, cls, inner, { legend, label: name });
}

/** Text effect card: art in the sky window, banner title, effect under it. */
function effectCard({ kind, name, tag, art, text, when, cls = '', legend = false }) {
  const inner = `${sky()}<div class="cs-art ${art.startsWith('<svg') ? 'svg' : ''}">${art}</div>${frame()}${banner(name, tag)}
    <div class="cs-text" style="font-size:${textSize(text.length)}cqw"><div class="cs-p">${esc(text)}</div>${when ? `<small>${esc(when)}</small>` : ''}</div>`;
  return shell(kind, cls, inner, { legend, label: name });
}

/** Ability card (hero / boss backs and generic text cards). lines: string | string[] */
function abilityCard({ kind, title, tag, lines, art, foot, cls = '' }) {
  const arr = (Array.isArray(lines) ? lines : [lines]).map(String);
  const n = arr.join(' ').length;
  const body = arr.map((l) => {
    const m = l.match(/^(\d):\s*(.*)$/);
    return m ? `<div class="cs-ln">${dieIcon(+m[1])}<span>${esc(m[2])}</span></div>` : `<div class="cs-note">${esc(l)}</div>`;
  }).join('');
  const size = abilitySize(n) + (arr.length === 1 ? 0.7 : 0);
  const inner = `${sky()}<div class="cs-panel" style="font-size:${size}cqw"><div class="cs-pin">${body}</div></div>${frame()}
    ${banner(title, tag)}
    <div class="cs-foot">${art ? `<span class="cs-med"><img src="${charUrl(art)}" alt="" draggable="false"></span>` : ''}${foot || ''}</div>`;
  return shell(kind, `cs-ability ${cls}`, inner, { label: `${title} ${tag || ''}` });
}

/** Generic text card (kept for callers): title + lines, ability layout. */
export function textCard({ title, lines, cls = '', foot = '' }) {
  const k = KINDS.find((x) => cls.split(/\s+/).includes(x)) || 'hero';
  return abilityCard({ kind: k, title: String(title), tag: foot, lines, cls });
}

/** Card back: dragon emblem in the sky window, word on the banner, a die below. */
export function cardBack(word, cls = '') {
  const w = String(word);
  const k = KINDS.includes(w.toLowerCase()) ? w.toLowerCase() : 'hero';
  const inner = `<div class="cs-win cs-backsky"><i class="cs-rays"></i></div><div class="cs-emb-ink"></div><div class="cs-emb"></div>${frame()}
    ${banner(w)}<div class="cs-bdie">${dieIcon(5)}</div>`;
  return shell(k, `cs-back back ${cls}`, inner, { label: `${w} card back` });
}

// ---------------------------------------------------------------- heroes
const trig = (nums, label) => `<span class="cs-trig"><i>${esc(label)}</i><span>${nums.map((n) => dieIcon(n)).join('')}</span></span>`;
export const heroFront = (id, hp) => {
  const h = heroDef(id);
  const nm = h.short || h.name;
  return charCard({ art: h.art, name: nm, atk: h.atk, hp: hp ?? h.hp, maxHp: h.hp, kind: 'hero', tag: `Hero · ${h.role}`, mid: `<i>${h.triggers.join(' · ')}</i>${esc(h.role)}` });
};
export const heroBack = (id) => {
  const h = heroDef(id);
  return abilityCard({ kind: 'hero', title: 'Hero', tag: h.name, lines: h.skill, art: h.art, foot: trig(h.triggers, 'Skill check') });
};

// ---------------------------------------------------------------- bosses / monsters
export const monsterCard = (id, hp) => {
  const m = MONSTERS.find((x) => x.id === id);
  return charCard({ art: m.art, name: m.name, atk: m.atk, hp: hp ?? m.hp, maxHp: m.hp, kind: 'monster', tag: 'Monster', legend: m.count === 1 });
};
export const bossFront = (b, hp) => charCard({ art: b.art, name: b.name, atk: b.atk, hp: hp ?? b.hp, maxHp: b.hp, kind: 'boss', tag: `Boss · Floor ${b.floor}`, floor: b.floor,
  mid: `<i>Every 3rd</i>${esc(BOSS_SHORT[b.id] || 'Skill')}` });
export const bossBack = (b) => abilityCard({ kind: 'boss', title: 'Boss', tag: `${b.name} · Floor ${b.floor}`, lines: b.skill, art: b.art,
  foot: `<span class="cs-trig"><i>Every</i><span class="cs-third">3rd</span><i>battle roll</i></span>` });

// ---------------------------------------------------------------- treasures / traps
const WHEN = { turn: 'Your turn', battle: 'Battle', pvp: 'PvP' };
const whenOf = (d) => (d.kind === 'pet' ? 'Pet · Always equipped' : d.kind === 'reactive' ? 'When you land on a trap' : d.kind === 'auto' ? 'Triggers by itself'
  : d.when.map((w) => WHEN[w]).join(' · ') + (d.boss ? ' · Boss' : d.monster ? ' · Monster' : ''));

export const treasureCard = (id, cls = '') => {
  const d = treasureDef(id);
  if (d.kind === 'pet') {
    return effectCard({ kind: 'pet', name: d.name, tag: 'Pet', art: `<img src="${charUrl(PET_ART[id])}" alt="${esc(d.name)}" draggable="false">`,
      text: d.text.replace(/^Pet\.\s*/, ''), when: whenOf(d), cls: `pet ${cls}`, legend: d.count === 1 });
  }
  return effectCard({ kind: 'treasure', name: d.name, tag: 'Treasure', art: treasureArt(id), text: d.text, when: whenOf(d), cls: `treasure ${cls}`, legend: d.count === 1 });
};
export const trapCard = (id, cls = '') => {
  const d = trapDef(id);
  return effectCard({ kind: 'trap', name: d.name, tag: 'Trap', art: trapArt(id), text: d.text, when: 'On landing', cls: `trap ${cls}`, legend: d.count === 1 });
};

export { BOSSES };
