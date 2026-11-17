// Headless bot-vs-bot simulator: node tools/sim.js [games] [players] [mode]
import { Game } from '../js/engine.js';
import { HEROES } from '../js/data.js';

const games = +(process.argv[2] || 50), np = +(process.argv[3] || 4), mode = process.argv[4] || 'standard';
const agg = { turns: 0, deaths: 0, pvp: 0, wins: {}, kinds: {}, relicsByHero: {}, errors: 0 };
for (let g = 0; g < games; g++) {
  const heroes = [...HEROES].sort(() => Math.random() - 0.5).slice(0, np);
  const io = { log: process.env.VERBOSE ? (m) => console.log(m) : () => {}, event: () => {}, choose: async () => { throw new Error('no humans'); } };
  const game = new Game({ mode, speed: 0, seed: 1000 + g, players: heroes.map((h) => ({ hero: h.id, bot: true })) }, io);
  try {
    const r = await game.run();
    agg.turns += r.turns; agg.deaths += r.stats.deaths; agg.pvp += r.stats.pvp;
    agg.kinds[r.kind] = (agg.kinds[r.kind] || 0) + 1;
    for (const p of game.players) agg.relicsByHero[p.hero] = (agg.relicsByHero[p.hero] || 0) + p.relics.length;
    if (r.winner) for (const id of r.winner) agg.wins[game.players[id].hero] = (agg.wins[game.players[id].hero] || 0) + 1;
  } catch (e) { agg.errors++; console.error('game', g, 'seed', 1000 + g, e); }
}
console.log(JSON.stringify({ games, np, mode, avgTurns: (agg.turns / games).toFixed(1), avgDeaths: (agg.deaths / games).toFixed(1), avgPvp: (agg.pvp / games).toFixed(1), kinds: agg.kinds, wins: agg.wins, relicsByHero: agg.relicsByHero, errors: agg.errors }, null, 1));
