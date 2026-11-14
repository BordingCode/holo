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
- [x] Stage 2: persistent collection (take home 3 on win / 1 on death) + Deck Box ante; meta save v2 migration.
- [x] Stage 3: Back Room hub — Credit currency, open sealed packs at home, grading slabs (loupe minigame), sell, upgrades.
- [x] Stage 4: customers & daily orders.
- [x] Stage 5: new set (~12 cards) + set release system; set-page completion cosmetics.
- [ ] Stage 6: sim balance incl. Deck Box, phone-size verification, Bording Hub entry.

## Done earlier: "Excitement & depth" expansion (aims, jams, tactics, set bonuses, multipliers, relics, enemy editions…)

## Later ideas
- Fable playtest findings (agent running) → fold in.
- More events, more bosses variants, card back picker in settings.

### Back Room notes (for resuming)
- meta.collection = [{cid,id,ed,star,mp?,cracks?,grade?}], meta.cuid, meta.boxCap (Deck Box points, base 3; R=2, M=3; Heat 4/7 shrink by 1 each).
- Deck Box: heroSelect removes picked cids from collection → R.newRun({box}) → cards get c.boxed=cid. Win: endScreen returns
  survivors once (run.boxReturned). Loss/abandon: gone. Take-home: win 3 / loss 1 (run.homePicked, run.homeDone).
- Debug: __holo.pull([[id,ed,star],...]) opens a booster with exactly those cards.
- Back Room (js/backroom.js): meta.credit, meta.display (cids of slabs), meta.upg {box, display}; meta.homePack = pack being opened at home
  (packScreen ctx.home callback skips the tray → cards straight into collection). Grading pure rules in js/grade.js
  (10 needs all three sub-grades perfect; ~7% with perfect play). Slabs (k.grade) can't go in the Deck Box or merge until cracked.
  Credit per run = floor*2 + fights + bosses*10 (+40 + heat*10 on win) + display income (sum of displayed grades). Debug: __holo.credit(n), goto('backRoom').
- GOTCHA: a module imported without the shared ?v= loads TWICE → separate `meta` objects (Back Room showed 0 Credit). Always run tools/bump.py; a test now fails on unversioned imports.
- Customers (js/customers.js pure; UI in backroom.js): meta.customers (max 3), meta.custSeq/custSeed/custDay. +1 per calendar day since
  last visit (capped) and +1 per finished run; they never leave on their own (no-FOMO per KB daily-return doc). 6 regulars with
  request preferences; big rewards sometimes paid as a Collector's Tin (opened free at home).
- Vintage set (12 cards, data.js; engine ctx helpers rowStars/nextInst/fireWhere; set bonus ★2+ +2/hit, ★3 fire twice, special ed ×1.5).
  Released via UNLOCKS 'vintage' (serve 5 customers) → banner + reveal modal (meta.flags.vintageReleased). Completing a binder set
  page pays SET_REWARD 50 Credit once (meta.setsDone) and stars the tab. New icons fetched from game-icons raw GitHub (names appended in tools/build_icons.py).
- Sim: BOX=id:ed:star,... brings Deck Box cards.
