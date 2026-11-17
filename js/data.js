// Relix: The Heroes' Quest — card and character data.
// All numbers come from the official cards and the designer's rules.

export const MAX_HP = 80;
export const RESPAWN_HP = 40;
export const PVP_BASE = 5;

export const HEROES = [
  {
    id: 'chan_kong', name: 'Chan Kong', role: 'Berserker', art: 'chan_kong', atk: 1, hp: 80,
    triggers: [4, 5, 6],
    skill: [
      '4: −2 health and gain +3 damage this battle roll.',
      '5: −3 health and gain +5 damage this battle roll.',
      '6: −5 health and gain +8 damage this battle roll.',
      "Chan Kong's ability is optional to use in battle.",
    ],
  },
  {
    id: 'josue', name: 'Josue the Fat Assassin', short: 'Josue', role: 'Assassin', art: 'josue', atk: 1, hp: 80,
    triggers: [6],
    skill: ['6: Roll 2 dice. The sum of the 2 dice is the additional damage dealt this battle roll.'],
  },
  {
    id: 'luke', name: 'Luke', role: 'Knight', art: 'luke', atk: 1, hp: 80,
    triggers: [4, 5, 6],
    skill: [
      '4: Luke reduces the amount of damage taken this battle roll by 2.',
      '5: Luke reduces the amount of damage taken this battle roll by 3.',
      '6: Luke reduces the amount of damage taken this battle roll by 5.',
    ],
  },
  {
    id: 'nowtna', name: 'Nowtna', role: 'Cleric', art: 'nowtna', atk: 1, hp: 80,
    triggers: [4, 5, 6],
    skill: [
      '4: Heal yourself or a guild member for +3 health.',
      '5: Heal yourself or a guild member for +4 health.',
      '6: Heal yourself or a guild member for +8 health.',
    ],
  },
  {
    id: 'shi', name: 'Shi', role: 'Thief', art: 'shi', atk: 1, hp: 80,
    triggers: [1, 3, 5],
    skill: [
      '1: Steal a treasure from the treasure pile.',
      '3: Steal a treasure from another player.',
      '5: Steal 2 treasures from another player, the treasure pile, or 1 from a player and 1 from the treasure pile.',
    ],
  },
  {
    id: 'yessi', name: 'Yessi', role: 'Fairy', art: 'yessi', atk: 1, hp: 80,
    triggers: [4, 5, 6],
    skill: [
      '4: Yessi deals 1 damage to everything on her tile and horizontally adjacent.',
      '5: Yessi deals 1 damage to everything on her tile and vertically adjacent.',
      '6: Yessi deals 3 damage to everything on her tile and adjacent to her.',
    ],
  },
];

export const MONSTERS = [
  { id: 'skeleton_warrior', name: 'Skeleton Warrior', art: 'skeleton_warrior', hp: 1, atk: 1, count: 5 },
  { id: 'trov', name: 'Trov', art: 'trov', hp: 2, atk: 1, count: 4 },
  { id: 'dragonkin', name: 'Dragonkin', art: 'dragonkin', hp: 3, atk: 1, count: 3 },
  { id: 'brevha', name: 'Brevha', art: 'brevha', hp: 4, atk: 1, count: 2 },
  { id: 'ikias_monster', name: 'Ikias', art: 'ikias_monster', hp: 5, atk: 2, count: 1 },
];

// Floor order follows boss HP (20 → 40).
export const BOSSES = [
  {
    id: 'skeleton_general', name: 'Skeleton General', art: 'skeleton_general', hp: 20, atk: 2, floor: 1,
    skill: 'Every third battle roll the Skeleton General deals +5 damage during battle. (This only takes effect if the Skeleton General deals damage. If the player does not roll a miss, no additional damage is added.)',
    theme: { name: 'The Bone Crypt', sky: 0x1b2a1f, fog: 0x14201a, ground: 0x2b3a2c, accent: 0x7fd36b, light: 0xbfffb0 },
  },
  {
    id: 'vore', name: 'Vore', art: 'vore', hp: 25, atk: 2, floor: 2,
    skill: 'Every third battle roll Vore pushes the active player out of the boss room to the nearest trap tile. The trap activates immediately and then the player proceeds with their turn.',
    theme: { name: 'The Sand Hive', sky: 0x3a2a14, fog: 0x2e2210, ground: 0x5a4524, accent: 0xf0c050, light: 0xffe2a0 },
  },
  {
    id: 'raskon', name: 'Raskon', art: 'raskon', hp: 30, atk: 2, floor: 3,
    skill: 'Every third battle roll Raskon deals 10 damage to all players in the boss room.',
    theme: { name: 'The Ember Forge', sky: 0x2a0f0b, fog: 0x220c08, ground: 0x3d1d16, accent: 0xff6a2a, light: 0xffb27a },
  },
  {
    id: 'enguxi', name: 'Enguxi', art: 'enguxi', hp: 35, atk: 2, floor: 4,
    skill: 'Every third battle roll Enguxi forces all players to use 1 less die during combat. Enguxi continues to reduce the number of dice until only 1 remains. Once Enguxi is defeated the number of dice used for combat returns to normal.',
    theme: { name: 'The Gloom Mire', sky: 0x16241a, fog: 0x0f1c14, ground: 0x24382a, accent: 0xe0d040, light: 0xd8ffb0 },
  },
  {
    id: 'ikias_boss', name: 'Ikias', art: 'ikias_boss', hp: 40, atk: 2, floor: 5,
    skill: 'Every third battle roll Ikias deals double damage on all misses.',
    theme: { name: 'The Shadow Sanctum', sky: 0x1a1030, fog: 0x120a24, ground: 0x2a2040, accent: 0xb07aff, light: 0xd8c0ff },
  },
];

// kind: active (played, then discarded) | pet (equipped, permanent) | auto (triggers itself) | reactive (offered when it applies)
// when: turn = start of your turn, battle = start of a battle roll vs monster/boss, pvp = before a PvP roll
export const TREASURES = [
  { id: 'potion', name: 'Potion', count: 13, kind: 'active', when: ['turn', 'battle', 'pvp'], text: 'Heal 5 health.' },
  { id: 'super_potion', name: 'Super Potion', count: 6, kind: 'active', when: ['turn', 'battle', 'pvp'], text: 'Heal 10 health.' },
  { id: 'ultra_potion', name: 'Ultra Potion', count: 1, kind: 'active', when: ['turn', 'battle', 'pvp'], text: 'Restore your health to full.' },
  { id: 'shield', name: 'Shield', count: 4, kind: 'active', when: ['battle', 'pvp'], text: 'Reduce damage taken by 3 this battle roll.' },
  { id: 'large_shield', name: 'Large Shield', count: 1, kind: 'active', when: ['battle', 'pvp'], text: 'Reduce damage taken by 5 this battle roll.' },
  { id: 'sword', name: 'Sword', count: 3, kind: 'active', when: ['battle', 'pvp'], text: '+2 damage this battle roll.' },
  { id: 'large_sword', name: 'Large Sword', count: 1, kind: 'active', when: ['battle', 'pvp'], text: '+4 damage this battle roll.' },
  { id: 'inner_strength', name: 'Inner Strength', count: 4, kind: 'active', when: ['battle', 'pvp'], text: 'Do x2 damage this battle roll. Stacks with other Inner Strength cards: x4 with 2, x6 with all 3.' },
  { id: 'ambush', name: 'Ambush', count: 1, kind: 'active', when: ['battle'], boss: true, text: 'Do x3 damage to the boss this battle roll.' },
  { id: 'reroll', name: 'Reroll', count: 3, kind: 'active', when: ['battle'], text: 'Reroll all misses this battle roll.' },
  { id: 'refresh', name: 'Refresh', count: 3, kind: 'active', when: ['battle'], text: 'You can now activate your skill again this battle.' },
  { id: 'killshot', name: 'Killshot', count: 4, kind: 'active', when: ['battle'], monster: true, text: 'Instantly kill a monster.' },
  { id: 'extra_loot', name: 'Extra Loot', count: 4, kind: 'active', when: ['battle'], monster: true, text: 'Draw 2 treasures when you kill this monster.' },
  { id: 'bomb', name: 'Bomb', count: 4, kind: 'active', when: ['turn', 'battle'], monster: true, text: 'Do 5 damage to a monster or a player. Not bosses.' },
  { id: 'mega_bomb', name: 'Mega Bomb', count: 1, kind: 'active', when: ['turn', 'battle'], monster: true, text: 'Do 10 damage to a monster or a player. Not bosses.' },
  { id: 'skill_counter', name: 'Skill Counter', count: 4, kind: 'active', when: ['pvp'], text: "Deactivate your opponents' skills this PvP battle." },
  { id: 'steal', name: 'Steal', count: 1, kind: 'active', when: ['turn'], text: 'Steal 1 treasure from a player.' },
  { id: 'quick_hands', name: 'Quick Hands', count: 3, kind: 'active', when: ['turn'], text: "Roll a 4, 5 or 6 to steal a player's treasure card." },
  { id: 'swap', name: 'Swap', count: 1, kind: 'active', when: ['turn'], text: 'Swap all treasures in your hand with another player. You must have at least one other treasure card.' },
  { id: 'guild_banner', name: 'Guild Banner', count: 2, kind: 'active', when: ['turn'], text: 'Create a guild. Invite players; each must accept to join.' },
  { id: 'guild_bomb', name: 'Guild Bomb', count: 2, kind: 'active', when: ['turn'], text: 'Destroy a guild banner. That guild disbands.' },
  { id: 'hyperspeed', name: 'Hyperspeed', count: 1, kind: 'active', when: ['turn'], text: 'Move straight to the boss room.' },
  { id: 'trickster', name: 'Trickster', count: 2, kind: 'active', when: ['turn'], text: "Travel to a player on a trap tile. Don't engage in PvP; make them suffer the trap. If multiple players are there, pick one." },
  { id: 'fast_travel', name: 'Fast Travel', count: 3, kind: 'active', when: ['turn'], text: "Travel to any player and engage in PvP. If it's a special tile, activate it after the PvP." },
  { id: 'trap_resist', name: 'Trap Resist', count: 4, kind: 'reactive', when: [], text: 'Deactivate a trap you land on.' },
  { id: 'revival_potion', name: 'Revival Potion', count: 1, kind: 'auto', when: [], text: 'When you die, revive on your current tile with all your treasures and relics.' },
  { id: 'pet_golem', name: 'Golem', count: 1, kind: 'pet', pet: 'golem', forms: 2, when: [], text: 'Pet. Permanently reduce damage taken by 1 every battle roll.' },
  { id: 'pet_tezuki', name: 'Tezuki', count: 1, kind: 'pet', pet: 'kitsune', forms: 3, when: [], text: 'Pet. Tezuki adds +3 to all heals the player obtains.' },
  { id: 'pet_kezz', name: 'Kezz', count: 1, kind: 'pet', pet: 'goblin', forms: 3, when: [], text: 'Pet. Kezz lets the player draw +1 treasure card when defeating a monster or boss.' },
];

export const TRAPS = [
  { id: 'roar', name: 'Roar', count: 1, text: 'Lose all relics and treasures, even those equipped.' },
  { id: 'giant_boulder', name: 'Giant Boulder', count: 1, text: 'Take 25 damage.' },
  { id: 'land_slide', name: 'Land Slide', count: 1, text: 'All players on this tile and the adjacent tiles in this row take 15 damage.' },
  { id: 'endless_pit', name: 'Endless Pit', count: 3, text: 'You die.' },
  { id: 'restart', name: 'Restart', count: 2, text: 'Go to the start tile.' },
  { id: 'skill_counter', name: 'Skill Counter', count: 3, text: 'Your skill is deactivated next battle.' },
  { id: 'boulder', name: 'Boulder', count: 2, text: 'Take 10 damage.' },
  { id: 'double_battle', name: 'Double Battle', count: 3, text: 'The next monster tile you land on, fight 2 monsters.' },
  { id: 'double_loss', name: 'Double Loss', count: 1, text: 'Lose your next 2 turns.' },
  { id: 'let_down', name: 'Let Down', count: 2, text: "During your next PvP don't roll, just take 5 damage." },
  { id: 'spike_trap', name: 'Spike Trap', count: 3, text: 'Take 5 damage.' },
  { id: 'bat_swarm', name: 'Bat Swarm', count: 5, text: 'Lose one treasure in hand at random. If none in hand, lose one equipped.' },
  { id: 'lose_a_turn', name: 'Lose a Turn', count: 2, text: 'Lose your next turn.' },
  { id: 'surprise', name: 'Surprise', count: 2, text: 'Fight a monster. Get no treasure for beating it.' },
  { id: 'poison_dart', name: 'Poison Dart', count: 5, text: 'Take 3 damage.' },
  { id: 'fumble', name: 'Fumble', count: 2, text: 'The next player takes a treasure from your hand at random.' },
  { id: 'misstep', name: 'Misstep', count: 2, text: 'Move back 3 tiles. If you land on another special tile, it activates.' },
];

export const MODES = [
  { id: 'standard', name: 'Standard', text: 'Complete all five floors. The player or guild with the most Relics wins. Die and you respawn at Start with 40 HP.' },
  { id: 'elimination', name: 'Elimination', text: 'Die and you are out for the rest of the floor. You return with 40 HP at the start of the next floor.' },
  { id: 'pvr', name: 'Players vs. Relix', text: 'Fully cooperative. Everyone is one guild. Collect all 5 Relics together. Death is permanent; if everyone dies, the run is lost.' },
  { id: 'onestop', name: '1 Stop Shop', text: 'Full PvP and guilds, but every player has only 1 life for the whole game.' },
];

export const TILE = { START: 'start', BLANK: 'blank', MONSTER: 'monster', TREASURE: 'treasure', TRAP: 'trap', BOSS: 'boss' };

export const byId = (list, id) => list.find((x) => x.id === id);
export const treasureDef = (id) => byId(TREASURES, id);
export const trapDef = (id) => byId(TRAPS, id);
export const monsterDef = (id) => byId(MONSTERS, id);
export const heroDef = (id) => byId(HEROES, id);

export const sumCounts = (list) => list.reduce((s, x) => s + x.count, 0);
