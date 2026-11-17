// Bot brains. Simple, readable heuristics; good enough to be a real opponent.
import { treasureDef, TILE } from './data.js';

const has = (opts, id) => opts.some((o) => o.id === id);
const cardOpt = (req, ids) => req.options.find((o) => o.card && ids.includes(o.card.id));

function threat(game, p, q) {
  // How attractive q is as a target for p.
  if (game.sameGuild(p, q)) return -999;
  return q.relics.length * 10 + q.hand.length * 2 + (80 - q.hp) / 10;
}

export function botDecide(game, p, req) {
  const o = req.options;
  const hpFrac = p.hp / p.maxHp;
  switch (req.kind) {
    case 'turn': {
      const heal = hpFrac < 0.45 && (cardOpt(req, ['super_potion']) || cardOpt(req, ['potion']) || (hpFrac < 0.3 && cardOpt(req, ['ultra_potion'])));
      if (heal) return heal.id;
      for (const id of ['guild_banner', 'steal', 'quick_hands']) { const c = cardOpt(req, [id]); if (c) return c.id; }
      const bomb = cardOpt(req, ['mega_bomb', 'bomb']);
      if (bomb) {
        const dmg = bomb.card.id === 'mega_bomb' ? 10 : 5;
        if (game.others(p).some((q) => !game.sameGuild(p, q) && (q.hp <= dmg || q.relics.length >= 1))) return bomb.id;
      }
      const gb = cardOpt(req, ['guild_bomb']);
      if (gb && game.guilds.some((g) => g.id !== p.guild)) return gb.id;
      const hyper = cardOpt(req, ['hyperspeed']);
      if (hyper && hpFrac > 0.6 && p.pos < game.bossIdx - 6) return hyper.id;
      const ft = cardOpt(req, ['fast_travel']);
      if (ft && hpFrac > 0.6 && game.others(p).some((q) => !game.sameGuild(p, q) && q.relics.length && q.hp < 30 && q.pos !== game.bossIdx)) return ft.id;
      const tr = cardOpt(req, ['trickster']);
      if (tr && game.tricksterTargets(p).some((q) => !game.sameGuild(p, q))) return tr.id;
      const swap = cardOpt(req, ['swap']);
      if (swap && game.others(p).some((q) => q.hand.length > p.hand.length + 1)) return swap.id;
      return 'go';
    }
    case 'bomb_target': case 'steal_target': case 'swap_target': case 'fast_travel_target': case 'pick_player': {
      let best = o[0], bs = -Infinity;
      for (const opt of o) {
        const q = game.players[opt.player];
        let s = threat(game, p, q);
        if (req.kind === 'steal_target' || req.kind === 'swap_target') s = game.sameGuild(p, q) ? -999 : q.hand.length * 3 + q.relics.length;
        if (req.kind === 'bomb_target' && q.hp <= 10) s += 50;
        if (s > bs) { bs = s; best = opt; }
      }
      return best.id;
    }
    case 'trickster_target': {
      const opts = o.filter((x) => !game.sameGuild(p, game.players[x.player]));
      return (opts[0] || o[0]).id;
    }
    case 'heal_target': {
      let best = o[0], bs = Infinity;
      for (const opt of o) { const q = game.players[opt.player]; const f = q.hp / q.maxHp; if (f < bs) { bs = f; best = opt; } }
      return best.id;
    }
    case 'guild_bomb': {
      const other = o.find((x) => x.id !== 'g' + p.guild);
      return (other || o[0]).id;
    }
    case 'guild_invite': {
      const cands = o.filter((x) => x.id !== 'done');
      if (!cands.length) return 'done';
      // Invite the strongest remaining player.
      cands.sort((a, b) => game.players[b.player].relics.length - game.players[a.player].relics.length || game.players[b.player].hp - game.players[a.player].hp);
      return cands[0].id;
    }
    case 'guild_accept': return game.rng.next() < 0.6 ? 'yes' : 'no';
    case 'move': {
      let best = o[0], bs = -Infinity;
      for (const opt of o) {
        const t = game.tile(opt.dest);
        let s = 0;
        if (t.type === TILE.BOSS) s = hpFrac > 0.55 ? 12 : hpFrac > 0.35 ? 4 : -6;
        else if (t.type === TILE.TREASURE) s = 7;
        else if (t.type === TILE.BLANK) s = 3 + (hpFrac < 0.4 ? 3 : 0);
        else if (t.type === TILE.MONSTER) s = hpFrac > 0.5 ? 6 : hpFrac > 0.3 ? 2 : -3;
        else if (t.type === TILE.TRAP) s = p.hand.some((c) => c.id === 'trap_resist') ? 3 : -4;
        const occ = game.playersAt(opt.dest).filter((q) => q !== p && !game.sameGuild(p, q));
        if (occ.length && t.type !== TILE.BOSS) s += hpFrac > 0.6 ? 2 + occ.reduce((a, q) => a + q.relics.length * 4, 0) : -5;
        if (game.tileLoot?.[opt.dest]) s += 8;
        s += opt.dest * 0.08 + game.rng.next() * 1.5;
        if (s > bs) { bs = s; best = opt; }
      }
      return best.id;
    }
    case 'trap_resist': return 'yes';
    case 'chan_kong': return p.hp > (req.cost || 3) + 15 ? 'yes' : 'no';
    case 'shi_source': return game.others(p).some((q) => q.hand.length && !game.sameGuild(p, q)) ? 'player' : 'pile';
    case 'battle': {
      const e = req.enemy;
      const m = req.mods || {};
      if (hpFrac < 0.3) { const h = cardOpt(req, ['super_potion', 'ultra_potion', 'potion']); if (h) return h.id; }
      if (e.kind === 'monster') {
        const k = e.hp >= 3 && cardOpt(req, ['killshot']); if (k) return k.id;
        const bomb = e.hp >= 3 && cardOpt(req, ['mega_bomb', 'bomb']); if (bomb) return bomb.id;
        const loot = cardOpt(req, ['extra_loot']); if (loot && e.hp >= 2) return loot.id;
        if (hpFrac < 0.35) { const sh = !m.shield && cardOpt(req, ['shield', 'large_shield']); if (sh) return sh.id; }
        return 'go';
      }
      // Boss: go all-in when it can finish the boss or when healthy.
      const big = e.hp >= 8;
      if (big) {
        const a = !m.ambush && cardOpt(req, ['ambush']); if (a) return a.id;
        const i = m.inner < 3 && cardOpt(req, ['inner_strength']); if (i) return i.id;
        const s = cardOpt(req, ['large_sword', 'sword']); if (s && m.sword < 6) return s.id;
      }
      const rr = !m.reroll && cardOpt(req, ['reroll']); if (rr) return rr.id;
      if (hpFrac < 0.5) { const sh = !m.shield && cardOpt(req, ['large_shield', 'shield']); if (sh) return sh.id; }
      const rf = !m.refresh && cardOpt(req, ['refresh']); if (rf && p.hero !== 'shi') return rf.id;
      return 'go';
    }
    case 'guild_reroll': return 'yes';
    case 'pvp_cards': {
      if (hpFrac < 0.3) { const h = cardOpt(req, ['super_potion', 'potion']); if (h) return h.id; }
      const sc = cardOpt(req, ['skill_counter']); if (sc && game.rng.next() < 0.5) return sc.id;
      if (hpFrac < 0.5) { const sh = cardOpt(req, ['shield', 'large_shield']); if (sh && game.rng.next() < 0.6) return sh.id; }
      return 'go';
    }
    case 'pvp_reroll': return (req.value || 6) <= 3 ? 'yes' : 'no';
    default: {
      const prim = o.find((x) => x.primary);
      return (prim || o[0]).id;
    }
  }
}
