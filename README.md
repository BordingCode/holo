# HOLO

A booster-pack roguelite for phones. Rip packs, chase holo pulls, build a left-to-right
combo row, and climb the card shop's shelves past three bosses.

Play: https://bordingcode.github.io/holo/

- Vanilla HTML/CSS/JS (ES modules, no build step), offline PWA.
- `js/engine.js` (battle) and `js/run.js` (map/packs/shop) are pure logic — `node tests/sim.mjs` plays hundreds of runs to check balance.
- Card & enemy icons: [game-icons.net](https://game-icons.net) (CC BY 3.0), built into `js/icons.js` by `tools/build_icons.py`.
