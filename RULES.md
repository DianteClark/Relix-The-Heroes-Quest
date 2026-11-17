# Relix: The Heroes' Quest — Rules (as built in the digital prototype)

This is the rulebook the game code follows. Items marked **[interpretation]** are calls made where the physical rules were silent; change any of them and the code changes with it.

## Goal
Fight through **five dungeon floors**. Each floor ends in a Boss Room. The player who lands the **killing blow** on a boss claims that floor's **Relic**. When the fifth boss falls, the player or guild holding the most Relics wins. **[interpretation]** If two are tied, the one with more total HP wins.

## Setup
- 1–6 players, any mix of humans and bots. Each picks a unique hero (or random).
- Every hero has **80 HP** and **attack 1**.
- Turn order is random (the table version uses age).
- Everyone starts on Start with **1 Treasure card**.

## Turn
1. **Equip** any pets in your hand. This happens automatically.
2. **Play treasure cards** that are usable at the start of a turn (potions, bombs, steals, travel cards, guild cards).
3. **Move:** roll 2 dice and move by either one. On doubles you may move by the total instead. Moving is mandatory, and you don't need an exact roll to enter the Boss Room. If you are already in the Boss Room, you fight instead of moving.
4. **Resolve the tile you land on** (passing over a tile does nothing):
   - Pick up anything left on the tile by a trap death.
   - PvP happens if non-guild players are there (not on Start, not in the Boss Room).
   - Then the tile effect: **Monster** (fight), **Treasure** (draw 1), **Trap** (draw and suffer), **Blank** (safe).

## Combat (monsters and bosses)
Before each battle roll you may play treasure cards. At the start of a battle you roll your **Skill Check**. Your hero's numbers trigger the skill, which works **once per battle** unless you play Refresh. Skill effects that say "this battle roll" apply to that first roll.

| Die | Result |
|---|---|
| 6 | Critical hit: deal 2 |
| 4–5 | Hit: deal 1 |
| 2–3 | Miss: take the enemy's attack (its dagger number) |
| 1 | Critical miss: take double the enemy's attack |

- **Monsters:** roll one die per HP the monster has left. Keep rolling until it dies or you do. Beating a monster draws **1 Treasure**.
- **Bosses:** always 5 dice (Enguxi can lower this). Each turn in the Boss Room is **one** battle roll. Everyone in the room counts toward the same roll counter. On every **3rd roll** the boss's skill fires automatically, before that player acts.
- If your roll kills the enemy, you take no damage from that roll.
- Sword and Large Sword add their bonus only if you rolled at least one hit. Hero skill bonuses always add.
- Your hero skill works once per battle. A whole boss fight counts as one battle, even across turns; after that it comes down to treasures and luck (Refresh lets you use it again).
- Extra Loot means you draw 2 treasures in total for that monster. Surprise gives no treasure at all.
- Inner Strength multiplies all the damage you deal that roll: ×2, ×4 with 2 cards, ×6 with 3. Ambush multiplies boss damage by ×3 and stacks with Inner Strength.

### Bosses
| Floor | Boss | HP | Attack | Skill (every 3rd roll) |
|---|---|---|---|---|
| 1 | Skeleton General | 20 | 2 | +5 damage on that roll, only if the player rolled a miss |
| 2 | Vore | 25 | 2 | Pushes the active player to the nearest trap tile. The trap fires, then the player continues their turn |
| 3 | Raskon | 30 | 2 | 10 damage to every player in the Boss Room |
| 4 | Enguxi | 35 | 2 | Everyone uses 1 fewer combat die, down to 1. Lasts until Enguxi falls |
| 5 | Ikias | 40 | 2 | Misses deal double damage that roll |

### Monsters (15 cards)
5× Skeleton Warrior (1 HP), 4× Trov (2 HP), 3× Dragonkin (3 HP), 2× Brevha (4 HP), 1× Ikias (5 HP, attack 2).

## Heroes
| Hero | Skill check | Effect |
|---|---|---|
| Chan Kong | 4 / 5 / 6 | Optional: −2 HP for +3 dmg / −3 for +5 / −5 for +8, this battle roll |
| Josue the Fat Assassin | 6 | Roll 2 dice; their sum is extra damage this battle roll |
| Luke | 4 / 5 / 6 | Reduce damage taken this battle roll by 2 / 3 / 5 |
| Nowtna | 4 / 5 / 6 | Heal yourself or a guild member +3 / +4 / +8 |
| Shi | 1 / 3 / 5 | 1: draw from the treasure pile · 3: steal 1 from a player · 5: steal 2 (any mix of player and pile) |
| Yessi | 4 / 5 / 6 | Bomb: 1 dmg to her tile + row neighbours / 1 dmg to her tile + column neighbours / 3 dmg to her tile + all 4 neighbours. Hits monsters, bosses and enemy players (never her own guild). Neighbours are by board position, so other rows of the path can be hit |

## PvP
Whenever players who aren't in the same guild share a tile (except Start and the Boss Room), everyone fights. Each side may play cards and rolls a Skill Check. Then each rolls 1 die, and the **highest roll deals 5 damage** to everyone else. Ties re-roll, and each re-roll adds **+5** to the damage.
- **Guild members on one tile:** only one rolls, and they get **1 free reroll**. If they lose, every member takes the damage.
- **Guild vs guild:** every member rolls, and each guild's total is compared.
- **Let Down:** you don't roll; you just take 5.
- Skill Counter cancels your opponents' skills for that PvP.

## Death
| Cause | Your treasures and Relics |
|---|---|
| Another player | The killer takes everything |
| Monster | Treasures go to the discard pile. Relics go to the Boss Room |
| Boss | Everything goes to the Boss Room, for whoever kills the boss |
| Trap | Everything stays on that tile for the next player who lands there |

Anything still left on tiles when the boss falls goes to the player who killed it.

**Standard:** respawn at Start with **40 HP** and draw 1 Treasure (2 if you died in the Boss Room). A Revival Potion in hand triggers automatically: you stay where you are with 40 HP and keep everything. If a guild leader dies, the guild disbands.

## Guilds (4+ players)
- Formed with a **Guild Banner**. Invited players must accept. Max size is half the players, rounded down.
- Members never PvP each other, and bombs, steals, Swap and Yessi's bomb only hit enemies, never guild-mates.
- In a monster or boss fight, a guild member on the same tile may **reroll your failed dice once per battle**.
- A guild's Relics count together at the end. A **Guild Bomb** disbands a guild.

## Game modes
- **Standard:** described above.
- **Elimination:** when you die, you're out for the rest of the floor and return with 40 HP on the next floor.
- **Players vs. Relix:** fully co-op. Everyone is one guild with no PvP. Death is permanent; if everyone dies, the run is lost. Win by collecting all 5 Relics.
- **1 Stop Shop:** full PvP and guilds, but one life for the whole game.

## Decks
**Treasure (80):** Potion 13 · Super Potion 6 · Ultra Potion 1 · Shield 4 · Large Shield 1 · Sword 3 · Large Sword 1 · Inner Strength 4 · Ambush 1 · Reroll 3 · Refresh 3 · Killshot 4 · Extra Loot 4 · Bomb 4 · Mega Bomb 1 · Skill Counter 4 · Steal 1 · Quick Hands 3 · Swap 1 · Guild Banner 2 · Guild Bomb 2 · Hyperspeed 1 · Trickster 2 · Fast Travel 3 · Trap Resist 4 · Revival Potion 1 · Golem (pet) 1 · Tezuki (pet) 1 · Kezz (pet) 1

**Trap (40):** Roar 1 · Giant Boulder 1 · Land Slide 1 · Double Loss 1 · Endless Pit 1 (legendary) · Restart 2 · Let Down 2 · Lose a Turn 2 · Surprise 2 · Fumble 2 · Misstep 2 · Boulder 3 · Skill Counter 3 · Double Battle 3 · Spike Trap 4 · Bat Swarm 5 · Poison Dart 5

**Pets** grow into their next form (looks only) each time a boss is defeated while you have them equipped. Goblin and Kitsune have 3 forms; the Golem has 2.
