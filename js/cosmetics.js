// Shared cosmetics catalog. Every team module reads ids from here.
// Prices are in Relix Coins (earned by playing; real shop comes later).

export const BANNER_COLORS = [
  '#c9302c', '#e0702a', '#f2c443', '#3fa34d', '#1f8a8a', '#2f6fd1', '#5b3fbf', '#a8327e',
  '#f4ecdf', '#2a2238', '#111111', '#7a5230',
];

export const BANNER_PATTERNS = [
  { id: 'plain', name: 'Plain', price: 0 },
  { id: 'chevron', name: 'Chevron', price: 0 },
  { id: 'stripes', name: 'Stripes', price: 0 },
  { id: 'quarters', name: 'Quarters', price: 120 },
  { id: 'saltire', name: 'Saltire', price: 120 },
  { id: 'border', name: 'Bordure', price: 150 },
  { id: 'flames', name: 'Flames', price: 300 },
];

export const BANNER_EMBLEMS = [
  { id: 'dragon', name: 'Dragon', price: 0 },
  { id: 'sword', name: 'Sword', price: 0 },
  { id: 'skull', name: 'Skull', price: 0 },
  { id: 'crown', name: 'Crown', price: 100 },
  { id: 'star', name: 'Star', price: 100 },
  { id: 'shield', name: 'Shield', price: 100 },
  { id: 'gem', name: 'Relic Gem', price: 250 },
  { id: 'eye', name: 'Watcher Eye', price: 250 },
];

// Dice skins: body = die color, pip = pip color, edge = outline/bevel tint,
// finish: 'matte' | 'gloss' | 'metal' | 'glow'
export const DICE_SKINS = [
  { id: 'bone', name: 'Bone', price: 0, body: '#f3ead8', pip: '#2a1f38', edge: '#c9bda5', finish: 'matte' },
  { id: 'obsidian', name: 'Obsidian', price: 0, body: '#1d1a24', pip: '#f2c443', edge: '#4a3d5e', finish: 'gloss' },
  { id: 'ruby', name: 'Ruby', price: 150, body: '#b3122e', pip: '#fff2d0', edge: '#5e0716', finish: 'gloss' },
  { id: 'jade', name: 'Jade', price: 150, body: '#2e9a6a', pip: '#f4ecdf', edge: '#1a5a3e', finish: 'gloss' },
  { id: 'gold', name: 'Royal Gold', price: 400, body: '#e8b93a', pip: '#3a2208', edge: '#8a5a0a', finish: 'metal' },
  { id: 'frost', name: 'Frostbite', price: 400, body: '#bfe6ff', pip: '#1b3a66', edge: '#6fb0e0', finish: 'glow' },
  { id: 'relic', name: 'Relic Core', price: 800, body: '#5b3fbf', pip: '#ffe27a', edge: '#2a1a66', finish: 'glow' },
];

// Particle trail while dice fly + burst when they land.
export const THROW_FX = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'dust', name: 'Dungeon Dust', price: 0 },
  { id: 'sparks', name: 'Sparks', price: 150 },
  { id: 'flames', name: 'Flames', price: 300 },
  { id: 'frost', name: 'Frost', price: 300 },
  { id: 'stars', name: 'Starfall', price: 500 },
];

// Played in the battle scene when your hero defeats a monster, boss or player.
export const KILL_FX = [
  { id: 'none', name: 'Classic', price: 0 },
  { id: 'shatter', name: 'Shatter', price: 200 },
  { id: 'soulburst', name: 'Soul Burst', price: 300 },
  { id: 'lightning', name: 'Thunderstrike', price: 400 },
  { id: 'confetti', name: 'Party Time', price: 250 },
];

export const DEFAULT_BANNER = { name: '', field: '#2f6fd1', accent: '#f2c443', pattern: 'chevron', emblem: 'dragon', emblemColor: '#f4ecdf' };

// Guild/hero colors used for bots and extra hot-seat humans.
export const SEAT_BANNERS = [
  { field: '#c9302c', accent: '#f2c443', pattern: 'chevron', emblem: 'sword', emblemColor: '#f4ecdf' },
  { field: '#2f6fd1', accent: '#f4ecdf', pattern: 'stripes', emblem: 'dragon', emblemColor: '#f2c443' },
  { field: '#3fa34d', accent: '#111111', pattern: 'plain', emblem: 'skull', emblemColor: '#f4ecdf' },
  { field: '#5b3fbf', accent: '#f2c443', pattern: 'quarters', emblem: 'crown', emblemColor: '#f2c443' },
  { field: '#e0702a', accent: '#2a2238', pattern: 'saltire', emblem: 'star', emblemColor: '#2a2238' },
  { field: '#1f8a8a', accent: '#f4ecdf', pattern: 'border', emblem: 'shield', emblemColor: '#f4ecdf' },
];

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];
