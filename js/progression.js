// Relix progression tables: XP curve, level rewards, achievements. Pure data + math,
// no storage (profile.js applies them). Kept separate so the tables are easy to tune.

export const MAX_LEVEL = 30;

/** XP needed to go from level L to L+1. */
export const xpToNext = (L) => 100 + 40 * (L - 1);

/** Total XP at which level L starts (level 1 starts at 0). */
export function xpAtLevel(L) {
  let t = 0;
  for (let i = 1; i < Math.min(L, MAX_LEVEL); i++) t += xpToNext(i);
  return t;
}

/** { level, into, need, frac } for a total XP amount. need = 0 at max level. */
export function levelOf(xp) {
  let L = 1, rest = Math.max(0, Math.floor(xp || 0));
  while (L < MAX_LEVEL && rest >= xpToNext(L)) { rest -= xpToNext(L); L++; }
  const need = L >= MAX_LEVEL ? 0 : xpToNext(L);
  return { level: L, into: need ? rest : 0, need, frac: need ? rest / need : 1 };
}

/** Coins every level-up pays, plus the item some levels grant (key 'kind:id'). */
export const levelCoins = (L) => 40 + 10 * L;
export const LEVEL_ITEMS = {
  3: 'emblem:heart',
  5: 'pattern:starry',
  7: 'emblem:flame',
  10: 'dice:void',
  12: 'throw:stars',
  15: 'pattern:wavy',
  18: 'kill:lightning',
  20: 'dice:sunfire',
  25: 'dice:relic',
  30: 'emblem:eye',
};

/** XP and coins for one finished game. r = { placement, players, relics, kills, bossKills, won } */
export function gameRewards(r) {
  const players = Math.max(1, r.players | 0 || 1);
  const place = Math.min(players, Math.max(1, r.placement | 0 || players));
  const beat = players - place;
  const xp = 40 + (r.relics | 0) * 30 + (r.bossKills | 0) * 50 + (r.kills | 0) * 5 + beat * 15 + (r.won ? 120 : 0);
  const coins = 20 + (r.relics | 0) * 25 + (r.bossKills | 0) * 15 + (r.kills | 0) * 2 + beat * 5 + (r.won ? 60 : 0);
  return { xp, coins };
}

// Achievements. `goal` + `stat` show a progress bar (profile.stats[stat], or the length of
// an array stat). `coins` and optional `item` are granted on unlock. `icon` is a key into
// the menu icon set. `hidden` ones show as "???" until earned.
export const ACHIEVEMENTS = [
  { id: 'first_game', name: 'Into the Dungeon', desc: 'Finish your first game.', icon: 'gate', coins: 50 },
  { id: 'first_win', name: 'Champion', desc: 'Win a game.', icon: 'crown', coins: 100 },
  { id: 'first_relic', name: 'First Relic', desc: 'Claim your first Relic.', icon: 'gem', coins: 60 },
  { id: 'relic_trio', name: 'Relic Hoarder', desc: 'Hold 3 Relics in one game.', icon: 'gem', coins: 150 },
  { id: 'first_boss', name: 'Bossbreaker', desc: 'Land the killing blow on a boss.', icon: 'skull', coins: 80 },
  { id: 'all_bosses', name: 'Master of Floors', desc: 'Slay all 5 bosses.', icon: 'skull', coins: 400, goal: 5, stat: 'bossesSlain', item: 'emblem:tower' },
  { id: 'five_kind', name: 'Five of a Kind', desc: 'Roll five of a kind.', icon: 'dice', coins: 150 },
  { id: 'all_sixes', name: 'Perfect Roll', desc: 'Roll five sixes at once.', icon: 'dice', coins: 300, hidden: true },
  { id: 'monster_50', name: 'Monster Hunter', desc: 'Defeat 50 monsters.', icon: 'sword', coins: 200, goal: 50, stat: 'monsterKills' },
  { id: 'brawler', name: 'Brawler', desc: 'Win a PvP brawl.', icon: 'fist', coins: 60 },
  { id: 'last_stand', name: 'By a Thread', desc: 'Survive with exactly 1 HP.', icon: 'heart', coins: 120 },
  { id: 'pit_diver', name: 'Pit Diver', desc: 'Fall into the Endless Pit.', icon: 'pit', coins: 50, hidden: true },
  { id: 'beast_tamer', name: 'Beast Tamer', desc: 'Equip a pet.', icon: 'paw', coins: 60 },
  { id: 'guild_founder', name: 'Banner Raiser', desc: 'Found a guild.', icon: 'banner', coins: 60 },
  { id: 'hoarder', name: 'Deep Pockets', desc: 'Hold 6 treasures at once.', icon: 'bag', coins: 100 },
  { id: 'flawless', name: 'Untouchable', desc: 'Win a game without dying.', icon: 'shield', coins: 200 },
  { id: 'elim_win', name: 'Last One Standing', desc: 'Win an Elimination game.', icon: 'crown', coins: 150 },
  { id: 'all_heroes', name: 'Hall of Heroes', desc: 'Win as each of the 6 heroes.', icon: 'star', coins: 500, goal: 6, stat: 'heroWins', item: 'dice:copper' },
  { id: 'games_10', name: 'Regular', desc: 'Finish 10 games.', icon: 'gate', coins: 150, goal: 10, stat: 'games' },
  { id: 'wins_10', name: 'Legend', desc: 'Win 10 games.', icon: 'crown', coins: 300, goal: 10, stat: 'wins' },
  { id: 'level_10', name: 'Seasoned', desc: 'Reach level 10.', icon: 'star', coins: 200, goal: 10, stat: 'level' },
  { id: 'collector', name: 'Collector', desc: 'Own 30 cosmetics.', icon: 'chest', coins: 250, goal: 30, stat: 'owned' },
];

/** Events the game fires (achievementsFor(event, data)) and what they check. */
export const ACH_EVENTS = {
  relic: 'data.count = Relics the player now holds',
  roll: 'data.values = the dice values of one roll',
  kill: "data.target = 'monster' | 'boss' | 'player', data.bossId for bosses",
  pvp_win: 'the player won a PvP brawl',
  hp: 'data.hp = health after taking damage (alive)',
  trap: 'data.id = trap id',
  pet: 'data.id = pet treasure id',
  guild: 'the player founded a guild',
  hand: 'data.count = treasure cards in hand',
};
