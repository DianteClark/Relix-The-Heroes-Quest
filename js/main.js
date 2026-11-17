// Relix: app shell. Wires the rules engine to the board, cinematics, dice,
// battle scenes, audio and menus. Team modules are loaded if present so the
// game always runs, even mid-integration.
import { Game } from './engine.js';
import { HEROES, heroDef, treasureDef } from './data.js';
import { BoardView } from './render3d.js';
import { heroFront, heroBack, treasureCard, bossFront, bossBack, charCard } from './cards.js';
import { Flow } from './flow.js';
import { haptics } from './haptics.js';
import { SEAT_BANNERS, DEFAULT_BANNER } from './cosmetics.js';
import { ICON } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artUrl = (a) => `assets/chars/${a}.webp`;

// ---------------- Team modules (optional) ----------------
const mods = {};
async function load(name, path) { try { mods[name] = await import(path); } catch (e) { if (!String(e).includes('Failed to fetch')) console.warn(name, e); } }
await Promise.all([
  load('dice', './dice3d.js'), load('battle', './battle.js'), load('audio', './audio.js'),
  load('menus', './menus.js'), load('profile', './profile.js'), load('banner', './banner.js'), load('guildui', './guildui.js'),
]);
const audio = mods.audio?.audio || { unlock() {}, sfx() {}, music() {}, stopMusic() {}, setVolume() {} };
const sfx = (n, o) => { try { audio.sfx(n, o); } catch { /* ignore */ } };
const profile = () => mods.profile?.loadProfile?.() || {
  banner: DEFAULT_BANNER, dice: 'bone', throwFx: 'dust', killFx: 'none', coins: 0,
  settings: { music: 0.7, sfx: 0.9, haptics: true, swipeDice: true, speed: 0.5, reducedMotion: false },
};
function applySettings() {
  const st = profile().settings || {};
  haptics.setEnabled(st.haptics !== false);
  document.body.classList.toggle('reduced-motion', !!st.reducedMotion);
  try { audio.setVolume({ music: st.music ?? 0.7, sfx: st.sfx ?? 0.9 }); } catch { /* ignore */ }
}
applySettings();
window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* ignore */ } }, { once: true });

// ---------------- Tap helper ----------------
// Fires on pointerup if the finger stayed within 16px. Ignores the follow-up
// synthetic click, so taps never double-fire or get lost to tiny finger drift.
// Ghost-click guard: after a handled tap, the browser fires a synthetic click
// ~0-300ms later at the same spot. If the UI changed in between (a new prompt
// replaced the buttons), that click would hit whatever is now under the finger.
// We swallow all clicks for a short window after any handled tap.
let lastTap = 0;
document.addEventListener('click', (e) => {
  if (performance.now() - lastTap < 450 && e.isTrusted) { e.stopPropagation(); e.preventDefault(); }
}, true);
export function onTap(el, fn) {
  let start = null;
  el.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), born: el._born || 0 }; });
  el.addEventListener('pointerup', (e) => {
    if (!start || start.id !== e.pointerId) return;
    const ok = Math.hypot(e.clientX - start.x, e.clientY - start.y) < 16;
    start = null;
    if (!ok) return;
    lastTap = performance.now();
    e.preventDefault();
    fn(e);
  });
  el.addEventListener('pointercancel', () => { start = null; });
  el.addEventListener('click', (e) => {
    if (performance.now() - lastTap < 450) return; // tap already handled
    fn(e); // keyboard / accessibility clicks
  });
}

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  document.body.classList.toggle('in-game', id === 'game');
}
// The action bar lives on <body> so prompts can rise above battle scenes.
document.body.appendChild($('#bottom'));
$('#btnMenu').innerHTML = ICON.menu;
$('#btnLogClose').innerHTML = ICON.close;

// ---------------- Menus ----------------
let legacy = null;
if (mods.menus?.initMenus) {
  mods.menus.initMenus({ startGame, audio });
} else {
  legacy = await import('./legacy-menus.js');
  legacy.initLegacyMenus({ startGame });
}
function backToTitle() {
  if (mods.menus?.showMenu) { show('title'); mods.menus.showMenu('title'); } else show('title');
  try { audio.preload?.(['title', 'menu', 'floor1']); audio.music('title'); } catch { /* ignore */ }
}

// ---------------- Modal ----------------
function openModal(html) {
  $('#modalBody').innerHTML = `<button class="icon-btn close" data-close aria-label="Close">${ICON.close}</button>${html}`;
  $('#modal').classList.remove('hidden');
  $$('[data-close]', $('#modal')).forEach((b) => onTap(b, closeModal));
  sfx('open');
}
function closeModal() { $('#modal').classList.add('hidden'); sfx('back'); }
$('#modal').addEventListener('pointerup', (e) => { if (e.target.id === 'modal') closeModal(); });

// ---------------- Game ----------------
let game, view, flow, tray, battle, viewer = null;
const cos = {}; // per-player cosmetics
const ui = { combat: null, hudQueued: false };

function startGame(config) {
  // Warm the image cache so fighters and cards never pop in late.
  ['chan_kong','josue','luke','nowtna','shi','yessi','skeleton_warrior','trov','dragonkin','brevha','ikias_monster','skeleton_general','vore','raskon','enguxi','ikias_boss','golem_1','golem_2','kitsune_1','kitsune_2','kitsune_3','goblin_1','goblin_2','goblin_3']
    .forEach((a) => { const im = new Image(); im.decoding = 'async'; im.src = artUrl(a); (window.__relixArt ||= []).push(im); });
  show('game');
  $('#logList').innerHTML = '';
  const prof = profile();
  config.speed = config.speed ?? prof.settings?.speed ?? 0.5;
  let firstHuman = true;
  config.players.forEach((pc, i) => {
    if (!pc.banner) pc.banner = (!pc.bot && firstHuman) ? prof.banner : { ...SEAT_BANNERS[i % SEAT_BANNERS.length], name: '' };
    const mine = !pc.bot && firstHuman;
    if (!pc.bot) firstHuman = false;
    cos[i] = mine ? { dice: prof.dice, throwFx: prof.throwFx, killFx: prof.killFx } : { dice: pc.bot ? 'obsidian' : 'bone', throwFx: 'dust', killFx: 'none' };
  });
  if (!view) {
    view = new BoardView($('#board'));
    view.onTileTap = null;
    window.relixView = view;
    if (mods.banner?.drawBanner) view.setBannerPainter((c, b) => mods.banner.drawBanner(c, b, { w: c.width, h: c.height }));
  }
  if (!flow) flow = new Flow({ sfx, haptics, speed: () => game?.speed ?? 1 });
  if (!tray && mods.dice?.DiceTray) tray = new mods.dice.DiceTray();
  if (!battle && mods.battle?.BattleScene) { battle = new mods.battle.BattleScene(); window.relixBattle = battle; }
  game = new Game(config, io);
  window.relix = game;
  window.relixDebug = { showEnd };
  if (battle) battle.speed = game.speed;
  try { tray?.warmup?.(prof.dice); } catch { /* ignore */ }
  viewer = game.players.find((p) => !p.isBot) || null;
  scheduleHud();
  game.run().then((r) => setTimeout(() => showEnd(r), 900)).catch((e) => { console.error(e); flow.banner(`Error: ${esc(e.message)}`, 'red'); });
}

const anyHuman = () => game.players.some((p) => !p.isBot);
const isHuman = (id) => !game.players[id].isBot;
const theme = () => game.boss.def.theme;

function fighter(p) {
  const h = heroDef(p.hero);
  return { id: 'p' + p.id, name: p.name, art: h.art, hp: p.hp, maxHp: p.maxHp, atk: h.atk, side: 'hero', banner: p.banner };
}
function foe(e) { return { id: e.id, name: e.name, art: e.art, hp: e.hp, maxHp: e.maxHp, atk: e.atk, side: 'enemy' }; }

const io = {
  log(msg, cls = '') {
    const d = document.createElement('div');
    d.className = cls ? 'lg-' + cls : '';
    d.textContent = msg;
    const list = $('#logList');
    list.appendChild(d);
    if (list.children.length > 400) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
    $('#ticker').textContent = msg;
  },
  event(type, data) { onEvent(type, data); },
  pause(ms) { return sleep(ms); },
  async dice(p, values, label, opts = {}) {
    const kind = opts.combat ? 'combat' : opts.skill ? 'skill' : opts.pvp ? 'pvp' : 'move';
    if (tray) {
      document.body.classList.add('rolling');
      try { await rollTray(p, values, label, opts, kind); } finally { document.body.classList.remove('rolling'); }
      return;
    }
    await legacyDice(p, values, label, opts);
  },
  choose(p, req) { return humanChoose(p, req); },
  async nameGuild(p, suggested) {
    if (mods.guildui?.nameGuild) return mods.guildui.nameGuild({ leader: { name: p.name, art: heroDef(p.hero).art }, banner: p.banner, suggested });
    return window.prompt('Name your guild', suggested) || suggested;
  },
  async botChoice(p, req, ans) {
    if (req.kind === 'move' && view) {
      const o = req.options.find((x) => x.id === ans);
      if (o) { view.highlight([o.dest]); await sleep(320 * game.speed); view.clearHighlight(); }
    }
  },
  async show(type, d) { return showBeat(type, d); },
};

async function rollTray(p, values, label, opts, kind) {
  const prof = profile();
  const swipe = !p.isBot && prof.settings?.swipeDice !== false && game.speed >= 0.05;
  await tray.roll({
    values, kind, mode: swipe ? 'swipe' : 'auto', label: battle?.isOpen ? '' : `${p.name} · ${label}`,
    triggers: opts.skill ? heroDef(p.hero).triggers : undefined,
    skin: cos[p.id]?.dice || 'bone', throwFx: cos[p.id]?.throwFx || 'dust',
    area: battle?.isOpen ? battle.diceArea() : undefined, speed: p.isBot ? game.speed : Math.max(game.speed, 0.6),
    reducedMotion: !!prof.settings?.reducedMotion,
  });
}

const TIPS = {
  move: ['Pick your path', 'You rolled two dice: move by either one. Doubles let you move the total. Tap a glowing tile.', 'luke'],
  monster: ['Monster fight!', 'Roll one die per HP the monster has left. 4-5 hits, 6 crits for double. 2-3 misses and you take damage, 1 hurts double.', 'skeleton_warrior'],
  boss: ['The Boss Room', 'Bosses take 5 dice every round, one round per turn. Every 3rd roll in the room fires the boss skill. Land the killing blow to claim the Relic!', 'skeleton_general'],
  trap: ['Trap!', 'Traps fire as soon as you land. A Trap Resist card can cancel one.', 'shi'],
  pvp: ['PvP!', 'Share a tile with a rival and you fight. Highest roll wins and deals 5 damage. Ties re-roll for +5 more.', 'chan_kong'],
  treasure: ['Treasure', 'Cards are played from the prompts when they can be used: at the start of your turn, before a battle roll, or before PvP.', 'goblin_3'],
};
const tipFor = (key, p) => (p && !p.isBot && game.speed >= 0.05 && TIPS[key] ? flow.tip(key, ...TIPS[key]) : null);

async function showBeat(type, d) {
  const p = d.player != null ? game.players[d.player] : null;
  switch (type) {
    case 'turnStart':
      view.setActive(p.id);
      if (!p.isBot) viewer = p;
      scheduleHud();
      if (game.speed < 0.2 && p.isBot) return;
      return flow.turn(p, { human: !p.isBot, guild: game.guildOf(p) });
    case 'cardReveal':
      if (p.isBot && game.speed < 0.2) return;
      if (!p.isBot && game.current === p) { await flow.cards(p, d.cards, { human: true, why: d.why }); return tipFor('treasure', p); }
      // Only the human whose turn it is sees the faces; everyone else sees card backs.
      return flow.cards(p, d.cards, { human: !p.isBot, why: d.why, hidden: p.isBot || game.current !== p });
    case 'trapReveal':
      await flow.trap(p, d.card, { human: !p.isBot });
      return tipFor('trap', p);
    case 'floorIntro':
      try { audio.music('floor' + d.floor); } catch { /* ignore */ }
      return flow.floor(d.floor, game.boss.def, { human: anyHuman() });
    case 'bossSkill':
      if (battle?.isOpen) await battle.skill('right', `${game.boss.def.name.toUpperCase()}'S SKILL!`);
      return flow.bossSkill(game.boss.def);
    case 'relic':
      try { audio.music('victory'); } catch { /* ignore */ }
      await flow.relic(p, d.relic, { human: !p.isBot });
      return;
    case 'combatStart':
      ui.combat = { player: p.id, enemy: d.enemy };
      if (d.kind === 'boss') { try { audio.music('boss'); } catch { /* ignore */ } }
      scheduleHud();
      if (battle) {
        haptics.impact(1);
        await battle.open({ left: fighter(p), right: foe(d.enemy), kind: d.kind, theme: theme() });
      } else await sleep(500 * game.speed);
      await tipFor(d.kind === 'boss' ? 'boss' : 'monster', p);
      return;
    case 'exchange': {
      if (!battle?.isOpen) return;
      const e = d.enemy;
      if (d.dealt > 0 || d.hits > 0) {
        await battle.strike('left', { dmg: d.dealt, crit: d.crits > 0, hp: Math.max(0, e.hp - d.dealt) });
        haptics.impact(d.crits > 0 ? 2 : 1);
      } else await battle.strike('left', { dmg: 0, miss: true });
      if (d.taken > 0) {
        await battle.strike('right', { dmg: d.taken, crit: d.cmiss > 0, hp: Math.max(0, p.hp - d.taken) });
        haptics.impact(d.cmiss > 0 ? 2 : 1);
      }
      return;
    }
    case 'skill':
      if (battle?.isOpen) return battle.skill(battle.sideOf?.(p) || (ui.combat?.player === p.id ? 'left' : ui.pvpLeft === p.id ? 'left' : 'right'), d.text);
      return flow.banner(d.text, 'gold');
    case 'defeat':
      if (battle?.isOpen) {
        const killer = d.side === 'enemy' ? p : null;
        await battle.defeat(d.side === 'enemy' ? 'right' : 'left', killer ? cos[killer.id]?.killFx || 'none' : 'none');
      }
      return;
    case 'combatEnd':
      ui.combat = null;
      scheduleHud();
      if (battle?.isOpen) await battle.close();
      try { if (!game.boss.defeated) audio.music('floor' + game.floor); } catch { /* ignore */ }
      return;
    case 'pvpStart': {
      if (!battle) return flow.banner('PvP!', 'red');
      const mover = game.players[d.mover];
      const other = d.sides.flat().map((id) => game.players[id]).find((q) => q !== mover && !game.sameGuild(q, mover));
      ui.pvpLeft = mover.id; ui.pvpRight = other.id;
      haptics.impact(2);
      await battle.open({ left: fighter(mover), right: { ...fighter(other), side: 'enemy' }, kind: 'pvp', theme: theme() });
      const hp = d.sides.flat().map((id) => game.players[id]).find((q) => !q.isBot);
      return tipFor('pvp', hp);
    }
    case 'pvpHit': {
      if (!battle?.isOpen) return;
      const loser = game.players[d.loser];
      const from = game.sameGuild(loser, game.players[ui.pvpLeft]) || loser.id === ui.pvpLeft ? 'right' : 'left';
      const to = from === 'left' ? 'right' : 'left';
      await battle.strike(from, { dmg: d.dmg, crit: !!d.crit });
      if (loser.id === ui.pvpLeft || loser.id === ui.pvpRight) battle.setHp(to, Math.max(0, loser.hp - d.dmg));
      haptics.impact(1);
      if (loser.hp - d.dmg <= 0 && (loser.id === ui.pvpLeft || loser.id === ui.pvpRight)) {
        const w = d.winner != null ? game.players[d.winner] : null;
        await battle.defeat(to, w ? cos[w.id]?.killFx || 'none' : 'none');
      }
      return;
    }
    case 'pvpEnd':
      ui.pvpLeft = ui.pvpRight = null;
      if (battle?.isOpen) await battle.close();
      return;
  }
}

// Floating numbers over heroes on the board (battle scenes show their own).
function floatAt(pid, text, cls) {
  if (!game || game.speed < 0.05 || battle?.isOpen) return;
  const pt = view?.screenOf?.(pid) || null;
  const el = document.createElement('div');
  el.className = `floatnum ${cls}`;
  el.textContent = text;
  el.style.left = (pt ? pt.x : innerWidth / 2) + (Math.random() - 0.5) * 18 + 'px';
  el.style.top = (pt ? pt.y : innerHeight * 0.45) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function onEvent(type, d) {
  switch (type) {
    case 'floor':
      view.setFloor(game);
      break;
    case 'move':
      view.movePlayer(d.player, d.from, d.to, d.how, game.speed);
      if (d.how === 'walk') sfx('step');
      break;
    case 'respawn': case 'out': case 'revive': case 'board':
      view.syncPlayers(game, true);
      break;
    case 'hp': {
      view.flash(d.player, d.delta < 0 ? 'hurt' : 'heal');
      floatAt(d.player, d.delta < 0 ? `${d.delta}` : `+${d.delta}`, d.delta < 0 ? 'dmg' : 'heal');
      sfx(d.delta < 0 ? 'hurt' : 'heal');
      if (battle?.isOpen) {
        const side = ui.combat?.player === d.player || ui.pvpLeft === d.player ? 'left' : ui.pvpRight === d.player ? 'right' : null;
        if (side) battle.setHp(side, game.players[d.player].hp);
      }
      if (d.delta < 0 && isHuman(d.player)) haptics.impact(1);
      break;
    }
    case 'enemy':
      if (ui.combat) ui.combat.enemy.hp = d.hp;
      if (battle?.isOpen) battle.setHp('right', d.hp);
      if (d.dealt) view.hitEnemy();
      break;
    case 'skill': view.flash(d.player, 'skill'); break;
    case 'fx': view.fx(d.kind, d.at); if (d.kind === 'bomb' || d.kind === 'yessi') { sfx('crit'); haptics.impact(2); } break;
    case 'trap': view.fx('trap', game.players[d.player].pos); break;
    case 'combat': view.showEnemy(game.players[d.player].pos, d.boss ? null : d.enemy.art, d.boss); break;
    case 'combatEnd': view.hideEnemy(); break;
    case 'bossDown': view.fx('relic', game.bossIdx); break;
    case 'draw': view.fx('loot', game.players[d.player].pos); floatAt(d.player, `+${d.cards.length} card${d.cards.length > 1 ? 's' : ''}`, 'loot'); break;
    case 'guilds': sfx('guild'); break;
  }
  if (['equip', 'play', 'hand', 'draw', 'guilds', 'bossDown', 'respawn', 'revive'].includes(type)) view.syncPlayers(game);
  if (['hand', 'respawn', 'floor', 'move'].includes(type)) view.syncLoot(game);
  scheduleHud();
}

// ---------------- HUD ----------------
function scheduleHud() {
  if (ui.hudQueued) return;
  ui.hudQueued = true;
  requestAnimationFrame(() => { ui.hudQueued = false; renderHud(); });
}
const hpClass = (p) => (p.hp / p.maxHp < 0.3 ? 'low' : '');
const gems = (n, total = 5) => `<span class="relics">${Array.from({ length: Math.max(total, n) }, (_, i) => `<i class="gem ${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
function bannerImg(b, w = 22, h = 32) {
  if (!b || !mods.banner?.bannerDataURL) return `<i class="mini-flag" style="--f:${b?.field || '#888'};--a:${b?.accent || '#fff'}"></i>`;
  ui.flagCache ||= {};
  const key = JSON.stringify(b) + w;
  ui.flagCache[key] ||= mods.banner.bannerDataURL(b, w * 3, h * 3);
  return `<img class="mini-flag-img" src="${ui.flagCache[key]}" alt="" width="${w}" height="${h}">`;
}

let lastHud = '';
function renderHud() {
  if (!game || !game.board) return;
  const b = game.boss;
  const bossHtml = `<div class="face" style="background-image:url(${artUrl(b.def.art)})"></div>
    <div class="info"><div class="bn"><b>${b.def.name}</b><small>${b.hp}/${b.maxHp}</small></div>
    <div class="bar boss"><i style="width:${(100 * b.hp) / b.maxHp}%"></i></div>
    <div class="pips">${[1, 2, 3].map((i) => `<i class="${(b.rolls % 3) >= i ? 'on' : ''}"></i>`).join('')}<span>skill</span>${b.minus ? `<em>−${b.minus} dice</em>` : ''}</div></div>`;
  const cur = game.current;
  const status = (p) => {
    const st = [];
    if (p.skip) st.push(`<i title="Skipping turns">${ICON.hourglass}${p.skip}</i>`);
    if (p.fx.letDown) st.push(`<i title="Let Down">${ICON.heartbreak}</i>`);
    if (p.fx.skillBlocked) st.push(`<i title="Skill blocked">${ICON.blocked}</i>`);
    if (p.fx.doubleBattle) st.push(`<i title="Double Battle">${ICON.swords}</i>`);
    return st.join('');
  };
  const face = (p) => `background-image:url(${artUrl(heroDef(p.hero).art)})`;
  const flagOf = (p) => { const g = game.guildOf(p); return g ? `<span class="gflag">${bannerImg(g.banner || { field: g.color })}</span>` : ''; };
  const hpTxt = (p) => (p.dead ? 'FALLEN' : p.out ? 'OUT' : p.hp);
  // 1) Turn order: faces only.
  const order = game.order.map((id, k) => {
    const p = game.players[id];
    const g = game.guildOf(p);
    return `<button class="tface ${cur === p ? 'turn' : ''} ${!game.active(p) ? 'out' : ''}" data-pid="${p.id}" aria-label="${esc(p.name)}" style="${face(p)};${g ? `--gcol:${g.color}` : ''}">${flagOf(p)}${cur === p ? '<i class="tarrow"></i>' : ''}</button>`;
  }).join('<i class="tsep"></i>');
  // 2) Everyone but the current player: compact cards down the left.
  const others = game.order.map((id) => game.players[id]).filter((p) => p !== cur).map((p) => {
    const g = game.guildOf(p);
    return `<button class="ochip ${!game.active(p) ? 'out' : ''}" data-pid="${p.id}" style="${g ? `--gcol:${g.color}` : ''}">
      <span class="ph" style="${face(p)}">${flagOf(p)}</span>
      <span class="oc-body"><span class="nm">${esc(p.name)}</span>
      <span class="bar hp ${hpClass(p)}"><i style="width:${(100 * p.hp) / p.maxHp}%"></i><b>${hpTxt(p)}</b></span>
      <span class="row"><span class="gemcount">${ICON.gem}${p.relics.length}</span><span class="cc">${ICON.card}${p.hand.length}</span>${status(p)}</span></span></button>`;
  }).join('');
  // 3) The current player: the big bar at the bottom.
  let me = '';
  if (cur) {
    const g = game.guildOf(cur);
    const n = cur.hand.length + cur.equipped.length;
    const canSee = !cur.isBot || !anyHuman();
    me = `<div class="me ${cur.isBot ? 'bot' : ''}" style="${g ? `--gcol:${g.color}` : ''}">
      <button class="me-ph" data-pid="${cur.id}" style="${face(cur)}" aria-label="${esc(cur.name)}">${flagOf(cur)}</button>
      <div class="me-body"><div class="me-top"><b>${esc(cur.name)}</b>${cur.isBot ? '<em>BOT</em>' : ''}${g ? `<span class="me-guild">${esc(g.name)}</span>` : ''}<span class="me-st">${status(cur)}</span></div>
        <div class="bar hp big ${hpClass(cur)}"><i style="width:${(100 * cur.hp) / cur.maxHp}%"></i><b>${hpTxt(cur)} / ${cur.maxHp}</b></div>
        <div class="me-row">${gems(cur.relics.length)}</div></div>
      <button class="me-cards" data-cards="${cur.id}" ${canSee ? '' : 'disabled'} aria-label="Cards"><span class="hb-cards">${Array.from({ length: Math.min(3, n) }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span><b>${n}</b></button></div>`;
  }
  const html = bossHtml + '|' + order + '|' + others + '|' + me;
  if (html !== lastHud) {
    lastHud = html;
    $('#bossMini').innerHTML = bossHtml;
    $('#players').innerHTML = order;
    $('#others').innerHTML = others;
    $('#me').innerHTML = me;
    $$('.tface, .ochip, .me-ph').forEach((el) => onTap(el, () => showPlayer(game.players[+el.dataset.pid])));
    $$('.me-cards').forEach((el) => onTap(el, () => showCards(game.players[+el.dataset.cards])));
  }
  $('#floorNum').textContent = `Floor ${game.floor}`;
  $('#floorName').textContent = b.def.theme.name;
  renderCombatFallback();
  renderHandButton();
}
onTap($('#bossMini'), () => game && openModal(`<h2>${game.boss.def.name}</h2><div class="card-pair">${bossFront(game.boss.def, game.boss.hp)}${bossBack(game.boss.def)}</div>`));

function renderCombatFallback() {
  const c = $('#combat');
  if (ui.combat && !battle) {
    const p = game.players[ui.combat.player];
    const e = ui.combat.enemy;
    c.classList.remove('hidden');
    c.innerHTML = `<div class="side">${heroFront(p.hero, p.hp)}</div><div class="vs">VS</div><div class="side">${charCard({ art: e.art, name: e.name, atk: e.atk, hp: e.hp })}</div>`;
  } else c.classList.add('hidden');
}

function renderHandButton() {}
function showCards(p) {
  if (!p) return;
  openModal(`<h2>${esc(p.name)}'s cards</h2>
    ${p.equipped.length ? `<h3>Equipped</h3><div class="gallery">${p.equipped.map((c) => treasureCard(c.id)).join('')}</div>` : ''}
    <h3>Hand</h3>${p.hand.length ? `<div class="gallery">${p.hand.map((c) => treasureCard(c.id)).join('')}</div>` : '<p>No cards in hand.</p>'}
    <p class="hint">Cards are played from the prompts when they can be used: at the start of your turn, before a battle roll, or before a PvP roll.</p>`);
}

function showPlayer(p) {
  const g = game.guildOf(p);
  const seeHand = !p.isBot || !anyHuman();
  openModal(`<h2>${esc(p.name)}</h2>
    <p>${p.hp}/${p.maxHp} HP · ${p.relics.length} Relic(s)${p.relics.length ? ': ' + p.relics.map((r) => esc(r.name)).join(', ') : ''}${g ? ` · Guild <b style="color:${g.color}">${esc(g.name)}</b>${g.leader === p.id ? ' (leader)' : ''}` : ''}</p>
    <div class="card-pair">${heroFront(p.hero, p.hp)}${heroBack(p.hero)}</div>
    ${p.equipped.length ? `<h3>Equipped</h3><div class="gallery">${p.equipped.map((c) => treasureCard(c.id)).join('')}</div>` : ''}
    ${seeHand ? (p.hand.length ? `<h3>Hand</h3><div class="gallery">${p.hand.map((c) => treasureCard(c.id)).join('')}</div>` : '') : `<p>${p.hand.length} card(s) in hand.</p>`}`);
}

// ---------------- Human choices ----------------
async function humanChoose(p, req) {
  if (req.kind === 'move') await tipFor('move', p);
  return humanChoose2(p, req);
}
function humanChoose2(p, req) {
  viewer = p;
  scheduleHud();
  if (req.kind === 'guild_accept' && mods.guildui?.inviteScroll) {
    const from = game.players[req.from];
    return mods.guildui.inviteScroll({ from: { name: from.name, art: heroDef(from.hero).art, banner: from.banner }, to: { name: p.name, art: heroDef(p.hero).art }, guildName: req.guildName });
  }
  return new Promise((resolve) => {
    const box = $('#prompt');
    const cardOpts = req.options.filter((o) => o.card);
    const plain = req.options.filter((o) => !o.card);
    const multiHuman = game.players.filter((q) => !q.isBot).length > 1;
    box.innerHTML = `${multiHuman ? `<div class="who" style="--gcol:${p.banner?.field || '#f2c443'}">${esc(p.name)}</div>` : ''}<h4>${esc(req.title)}</h4>${req.text ? `<p>${esc(req.text)}</p>` : ''}
      ${req.kind === 'move' ? '<p class="hint">Tap a glowing tile or a button.</p>' : req.options.some((o) => o.player != null) ? '<p class="hint">Tap a player below or their glowing tile.</p>' : ''}
      ${cardOpts.length ? `<div class="opt-cards">${cardOpts.map((o) => `<button class="opt-card" data-o="${o.id}" aria-label="${esc(o.label)}">${treasureCard(o.card.id)}<span>${esc(o.label)}</span></button>`).join('')}</div>` : ''}
      <div class="opts">${plain.map((o) => `<button class="opt ${o.primary ? 'primary' : ''}" data-o="${o.id}">${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</button>`).join('')}</div>`;
    box.classList.remove('hidden');
    document.body.classList.add('prompting');
    haptics.select();
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      box.classList.add('hidden');
      document.body.classList.remove('prompting');
      view.clearHighlight();
      haptics.tap();
      sfx('tap');
      resolve(id);
    };
    $$('[data-o]', box).forEach((b) => onTap(b, () => finish(b.dataset.o)));
    if (req.kind === 'move') {
      view.highlight(req.options.map((o) => o.dest), (tileIdx) => {
        const o = req.options.find((x) => x.dest === tileIdx);
        if (o) finish(o.id);
      });
    }
    // Choosing a player: their tiles glow too, so you can tap them on the board.
    const targets = req.options.filter((o) => o.player != null);
    if (targets.length && req.kind !== 'move') {
      const tiles = [...new Set(targets.map((o) => game.players[o.player].pos))];
      view.highlight(tiles, (tileIdx) => {
        const o = targets.find((x) => game.players[x.player].pos === tileIdx);
        if (o) finish(o.id);
      });
    }
  });
}

// ---------------- Legacy dice (only if dice3d.js is missing) ----------------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, 90], 5: [0, -90], 3: [-90, 0], 4: [90, 0] };
async function legacyDice(p, values, label, opts = {}) {
  if (game.speed < 0.05) return;
  const box = $('#dice');
  box.classList.remove('hidden');
  $('.dice-label', box).textContent = `${p.name}: ${label}`;
  const row = $('.dice-row', box);
  row.innerHTML = values.map(() => `<div class="die">${[1, 2, 3, 4, 5, 6].map((n) => `<div class="face f${n}">${Array.from({ length: 9 }, (_, i) => (PIPS[n].includes(i) ? '<i></i>' : '<span></span>')).join('')}</div>`).join('')}</div>`).join('');
  const dice = $$('.die', row);
  dice.forEach((d) => { d.style.transition = 'none'; d.style.transform = `rotateX(${Math.random() * 720}deg) rotateY(${Math.random() * 720}deg)`; });
  void row.offsetWidth;
  const spin = Math.max(260, 900 * game.speed);
  dice.forEach((d, i) => { const [rx, ry] = FACE_ROT[values[i]]; d.style.transition = `transform ${spin}ms cubic-bezier(.2,.8,.25,1.1)`; d.style.transform = `rotateX(${rx + 720}deg) rotateY(${ry + 720}deg)`; });
  sfx('dice_throw');
  await sleep(spin);
  if (opts.combat) dice.forEach((d, i) => d.classList.add(values[i] === 6 ? 'crit' : values[i] >= 4 ? 'hit' : values[i] === 1 ? 'cmiss' : 'miss'));
  await sleep(p.isBot ? Math.max(250, 700 * game.speed) : 900);
  box.classList.add('hidden');
}

// ---------------- Game menu ----------------
onTap($('#btnMenu'), () => {
  const st = profile().settings || {};
  openModal(`<h2>Paused</h2><div class="menu-list">
    <button class="btn" data-m="resume">Resume</button>
    <button class="btn ghost" data-m="log">Quest Log</button>
    <button class="btn ghost" data-m="rules">How to Play</button>
    <div class="set-row"><span>Game speed</span><select id="mSpeed"><option value="1">Normal</option><option value="0.5">Fast</option><option value="0.15">Turbo</option></select></div>
    <div class="set-row"><span>Swipe to roll dice</span><input type="checkbox" id="mSwipe" ${st.swipeDice !== false ? 'checked' : ''}></div>
    <button class="btn danger" data-m="quit">Quit to Title</button></div>`);
  $('#mSpeed').value = String(game?.speed ?? 0.5);
  $('#mSpeed').onchange = (e) => { if (game) { game.speed = +e.target.value; if (battle) battle.speed = game.speed; } };
  $('#mSwipe').onchange = (e) => {
    const pr = profile();
    pr.settings = { ...(pr.settings || {}), swipeDice: e.target.checked };
    mods.profile?.saveProfile?.(pr);
  };
  $$('[data-m]', $('#modal')).forEach((b) => onTap(b, () => {
    const m = b.dataset.m;
    if (m === 'resume') closeModal();
    if (m === 'log') { closeModal(); $('#log').classList.remove('hidden'); }
    if (m === 'rules') { if (legacy) legacy.openRules(); else if (mods.menus?.openRules) mods.menus.openRules(); else closeModal(); }
    if (m === 'quit' && window.confirm('Quit this game?')) location.reload();
  }));
});
onTap($('#btnLogClose'), () => $('#log').classList.add('hidden'));

// ---------------- End ----------------
function showEnd(r) {
  show('end');
  try { audio.music(r.kind === 'loss' ? 'defeat' : 'victory'); } catch { /* ignore */ }
  const winners = r.winner ? r.winner.map((id) => game.players[id]) : [];
  const human = game.players.find((p) => !p.isBot);
  let coins = 0;
  if (human && mods.profile?.awardCoins) {
    coins = 20 + human.relics.length * 25 + (winners.includes(human) ? 60 : 0) + human.kills * 2;
    mods.profile.awardCoins(coins);
  }
  const ranked = r.scores;
  const podium = ranked.slice(0, 3).map((sc, i) => `<div class="pod p${i + 1}" style="${sc.color ? `--gcol:${sc.color}` : ''}">
      <div class="pod-art">${sc.members.map((p) => `<img src="${artUrl(heroDef(p.hero).art)}" alt="">`).join('')}</div>
      <div class="pod-step"><b>${i + 1}</b><span>${esc(sc.label)}</span>${gems(sc.relics)}</div></div>`);
  const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const ps = game.players;
  const top = (f) => ps.reduce((a, b) => (f(b) > f(a) ? b : a), ps[0]);
  const awards = [
    ['Slayer', top((p) => p.kills), (p) => `${p.kills} kills`],
    ['Relic Hoarder', top((p) => p.relics.length), (p) => `${p.relics.length} Relics`],
    ['Unkillable', ps.reduce((a, b) => (b.deaths < a.deaths ? b : a), ps[0]), (p) => `${p.deaths} deaths`],
  ];
  $('#endBox').innerHTML = `<canvas id="confetti"></canvas>
    <h1 class="${r.kind === 'loss' ? 'loss' : ''}">${r.kind === 'loss' ? 'Defeat' : 'Victory!'}</h1>
    <p class="end-text">${esc(r.text)}</p>
    <div class="podium">${order.join('')}</div>
    <div class="awards">${awards.map(([t, p, f]) => `<div class="award"><span class="aw-face" style="background-image:url(${artUrl(heroDef(p.hero).art)})"></span><b>${t}</b><small>${esc(p.name)} · ${f(p)}</small></div>`).join('')}</div>
    ${ranked.length > 3 ? `<div>${ranked.slice(3).map((sc, i) => `<div class="score"><b>${i + 4}. ${esc(sc.label)}</b>${gems(sc.relics)}</div>`).join('')}</div>` : ''}
    ${coins ? `<p class="coins-won">+${coins} Relix Coins</p>` : ''}
    <p class="end-stats">${r.turns} turns · ${r.stats.deaths} deaths · ${r.stats.pvp} PvP battles${r.stats.fiveKind ? ` · ${r.stats.fiveKind} five-of-a-kind` : ''}</p>
    <div class="menu-list"><button class="btn big" id="eAgain">Play Again</button><button class="btn ghost" id="eTitle">Title Screen</button></div>`;
  if (r.kind !== 'loss') confetti($('#confetti'));
  onTap($('#eAgain'), () => backToTitle());
  onTap($('#eTitle'), () => backToTitle());
}

function confetti(cv) {
  const ctx = cv.getContext('2d');
  const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const cols = ['#f2c443', '#ff5a7a', '#5ad1ff', '#8dff7a', '#c88aff', '#ffffff'];
  const bits = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.x += b.vx + Math.sin((performance.now() - t0) / 300 + b.r) * 0.6; b.y += b.vy; b.r += b.vr;
      if (b.y > H + 20) { b.y = -20; b.x = Math.random() * W; }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
    }
    if (performance.now() - t0 < 9000 && document.body.contains(cv)) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  };
  tick();
}

// Debug: ?demo=N starts a bot game immediately (&human = seat 1 is you).
const qs = new URLSearchParams(location.search);
if (qs.has('demo')) {
  const n = +qs.get('demo') || 4;
  startGame({
    mode: qs.get('mode') || 'standard', speed: +(qs.get('speed') || 0.5), seed: qs.has('seed') ? +qs.get('seed') : undefined,
    players: HEROES.slice(0, n).map((h, i) => ({ hero: h.id, bot: !(qs.has('human') && i === 0), name: h.short || h.name })),
  });
} else {
  try { audio.preload?.(['title', 'menu', 'floor1']); audio.music('title'); } catch { /* ignore */ }
}
