// Shared cosmetics catalog. Every team module reads ids from here.
// Prices are in Relix Coins (earned by playing; real shop comes later).
// An item with `level` instead of `price` is a level reward: it cannot be bought and is
// granted by profile.js when the player reaches that level (see LEVEL_REWARDS).

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
  { id: 'chief', name: 'Chief', price: 100 },
  { id: 'pale', name: 'Pale', price: 120 },
  { id: 'bend', name: 'Bend', price: 120 },
  { id: 'checky', name: 'Checky', price: 200 },
  { id: 'lozenge', name: 'Diamonds', price: 220 },
  { id: 'wavy', name: 'Waves', price: 250 },
  { id: 'starry', name: 'Starfield', level: 5 },
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
  { id: 'heart', name: 'Heart', price: 120 },
  { id: 'moon', name: 'Moon', price: 150 },
  { id: 'key', name: 'Dungeon Key', price: 150 },
  { id: 'bolt', name: 'Bolt', price: 150 },
  { id: 'tower', name: 'Tower', price: 200 },
  { id: 'flame', name: 'Eternal Flame', level: 7 },
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
  { id: 'mint', name: 'Mint Stone', price: 150, body: '#aef0d4', pip: '#140c1e', edge: '#3aa88a', finish: 'matte' },
  { id: 'lavender', name: 'Lavender', price: 150, body: '#a294d8', pip: '#fff6e2', edge: '#5e4f9e', finish: 'matte' },
  { id: 'candy', name: 'Candy', price: 250, body: '#ff7ac8', pip: '#ffffff', edge: '#b8307a', finish: 'gloss' },
  { id: 'amber', name: 'Amber', price: 250, body: '#ff9a2a', pip: '#3a1a05', edge: '#a85010', finish: 'gloss' },
  { id: 'copper', name: 'Copper', price: 300, body: '#c87a4a', pip: '#2a1405', edge: '#6a3a1a', finish: 'metal' },
  { id: 'silver', name: 'Moon Silver', price: 400, body: '#d8dce8', pip: '#2a1f38', edge: '#8a90a8', finish: 'metal' },
  { id: 'sky', name: 'Sky Glass', price: 450, body: '#7fd4ff', pip: '#ffffff', edge: '#2a6ad8', finish: 'glow' },
  { id: 'toxic', name: 'Toxic', price: 450, body: '#7aff5a', pip: '#1a3a0a', edge: '#2a8a2a', finish: 'glow' },
  { id: 'void', name: 'Voidstone', level: 10, body: '#241238', pip: '#c88aff', edge: '#6a3aa8', finish: 'glow' },
  { id: 'sunfire', name: 'Sunfire', level: 20, body: '#ffd23f', pip: '#e8304a', edge: '#e8961a', finish: 'glow' },
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

// Bundles: several items for one price. `price` is the full bundle price; when the player
// already owns part of it, profile.bundleOffer() discounts the owned share.
export const BUNDLES = [
  { id: 'inferno', name: 'Inferno Set', items: ['dice:amber', 'throw:flames', 'pattern:flames'], price: 600, tint: '#ff8a2a' },
  { id: 'frostbound', name: 'Frostbound Set', items: ['dice:frost', 'throw:frost', 'kill:shatter'], price: 650, tint: '#7fd4ff' },
  { id: 'royal', name: 'Royal Court', items: ['dice:gold', 'emblem:crown', 'pattern:border'], price: 500, tint: '#ffd23f' },
  { id: 'night', name: 'Night Watch', items: ['dice:silver', 'emblem:moon', 'kill:soulburst'], price: 620, tint: '#a294d8' },
  { id: 'party', name: 'Party Starter', items: ['dice:candy', 'emblem:heart', 'kill:confetti', 'throw:stars'], price: 780, tint: '#ff7ac8' },
];

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];
