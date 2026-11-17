// Fallback menus used only if js/menus.js is not available.
import { HEROES, MONSTERS, BOSSES, TREASURES, TRAPS, MODES, heroDef, sumCounts } from './data.js';
import { heroFront, heroBack, treasureCard, trapCard, monsterCard, bossFront, bossBack, cardBack } from './cards.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const artUrl = (a) => `assets/chars/${a}.webp`;
let hooks = {};
export function show(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); }
function closeModal() { $('#modal').classList.add('hidden'); }
function openModal(html) {
  $('#modalBody').innerHTML = `<button class="icon-btn close" data-close>X</button>${html}`;
  $('#modal').classList.remove('hidden');
  $$('[data-close]', $('#modal')).forEach((b) => (b.onclick = closeModal));
}
// ---------------- Title ----------------
$('#titleHeroes').innerHTML = ['luke', 'yessi', 'chan_kong', 'nowtna', 'shi', 'josue'].map((a) => `<img src="${artUrl(a)}" alt="">`).join('');
export function initLegacyMenus(h) { hooks = h;
$('#btnNew').onclick = () => { renderSetup(); show('setup'); };
$('#btnRules').onclick = () => openRules();
$('#btnGallery').onclick = () => openGallery();
$$('[data-back]').forEach((b) => (b.onclick = () => show('title')));
$('#btnStart').onclick = beginGame;
}

export function openGallery() {
  const sec = (t, items) => `<h3>${t}</h3><div class="gallery">${items.join('')}</div>`;
  const withCount = (html, n) => `<div>${html}<div class="cnt">×${n}</div></div>`;
  openModal(`<h2>Card Gallery</h2>
    ${sec('Card backs', ['Hero', 'Monster', 'Boss', 'Treasure', 'Trap'].map((w) => cardBack(w)))}
    ${sec('Heroes', HEROES.flatMap((h) => [heroFront(h.id), heroBack(h.id)]))}
    ${sec(`Monsters (${sumCounts(MONSTERS)} cards)`, MONSTERS.map((m) => withCount(monsterCard(m.id), m.count)))}
    ${sec('Bosses', BOSSES.flatMap((b) => [bossFront(b), bossBack(b)]))}
    ${sec(`Treasures (${sumCounts(TREASURES)} cards)`, TREASURES.map((t) => withCount(treasureCard(t.id), t.count)))}
    ${sec(`Traps (${sumCounts(TRAPS)} cards)`, TRAPS.map((t) => withCount(trapCard(t.id), t.count)))}`);
}

export function openRules() {
  openModal(`<h2>How to Play</h2><div class="rules">
  <p><b>Goal:</b> Fight through five dungeon floors. Whoever lands the killing blow on a floor's boss claims its Relic. When the fifth boss falls, the player or guild holding the most Relics wins.</p>
  <h3>Your turn</h3>
  <ol><li>Pets are equipped automatically. Play any treasure cards you want.</li>
  <li>Roll 2 dice and move by one of them. On doubles you may move the total. Moving is mandatory and you never need an exact roll for the Boss Room.</li>
  <li>Resolve the tile: <b>Monster</b> (fight), <b>Treasure</b> (draw), <b>Trap</b> (suffer it), or a safe room.</li></ol>
  <h3>Combat</h3>
  <p>Play treasures, roll your Skill Check (your hero's numbers trigger the skill once per battle), then roll battle dice.</p>
  <table><tr><th>Roll</th><th>Result</th></tr><tr><td>6</td><td>Critical hit: deal 2</td></tr><tr><td>4–5</td><td>Hit: deal 1</td></tr><tr><td>2–3</td><td>Miss: take the enemy's attack</td></tr><tr><td>1</td><td>Critical miss: take double</td></tr></table>
  <p><b>Monsters:</b> roll one die per HP they have left and keep rolling until one of you falls. Beat it to draw a treasure.<br>
  <b>Bosses:</b> roll 5 dice, one round per turn. Every 3rd roll in the room (counted across all players) the boss's skill fires.</p>
  <h3>PvP</h3><p>Land on a tile with other players (not Start or the Boss Room) and everyone not in your guild fights. Highest roll deals 5 damage to everyone else. Ties re-roll for +5 more each time.</p>
  <h3>Death</h3><p>Respawn at Start with 40 HP and draw a fresh treasure. A player who kills you takes everything. A monster sends your treasures to the discard. A boss keeps them in the Boss Room for whoever beats it. A trap leaves them on the tile.</p>
  <h3>Guilds</h3><p>4+ players only. Play a Guild Banner to invite others (max half the players). Guild members don't fight each other, can reroll each other's failed dice once per battle, and count their Relics together.</p>
  </div>`);
}

// ---------------- Setup ----------------
const setup = {
  mode: 'standard',
  slots: [
    { type: 'human', hero: 'random', name: '' },
    { type: 'bot', hero: 'random', name: '' },
    { type: 'bot', hero: 'random', name: '' },
    { type: 'bot', hero: 'random', name: '' },
    { type: 'off', hero: 'random', name: '' },
    { type: 'off', hero: 'random', name: '' },
  ],
};
function renderSetup() {
  $('#modes').innerHTML = MODES.map((m) => `<div class="mode ${setup.mode === m.id ? 'sel' : ''}" data-mode="${m.id}"><b>${m.name}</b><span>${m.text}</span></div>`).join('');
  $$('.mode').forEach((el) => (el.onclick = () => { setup.mode = el.dataset.mode; renderSetup(); }));
  $('#slots').innerHTML = setup.slots.map((s, i) => {
    const h = s.hero !== 'random' ? heroDef(s.hero) : null;
    return `<div class="slot ${s.type === 'off' ? 'off' : ''}">
      <div class="portrait" data-pick="${i}" style="${h ? `background-image:url(${artUrl(h.art)})` : ''}">${h ? '' : '?'}</div>
      <div>
        <div class="seg">${['human', 'bot', 'off'].map((t) => `<button data-slot="${i}" data-type="${t}" class="${s.type === t ? 'on' : ''}">${t === 'human' ? 'Human' : t === 'bot' ? 'Bot' : 'Off'}</button>`).join('')}</div>
        <input data-name="${i}" placeholder="${h ? h.short || h.name : 'Player ' + (i + 1)}" value="${esc(s.name)}" maxlength="16">
        <div class="heroname">${h ? `${h.name} · ${h.role}` : 'Random hero'} — tap portrait to choose</div>
      </div></div>`;
  }).join('');
  $$('[data-type]').forEach((b) => (b.onclick = () => { setup.slots[+b.dataset.slot].type = b.dataset.type; renderSetup(); }));
  $$('[data-name]').forEach((inp) => (inp.oninput = () => { setup.slots[+inp.dataset.name].name = inp.value; }));
  $$('[data-pick]').forEach((el) => (el.onclick = () => pickHero(+el.dataset.pick)));
}
function pickHero(i) {
  const taken = setup.slots.filter((s, j) => j !== i && s.type !== 'off').map((s) => s.hero);
  openModal(`<h2>Choose a Hero</h2><div class="pick-grid">
    <button data-h="random"><div style="font-family:var(--title);font-size:22px;padding:30px 0">Random</div></button>
    ${HEROES.map((h) => `<button data-h="${h.id}" class="${taken.includes(h.id) ? 'taken' : ''}">${heroFront(h.id)}${heroBack(h.id)}</button>`).join('')}
  </div>`);
  $$('[data-h]', $('#modal')).forEach((b) => (b.onclick = () => { setup.slots[i].hero = b.dataset.h; if (setup.slots[i].type === 'off') setup.slots[i].type = 'human'; closeModal(); renderSetup(); }));
}
function beginGame() {
  const active = setup.slots.filter((s) => s.type !== 'off');
  if (!active.length) { alert('Add at least one player.'); return; }
  const used = new Set(active.map((s) => s.hero).filter((h) => h !== 'random'));
  const pool = HEROES.map((h) => h.id).filter((h) => !used.has(h)).sort(() => Math.random() - 0.5);
  const players = active.map((s) => {
    const hero = s.hero === 'random' ? pool.pop() : s.hero;
    return { hero, bot: s.type === 'bot', name: s.name.trim() || heroDef(hero).short || heroDef(hero).name };
  });
  hooks.startGame({ mode: setup.mode, players, speed: +$('#speed').value });
};

