// Relix rules engine. Runs the whole game as an async script.
// It never touches the DOM: everything visible goes through `io`, and every
// decision goes through `decide()` (bots answer instantly, humans via the UI).
import {
  HEROES, MONSTERS, BOSSES, TREASURES, TRAPS, TILE, MAX_HP, RESPAWN_HP, PVP_BASE,
  treasureDef, trapDef, heroDef,
} from './data.js';
import { buildBoard, makeRng } from './board.js';
import { botDecide } from './bot.js';

const GUILD_COLORS = ['#f0c040', '#5ad1ff', '#ff6b9a', '#8dff7a'];
const GUILD_NAMES = ['Golden Fang', 'Azure Oath', 'Crimson Pact', 'Verdant Ring'];

class Deck {
  constructor(defs, rng, prefix) {
    this.rng = rng;
    this.cards = [];
    this.discard = [];
    let n = 0;
    for (const d of defs) for (let i = 0; i < d.count; i++) this.cards.push({ uid: `${prefix}${n++}`, id: d.id });
    rng.shuffle(this.cards);
  }
  draw() {
    if (!this.cards.length) {
      if (!this.discard.length) return null;
      this.cards = this.rng.shuffle(this.discard);
      this.discard = [];
    }
    return this.cards.pop();
  }
  toss(card) { if (card) this.discard.push(card); }
  get size() { return this.cards.length; }
}

export class Game {
  constructor(config, io) {
    this.io = io;
    this.mode = config.mode || 'standard';
    this.seed = config.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = makeRng(this.seed);
    this.speed = config.speed ?? 1;
    this.maxTurns = config.maxTurns ?? 4000;
    this.players = config.players.map((pc, i) => ({
      id: i,
      name: pc.name || heroDef(pc.hero).name,
      hero: pc.hero,
      isBot: !!pc.bot,
      banner: pc.banner || null,
      hp: MAX_HP,
      maxHp: MAX_HP,
      pos: 0,
      hand: [],
      equipped: [],
      relics: [],
      skip: 0,
      guild: null,
      out: false, // eliminated for this floor (Elimination mode)
      dead: false, // permanently dead (Players vs. Relix, 1 Stop Shop)
      deaths: 0,
      fx: { letDown: false, skillBlocked: false, doubleBattle: false },
      bossBattle: null,
      kills: 0,
    }));
    this.order = this.rng.shuffle(this.players.map((p) => p.id));
    this.treasure = new Deck(TREASURES, this.rng, 't');
    this.traps = new Deck(TRAPS, this.rng, 'x');
    this.monsters = new Deck(MONSTERS, this.rng, 'm');
    this.guilds = [];
    this.guildSeq = 0;
    this.floor = 0;
    this.turn = 0;
    this.over = false;
    this.result = null;
    this.petForms = {}; // card uid -> form number
    this.stats = { pvp: 0, monsterFights: 0, deaths: 0, bossRolls: 0, traps: 0 };
  }

  // ---------- helpers ----------
  get bossIdx() { return this.board.bossIdx; }
  tile(i) { return this.board.tiles[i]; }
  active(p) { return !p.dead && !p.out; }
  living() { return this.players.filter((p) => this.active(p)); }
  name(p) { return p.name; }
  guildOf(p) { return p.guild == null ? null : this.guilds.find((g) => g.id === p.guild) || null; }
  sameGuild(a, b) { return a.guild != null && a.guild === b.guild; }
  hasPet(p, pet) { return p.equipped.some((c) => treasureDef(c.id).pet === pet); }
  coop() { return this.mode === 'pvr'; }
  log(msg, cls) { this.io.log?.(msg, cls); }
  emit(type, data = {}) { this.io.event?.(type, data); }
  async show(type, data = {}) { if (this.speed >= 0.05 && this.io.show) await this.io.show(type, data); }
  async wait(ms) { if (this.speed > 0) await this.io.pause?.(ms * this.speed); }
  playersAt(i) { return this.living().filter((p) => p.pos === i); }
  others(p) { return this.living().filter((q) => q !== p); }
  // Targets for hostile cards and skills: only enemies, never your own guild or party.
  foes(p) { return this.others(p).filter((q) => !this.sameGuild(p, q)); }

  lifeOf(p) { const d = p.deaths; return () => !this.over && this.active(p) && p.deaths === d && !this.boss.defeated; }

  async decide(p, req) {
    let ans;
    if (p.isBot) {
      ans = botDecide(this, p, req);
      await this.io.botChoice?.(p, req, ans);
      await this.wait(req.kind === 'move' ? 450 : 220);
    } else ans = await this.io.choose(p, req);
    if (!req.options.some((o) => o.id === ans)) ans = req.options[0].id;
    return ans;
  }

  async rollDice(p, n, label, opts = {}) {
    const values = Array.from({ length: n }, () => this.rng.die());
    await this.io.dice?.(p, values, label, opts);
    return values;
  }

  async drawTreasure(p, n = 1, why = '', opts = {}) {
    const got = [];
    for (let i = 0; i < n; i++) {
      const c = this.treasure.draw();
      if (!c) break;
      p.hand.push(c);
      got.push(c);
    }
    if (got.length) {
      this.log(`${p.name} draws ${got.length === 1 ? 'a treasure' : got.length + ' treasures'}${why ? ' ' + why : ''}.`, 'loot');
      this.emit('draw', { player: p.id, cards: got });
      if (!opts.quiet) await this.show('cardReveal', { player: p.id, cards: got, why });
    }
    return got;
  }

  async heal(p, amount, source) {
    if (!this.active(p)) return;
    let amt = amount;
    if (this.hasPet(p, 'kitsune')) amt += 3;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amt);
    if (p.hp - before > 0) this.log(`${p.name} heals ${p.hp - before}${source ? ' (' + source + ')' : ''}.`, 'heal');
    this.emit('hp', { player: p.id, delta: p.hp - before });
  }

  // Returns true if the player died.
  async hurt(p, amount, cause, killer = null, ctx = {}) {
    if (amount <= 0 || !this.active(p)) return false;
    p.hp -= amount;
    this.emit('hp', { player: p.id, delta: -amount });
    this.log(`${p.name} takes ${amount} damage${ctx.from ? ' from ' + ctx.from : ''}.`, 'dmg');
    if (p.hp <= 0) {
      p.hp = 0;
      await this.kill(p, cause, killer, ctx);
      return true;
    }
    return false;
  }

  removeCard(p, uid) {
    let i = p.hand.findIndex((c) => c.uid === uid);
    if (i >= 0) return p.hand.splice(i, 1)[0];
    i = p.equipped.findIndex((c) => c.uid === uid);
    if (i >= 0) return p.equipped.splice(i, 1)[0];
    return null;
  }

  spend(p, uid) {
    const c = this.removeCard(p, uid);
    if (c) {
      this.treasure.toss(c);
      this.log(`${p.name} plays ${treasureDef(c.id).name}.`, 'card');
      this.emit('play', { player: p.id, card: c });
    }
    return c;
  }

  // ---------- death ----------
  async kill(p, cause, killer, ctx = {}) {
    const rev = p.hand.find((c) => c.id === 'revival_potion');
    if (rev) {
      this.removeCard(p, rev.uid);
      this.treasure.toss(rev);
      p.hp = RESPAWN_HP;
      this.log(`${p.name} would have died, but the Revival Potion brings them back on the spot!`, 'big');
      this.emit('revive', { player: p.id });
      return;
    }
    this.stats.deaths++;
    p.deaths++;
    const diedInBoss = p.pos === this.bossIdx;
    const cards = [...p.hand, ...p.equipped];
    const relics = [...p.relics];
    p.hand = []; p.equipped = []; p.relics = [];
    const where = p.pos;
    this.log(`☠ ${p.name} has died${ctx.from ? ' to ' + ctx.from : ''}!`, 'death');
    if (this.inCombat === p.id) await this.show('defeat', { side: 'hero', player: p.id });

    if (cause === 'player' && killer && killer !== p && this.active(killer)) {
      killer.hand.push(...cards);
      killer.relics.push(...relics);
      killer.kills++;
      if (cards.length || relics.length) this.log(`${killer.name} collects ${cards.length} treasure(s)${relics.length ? ' and ' + relics.length + ' Relic(s)' : ''}.`, 'loot');
    } else if (cause === 'trap') {
      const pile = (this.tileLoot[where] ||= { cards: [], relics: [] });
      pile.cards.push(...cards);
      pile.relics.push(...relics);
      if (cards.length || relics.length) this.log(`Their belongings stay on the tile for the next player who lands there.`, 'loot');
    } else if (cause === 'boss') {
      this.boss.pile.cards.push(...cards);
      this.boss.pile.relics.push(...relics);
      if (cards.length || relics.length) this.log(`Their belongings fall into the Boss Room. Whoever defeats the boss claims them.`, 'loot');
    } else {
      // monster (or anything else): treasures to the discard pile, relics to the boss room
      cards.forEach((c) => this.treasure.toss(c));
      this.boss.pile.relics.push(...relics);
      if (relics.length) this.log(`Their Relics fall into the Boss Room.`, 'loot');
    }
    for (const c of cards) delete this.petForms[c.uid];

    // Guild leader killed: the guild disbands.
    const g = this.guildOf(p);
    if (g && g.leader === p.id && !this.coop()) this.disband(g, `${p.name}, its leader, has fallen`);

    p.fx = { letDown: false, skillBlocked: false, doubleBattle: false };
    p.bossBattle = null;
    p.skip = 0;

    if (this.mode === 'standard') {
      p.pos = 0;
      p.hp = RESPAWN_HP;
      this.emit('respawn', { player: p.id });
      this.log(`${p.name} respawns at Start with ${RESPAWN_HP} HP.`);
      await this.drawTreasure(p, diedInBoss ? 2 : 1, 'as a fresh start');
    } else if (this.mode === 'elimination') {
      p.out = true;
      p.pos = 0;
      this.log(`${p.name} is eliminated until the next floor.`);
      this.emit('out', { player: p.id });
    } else {
      p.dead = true;
      this.log(`${p.name} is gone for good.`, 'death');
      this.emit('out', { player: p.id });
    }
    this.checkEnd();
  }

  disband(g, why) {
    this.guilds = this.guilds.filter((x) => x !== g);
    for (const p of this.players) if (p.guild === g.id) p.guild = null;
    this.log(`The guild ${g.name} disbands (${why}). Each member keeps the Relics they hold.`, 'guild');
    this.emit('guilds');
  }

  checkEnd() {
    if (this.over) return;
    const alive = this.players.filter((p) => !p.dead);
    if (alive.length === 0) {
      this.finish(this.coop() ? 'The whole party has fallen. The run is lost.' : 'Every hero has fallen.', this.coop() ? 'loss' : 'end');
    }
  }

  // ---------- game flow ----------
  async run() {
    this.emit('start');
    this.log(`A new quest begins (${this.modeName()}). Turn order: ${this.order.map((id) => this.players[id].name).join(' → ')}.`, 'big');
    if (this.coop()) {
      const g = { id: this.guildSeq++, name: 'The Party', color: GUILD_COLORS[1], banner: this.players[this.order[0]].banner, leader: this.order[0] };
      this.guilds.push(g);
      for (const p of this.players) p.guild = g.id;
    }
    for (const p of this.players) await this.drawTreasure(p, 1, 'to begin', { quiet: true });
    for (let f = 1; f <= 5 && !this.over; f++) {
      await this.startFloor(f);
      await this.playFloor();
    }
    if (!this.over) this.finishByRelics();
    this.emit('end', this.result);
    return this.result;
  }

  modeName() { return { standard: 'Standard', elimination: 'Elimination', pvr: 'Players vs. Relix', onestop: '1 Stop Shop' }[this.mode]; }

  async startFloor(f) {
    this.floor = f;
    this.board = buildBoard(f, this.rng);
    const def = BOSSES[f - 1];
    this.boss = { def, hp: def.hp, maxHp: def.hp, rolls: 0, pile: { cards: [], relics: [] }, minus: 0, defeated: false };
    this.tileLoot = {};
    for (const p of this.players) {
      if (p.dead) continue;
      if (p.out) {
        p.out = false;
        p.hp = RESPAWN_HP;
        this.log(`${p.name} returns for floor ${f} with ${RESPAWN_HP} HP.`);
      }
      p.pos = 0;
      p.bossBattle = null;
    }
    this.log(`— Floor ${f}: ${def.theme.name}. ${def.name} awaits (${def.hp} HP). —`, 'floor');
    this.emit('floor', { floor: f });
    await this.show('floorIntro', { floor: f });
  }

  async playFloor() {
    this.turnIdx ||= 0;
    while (!this.over && !this.boss.defeated) {
      if (this.turn++ > this.maxTurns) { this.finish('The quest ran too long and was called off.', 'end'); return; }
      const p = this.players[this.order[this.turnIdx % this.order.length]];
      this.turnIdx++;
      if (!this.active(p)) {
        // Elimination: if everyone is out, bring them all back so the floor can finish.
        if (this.mode === 'elimination' && this.living().length === 0 && this.players.some((q) => q.out)) {
          for (const q of this.players) if (q.out) { q.out = false; q.hp = RESPAWN_HP; q.pos = 0; }
          this.log('Every hero has been eliminated, so all return to Start with 40 HP.', 'big');
          this.emit('board');
        }
        continue;
      }
      await this.takeTurn(p);
    }
  }

  async takeTurn(p) {
    this.current = p;
    this.emit('turn', { player: p.id });
    await this.show('turnStart', { player: p.id });
    if (p.skip > 0) {
      p.skip--;
      this.log(`${p.name} loses this turn.`);
      await this.wait(500);
      return;
    }
    const life = p.deaths;
    const alive = () => !this.over && this.active(p) && p.deaths === life && !this.boss.defeated;

    // 1) Equip pets.
    for (const c of [...p.hand]) {
      if (treasureDef(c.id).kind === 'pet') {
        this.removeCard(p, c.uid);
        p.equipped.push(c);
        this.petForms[c.uid] ||= 1;
        this.log(`${p.name} equips ${treasureDef(c.id).name}.`, 'card');
        this.emit('equip', { player: p.id, card: c });
      }
    }

    // 2) Play turn cards, then move or fight.
    const moved = await this.turnCards(p, alive);
    if (!alive() || moved) return;

    if (p.pos === this.bossIdx) {
      await this.bossRound(p, alive);
      return;
    }
    await this.movePhase(p, alive);
  }

  playable(p, when, ctx = {}) {
    return p.hand.filter((c) => {
      const d = treasureDef(c.id);
      if (!d.when.includes(when)) return false;
      if (d.boss && !ctx.boss) return false;
      if (d.monster && when === 'battle' && !ctx.monster) return false;
      if (c.id === 'refresh' && !(ctx.battle && ctx.battle.skillUsed)) return false;
      if (['potion', 'super_potion', 'ultra_potion'].includes(c.id) && p.hp >= p.maxHp) return false;
      if (when === 'turn') {
        if (c.id === 'guild_banner' && (this.coop() || this.players.length < 4 || p.guild != null || !this.inviteable(p).length)) return false;
        if (c.id === 'guild_bomb' && (this.coop() || !this.guilds.length)) return false;
        if (['steal', 'quick_hands'].includes(c.id) && !this.foes(p).some((q) => q.hand.length)) return false;
        if (c.id === 'swap' && !(p.hand.length > 1 && this.foes(p).some((q) => q.hand.length))) return false;
        if (c.id === 'hyperspeed' && p.pos === this.bossIdx) return false;
        if (c.id === 'trickster' && !this.tricksterTargets(p).length) return false;
        if (c.id === 'fast_travel' && !this.others(p).length) return false;
        if ((c.id === 'bomb' || c.id === 'mega_bomb') && !this.foes(p).length) return false;
      }
      return true;
    });
  }

  tricksterTargets(p) {
    return this.others(p).filter((q) => this.tile(q.pos).type === TILE.TRAP);
  }
  inviteable(p) {
    return this.others(p).filter((q) => q.guild == null);
  }

  cardOptions(cards) {
    return cards.map((c) => ({ id: c.uid, label: treasureDef(c.id).name, desc: treasureDef(c.id).text, card: c }));
  }

  // Returns true if the card replaced the player's movement.
  async turnCards(p, alive) {
    for (let guard = 0; guard < 20 && alive(); guard++) {
      const cards = this.playable(p, 'turn');
      const inBoss = p.pos === this.bossIdx;
      const go = { id: 'go', label: inBoss ? `Fight ${this.boss.def.name}` : 'Roll to move', primary: true };
      if (!cards.length) return false;
      const ans = await this.decide(p, { kind: 'turn', title: `${p.name}'s turn`, text: 'Play treasure cards, then continue.', options: [go, ...this.cardOptions(cards)] });
      if (ans === 'go') return false;
      const card = p.hand.find((c) => c.uid === ans);
      if (!card) return false;
      const replaced = await this.playTurnCard(p, card, alive);
      if (replaced) return true;
    }
    return false;
  }

  async choosePlayer(p, list, title, kind = 'pick_player', extra = {}) {
    if (!list.length) return null;
    const ans = await this.decide(p, {
      kind, title, ...extra,
      options: list.map((q) => ({ id: 'p' + q.id, label: q.name, desc: `${q.hp} HP · ${q.hand.length} cards · ${q.relics.length} Relics`, player: q.id })),
    });
    return this.players[+ans.slice(1)];
  }

  async playTurnCard(p, card, alive) {
    const id = card.id;
    if (id === 'potion' || id === 'super_potion' || id === 'ultra_potion') {
      this.spend(p, card.uid);
      await this.heal(p, id === 'potion' ? 5 : id === 'super_potion' ? 10 : p.maxHp, treasureDef(id).name);
      return false;
    }
    if (id === 'bomb' || id === 'mega_bomb') {
      const q = await this.choosePlayer(p, this.foes(p), `${treasureDef(id).name}: choose a player`, 'bomb_target');
      this.spend(p, card.uid);
      this.emit('fx', { kind: 'bomb', at: q.pos });
      await this.hurt(q, id === 'bomb' ? 5 : 10, 'player', p, { from: `${p.name}'s ${treasureDef(id).name}` });
      return false;
    }
    if (id === 'steal') {
      const q = await this.choosePlayer(p, this.foes(p).filter((x) => x.hand.length), 'Steal from which player?', 'steal_target');
      this.spend(p, card.uid);
      this.stealRandom(p, q);
      return false;
    }
    if (id === 'quick_hands') {
      const q = await this.choosePlayer(p, this.foes(p).filter((x) => x.hand.length), 'Quick Hands: steal from which player?', 'steal_target');
      this.spend(p, card.uid);
      const [v] = await this.rollDice(p, 1, 'Quick Hands');
      if (v >= 4) this.stealRandom(p, q);
      else this.log(`${p.name} fumbles the grab.`);
      return false;
    }
    if (id === 'swap') {
      const q = await this.choosePlayer(p, this.foes(p).filter((x) => x.hand.length), 'Swap hands with which player?', 'swap_target');
      this.spend(p, card.uid);
      [p.hand, q.hand] = [q.hand, p.hand];
      this.log(`${p.name} swaps hands with ${q.name}.`, 'card');
      this.emit('hand');
      return false;
    }
    if (id === 'guild_banner') {
      this.spend(p, card.uid);
      await this.formGuild(p);
      return false;
    }
    if (id === 'guild_bomb') {
      const ans = await this.decide(p, {
        kind: 'guild_bomb', title: 'Guild Bomb: destroy which guild?',
        options: this.guilds.map((g) => ({ id: 'g' + g.id, label: g.name, desc: this.players.filter((q) => q.guild === g.id).map((q) => q.name).join(', ') })),
      });
      const g = this.guilds.find((x) => 'g' + x.id === ans);
      this.spend(p, card.uid);
      if (g) this.disband(g, `${p.name} destroyed its banner`);
      return false;
    }
    if (id === 'hyperspeed') {
      this.spend(p, card.uid);
      await this.moveTo(p, this.bossIdx, 'warp');
      await this.bossRound(p, alive);
      return true;
    }
    if (id === 'trickster') {
      const q = await this.choosePlayer(p, this.tricksterTargets(p), 'Trickster: pick a player on a trap tile', 'trickster_target');
      this.spend(p, card.uid);
      await this.moveTo(p, q.pos, 'warp');
      this.log(`${p.name} springs the trap on ${q.name}!`, 'big');
      await this.springTrap(q, q.pos, { tricked: true }, this.lifeOf(q));
      return true;
    }
    if (id === 'fast_travel') {
      const q = await this.choosePlayer(p, this.others(p), 'Fast Travel: travel to which player?', 'fast_travel_target');
      this.spend(p, card.uid);
      await this.moveTo(p, q.pos, 'warp');
      if (q.pos === this.bossIdx) { await this.bossRound(p, alive); return true; }
      await this.arrive(p, alive, { forcePvp: true });
      return true;
    }
    return false;
  }

  stealRandom(p, q) {
    if (!q.hand.length) return null;
    const c = q.hand.splice(this.rng.int(q.hand.length), 1)[0];
    p.hand.push(c);
    this.log(`${p.name} steals a treasure from ${q.name}.`, 'card');
    this.emit('hand');
    return c;
  }

  async formGuild(p) {
    const limit = Math.floor(this.players.length / 2);
    const cands = this.inviteable(p);
    const invited = [];
    while (invited.length < Math.min(limit - 1, cands.length)) {
      const left = cands.filter((q) => !invited.includes(q));
      const ans = await this.decide(p, {
        kind: 'guild_invite', title: `Guild Banner: invite a player (${invited.length + 1}/${limit} members)`,
        options: [{ id: 'done', label: invited.length ? 'Send invitations' : 'Cancel' }, ...left.map((q) => ({ id: 'p' + q.id, label: q.name, desc: `${q.relics.length} Relics · ${q.hp} HP`, player: q.id }))],
      });
      if (ans === 'done') break;
      invited.push(this.players[+ans.slice(1)]);
    }
    if (!invited.length) { this.log('No invitations were sent, so the banner is wasted.', 'guild'); return; }
    const slot = this.guildSeq++;
    const suggested = GUILD_NAMES[slot % GUILD_NAMES.length];
    let gname = suggested;
    if (!p.isBot && this.io.nameGuild && this.speed >= 0.05) gname = ((await this.io.nameGuild(p, suggested)) || suggested).slice(0, 24);
    const joined = [];
    for (const q of invited) {
      const yes = await this.decide(q, { kind: 'guild_accept', title: `${p.name} invites you to join ${gname}`, text: 'Guilds are permanent until disbanded. Guild Relics count together at the end.', options: [{ id: 'yes', label: 'Accept', primary: true }, { id: 'no', label: 'Decline' }], from: p.id, guildName: gname });
      if (yes === 'yes') joined.push(q);
      this.log(`${q.name} ${yes === 'yes' ? 'accepts' : 'declines'} the invitation.`, 'guild');
    }
    if (!joined.length) { this.log('Nobody joined, so the banner is wasted.', 'guild'); return; }
    const g = { id: slot, name: gname, color: (p.banner && p.banner.field) || GUILD_COLORS[slot % GUILD_COLORS.length], banner: p.banner, leader: p.id };
    this.log(`The guild ${g.name} is formed, led by ${p.name}: ${[p, ...joined].map((q) => q.name).join(', ')}.`, 'guild');
    this.emit('guilds');
  }

  // ---------- movement ----------
  async moveTo(p, idx, how = 'walk') {
    const from = p.pos;
    p.pos = Math.max(0, Math.min(this.bossIdx, idx));
    if (from === this.bossIdx && p.pos !== this.bossIdx) p.bossBattle = null;
    this.emit('move', { player: p.id, from, to: p.pos, how });
    await this.wait(how === 'walk' ? 260 * Math.abs(p.pos - from) + 200 : 700);
  }

  async movePhase(p, alive) {
    const [a, b] = await this.rollDice(p, 2, 'Movement');
    const opts = [{ id: String(a), n: a }];
    if (b !== a) opts.push({ id: String(b), n: b });
    else opts.push({ id: String(a + b), n: a + b });
    const options = opts.map((o) => {
      const dest = Math.min(this.bossIdx, p.pos + o.n);
      return { id: o.id, label: `Move ${o.n}`, desc: this.describeTile(dest, p), dest };
    });
    const ans = await this.decide(p, { kind: 'move', title: a === b ? `Doubles! Move ${a} or ${a + b}` : `Choose a die: ${a} or ${b}`, options });
    const steps = +ans;
    await this.moveTo(p, p.pos + steps, 'walk');
    this.log(`${p.name} moves ${steps} to ${this.describeTile(p.pos, p)}.`);
    await this.arrive(p, alive);
  }

  describeTile(i, viewer) {
    const t = this.tile(i);
    const names = { start: 'Start', blank: 'a safe room', monster: 'a Monster tile', treasure: 'a Treasure tile', trap: 'a Trap tile', boss: 'the Boss Room' };
    const occ = this.playersAt(i).filter((q) => q !== viewer);
    return names[t.type] + (occ.length && t.type !== TILE.BOSS && t.type !== TILE.START ? ` (${occ.map((q) => q.name).join(', ')})` : '');
  }

  // Landing on a tile: loot, PvP, then the tile effect.
  async arrive(p, alive, opts = {}) {
    if (!alive()) return;
    if (p.pos === this.bossIdx) {
      this.log(`${p.name} enters the Boss Room!`, 'big');
      await this.bossRound(p, alive);
      return;
    }
    const loot = this.tileLoot[p.pos];
    if (loot && (loot.cards.length || loot.relics.length)) {
      p.hand.push(...loot.cards);
      p.relics.push(...loot.relics);
      this.log(`${p.name} finds ${loot.cards.length} treasure(s)${loot.relics.length ? ' and ' + loot.relics.length + ' Relic(s)' : ''} left behind on this tile!`, 'loot');
      delete this.tileLoot[p.pos];
      this.emit('hand');
    }
    if (p.pos !== 0 && !this.coop()) {
      await this.pvp(p.pos, p);
      if (!alive()) return;
    }
    await this.resolveTile(p, alive);
  }

  async resolveTile(p, alive) {
    const t = this.tile(p.pos);
    if (t.type === TILE.TREASURE) {
      await this.drawTreasure(p, 1, 'from the treasure tile');
    } else if (t.type === TILE.MONSTER) {
      const n = p.fx.doubleBattle ? 2 : 1;
      if (p.fx.doubleBattle) { p.fx.doubleBattle = false; this.log(`Double Battle! ${p.name} must fight 2 monsters.`, 'big'); }
      for (let k = 0; k < n && alive(); k++) await this.monsterEncounter(p, alive);
    } else if (t.type === TILE.TRAP) {
      await this.springTrap(p, p.pos, {}, alive);
    }
  }

  // ---------- traps ----------
  async springTrap(p, at, opts = {}, alive = this.lifeOf(p)) {
    const resist = p.hand.find((c) => c.id === 'trap_resist');
    if (resist && !opts.tricked) {
      const ans = await this.decide(p, { kind: 'trap_resist', title: 'You landed on a trap!', text: 'Use Trap Resist to deactivate it?', options: [{ id: 'yes', label: 'Use Trap Resist', primary: true }, { id: 'no', label: 'Take my chances' }] });
      if (ans === 'yes') { this.spend(p, resist.uid); this.log(`${p.name} disarms the trap.`); return; }
    }
    const card = this.traps.draw();
    if (!card) return;
    this.stats.traps++;
    const d = trapDef(card.id);
    this.log(`Trap! ${p.name} draws ${d.name}: ${d.text}`, 'trap');
    this.emit('trap', { player: p.id, card });
    await this.show('trapReveal', { player: p.id, card });
    this.traps.toss(card);
    await this.applyTrap(p, card.id, at, alive);
  }

  async applyTrap(p, id, at, alive) {
    const dmg = { giant_boulder: 25, boulder: 10, spike_trap: 5, poison_dart: 3 }[id];
    if (dmg) { await this.hurt(p, dmg, 'trap', null, { from: trapDef(id).name }); return; }
    switch (id) {
      case 'roar': {
        const cards = [...p.hand, ...p.equipped];
        cards.forEach((c) => { this.treasure.toss(c); delete this.petForms[c.uid]; });
        this.boss.pile.relics.push(...p.relics);
        if (p.relics.length) this.log(`${p.name}'s Relics fly into the Boss Room.`, 'loot');
        p.hand = []; p.equipped = []; p.relics = [];
        this.emit('hand');
        break;
      }
      case 'land_slide': {
        const t = this.tile(at);
        const hit = this.living().filter((q) => { const u = this.tile(q.pos); return u.z === t.z && Math.abs(u.x - t.x) <= 1 && q.pos !== this.bossIdx && q.pos !== 0; });
        this.emit('fx', { kind: 'slide', at });
        for (const q of hit) await this.hurt(q, 15, 'trap', null, { from: 'Land Slide' });
        break;
      }
      case 'endless_pit': await this.kill(p, 'trap', null, { from: 'the Endless Pit' }); break;
      case 'restart': await this.moveTo(p, 0, 'warp'); break;
      case 'skill_counter': p.fx.skillBlocked = true; break;
      case 'double_battle': p.fx.doubleBattle = true; break;
      case 'double_loss': p.skip += 2; break;
      case 'lose_a_turn': p.skip += 1; break;
      case 'let_down': p.fx.letDown = true; break;
      case 'bat_swarm': {
        if (p.hand.length) { const c = p.hand.splice(this.rng.int(p.hand.length), 1)[0]; this.treasure.toss(c); this.log(`The bats carry off ${treasureDef(c.id).name}.`); }
        else if (p.equipped.length) { const c = p.equipped.splice(this.rng.int(p.equipped.length), 1)[0]; this.treasure.toss(c); delete this.petForms[c.uid]; this.log(`The bats carry off ${treasureDef(c.id).name}.`); }
        this.emit('hand');
        break;
      }
      case 'surprise': await this.monsterEncounter(p, alive || this.lifeOf(p), { noLoot: true }); break;
      case 'fumble': {
        const i = this.order.indexOf(p.id);
        let q = null;
        for (let k = 1; k < this.order.length; k++) { const c = this.players[this.order[(i + k) % this.order.length]]; if (this.active(c)) { q = c; break; } }
        if (q && p.hand.length) this.stealRandom(q, p);
        break;
      }
      case 'misstep': {
        const dest = Math.max(0, p.pos - 3);
        await this.moveTo(p, dest, 'walk');
        if (dest !== 0) await this.arrive(p, alive || this.lifeOf(p));
        break;
      }
    }
  }

  // ---------- combat ----------
  newBattle() { return { skillUsed: false, guildReroll: false, extraLoot: 0 }; }

  // Skill check. Returns roll modifiers for this battle roll.
  async skillCheck(p, battle, ctx) {
    const mods = { bonus: 0, reduce: 0 };
    battle.skillUsed = true;
    if (p.fx.skillBlocked) {
      p.fx.skillBlocked = false;
      this.log(`${p.name}'s skill is deactivated for this battle.`);
      return mods;
    }
    if (ctx.countered) { this.log(`${p.name}'s skill is countered!`); return mods; }
    const hero = heroDef(p.hero);
    const [v] = await this.rollDice(p, 1, "Skill check", { skill: true });
    if (!hero.triggers.includes(v)) { this.log(`${p.name}'s skill check fails (${v}).`); return mods; }
    this.log(`${p.name}'s skill activates (${v})!`, 'skill');
    this.emit('skill', { player: p.id, value: v });
    switch (p.hero) {
      case 'chan_kong': {
        const cost = { 4: 2, 5: 3, 6: 5 }[v], gain = { 4: 3, 5: 5, 6: 8 }[v];
        const ans = await this.decide(p, { kind: 'chan_kong', title: `Rage: −${cost} health for +${gain} damage?`, options: [{ id: 'yes', label: `Use it (+${gain} dmg)`, primary: true }, { id: 'no', label: 'Not this time' }], cost, gain });
        if (ans === 'yes') {
          mods.bonus += gain;
          mods.text = `RAGE! +${gain} DMG`;
          const died = await this.hurt(p, cost, ctx.cause || 'monster', null, { from: 'his own rage' });
          if (died) mods.dead = true;
        }
        break;
      }
      case 'josue': {
        const [a, b] = await this.rollDice(p, 2, 'Josue: bonus damage');
        mods.bonus += a + b;
        mods.text = `ASSASSINATE +${a + b}`;
        this.log(`Josue adds ${a + b} damage!`, 'skill');
        break;
      }
      case 'luke': mods.reduce += { 4: 2, 5: 3, 6: 5 }[v]; mods.text = `GUARD −${{ 4: 2, 5: 3, 6: 5 }[v]}`; break;
      case 'nowtna': {
        const amt = { 4: 3, 5: 4, 6: 8 }[v];
        const team = [p, ...this.others(p).filter((q) => this.sameGuild(p, q))];
        const target = team.length > 1 ? await this.choosePlayer(p, team, `Heal whom for +${amt}?`, 'heal_target') : p;
        mods.text = `HEAL +${amt}`;
        await this.show('skill', { player: p.id, text: mods.text });
        mods.shown = true;
        await this.heal(target, amt, 'Nowtna');
        break;
      }
      case 'shi': {
        const steals = v === 5 ? 2 : 1;
        await this.show('skill', { player: p.id, text: steals === 2 ? 'DOUBLE STEAL!' : 'STEAL!' });
        mods.shown = true;
        for (let k = 0; k < steals; k++) {
          const victims = this.foes(p).filter((q) => q.hand.length);
          if (v === 1 || !victims.length) { await this.drawTreasure(p, 1, 'from the treasure pile'); continue; }
          let src = 'player';
          if (v === 5) src = await this.decide(p, { kind: 'shi_source', title: `Steal ${k + 1} of 2: from where?`, options: [{ id: 'player', label: 'Another player' }, { id: 'pile', label: 'The treasure pile' }] });
          if (src === 'pile') { await this.drawTreasure(p, 1, 'from the treasure pile'); continue; }
          const q = await this.choosePlayer(p, victims, 'Steal from which player?', 'steal_target');
          this.stealRandom(p, q);
        }
        break;
      }
      case 'yessi':
        await this.show('skill', { player: p.id, text: v === 6 ? 'MEGA BOMB!' : 'BOMB!' });
        mods.shown = true;
        await this.yessiBomb(p, v, ctx);
        break;
    }
    if (mods.text && !mods.shown) await this.show('skill', { player: p.id, text: mods.text });
    return mods;
  }

  async yessiBomb(p, v, ctx) {
    const t = this.tile(p.pos);
    const dmg = v === 6 ? 3 : 1;
    const inArea = (u) => {
      if (u.i === t.i) return true;
      const dx = Math.abs(u.x - t.x), dz = Math.abs(u.z - t.z);
      if (v === 4) return dz === 0 && dx === 1;
      if (v === 5) return dx === 0 && dz === 1;
      return dx + dz === 1;
    };
    this.log(`Yessi throws a bomb (${dmg} damage, ${v === 4 ? 'row' : v === 5 ? 'column' : 'all around'})!`, 'skill');
    this.emit('fx', { kind: 'yessi', at: p.pos, value: v });
    if (ctx.enemy && ctx.enemy.hp > 0) {
      ctx.enemy.hp = Math.max(0, ctx.enemy.hp - dmg);
      this.log(`The bomb hits ${ctx.enemy.name} for ${dmg}.`);
      this.emit('enemy', { hp: ctx.enemy.hp });
      if (ctx.enemy.kind === 'boss') this.boss.hp = ctx.enemy.hp;
    }
    const victims = this.foes(p).filter((q) => inArea(this.tile(q.pos)) && q.pos !== 0);
    for (const q of victims) await this.hurt(q, dmg, 'player', p, { from: "Yessi's bomb" });
  }

  // Cards played at the start of a battle roll. Returns roll modifiers.
  async battleCards(p, enemy, battle, alive) {
    const m = { sword: 0, shield: 0, inner: 0, ambush: false, reroll: false, refresh: false };
    const ctx = { boss: enemy.kind === 'boss', monster: enemy.kind === 'monster', battle };
    for (let guard = 0; guard < 20 && alive() && enemy.hp > 0; guard++) {
      const cards = this.playable(p, 'battle', ctx).filter((c) => !(c.id === 'refresh' && m.refresh));
      if (!cards.length) break;
      const ans = await this.decide(p, {
        kind: 'battle', title: `Battle roll vs ${enemy.name} (${enemy.hp} HP)`, text: 'Play treasure cards for this roll, then roll.',
        options: [{ id: 'go', label: 'Roll!', primary: true }, ...this.cardOptions(cards)], enemy, mods: m,
      });
      if (ans === 'go') break;
      const c = p.hand.find((x) => x.uid === ans);
      if (!c) break;
      this.spend(p, c.uid);
      switch (c.id) {
        case 'potion': await this.heal(p, 5, 'Potion'); break;
        case 'super_potion': await this.heal(p, 10, 'Super Potion'); break;
        case 'ultra_potion': await this.heal(p, p.maxHp, 'Ultra Potion'); break;
        case 'sword': m.sword += 2; break;
        case 'large_sword': m.sword += 4; break;
        case 'shield': m.shield += 3; break;
        case 'large_shield': m.shield += 5; break;
        case 'inner_strength': m.inner++; break;
        case 'ambush': m.ambush = true; break;
        case 'reroll': m.reroll = true; break;
        case 'refresh': m.refresh = true; break;
        case 'killshot': enemy.hp = 0; this.log(`Killshot! ${enemy.name} is slain instantly.`, 'big'); this.emit('enemy', { hp: 0 }); break;
        case 'extra_loot': battle.extraLoot += 2; break;
        case 'bomb': case 'mega_bomb': {
          const d = c.id === 'bomb' ? 5 : 10;
          enemy.hp = Math.max(0, enemy.hp - d);
          this.emit('fx', { kind: 'bomb', at: p.pos });
          this.log(`The ${treasureDef(c.id).name} blasts ${enemy.name} for ${d}.`);
          this.emit('enemy', { hp: enemy.hp });
          break;
        }
      }
    }
    return m;
  }

  innerMult(n) { return n <= 0 ? 1 : n === 1 ? 2 : n === 2 ? 4 : 6; }

  // One battle roll against a monster or the boss.
  async battleRoll(p, enemy, battle, m, skillMods, fx = {}) {
    let n = enemy.kind === 'boss' ? 5 : enemy.hp;
    n = Math.max(1, n - (this.boss.minus || 0));
    let values = await this.rollDice(p, n, `Battle roll vs ${enemy.name}`, { combat: true });
    const misses = () => values.filter((v) => v < 4).length;
    if (m.reroll && misses()) {
      const keep = values.filter((v) => v >= 4);
      const again = await this.rollDice(p, misses(), 'Reroll misses', { combat: true });
      values = [...keep, ...again];
    }
    if (!battle.guildReroll && misses()) {
      const mate = this.others(p).find((q) => this.sameGuild(p, q) && q.pos === p.pos);
      if (mate) {
        const ans = await this.decide(mate, { kind: 'guild_reroll', title: `Guild Double Up: reroll ${p.name}'s ${misses()} failed dice?`, options: [{ id: 'yes', label: 'Reroll them', primary: true }, { id: 'no', label: 'Not now' }] });
        if (ans === 'yes') {
          battle.guildReroll = true;
          const keep = values.filter((v) => v >= 4);
          const again = await this.rollDice(mate, misses(), `Guild reroll for ${p.name}`, { combat: true });
          values = [...keep, ...again];
        }
      }
    }
    const atk = heroDef(p.hero).atk;
    const hits = values.filter((v) => v >= 4).length;
    const crits = values.filter((v) => v === 6).length, cmiss = values.filter((v) => v === 1).length;
    let dealt = values.reduce((s, v) => s + (v === 6 ? 2 * atk : v >= 4 ? atk : 0), 0);
    if (hits > 0) dealt += m.sword;
    dealt += skillMods.bonus;
    dealt *= this.innerMult(m.inner);
    if (m.ambush && enemy.kind === 'boss') dealt *= 3;

    let taken = values.reduce((s, v) => s + (v === 1 ? 2 * enemy.atk : v < 4 ? enemy.atk : 0), 0);
    if (fx.doubleMiss) taken *= 2;
    if (fx.sgPlus && taken > 0) taken += 5;
    const reduce = m.shield + skillMods.reduce + (this.hasPet(p, 'golem') ? 1 : 0);
    taken = Math.max(0, taken - reduce);

    this.log(`${p.name} rolls ${values.join(' ')} — ${hits} hit${hits === 1 ? '' : 's'}${crits ? ` (${crits} crit)` : ''}${cmiss ? `, ${cmiss} critical miss` : ''}.`);

    await this.show('exchange', { player: p.id, enemy, dealt, taken: enemy.hp - dealt <= 0 ? 0 : taken, crits, cmiss, hits, values, kills: enemy.hp - dealt <= 0 });
    if (dealt > 0) {
      enemy.hp = Math.max(0, enemy.hp - dealt);
      if (enemy.kind === 'boss') this.boss.hp = enemy.hp;
      this.log(`${p.name} deals ${dealt} damage to ${enemy.name}${enemy.hp <= 0 ? '' : ` (${enemy.hp} HP left)`}.`, 'hit');
      this.emit('enemy', { hp: enemy.hp, dealt });
    }
    if (enemy.hp <= 0) return;
    if (taken > 0) await this.hurt(p, taken, enemy.kind, null, { from: enemy.name });
  }

  async monsterEncounter(p, alive, opts = {}) {
    const card = this.monsters.draw();
    if (!card) return;
    const def = MONSTERS.find((x) => x.id === card.id);
    this.stats.monsterFights++;
    const enemy = { kind: 'monster', id: def.id, name: def.name, art: def.art, hp: def.hp, maxHp: def.hp, atk: def.atk };
    this.log(`A ${def.name} appears (${def.hp} HP, ${def.atk} attack)!`, 'monster');
    this.emit('combat', { player: p.id, enemy });
    this.inCombat = p.id;
    await this.show('combatStart', { player: p.id, enemy, kind: 'monster' });
    const battle = this.newBattle();
    let first = true;
    while (alive() && enemy.hp > 0) {
      const m = await this.battleCards(p, enemy, battle, alive);
      if (!alive() || enemy.hp <= 0) break;
      let skillMods = { bonus: 0, reduce: 0 };
      if (first || m.refresh) {
        skillMods = await this.skillCheck(p, battle, { enemy, cause: 'monster' });
        if (!alive() || enemy.hp <= 0) break;
      }
      first = false;
      await this.battleRoll(p, enemy, battle, m, skillMods);
    }
    this.monsters.toss(card);
    if (enemy.hp <= 0 && alive()) {
      p.kills++;
      this.log(`${p.name} defeats the ${def.name}!`, 'big');
      await this.show('defeat', { side: 'enemy', player: p.id });
      await this.show('combatEnd', { won: true });
      this.inCombat = null;
      this.emit('combatEnd', { won: true });
      // Surprise: no treasure at all. Extra Loot: draw 2 instead of 1. Kezz: +1.
      let n = 0;
      if (!opts.noLoot) {
        n = battle.extraLoot ? 2 : 1;
        if (this.hasPet(p, 'goblin')) n += 1;
      }
      if (n) await this.drawTreasure(p, n, 'as loot');
    } else {
      await this.show('combatEnd', { won: false });
      this.inCombat = null;
      this.emit('combatEnd', { won: false });
    }
  }

  async bossRound(p, alive) {
    if (!alive()) return;
    const b = this.boss;
    const enemy = { kind: 'boss', id: b.def.id, name: b.def.name, art: b.def.art, hp: b.hp, maxHp: b.maxHp, atk: b.def.atk };
    const battle = (p.bossBattle ||= this.newBattle());
    this.emit('combat', { player: p.id, enemy, boss: true });
    this.inCombat = p.id;
    await this.show('combatStart', { player: p.id, enemy, kind: 'boss' });
    b.rolls++;
    this.stats.bossRolls++;
    const fx = {};
    if (b.rolls % 3 === 0) {
      this.log(`${b.def.name}'s skill activates! ${b.def.skill.split('.')[0].replace(/^Every third battle roll /, '')}.`, 'boss');
      this.emit('bossSkill', { id: b.def.id });
      await this.show('bossSkill', { id: b.def.id, player: p.id });
      switch (b.def.id) {
        case 'skeleton_general': fx.sgPlus = true; break;
        case 'ikias_boss': fx.doubleMiss = true; break;
        case 'enguxi': b.minus = Math.min(4, b.minus + 1); this.log(`Everyone now rolls ${b.minus} fewer ${b.minus === 1 ? 'die' : 'dice'} in combat.`); break;
        case 'raskon':
          for (const q of this.playersAt(this.bossIdx)) await this.hurt(q, 10, 'boss', null, { from: 'Raskon' });
          if (!alive()) { await this.show('combatEnd', {}); this.inCombat = null; this.emit('combatEnd', {}); return; }
          break;
        case 'vore': {
          const traps = this.board.tiles.filter((t) => t.type === TILE.TRAP && t.i < this.bossIdx);
          const dest = traps.length ? traps[traps.length - 1].i : 0;
          await this.show('combatEnd', {});
          this.inCombat = null;
          this.emit('combatEnd', {});
          this.log(`${p.name} is hurled out of the Boss Room!`, 'big');
          await this.moveTo(p, dest, 'warp');
          if (traps.length) await this.arrive(p, alive);
          if (alive()) await this.movePhase(p, alive);
          return;
        }
      }
    }
    const m = await this.battleCards(p, enemy, battle, alive);
    let skillMods = { bonus: 0, reduce: 0 };
    if (alive() && (!battle.skillUsed || m.refresh)) skillMods = await this.skillCheck(p, battle, { enemy, cause: 'boss' });
    if (alive() && enemy.hp > 0) await this.battleRoll(p, enemy, battle, m, skillMods, fx);
    b.hp = enemy.hp;
    if (b.hp <= 0 && !b.defeated && alive()) await this.show('defeat', { side: 'enemy', player: p.id, boss: true });
    if (this.inCombat != null) await this.show('combatEnd', {});
    this.inCombat = null;
    if (b.hp <= 0 && !b.defeated) {
      if (alive()) await this.bossDefeated(p);
      else await this.bossDefeatedBy(null);
    }
    this.emit('combatEnd', {});
  }

  async bossDefeated(p) {
    const b = this.boss;
    b.defeated = true;
    const relic = { floor: this.floor, name: `Relic of ${b.def.name}`, boss: b.def.id };
    p.relics.push(relic);
    p.hand.push(...b.pile.cards);
    p.relics.push(...b.pile.relics);
    this.log(`★ ${p.name} lands the killing blow on ${b.def.name} and claims the ${relic.name}! ★`, 'victory');
    if (b.pile.cards.length || b.pile.relics.length) this.log(`${p.name} also collects everything in the Boss Room: ${b.pile.cards.length} treasure(s), ${b.pile.relics.length} extra Relic(s).`, 'loot');
    b.pile = { cards: [], relics: [] };
    // Anything still lying on the floor's tiles is swept up by the boss slayer, so nothing is lost when the board resets.
    let swept = 0, sweptR = 0;
    for (const pile of Object.values(this.tileLoot)) { p.hand.push(...pile.cards); p.relics.push(...pile.relics); swept += pile.cards.length; sweptR += pile.relics.length; }
    this.tileLoot = {};
    if (swept || sweptR) this.log(`${p.name} also sweeps up ${swept} treasure(s)${sweptR ? ' and ' + sweptR + ' Relic(s)' : ''} left on the floor.`, 'loot');
    if (this.hasPet(p, 'goblin')) await this.drawTreasure(p, 1, 'thanks to Kezz');
    this.growPets();
    this.emit('bossDown', { player: p.id, relic });
    await this.show('relic', { player: p.id, relic });
    this.checkRelicWin();
  }
  async bossDefeatedBy() {
    // No living slayer (should not happen): the Relic goes to the player with the most HP.
    const best = [...this.living()].sort((a, b) => b.hp - a.hp)[0];
    if (best) return this.bossDefeated(best);
    this.boss.defeated = true;
    this.emit('bossDown', {});
  }

  growPets() {
    for (const p of this.players) for (const c of p.equipped) {
      const d = treasureDef(c.id);
      if (d.kind === 'pet' && (this.petForms[c.uid] || 1) < d.forms) {
        this.petForms[c.uid] = (this.petForms[c.uid] || 1) + 1;
        this.log(`${p.name}'s pet grows into its next form!`, 'loot');
      }
    }
  }

  checkRelicWin() {
    if (this.coop() && this.floor === 5) {
      const total = this.players.reduce((s, p) => s + p.relics.length, 0) + this.boss.pile.relics.length;
      if (total >= 5) this.finish('The party has recovered all five Relics and banished the evil!', 'win');
    }
  }

  // ---------- PvP ----------
  async pvp(at, mover) {
    const here = this.playersAt(at);
    if (here.length < 2) return;
    // Group into sides: each guild is one side, everyone else alone.
    const sideMap = new Map();
    for (const q of here) {
      const key = q.guild != null ? 'g' + q.guild : 'p' + q.id;
      if (!sideMap.has(key)) sideMap.set(key, { key, members: [], guild: q.guild != null ? this.guildOf(q) : null });
      sideMap.get(key).members.push(q);
    }
    const sides = [...sideMap.values()];
    if (sides.length < 2) return;
    this.stats.pvp++;
    this.log(`⚔ PvP on this tile: ${sides.map((s) => s.members.map((q) => q.name).join(' + ')).join(' vs ')}!`, 'pvp');
    this.emit('pvp', { at, players: here.map((q) => q.id) });
    await this.show('pvpStart', { at, mover: mover.id, sides: sides.map((x) => x.members.map((q) => q.id)) });

    const multiGuild = sides.filter((s) => s.guild && s.members.length > 1).length >= 2;
    for (const s of sides) {
      s.rep = s.members.includes(mover) ? mover : s.members[0];
      s.letDown = s.members.length === 1 && s.rep.fx.letDown;
      s.mods = { bonus: 0, reduce: 0, sword: 0, shield: 0, inner: 0, counter: false };
    }
    // Cards (representatives only).
    for (const s of sides) {
      if (s.letDown) continue;
      const p = s.rep;
      for (let guard = 0; guard < 12 && this.active(p); guard++) {
        const cards = this.playable(p, 'pvp');
        if (!cards.length) break;
        const ans = await this.decide(p, { kind: 'pvp_cards', title: 'PvP: play cards before rolling', options: [{ id: 'go', label: 'Ready', primary: true }, ...this.cardOptions(cards)], sides });
        if (ans === 'go') break;
        const c = p.hand.find((x) => x.uid === ans);
        if (!c) break;
        this.spend(p, c.uid);
        switch (c.id) {
          case 'potion': await this.heal(p, 5, 'Potion'); break;
          case 'super_potion': await this.heal(p, 10, 'Super Potion'); break;
          case 'ultra_potion': await this.heal(p, p.maxHp, 'Ultra Potion'); break;
          case 'sword': s.mods.sword += 2; break;
          case 'large_sword': s.mods.sword += 4; break;
          case 'shield': s.mods.shield += 3; break;
          case 'large_shield': s.mods.shield += 5; break;
          case 'inner_strength': s.mods.inner++; break;
          case 'skill_counter': s.mods.counter = true; break;
        }
      }
    }
    // Skill checks.
    for (const s of sides) {
      if (s.letDown || !this.active(s.rep)) continue;
      const countered = sides.some((o) => o !== s && o.mods.counter);
      const sm = await this.skillCheck(s.rep, this.newBattle(), { countered, cause: 'player', pvp: true });
      s.mods.bonus += sm.bonus;
      s.mods.reduce += sm.reduce;
    }
    const live = (s) => s.members.some((q) => this.active(q) && q.pos === at);
    let contenders = sides.filter((s) => !s.letDown && live(s));
    for (const s of sides) if (s.letDown) { s.rep.fx.letDown = false; this.log(`${s.rep.name} is Let Down and doesn't roll.`); }
    let stack = 0;
    let winner = null;
    for (let round = 0; round < 30 && contenders.length; round++) {
      for (const s of contenders) {
        if (multiGuild && s.guild && s.members.length > 1) {
          let total = 0;
          for (const q of s.members.filter((x) => this.active(x))) total += (await this.rollDice(q, 1, `${q.name} `, { pvp: true }))[0];
          s.value = total;
        } else {
          let [v] = await this.rollDice(s.rep, 1, `${s.rep.name} `, { pvp: true });
          if (s.guild && s.members.length > 1 && !s.usedReroll) {
            const ans = await this.decide(s.rep, { kind: 'pvp_reroll', title: `You rolled ${v}. Use your guild's free reroll?`, value: v, options: [{ id: 'yes', label: 'Reroll' }, { id: 'no', label: 'Keep it', primary: true }] });
            if (ans === 'yes') { s.usedReroll = true; [v] = await this.rollDice(s.rep, 1, 'PvP reroll', { pvp: true }); }
          }
          s.value = v;
        }
      }
      const best = Math.max(...contenders.map((s) => s.value));
      const top = contenders.filter((s) => s.value === best);
      this.log(`PvP rolls: ${contenders.map((s) => `${s.rep.name} ${s.value}`).join(', ')}.`);
      if (top.length === 1) { winner = top[0]; break; }
      stack += 5;
      contenders = top;
      this.log(`Tie! Re-roll, and the stakes rise to +${stack} damage.`, 'pvp');
    }
    for (const s of sides) {
      if (s === winner) continue;
      for (const q of s.members) {
        if (!this.active(q) || q.pos !== at) continue;
        if (s.letDown) { await this.show('pvpHit', { winner: winner ? winner.rep.id : null, loser: q.id, dmg: 5 }); await this.hurt(q, 5, 'player', winner ? winner.rep : null, { from: 'Let Down' }); continue; }
        if (!winner) continue;
        let dmg = PVP_BASE + stack + winner.mods.bonus + winner.mods.sword;
        dmg *= this.innerMult(winner.mods.inner);
        const reduce = s.mods.shield + s.mods.reduce + (this.hasPet(q, 'golem') ? 1 : 0);
        dmg = Math.max(0, dmg - reduce);
        await this.show('pvpHit', { winner: winner.rep.id, loser: q.id, dmg, crit: stack > 0 });
        await this.hurt(q, dmg, 'player', winner.rep, { from: winner.rep.name });
      }
    }
    if (winner) this.log(`${winner.members.map((q) => q.name).join(' + ')} win${winner.members.length === 1 ? 's' : ''} the PvP!`, 'pvp');
    await this.show('pvpEnd', { at, winner: winner ? winner.rep.id : null });
    this.emit('pvpEnd', { at });
  }

  // ---------- ending ----------
  scores() {
    const rows = [];
    const done = new Set();
    for (const g of this.guilds) {
      const members = this.players.filter((p) => p.guild === g.id);
      if (!members.length) continue;
      members.forEach((p) => done.add(p.id));
      rows.push({ label: g.name, color: g.color, members, relics: members.reduce((s, p) => s + p.relics.length, 0), hp: members.reduce((s, p) => s + (p.dead ? 0 : p.hp), 0) });
    }
    for (const p of this.players) if (!done.has(p.id)) rows.push({ label: p.name, members: [p], relics: p.relics.length, hp: p.dead ? 0 : p.hp });
    rows.sort((a, b) => b.relics - a.relics || b.hp - a.hp);
    return rows;
  }

  finishByRelics() {
    if (this.coop()) {
      const total = this.players.reduce((s, p) => s + p.relics.length, 0);
      this.finish(total >= 5 ? 'The party has recovered all five Relics and banished the evil!' : 'The quest ends with Relics still lost.', total >= 5 ? 'win' : 'loss');
      return;
    }
    const rows = this.scores();
    const w = rows[0];
    this.finish(`${w.label} ${w.members.length > 1 ? 'win' : 'wins'} with ${w.relics} Relic${w.relics === 1 ? '' : 's'}!`, 'win', w);
  }

  finish(text, kind, winner) {
    if (this.over) return;
    this.over = true;
    this.result = { text, kind, winner: winner ? winner.members.map((p) => p.id) : null, scores: this.scores(), turns: this.turn, stats: this.stats };
    this.log(text, 'victory');
  }
}
