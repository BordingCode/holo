# HOLO — progress log (read this first when resuming)

Live: https://bordingcode.github.io/holo/ · repo BordingCode/holo · local ~/cc/holo
Mathias's brief: ambitious, polished (NOT "cheap AI slop"), more excitement to look forward to + depth.
He asked to keep improving until session usage runs out, and to use Fable (model) sub-agents for quality.

## How to work on it
- Pure logic: `js/engine.js` (battle), `js/run.js` (map/packs/shop/relics). UI: `js/main.js`, `js/battle.js`, `js/pack.js`, `js/ui.js`.
- Tests: `node tests/engine.test.mjs` (rule tests) · `node tests/sim.mjs N hero heat` (SMART bot balance sim;
  env NEWBIE=1 / DUMB=1 / SETS=a,b / EXCLUDE=id). Target: smart bot ~65% win at heat 0, ~25% at heat 8.
- Local browser test: no-cache server (python http.server caches ES modules!) — see scratch nocache.py pattern:
  SimpleHTTPRequestHandler + `Cache-Control: no-store`, port 8813. Playwright at 390x844.
- Deploy: bump `?v=` in index.html AND `CACHE` in sw.js, commit, push; GitHub Pages takes ~1–5 min.
- Debug: `window.__holo` (give, coins, pack, fight, node, goto).

## Done
- v1 (2026-11-11): full game — 59 cards/7 sets, editions, pack tear ritual, combo row, map, shop, grader, events,
  3 bosses, binder + unlocks, heroes, heat, daily. Polish pass (shelf backdrop, incoming readout, loot rays, foil tear).

## In progress: "Excitement & depth" expansion (approved plan, Mathias said "go")
1. [ ] Every-round decisions: enemy positional aims (STRIKE slot = hit + jam card; empty slot = miss; BLIND slot = that slot skips next round) + Tactics (one-shot tricks, hold 3, play between rounds)
2. [ ] Set bonuses 2/4/6 (SET_BONUS in data.js), shown as glowing chips under the row
3. [ ] Damage multipliers (x.amp), finishers, growing cards (inst.grow persists), Crescendo
4. [ ] Relics (boss pick 1 of 3; treasure node per act pick 1 of 2), shop showcase card, Mythic meter (pity 40), elite loot shown on map
5. [ ] Enemy editions (Foil/Holo/Gilded/Cracked), 19 new cards (data done), achievements → card backs
- Data for all of the above is ALREADY in js/data.js (cards, SET_BONUS, TACTICS, RELICS, ENEMY_EDITIONS, ACHIEVEMENTS, CARD_BACKS) + icons rebuilt.
- NEXT: rewrite js/engine.js to support it, then run.js, then UI, then sim/balance, test in browser, push.

## Later ideas
- Fable playtest findings (agent running) → fold in.
- More events, more bosses variants, card back picker in settings.
