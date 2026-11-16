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

## 2026-11-15 Shroom-and-Gloom blend (Mathias said "go"), plan: 1 growing cards · 2 room-by-room exploring · 3 mood pass
- [x] Unique art: every card has its own icon, none equal a set glyph (test guards it). 18 new icons appended to js/icons.js
      straight from the game-icons repo (NOT a full rebuild — stems exist under several authors).
- [x] Step 1 growing cards: inst.xp; +1 per fire (max 3/round, B.xpRound) +2 per kill, ROW only, passives never.
      GROWTH {alt 12, full 32}, GROW_MULT [1,1.3,1.6] folded into cardValues mult. data.js BLOOM: hand-made bonus for the 14
      number-less cards (from Alt) + named Full Art for the 7 starters (Haymaker, Bastion, Grindstone, Inferno Fang, Bonfire,
      Master Thief, Loaded Coin). Event 'bloom' → banner+burst in battle.js. Merge keeps max xp. CSS .st-1/.st-2, .xp bar.
      SIM BUG FIXED: evalRow test-fired the REAL cards (inflated Trophy/Snowball growth for years) → now copies.
      Sim knobs: GALT/GFULL/GMULT (tuned via engine re-export; data.js imported unversioned is a second copy!).
      Rebalanced ACT_DMG {1.3, 1.85, 2.3}: Kip h0 70%, Wick h0 61.5%, Kip h8 35.5%. ~11% of row Alt at act 2, ~24% Full at end.
- [x] Step 2 rooms: mapScreen → roomScreen (main.js). Same map graph underneath (sim/balance untouched). CSS one-point-perspective
      room (.rm-scene: ceil/sides/floor rotateX checker/wall/lamp cone), a .door per reachable node (plaque icon = type,
      light spill in type colour), tap = listen (hint line from DOOR_HINTS, seeded) → "Go through" = door swings + zoom into it.
      Room names seeded per node (ROOM_NAMES per act; ENTRANCE before first node). Old map = floorPlan() modal (map icon in topbar).
      Act palettes .room.act-1/2/3 (warm / cold glass / red).
- [x] Step 3 mood: flashlight(room) (pointer / gyro / idle drift, lerped CSS vars --lx/--ly on .rm-dark; aims at a tapped door),
      seeded silhouette props (PROPS per act, 3 of 6 spots), sfx.listen(type) per door type + sfx.creak on walking through,
      music modes explore1/2/3 (slow low pads, chimes, act2 hum, act3 thumps), battle screen gets .battle-act-N lighting.
      Room .lamp CSS is scoped to .room (battle has its own .lamp!). Prop icons re-added to icons.js (were Vintage-era).
- NEXT ideas: Mathias's phone feel test; maybe door variety per type (shop door with window, boss door chains).

## 2026-11-16 ROLLBACK: original map back, card growing removed (Mathias: "walking was better before", "grow thing not intuitive")
- mapScreen = the ORIGINAL dot map again (restored from 8456135). Rooms/doors/props/nights/spots/pockets REMOVED; js/explore.js deleted.
  (audio.js still has unused listen/creak/explore music modes.)
- Growth REMOVED everywhere: inst.xp, Alt/Full Art, GROWTH/GROW_MULT/BLOOM table, bloom event, growBar, st-1/st-2 CSS.
  Bloom set (12 cards) + Reprint deleted → 84 cards in 7 sets. Trophy/Snowball/Piggy (per-card "grows FOREVER" text) stay.
- Kept: 6 new non-Bloom cards, unique art, thorns halving, permanent enemy poison, keyword notes, card rebalance.
- ACT_DMG {1.3, 1.7, 2.1}. Sim: heat0 Kip 67.2% · Wick 60.4% · Glint 54%; heat8 Wick 25.5%.
- The section below is HISTORY (what was tried and rolled back).

## 2026-11-15 (later) "Didn't get better" → nights, things to do in every room, more cards, full balance pass
Mathias: runs samey, nothing to do, flashlight bad; likes S&G's world+art; keep growing cards; art same as rest of HOLO.
- Flashlight REMOVED (commit fe629d7). Rooms stay drawn (CSS), silhouette props now 2 (PROP_SPOTS sl-hi/sr-hi).
- js/explore.js (pure): a different NIGHT story each run (blackout/flood/thief/ghost/delivery — goal token x/need, reward),
  ITEMS (key/crowbar/code, max 4 "pockets"), SPOTS in each room (bin, case: key/pry/risky smash, vend, critter, till, lost,
  shelf=polish xp, pack, secret + the night's goal spot). roomSpots seeded by roomKey; doSpot → {out:[coins|hp|item|pack|xp|
  relic|tactic|token|goalDone|nothing], say}. thiefOnEnter steals coins on the thief night. UI = roomScreen in main.js
  (spot buttons fl/fr/sl/sr, info panel with action buttons, night chip + pockets in header, nightModal at run start).
- Sim explores too (env NOEXPLORE=1 to switch off). Exploring ≈ +10pp win before tuning; tuned down coin/pack payouts.
- 19 NEW cards → 97 total. New 8th set BLOOM (growth: sprout, seedling, pollen, thorn_vine, graft, bloom_burst, compost,
  overgrowth, old_oak, pruning, hothouse P, world_tree M) + cinder_toss, nettle, drawbridge, last_call, cash_stack,
  shadow_bargain, reprint. SET_BONUS.bloom: 2 +1 growth/fire · 4 +3/hit for Alt/Full · 6 Full Art fires twice.
- Card audit tool: `node tests/cards.mjs 120` (real fights; random / themed / best-slot gain vs Jab). Fixed Rares < Commons.
- Rule changes: Thorns HALVE every round (iron made bosses trivial). Poison on ENEMIES NEVER FADES (Venom identity: slow
  stack; Burn = hits hard & fades). Venom 2 = +2 Poison, 4 = +4/hit on Poisoned. Iron 2 = 3 Block/round, 4 keeps 1/3.
  Mirror/Echo copy the card to the right when first. Detail sheet shows short rules notes for Poison/Burn/Thorns/Block (ui.js KW).
- ACT_DMG {1.4, 2.0, 2.5} (later lowered — see rollback).
- Kip STEADY 6→4 Block. Heat 2 = enemies hit 25% harder (was 15%).
- Balance result (sim, 200–250 runs): heat 0 Kip 75.6% · Wick 62.8% · Glint 61.6%; heat 8 Kip 44% · Wick 34% · Glint 38.5%.
- GOTCHA: sim PERCARD "set win %" counts the row at run END → biased (cards held in early losses look bad). Venom read 36%
  there while the fight audit (tests/cards.mjs) shows Toxin/Venom Spit among the strongest commons. Causal check:
  STARTWITH=id node tests/sim.mjs N hero heat (starts the run with that card in slot 4) — slow and ±4pp noisy.
- NEXT: Mathias's phone feel test of nights/rooms; maybe Kip a touch harder; watch venom in real play.

## REMOVED 2026-11-15: "The Back Room" (Mathias found it weird → "just drop it")
Code rolled back to 24bda6f (merge rework kept) + the tougher ACT_HP/ACT_DMG kept. Vintage set, Credit, collection, Deck Box,
grading, customers all gone. meta.js drops old Back Room keys and discards saved runs holding unknown card ids.
Sim after removal: Kip heat0 63%. Next direction: blend in Shroom-and-Gloom ideas (moody room-by-room exploring + growing cards)
without losing HOLO's core (packs, editions, the firing row).

### (historical) "The Back Room" evolution (approved 2026-11-14)
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
- [x] Stage 6: sim balance incl. Deck Box, phone-size verification, Bording Hub entry.

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
- Balance 2026-11-14 (all 8 sets, 200 runs): Kip heat0 71.5%, Wick heat0 61.5%, Kip heat8 32%; Holo Golden Age in Deck Box ≈ +7pp.
  ACT_HP {1.3, 2.15, 3.0}, ACT_DMG {1.3, 1.6, 1.95}. NOTE: sims with 2-set pools are meaningless (~100% win).
- NEXT ideas: Mathias's phone feel test of the Back Room; more customers/regulars; a second released set; Deck Box choice for the bot sim.
