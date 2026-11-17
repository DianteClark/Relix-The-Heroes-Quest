import { Game } from './engine.js';
import { HEROES, MONSTERS, BOSSES, TREASURES, TRAPS, MODES, heroDef, treasureDef, trapDef, sumCounts } from './data.js';
import { BoardView } from './render3d.js';
import { heroFront, heroBack, treasureCard, trapCard, monsterCard, bossFront, bossBack, cardBack, charCard } from './cards.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artUrl = (a) => `assets/chars/${a}.webp`;

function show(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); }

// ---------------- Title ----------------
$('#titleHeroes').innerHTML = ['luke', 'yessi', 'chan_kong', 'nowtna', 'shi', 'josue'].map((a) => `<img src="${artUrl(a)}" alt="">`).join('');
$('#btnNew').onclick = () => { renderSetup(); show('setup'); };
$('#btnRules').onclick = () => openRules();
$('#btnGallery').onclick = () => openGallery();
$$('[data-back]').forEach((b) => (b.onclick = () => show('title')));

// ---------------- Modal ----------------
function openModal(html) {
  $('#modalBody').innerHTML = `<button class="icon-btn close" data-close>✕</button>${html}`;
  $('#modal').classList.remove('hidden');
  $$('[data-close]', $('#modal')).forEach((b) => (b.onclick = closeModal));
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

function openGallery() {
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

function openRules() {
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
    <button data-h="random"><div style="font-family:var(--title);font-size:22px;padding:30px 0">🎲 Random</div></button>
    ${HEROES.map((h) => `<button data-h="${h.id}" class="${taken.includes(h.id) ? 'taken' : ''}">${heroFront(h.id)}${heroBack(h.id)}</button>`).join('')}
  </div>`);
  $$('[data-h]', $('#modal')).forEach((b) => (b.onclick = () => { setup.slots[i].hero = b.dataset.h; if (setup.slots[i].type === 'off') setup.slots[i].type = 'human'; closeModal(); renderSetup(); }));
}
$('#btnStart').onclick = () => {
  const active = setup.slots.filter((s) => s.type !== 'off');
  if (!active.length) { alert('Add at least one player.'); return; }
  const used = new Set(active.map((s) => s.hero).filter((h) => h !== 'random'));
  const pool = HEROES.map((h) => h.id).filter((h) => !used.has(h)).sort(() => Math.random() - 0.5);
  const players = active.map((s) => {
    const hero = s.hero === 'random' ? pool.pop() : s.hero;
    return { hero, bot: s.type === 'bot', name: s.name.trim() || heroDef(hero).short || heroDef(hero).name };
  });
  startGame({ mode: setup.mode, players, speed: +$('#speed').value });
};

// ---------------- Game ----------------
let game, view, viewer = null, logOpen = false;
const ui = { combat: null, diceTimer: null, toastTimer: null };

function startGame(config) {
  show('game');
  $('#logList').innerHTML = '';
  if (!view) view = new BoardView($('#board'));
  game = new Game(config, io);
  window.relix = game;
  viewer = game.players.find((p) => !p.isBot) || null;
  game.run().then((r) => setTimeout(() => showEnd(r), 1200)).catch((e) => { console.error(e); toast(`Error: ${e.message}`, 'red'); });
}

const io = {
  log(msg, cls = '') {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = msg;
    const list = $('#logList');
    list.appendChild(d);
    if (list.children.length > 400) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
    if (cls === 'death') toast(msg.replace('☠ ', ''), 'red');
    if (cls === 'victory') toast(msg.replace(/★/g, '').trim(), 'gold');
  },
  event(type, data) { onEvent(type, data); },
  pause(ms) { return sleep(ms); },
  async dice(p, values, label, opts) { await showDice(p, values, label, opts); },
  choose(p, req) { return humanChoose(p, req); },
  async botChoice(p, req, ans) {
    if (req.kind === 'move' && view) {
      const o = req.options.find((x) => x.id === ans);
      if (o) { view.highlight([o.dest]); await sleep(300 * game.speed); view.clearHighlight(); }
    }
  },
};

function onEvent(type, d) {
  switch (type) {
    case 'floor':
      view.setFloor(game);
      $('#floorNum').textContent = `Floor ${game.floor}`;
      $('#floorName').textContent = game.boss.def.theme.name;
      toast(`Floor ${game.floor}<br><small style="font-size:.55em">${game.boss.def.theme.name}</small>`, 'gold');
      break;
    case 'turn':
      view.setActive(d.player);
      if (!game.players[d.player].isBot) viewer = game.players[d.player];
      break;
    case 'move':
      view.movePlayer(d.player, d.from, d.to, d.how, game.speed);
      break;
    case 'respawn': case 'out': case 'revive': case 'board':
      view.syncPlayers(game, true);
      break;
    case 'hp':
      if (d.delta < 0) view.flash(d.player, 'hurt'); else view.flash(d.player, 'heal');
      floatText(d.player, d.delta);
      break;
    case 'skill': view.flash(d.player, 'skill'); break;
    case 'fx': view.fx(d.kind, d.at); break;
    case 'trap':
      view.fx('trap', game.players[d.player].pos);
      toastCard(trapCard(d.card.id), `${game.players[d.player].name} sprang a trap!`, 'green');
      break;
    case 'combat':
      ui.combat = { player: d.player, enemy: d.enemy };
      view.showEnemy(game.players[d.player].pos, d.boss ? null : d.enemy.art, d.boss);
      break;
    case 'enemy':
      if (ui.combat) ui.combat.enemy.hp = d.hp;
      if (d.dealt) view.hitEnemy();
      break;
    case 'combatEnd':
      ui.combat = null;
      view.hideEnemy();
      break;
    case 'bossSkill':
      toastCard(bossBack(game.boss.def), `${game.boss.def.name}'s skill!`, 'red');
      break;
    case 'bossDown':
      view.fx('relic', game.bossIdx);
      break;
    case 'pvp':
      view.fx('bomb', d.at);
      toast('⚔ PvP!', 'red');
      break;
    case 'draw':
      view.fx('loot', game.players[d.player].pos);
      break;
  }
  if (['equip', 'play', 'hand', 'draw', 'guilds', 'bossDown', 'respawn', 'revive'].includes(type)) view.syncPlayers(game);
  if (['hand', 'respawn', 'floor', 'move'].includes(type)) view.syncLoot(game);
  renderHud();
}

function hpClass(p) { return p.hp / p.maxHp < 0.3 ? 'low' : ''; }
function relicGems(n, total = 5) { return `<span class="relics">${Array.from({ length: total }, (_, i) => `<i class="gem ${i < n ? 'on' : ''}"></i>`).join('')}</span>`; }

function renderHud() {
  if (!game || !game.board) return;
  const b = game.boss;
  $('#bossMini').innerHTML = `<div class="face" style="background-image:url(${artUrl(b.def.art)})"></div>
    <div class="info"><b>${b.def.name}</b><small>${b.hp}/${b.maxHp} HP · roll ${b.rolls % 3}/3${b.minus ? ` · −${b.minus} dice` : ''}</small>
    <div class="bar"><i style="width:${(100 * b.hp) / b.maxHp}%"></i></div></div>`;
  $('#bossMini').onclick = () => openModal(`<h2>${b.def.name}</h2><div class="card-pair">${bossFront(b.def, b.hp)}${bossBack(b.def)}</div>`);

  $('#players').innerHTML = game.order.map((id) => {
    const p = game.players[id];
    const g = game.guildOf(p);
    const st = [];
    if (p.skip) st.push(`⏳${p.skip}`);
    if (p.fx.letDown) st.push('💔');
    if (p.fx.skillBlocked) st.push('🚫');
    if (p.fx.doubleBattle) st.push('⚔');
    if (p.pos === game.bossIdx && game.active(p)) st.push('👑');
    return `<div class="pchip ${game.current === p ? 'turn' : ''} ${!game.active(p) ? 'out' : ''}" data-pid="${p.id}" style="${g ? `--gcol:${g.color}` : ''}">
      <div class="ph" style="background-image:url(${artUrl(heroDef(p.hero).art)})"></div>
      <div><div class="nm">${esc(p.name)} ${p.isBot ? '<span class="bot">BOT</span>' : ''}<small>${p.dead ? 'fallen' : p.out ? 'out' : ''}</small></div>
      <div class="row"><div class="bar hp ${hpClass(p)}"><i style="width:${(100 * p.hp) / p.maxHp}%"></i></div>${p.hp}</div>
      <div class="row"><span class="gemrow">${relicGems(p.relics.length, Math.max(5, p.relics.length))}</span><span class="gemcount">◆${p.relics.length}</span><span>🂠${p.hand.length}</span><span class="st">${st.join('')}</span></div></div></div>`;
  }).join('');
  $$('.pchip').forEach((el) => (el.onclick = () => showPlayer(game.players[+el.dataset.pid])));

  // Combat panel
  const c = $('#combat');
  if (ui.combat) {
    const p = game.players[ui.combat.player];
    const e = ui.combat.enemy;
    c.classList.remove('hidden');
    c.innerHTML = `<div class="side">${heroFront(p.hero, p.hp)}</div><div class="vs">VS</div>
      <div class="side">${charCard({ art: e.art, name: e.name, atk: e.atk, hp: e.hp })}<div class="bar ebar"><i style="width:${(100 * e.hp) / e.maxHp}%"></i></div></div>`;
  } else c.classList.add('hidden');

  renderHand();
}

function renderHand() {
  const p = viewer;
  const h = $('#hand');
  if (!p || !game) { h.innerHTML = ''; return; }
  const cards = [...p.equipped.map((c) => ({ c, eq: true })), ...p.hand.map((c) => ({ c, eq: false }))];
  h.innerHTML = cards.length ? `<span class="lbl">${esc(p.name)}</span>` + cards.map(({ c, eq }) => `<div class="${eq ? 'eq' : ''}" data-card="${c.id}">${treasureCard(c.id)}</div>`).join('') : '';
  $$('[data-card]', h).forEach((el) => (el.onclick = () => openModal(`<div class="card-pair">${treasureCard(el.dataset.card, 'big')}</div>`)));
}

function showPlayer(p) {
  const g = game.guildOf(p);
  openModal(`<h2>${esc(p.name)}</h2>
    <p>${p.hp}/${p.maxHp} HP · ${p.relics.length} Relic(s)${p.relics.length ? ': ' + p.relics.map((r) => r.name).join(', ') : ''}${g ? ` · Guild: <b style="color:${g.color}">${g.name}</b>${g.leader === p.id ? ' (leader)' : ''}` : ''}</p>
    <div class="card-pair">${heroFront(p.hero, p.hp)}${heroBack(p.hero)}</div>
    ${p.equipped.length ? `<h3>Equipped</h3><div class="gallery">${p.equipped.map((c) => treasureCard(c.id)).join('')}</div>` : ''}
    ${!p.isBot || !game.players.some((q) => !q.isBot) ? (p.hand.length ? `<h3>Hand</h3><div class="gallery">${p.hand.map((c) => treasureCard(c.id)).join('')}</div>` : '') : `<p>${p.hand.length} card(s) in hand.</p>`}`);
}

function floatText() { /* reserved for damage numbers */ }

// ---------------- Dice ----------------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, 90], 5: [0, -90], 3: [-90, 0], 4: [90, 0] };
function dieHtml() {
  return `<div class="die">${[1, 2, 3, 4, 5, 6].map((n) => `<div class="face f${n}">${Array.from({ length: 9 }, (_, i) => PIPS[n].includes(i) ? '<i></i>' : '<span></span>').join('')}</div>`).join('')}</div>`;
}
async function showDice(p, values, label, opts = {}) {
  if (game.speed < 0.05) return; // test mode
  clearTimeout(ui.diceTimer);
  const box = $('#dice');
  box.classList.remove('hidden');
  $('.dice-label', box).textContent = `${p.name}: ${label}`;
  const row = $('.dice-row', box);
  row.innerHTML = values.map(() => dieHtml()).join('');
  const dice = $$('.die', row);
  const sp = game.speed;
  dice.forEach((d) => { d.style.transition = 'none'; d.style.transform = `rotateX(${Math.random() * 720}deg) rotateY(${Math.random() * 720}deg)`; });
  void row.offsetWidth;
  const spin = Math.max(260, 900 * sp);
  dice.forEach((d, i) => {
    const [rx, ry] = FACE_ROT[values[i]];
    d.style.transition = `transform ${spin}ms cubic-bezier(.2,.8,.25,1.1)`;
    d.style.transform = `rotateX(${rx + 720}deg) rotateY(${ry + 720}deg)`;
  });
  await sleep(spin);
  if (opts.combat) dice.forEach((d, i) => d.classList.add(values[i] === 6 ? 'crit' : values[i] >= 4 ? 'hit' : values[i] === 1 ? 'cmiss' : 'miss'));
  if (opts.skill) {
    const hero = heroDef(p.hero);
    dice.forEach((d, i) => d.classList.add(hero.triggers.includes(values[i]) ? 'crit' : 'miss'));
  }
  const hold = p.isBot ? Math.max(250, 700 * sp) : 900;
  await sleep(hold);
  ui.diceTimer = setTimeout(() => box.classList.add('hidden'), 600);
}

// ---------------- Toasts ----------------
function toast(html, color = '') {
  const t = $('#toast');
  clearTimeout(ui.toastTimer);
  t.classList.remove('hidden');
  t.innerHTML = `<div class="msg ${color}">${html}</div>`;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  ui.toastTimer = setTimeout(() => t.classList.add('hidden'), Math.max(game?.speed < 0.05 ? 50 : 1200, 2200 * (game?.speed ?? 1)));
}
function toastCard(card, msg, color) {
  const t = $('#toast');
  clearTimeout(ui.toastTimer);
  t.classList.remove('hidden');
  t.innerHTML = `<div class="msg ${color}" style="font-size:22px">${esc(msg)}</div>${card}`;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  ui.toastTimer = setTimeout(() => t.classList.add('hidden'), Math.max(1400, 2600 * (game?.speed ?? 1)));
}

// ---------------- Human choices ----------------
function humanChoose(p, req) {
  viewer = p;
  renderHand();
  return new Promise((resolve) => {
    const box = $('#prompt');
    const cardOpts = req.options.filter((o) => o.card);
    const plain = req.options.filter((o) => !o.card);
    const multiHuman = game.players.filter((q) => !q.isBot).length > 1;
    box.innerHTML = `${multiHuman ? `<div class="who">${esc(p.name)}'s decision</div>` : ''}<h4>${esc(req.title)}</h4>${req.text ? `<p>${esc(req.text)}</p>` : ''}
      ${cardOpts.length ? `<div class="opt-cards">${cardOpts.map((o) => `<button class="opt-card" data-o="${o.id}" title="${esc(o.desc || '')}">${treasureCard(o.card.id)}</button>`).join('')}</div>` : ''}
      <div class="opts">${plain.map((o) => `<button class="opt ${o.primary ? 'primary' : ''}" data-o="${o.id}">${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</button>`).join('')}</div>`;
    box.classList.remove('hidden');
    const done = (id) => {
      box.classList.add('hidden');
      view.clearHighlight();
      resolve(id);
    };
    $$('[data-o]', box).forEach((b) => (b.onclick = () => done(b.dataset.o)));
    if (req.kind === 'move') {
      view.highlight(req.options.map((o) => o.dest), (tileIdx) => {
        const o = req.options.find((x) => x.dest === tileIdx);
        if (o) done(o.id);
      });
    }
  });
}

// ---------------- Top buttons ----------------
$('#btnLog').onclick = () => { logOpen = !logOpen; $('#log').classList.toggle('hidden', !logOpen); };
$('#btnLogClose').onclick = () => { logOpen = false; $('#log').classList.add('hidden'); };
$('#btnMenu').onclick = () => {
  openModal(`<h2>Menu</h2><div class="title-buttons">
    <button class="btn ghost" id="mRules">How to Play</button>
    <button class="btn ghost" id="mGallery">Card Gallery</button>
    <label style="font-weight:800">Game speed
      <select id="mSpeed" style="margin-left:8px;background:#1b1526;color:#fff;border:1px solid #4a3d5e;border-radius:8px;padding:6px">
        <option value="1">Normal</option><option value="0.5">Fast</option><option value="0.15">Turbo</option></select></label>
    <button class="btn danger" id="mQuit">Quit to Title</button></div>`);
  $('#mSpeed').value = String(game?.speed ?? 1);
  $('#mSpeed').onchange = (e) => { if (game) game.speed = +e.target.value; };
  $('#mRules').onclick = openRules;
  $('#mGallery').onclick = openGallery;
  $('#mQuit').onclick = () => { if (confirm('Quit this game?')) location.reload(); };
};

// ---------------- End ----------------
function showEnd(r) {
  show('end');
  const winners = r.winner ? r.winner.map((id) => game.players[id]) : [];
  $('#endBox').innerHTML = `<h1>${r.kind === 'loss' ? 'Defeat' : 'Victory!'}</h1>
    <div class="winners">${winners.map((p) => `<img src="${artUrl(heroDef(p.hero).art)}" alt="">`).join('')}</div>
    <p style="font-size:18px">${esc(r.text)}</p>
    <div>${r.scores.map((s) => `<div class="score"><b style="${s.color ? `color:${s.color}` : ''}">${esc(s.label)}${s.members.length > 1 ? ` <small style="color:var(--muted)">(${s.members.map((p) => esc(p.name)).join(', ')})</small>` : ''}</b>${relicGems(s.relics, Math.max(5, s.relics))}</div>`).join('')}</div>
    <p style="color:var(--muted);font-size:13px">${r.turns} turns · ${r.stats.deaths} deaths · ${r.stats.pvp} PvP battles</p>
    <div class="title-buttons" style="margin-top:16px"><button class="btn big" id="eAgain">Play Again</button><button class="btn ghost" id="eTitle">Title Screen</button></div>`;
  $('#eAgain').onclick = () => { renderSetup(); show('setup'); };
  $('#eTitle').onclick = () => show('title');
}

// Debug: ?demo starts a bot game immediately
const qs = new URLSearchParams(location.search);
if (qs.has('demo')) {
  const n = +qs.get('demo') || 4;
  startGame({ mode: qs.get('mode') || 'standard', speed: +(qs.get('speed') || 0.5), seed: qs.has('seed') ? +qs.get('seed') : undefined,
    players: HEROES.slice(0, n).map((h, i) => ({ hero: h.id, bot: !(qs.has('human') && i === 0), name: h.short || h.name })) });
}
