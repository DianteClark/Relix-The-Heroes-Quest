// Card rendering, rebuilt from the designer's frame art so text stays crisp
// and numbers can update live.
import { heroDef, treasureDef, trapDef, BOSSES, MONSTERS } from './data.js';

const DIE = `<svg class="c-die" viewBox="0 0 100 100"><g transform="rotate(16 50 50)"><rect x="12" y="12" width="76" height="76" rx="10" fill="#a39b00" stroke="#7d7600" stroke-width="5"/><rect x="20" y="20" width="60" height="60" rx="6" fill="none" stroke="#5c5046" stroke-width="3" opacity=".35"/><circle cx="32" cy="66" r="7.5" fill="#5c5046"/><circle cx="50" cy="50" r="7.5" fill="#5c5046"/><circle cx="68" cy="34" r="7.5" fill="#5c5046"/></g></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function charCard({ art, name, atk, hp, maxHp, cls = '' }) {
  const hpTxt = maxHp != null && hp !== maxHp ? `${hp}` : `${hp}`;
  return `<div class="card char ${cls}">
    <img class="c-frame" src="assets/ui/frame_char.webp" alt="">
    <div class="c-art"><img src="assets/chars/${art}.webp" alt="${esc(name)}"></div>
    <div class="c-name"><span>${esc(name)}</span></div>
    <div class="c-stat c-atk"><img src="assets/ui/sword.webp" alt=""><b>${atk}</b></div>
    <div class="c-stat c-hp"><img src="assets/ui/heart.webp" alt=""><b>${hpTxt}</b></div>
  </div>`;
}

const titleSize = (rest) => { const w = Math.max(...rest.split(' ').map((x) => x.length)); return Math.min(11, +(38 / (w * 0.68)).toFixed(2)); };
const bodySize = (n) => (n > 200 ? 4.5 : n > 150 ? 5 : n > 90 ? 5.7 : 6.4);

export function textCard({ title, lines, cls = '', foot = '' }) {
  const t = String(title).toUpperCase();
  const arr = Array.isArray(lines) ? lines : [lines];
  const body = arr.map((l) => `<p>${esc(l).toUpperCase()}</p>`).join('');
  const n = arr.join(' ').length;
  return `<div class="card text ${cls}">
    <img class="c-frame" src="assets/ui/frame_text.webp" alt="">
    <div class="c-title"><span class="c-letter"><img src="assets/ui/letterbox.webp" alt=""><i>${esc(t[0])}</i></span><span class="c-rest" style="font-size:${titleSize(t.slice(1))}cqw">${esc(t.slice(1))}</span></div>
    <div class="c-body" style="font-size:${bodySize(n)}cqw">${body}</div>
    ${foot ? `<div class="c-foot">${esc(foot)}</div>` : ''}
    ${DIE}
  </div>`;
}

export function cardBack(word, cls = '') {
  const t = word.toUpperCase();
  return `<div class="card back ${cls}">
    <img class="c-frame" src="assets/ui/frame_text.webp" alt="">
    <div class="c-title"><span class="c-letter"><img src="assets/ui/letterbox.webp" alt=""><i>${t[0]}</i></span><span class="c-rest" style="font-size:${titleSize(t.slice(1))}cqw">${t.slice(1)}</span></div>
    <img class="c-dragon" src="assets/ui/dragon.webp" alt="">
    ${DIE}
  </div>`;
}

export const heroFront = (id, hp) => { const h = heroDef(id); return charCard({ art: h.art, name: h.name, atk: h.atk, hp: hp ?? h.hp }); };
export const heroBack = (id) => textCard({ title: 'Hero', lines: heroDef(id).skill });
export const treasureCard = (id, cls = '') => {
  const d = treasureDef(id);
  if (d.kind === 'pet') {
    const art = { pet_golem: 'golem_1', pet_tezuki: 'kitsune_3', pet_kezz: 'goblin_3' }[id];
    return `<div class="card char pet ${cls}">
      <img class="c-frame" src="assets/ui/frame_char.webp" alt="">
      <div class="c-art"><img src="assets/chars/${art}.webp" alt=""></div>
      <div class="c-name"><span>${esc(d.name)}</span></div>
      <div class="c-pettext">${esc(d.text.replace(/^Pet\. /, '')).toUpperCase()}</div>
    </div>`;
  }
  return textCard({ title: d.name, lines: d.text, cls: 'treasure ' + cls, foot: 'Treasure' });
};
export const trapCard = (id, cls = '') => { const d = trapDef(id); return textCard({ title: d.name, lines: d.text, cls: 'trap ' + cls, foot: 'Trap' }); };
export const monsterCard = (id, hp) => { const m = MONSTERS.find((x) => x.id === id); return charCard({ art: m.art, name: m.name, atk: m.atk, hp: hp ?? m.hp }); };
export const bossFront = (b, hp) => charCard({ art: b.art, name: b.name, atk: b.atk, hp: hp ?? b.hp });
export const bossBack = (b) => textCard({ title: 'Boss', lines: b.skill });
export { BOSSES };
