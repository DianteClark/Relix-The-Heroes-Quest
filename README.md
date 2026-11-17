# Relix: The Heroes' Quest

A dungeon-crawl board game of relics, monsters and glory for 1–6 players, now playable in the browser.

**▶ Play it:** https://dianteclark.github.io/Relix-The-Heroes-Quest/
*(turn on GitHub Pages first: Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / root)*

Game design, rules and card art by Diante Clark. Character art was commissioned for Relix.

## What's in this prototype
- Full rules for 1–6 players. Any mix of humans (sharing one device) and bots.
- All four modes: Standard, Elimination, Players vs. Relix (co-op) and 1 Stop Shop.
- 6 heroes, 5 bosses, 15 monster cards, 80 treasure cards and 40 trap cards.
- Five themed floors, each with its own board layout.
- A 2.5D isometric board: real 3D tiles and lighting, with the chibi art standing on it.
- Cards rebuilt from the original frame art, in a card gallery and in play.
- Pets that grow into new forms as bosses fall.

Coming next: online peer-to-peer play.

## Rules
See [RULES.md](RULES.md). It's the exact ruleset the code follows.

## Running locally
It's a static site with no build step. Serve the folder with any web server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Shortcuts for testing: `?demo=4` starts a 4-bot game, and `&human` makes the first seat yours. `&mode=pvr`, `&seed=123` and `&speed=0.15` also work.

## Balance simulator
Run thousands of bot games headlessly (needs Node 18+):

```bash
node tools/sim.js 200 4 standard   # games, players, mode
```

It prints average turns, deaths, PvP fights and wins by hero.

## Code map
| File | What it does |
|---|---|
| `js/data.js` | Every hero, monster, boss, treasure and trap, with deck counts |
| `js/engine.js` | The rules engine (no graphics; runs in the browser or Node) |
| `js/bot.js` | Bot decision making |
| `js/board.js` | The five floor layouts and the seeded dice |
| `js/render3d.js` | The isometric 3D board (Three.js) |
| `js/cards.js` | Card rendering from the original frames |
| `js/main.js` | Menus, HUD, dice, prompts |

Fonts: Luckiest Guy (Apache 2.0), Lilita One and Nunito (SIL OFL). Three.js (MIT).
