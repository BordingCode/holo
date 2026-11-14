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
- Deploy: `python3 tools/bump.py` (versions index.html, EVERY module import, sw.js), commit, push; GitHub Pages takes ~1–5 min.
- Debug: `window.__holo` (give, coins, pack, fight, node, goto).

## Done
- v1 (2026-11-11): full game — 59 cards/7 sets, editions, pack tear ritual, combo row, map, shop, grader, events,
  3 bosses, binder + unlocks, heroes, heat, daily. Polish pass (shelf backdrop, incoming readout, loot rays, foil tear).

## In progress: "The Back Room" evolution (approved 2026-11-14, Mathias said "go")
Direction: collection matters between runs. Decisions: die → brought Deck Box cards ALL shredded;
grading = loupe minigame; collection cards may make runs easier but Deck Box size is capped (smaller at high Heat).
- [x] Stage 0: commit pending balance pass (enemy HP/dmg up).
- [x] Stage 1: merge rework — normal+special keeps special; two specials → player picks; Cracked never forced
      (fresh copy resets cracks to 3); maxed ★3 can "Apply edition"; choose target copy; merge owned↔owned;
      buttons preview result; exhaustive edition-combo tests. Same rules reused for the collection.
- [ ] Stage 2: persistent collection (take home 3 on win / 1 on death) + Deck Box ante; meta save v2 migration.
- [ ] Stage 3: Back Room hub — Credit currency, open sealed packs at home, grading slabs (loupe minigame), sell, upgrades.
- [ ] Stage 4: customers & daily orders.
- [ ] Stage 5: new set (~12 cards) + set release system; set-page completion cosmetics.
- [ ] Stage 6: sim balance incl. Deck Box, phone-size verification, Bording Hub entry.

## Done earlier: "Excitement & depth" expansion (aims, jams, tactics, set bonuses, multipliers, relics, enemy editions…)

## Later ideas
- Fable playtest findings (agent running) → fold in.
- More events, more bosses variants, card back picker in settings.
