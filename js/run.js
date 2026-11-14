// ---------------------------------------------------------------------------
// HOLO run logic — map, packs, rewards, shop, grader, events. Pure (no DOM).
// ---------------------------------------------------------------------------
import { CARDS, CARD_LIST, PACKS, ED_ODDS, RARITY, RARITY_RANK, ED_RANK, ENCOUNTERS, HEROES, MISPRINTS, SET_ORDER, TACTICS, TACTIC_PRICE, RELICS } from './data.js?v=11';
import { makeRng, hashStr } from './rng.js?v=11';
import { createBattle, ROW_SIZE } from './engine.js?v=11';

export const BENCH_SIZE = 4;
export const ACTS = 3;
const ROWS_PER_ACT = 8; // rows 0..6 + boss row 7

// Run-scoped RNG: always rebuilt from the saved state so a reload continues identically.
export function rngOf(run) {
  const r = makeRng(0); r.state = run.rngState;
  return new Proxy(r, { get(t, k) { const v = t[k]; if (typeof v !== 'function') return v; return (...a) => { const out = v.apply(t, a); run.rngState = t.state; return out; }; } });
}

// ---- heat (difficulty ladder) ---------------------------------------------
export const HEAT = [
  'Standard run.',
  'Enemies have +15% HP.',
  'Enemies hit 15% harder.',
  'Fights pay 20% fewer coins.',
  'Elites and bosses have +25% HP.',
  'Start with 10% less max HP.',
  'Packs cost 3 more, and Act 2–3 enemies have +15% HP.',
  'Bosses start with +5 Strength.',
  'Rest stops heal half as much, and beating a boss heals only 25%.',
];

export function enemyMods(run, kind) {
  const h = run.heat;
  const ACT_HP = { 1: 1.3, 2: 2.15, 3: 3.0 }, ACT_DMG = { 1: 1.3, 2: 1.6, 3: 1.95 };
  let hpMult = (ACT_HP[run.act] || 1) * (1 + (h >= 1 ? 0.15 : 0) + ((kind === 'elite' || kind === 'boss') && h >= 4 ? 0.25 : 0) + (h >= 6 && run.act >= 2 ? 0.15 : 0));
  const dmgMult = (ACT_DMG[run.act] || 1) * (h >= 2 ? 1.15 : 1);
  const str = kind === 'boss' && h >= 7 ? 5 : 0;
  return { hpMult, dmgMult, str };
}

// ---- card instances ----------------------------------------------------------
export function newCard(run, id, ed = 'normal', star = 1, rng) {
  const c = { uid: 'c' + (run.uid++), id, star, ed };
  if (ed === 'misprint') c.mp = (rng || rngOf(run)).int(0, MISPRINTS.length - 1);
  if (ed === 'cracked') c.cracks = 3;
  return c;
}

export function sellValue(run, c) {
  let v = RARITY[CARDS[c.id].r].sell + (c.star - 1) * 3 + (c.ed !== 'normal' && c.ed !== 'cracked' ? 3 : 0);
  if (HEROES[run.hero].perkId === 'fence') v += 1;
  return v;
}

export const allOwned = run => [...run.row, ...run.bench].filter(Boolean);
export const hasPassive = (run, p, includeBench) => (includeBench ? allOwned(run) : run.row.filter(Boolean)).some(c => CARDS[c.id].passive === p);

// ---- new run ------------------------------------------------------------------
export function newRun({ hero = 'kip', heat = 0, seed, daily = false, unlockedSets, box = [] }) {
  seed = seed ?? (Math.random() * 2 ** 32) >>> 0;
  const H = HEROES[hero];
  const maxHp = Math.round(H.hp * (heat >= 5 ? 0.9 : 1));
  const run = {
    v: 1, seed, rngState: seed, daily, hero, heat, hp: maxHp, maxHp, coins: H.coins,
    row: Array(ROW_SIZE).fill(null), bench: Array(BENCH_SIZE).fill(null), uid: 1,
    act: 1, map: null, pos: null, floor: 0, sets: unlockedSets || ['base', 'ember', 'venom', 'iron'],
    stats: { fights: 0, elites: 0, bosses: 0, packs: 0, pulls: [], dmgBest: 0, coinsEarned: 0 },
    pending: null, over: null, startedAt: Date.now(),
    tactics: [], relics: [], pity: 0,
  };
  H.start.forEach((id, k) => { run.row[k] = newCard(run, id); });
  // Deck Box: collection cards brought along. They fill empty row slots, then the bench.
  // They are AT RISK: if the run is lost they are not returned.
  for (const k of box) {
    const c = newCard(run, k.id, k.ed, k.star);
    if (k.mp != null) c.mp = k.mp;
    if (k.cracks) c.cracks = k.cracks;
    if (k.grade) c.grade = k.grade;
    c.boxed = k.cid;
    const r = run.row.indexOf(null);
    if (r >= 0) run.row[r] = c; else { const b = run.bench.indexOf(null); if (b >= 0) run.bench[b] = c; }
  }
  run.box = box.map(k => k.cid);
  run.map = genMap(run, 1);
  run.tactics.push(randomTactic(run, 'C'));
  return run;
}

// ---- tactics & relics -----------------------------------------------------------
export const PITY_MAX = 40;
export const hasRelic = (run, id) => (run.relics || []).includes(id);
export const tacticCap = run => hasRelic(run, 'tactical_vest') ? 5 : 3;
export function randomTactic(run, rarity) {
  const rng = rngOf(run);
  const r = rarity || rng.weighted({ C: 55, U: 35, R: 10 });
  return rng.pick(Object.keys(TACTICS).filter(k => TACTICS[k].r === r));
}
export function addTactic(run, id) {
  if (run.tactics.length >= tacticCap(run)) return false;
  run.tactics.push(id); return true;
}
export function relicChoices(run, n) {
  const rng = rngOf(run);
  const pool = Object.keys(RELICS).filter(r => !hasRelic(run, r) && !(RELICS[r].core && !run.sets.includes(RELICS[r].core)));
  // at most one "core" per offer so the choice stays interesting
  const out = [];
  for (const id of rng.shuffle(pool)) {
    if (out.length >= n) break;
    if (RELICS[id].core && out.some(o => RELICS[o].core)) continue;
    out.push(id);
  }
  return out;
}
export function takeRelic(run, id) {
  run.relics.push(id);
  if (id === 'seventh_sleeve') run.row.push(null);
  if (id === 'thick_sleeves') { run.maxHp += 15; run.hp += 15; }
  if (id === 'tactical_vest') { addTactic(run, randomTactic(run)); addTactic(run, randomTactic(run)); }
}
const priceMult = run => (HEROES[run.hero].perkId === 'fence' ? 0.8 : 1) * (hasRelic(run, 'coupon_book') ? 0.75 : 1);

// ---- map --------------------------------------------------------------------
export function genMap(run, act) {
  const rng = rngOf(run);
  const rows = [];
  let id = 0;
  for (let r = 0; r < ROWS_PER_ACT; r++) {
    const n = r === ROWS_PER_ACT - 1 ? 1 : r === 0 ? 3 : rng.int(2, 4);
    const row = [];
    for (let j = 0; j < n; j++) {
      const x = n === 1 ? 0.5 : 0.12 + (0.76 * j) / (n - 1) + (rng.next() - 0.5) * 0.08;
      row.push({ id: id++, r, j, x, type: 'fight', next: [], done: false });
    }
    rows.push(row);
  }
  // node types
  for (let r = 1; r < ROWS_PER_ACT - 1; r++) for (const nd of rows[r]) {
    if (r === ROWS_PER_ACT - 2) { nd.type = 'rest'; continue; }
    const w = { fight: 44, event: 18, shop: 13, grader: 10, elite: r >= 2 ? 15 : 0 };
    nd.type = rng.weighted(w);
  }
  rows[ROWS_PER_ACT - 1][0].type = 'boss';
  const all = rows.flat();
  if (!all.some(n => n.type === 'shop')) rng.pick(rows[3]).type = 'shop';
  if (!all.some(n => n.type === 'grader')) rng.pick(rows[4]).type = 'grader';
  if (!all.some(n => n.type === 'elite')) rng.pick(rows[4]).type = 'elite';
  // one treasure chest per act, mid-way
  const tr = rng.pick(rows[3].filter(n => n.type !== 'shop') .length ? rows[3].filter(n => n.type !== 'shop') : rows[3]);
  tr.type = 'treasure';
  const lootSets = run.sets.filter(s => s !== 'base' && s !== 'void');
  for (const n of rows.flat()) if (n.type === 'elite') n.loot = rng.pick(lootSets);
  // edges: each node links to its nearest 1–2 nodes in the next row; no orphans
  for (let r = 0; r < ROWS_PER_ACT - 1; r++) {
    const nxt = rows[r + 1];
    for (const nd of rows[r]) {
      const byDist = [...nxt].sort((a, b) => Math.abs(a.x - nd.x) - Math.abs(b.x - nd.x));
      nd.next.push(byDist[0].id);
      if (byDist[1] && Math.abs(byDist[1].x - nd.x) < 0.42 && rng.chance(0.55)) nd.next.push(byDist[1].id);
    }
    for (const t of nxt) {
      if (!rows[r].some(nd => nd.next.includes(t.id))) {
        const src = [...rows[r]].sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
        src.next.push(t.id);
      }
    }
  }
  return { act, rows };
}

export const nodeById = (run, id) => run.map.rows.flat().find(n => n.id === id);

export function reachable(run) {
  if (run.pos == null) return run.map.rows[0].map(n => n.id);
  return nodeById(run, run.pos).next;
}

// ---- encounters -------------------------------------------------------------
export function pickEncounter(run, kind) {
  const rng = rngOf(run);
  const E = ENCOUNTERS[run.act];
  if (kind === 'boss') return E.boss;
  if (kind === 'elite') return rng.pick(E.elite);
  const fightsThisAct = run.actFights || 0;
  return rng.pick(fightsThisAct < 2 ? E.easy : E.normal);
}

export function startBattle(run, kind) {
  const enemies = pickEncounter(run, kind);
  const rng = rngOf(run);
  const edChance = kind === 'boss' ? 0 : [0, 0.12, 0.22, 0.32][run.act] + (run.heat >= 3 ? 0.08 : 0);
  const eds = enemies.map(() => rng.chance(edChance) ? rng.weighted({ foil: 35, holo: 20, gilded: 25, cracked: 20 }) : null);
  run.pending = { type: 'battle', kind, enemies, eds, rngAtStart: run.rngState };
  return run.pending;
}

export function makeBattle(run) {
  const p = run.pending;
  const r = makeRng(0); r.state = p.rngAtStart;
  return createBattle({ rng: r, coins: run.coins, perk: HEROES[run.hero].perkId, hp: run.hp, maxHp: run.maxHp,
    row: run.row, enemies: p.enemies, eds: p.eds, mods: enemyMods(run, p.kind), relics: run.relics || [] });
}

// After a battle: sync HP/coins, crack cards, pay out. Returns reward description.
export function finishBattle(run, B) {
  const kind = run.pending.kind;
  run.hp = Math.max(0, B.player.hp);
  run.coins = B.coins;
  run.pending = null;
  if (B.over !== 'win') { run.over = 'lose'; run.killedBy = B.enemies.map(e => e.name)[0]; return null; }
  const rng = rngOf(run);
  run.stats.fights++; run.actFights = (run.actFights || 0) + 1;
  const shattered = [];
  run.row.forEach((c, k) => {
    if (c && c.ed === 'cracked') { c.cracks--; if (c.cracks <= 0) { shattered.push(c); run.row[k] = null; } }
  });
  const coinScale = run.heat >= 3 ? 0.8 : 1;
  let coins = kind === 'boss' ? 45 : kind === 'elite' ? 22 : rng.int(8, 12) + run.act * 2;
  coins = Math.round(coins * coinScale);
  let interest = 0;
  if (hasPassive(run, 'interest')) interest = Math.min(8, Math.floor(run.coins / 5));
  run.coins += coins + interest; run.stats.coinsEarned += coins + interest;
  const packs = [];
  let tactic = null, relics = null;
  if (kind === 'fight') packs.push({ type: 'booster' });
  if (kind === 'elite') {
    run.stats.elites++;
    const nd = nodeById(run, run.pos);
    packs.push({ type: 'set', set: (nd && nd.loot) || rng.pick(run.sets.filter(s => s !== 'base' && s !== 'void')) });
    tactic = randomTactic(run, rng.chance(0.4) ? 'R' : 'U');
    if (!addTactic(run, tactic)) { run.coins += 6; tactic = null; }
  }
  let healed = 0;
  if (hasRelic(run, 'bandolier')) { const h = Math.min(6, run.maxHp - run.hp); run.hp += h; healed += h; }
  if (kind === 'boss') {
    run.stats.bosses++;
    packs.push({ type: 'collector' });
    const h = Math.round((run.maxHp - run.hp) * (run.heat >= 8 ? 0.25 : 0.6)); run.hp += h; healed += h;
    relics = relicChoices(run, 3);
  }
  return { coins, interest, packs, shattered, healed, kind, tactic, relics };
}

// ---- packs --------------------------------------------------------------------
export function packPrice(run, type) {
  return Math.round((PACKS[type].price + (run.heat >= 6 ? 3 : 0)) * priceMult(run));
}

export function openPack(run, spec) {
  const rng = rngOf(run);
  const P = PACKS[spec.type];
  const clover = (hasPassive(run, 'clover', true) ? 2 : 1) * (hasRelic(run, 'rainbow_ink') ? 3 : 1);
  let pool;
  if (P.setLock) pool = CARD_LIST.filter(c => c.set === P.setLock);
  else if (spec.set) pool = CARD_LIST.filter(c => c.set === spec.set);
  else pool = CARD_LIST.filter(c => run.sets.includes(c.set) && c.set !== 'void');
  const cards = [];
  const size = P.size + (hasRelic(run, 'fat_packs') ? 1 : 0);
  const pityHit = (run.pity || 0) >= PITY_MAX;
  for (let k = 0; k < size; k++) {
    let r = rng.weighted(P.odds);
    if (P.guaranteeU && k === size - 1 && !cards.some(c => RARITY_RANK[CARDS[c.id].r] >= 1) && r === 'C') r = 'U';
    if (hasRelic(run, 'lucky_pull') && k === size - 1 && r === 'C') r = 'U';
    if (pityHit && k === size - 1) r = 'M';
    let options = pool.filter(c => c.r === r);
    let rr = RARITY_RANK[r];
    while (!options.length && rr > 0) { rr--; options = pool.filter(c => RARITY_RANK[c.r] === rr); }
    if (!options.length) options = pool;
    const def = rng.pick(options);
    const eo = {};
    for (const k2 in ED_ODDS) eo[k2] = k2 === 'normal' ? ED_ODDS[k2] : ED_ODDS[k2] * P.ed * clover;
    const ed = rng.weighted(eo);
    cards.push(newCard(run, def.id, ed, 1, rng));
  }
  // Mythic meter: every non-Mythic pull charges it; a Mythic (natural or forced) empties it
  if (cards.some(c => CARDS[c.id].r === 'M')) run.pity = 0;
  else run.pity = Math.min(PITY_MAX, (run.pity || 0) + cards.length * (hasRelic(run, 'golden_ticket') ? 2 : 1));
  // reveal order: rarest last (the classic pack "rare slot" drama)
  cards.sort((a, b) => score(a) - score(b));
  const best = cards[cards.length - 1];
  const tell = RARITY_RANK[CARDS[best.id].r] >= 3 || best.ed === 'holo' ? (rng.chance(0.65) ? 'glow' : null) : (rng.chance(0.06) ? 'glow' : null);
  run.stats.packs++;
  // bonus Tactic in some packs
  let tactic = null;
  if (spec.type !== 'cursed' && rng.chance(spec.type === 'collector' ? 0.6 : 0.3)) tactic = randomTactic(run, spec.type === 'collector' ? 'R' : null);
  return { type: spec.type, set: spec.set, cards, tell: pityHit ? 'glow' : tell, mustKeep: !!P.mustKeep, tactic, pityHit };
}

export function score(c) { return RARITY_RANK[CARDS[c.id].r] * 10 + ED_RANK[c.ed] + (c.star - 1) * 4; }

// ---- end of run: Deck Box return + take-home -----------------------------------
// Boxed cards come home automatically after a WIN; after a loss they are shredded.
export const boxedSurvivors = run => allOwned(run).filter(c => c.boxed);
export const takeHomePool = run => allOwned(run).filter(c => !c.boxed);

// ---- merging -------------------------------------------------------------------
// Merging two copies of the same card: the TARGET survives, the DONOR is consumed.
// Rules (shared by in-run merges and the collection):
//  - stars: max(star) + 1, capped at 3
//  - normal + special edition → the special edition is kept automatically
//  - two different special editions → the player chooses which edition to keep
//  - Cracked is never forced: any merge involving Cracked offers the non-cracked edition
//    as the default; choosing Cracked gives a fresh 3 fights (cracks = 3)
//  - a maxed ★3 card can still take a donor's edition ("apply edition")
//  - nothing gained (already ★3, same edition) → the donor is sold instead
export const MAX_STAR = 3;

// The possible results of merging donor into target. Returns
// { star, options: [{ed, mp?, cracks?}], gainsStar, useful }.
// options[0] is the default (never Cracked if there is an alternative).
export function mergeOutcome(target, donor) {
  const star = Math.min(MAX_STAR, Math.max(target.star || 1, donor.star || 1) + 1);
  const gainsStar = star > (target.star || 1);
  const a = target.ed || 'normal', b = donor.ed || 'normal';
  const mpOf = ed => (a === ed && target.mp != null) ? target.mp : (b === ed && donor.mp != null ? donor.mp : target.mp ?? donor.mp);
  const opt = ed => {
    const o = { ed };
    if (ed === 'misprint') o.mp = mpOf('misprint');
    if (ed === 'cracked') o.cracks = 3;
    return o;
  };
  let eds;
  if (a === b) eds = [a];
  else if (a === 'cracked' || b === 'cracked') eds = [a === 'cracked' ? b : a, 'cracked'];
  else if (a === 'normal') eds = [b];
  else if (b === 'normal') eds = [a];
  else eds = ED_RANK[a] >= ED_RANK[b] ? [a, b] : [b, a];
  const options = eds.map(opt);
  // a cracked copy merged with a cracked copy still gets patched up to 3 fights
  const changesEd = options.some(o => o.ed !== a) || (a === 'cracked' && (target.cracks ?? 3) < 3);
  return { star, options, gainsStar, useful: gainsStar || changesEd };
}

// Apply a merge. choice = index into mergeOutcome().options (default 0).
// Returns {star, ed} or {coins} when nothing was gained and the donor was sold.
export function applyMerge(run, target, donor, choice = 0) {
  const out = mergeOutcome(target, donor);
  if (!out.useful) { const v = sellValue(run, donor); run.coins += v; return { coins: v }; }
  const o = out.options[Math.min(choice, out.options.length - 1)];
  target.star = out.star;
  target.ed = o.ed;
  if (o.ed === 'misprint') target.mp = o.mp ?? 0; else delete target.mp;
  if (o.ed === 'cracked') target.cracks = 3; else delete target.cracks;
  if ((donor.grow || 0) > (target.grow || 0)) target.grow = donor.grow; // growing cards keep the bigger growth
  if (donor.boxed && !target.boxed) target.boxed = donor.boxed; // a Deck Box card lives on in the merged copy
  return { star: target.star, ed: target.ed };
}

// Back-compat wrapper (default choice).
export function mergeInto(run, owned, pulled, choice = 0) { return applyMerge(run, owned, pulled, choice); }

// All owned copies of a card id, best merge targets first (not maxed, highest star, row before bench).
export function mergeTargets(run, id, exclude) {
  const out = [];
  run.row.forEach((c, i) => { if (c && c.id === id && c !== exclude) out.push({ c, where: 'row', idx: i }); });
  run.bench.forEach((c, i) => { if (c && c.id === id && c !== exclude) out.push({ c, where: 'bench', idx: i }); });
  return out.sort((x, y) => ((x.c.star >= MAX_STAR) - (y.c.star >= MAX_STAR)) || (y.c.star - x.c.star));
}

// Short human label for a merge result, e.g. "★2 Holo" / "★3 (stays Foil)".
export function mergeLabel(target, o, star) {
  const name = ed => (ed === 'normal' ? 'plain' : ed[0].toUpperCase() + ed.slice(1));
  const st = '★' + star;
  if (o.ed === (target.ed || 'normal')) return target.ed && target.ed !== 'normal' ? `${st} (stays ${name(o.ed)})` : st;
  return `${st} ${name(o.ed)}`;
}

// ---- shop -----------------------------------------------------------------------
export function makeShop(run) {
  const rng = rngOf(run);
  const stock = [{ type: 'booster' }];
  const sets = rng.shuffle(run.sets.filter(s => s !== 'base' && s !== 'void'));
  stock.push({ type: 'set', set: sets[0] });
  if (sets[1]) stock.push({ type: 'set', set: sets[1] });
  if (run.sets.includes('void')) stock.push({ type: 'cursed' });
  if (run.act >= 2) stock.push({ type: 'collector' });
  else stock.push({ type: 'booster' });
  // showcase: one shiny Rare/Mythic in the display case — something to save up for
  const scR = rng.chance(0.3 + run.act * 0.1) ? 'M' : 'R';
  const scPool = CARD_LIST.filter(d => d.r === scR && run.sets.includes(d.set));
  const scDef = rng.pick(scPool.length ? scPool : CARD_LIST.filter(d => d.r === 'R'));
  const scEd = rng.weighted({ holo: 30, foil: 40, gilded: 20, normal: 10 });
  const showcase = { card: newCard(run, scDef.id, scEd, 1, rng), price: Math.round(((scR === 'M' ? 52 : 30) + (scEd === 'holo' ? 10 : scEd === 'foil' ? 6 : 0)) * priceMult(run)), sold: false };
  const tactics = [randomTactic(run), randomTactic(run)].map(id => ({ id, price: Math.round(TACTIC_PRICE[TACTICS[id].r] * priceMult(run)), sold: false }));
  return { stock: stock.map(s => ({ ...s, price: packPrice(run, s.type), sold: false })), showcase, tactics,
    mend: { price: Math.round(10 * priceMult(run)), amt: 15, used: false }, polish: { price: Math.round(22 * priceMult(run)), used: false } };
}

// ---- grader ----------------------------------------------------------------------
export const GRADE_TABLE = [
  { min: 10, label: 'GEM MINT 10', p: 8, desc: 'becomes HOLO' },
  { min: 9, label: 'MINT 9', p: 15, desc: 'becomes FOIL (or +1 star if already better)' },
  { min: 7, label: 'NEAR MINT', p: 30, desc: '+1 star' },
  { min: 4, label: 'PLAYED', p: 27, desc: 'no change, +6 coins' },
  { min: 1, label: 'DAMAGED', p: 20, desc: 'becomes CRACKED' },
];

export function gradeCard(run, c) {
  const rng = rngOf(run);
  const roll = rng.next() * 100;
  let acc = 0, g = GRADE_TABLE[GRADE_TABLE.length - 1];
  for (const row of GRADE_TABLE) { acc += row.p; if (roll < acc) { g = row; break; } }
  const grade = g.min === 10 ? 10 : g.min === 9 ? 9 : g.min === 7 ? rng.int(7, 8) : g.min === 4 ? rng.int(4, 6) : rng.int(1, 3);
  const before = { ...c };
  let result = '';
  if (grade === 10) { c.ed = 'holo'; delete c.cracks; result = 'Now HOLO — it fires twice!'; }
  else if (grade === 9) {
    if (ED_RANK[c.ed] >= ED_RANK.foil) { c.star = Math.min(3, c.star + 1); result = 'Already shiny — +1 star instead.'; }
    else { c.ed = 'foil'; delete c.cracks; delete c.mp; result = 'Now FOIL — numbers ×1.5!'; }
  } else if (grade >= 7) {
    if (c.star < 3) { c.star++; result = '+1 star!'; } else { run.coins += 10; result = 'Maxed — paid 10 coins.'; }
  } else if (grade >= 4) { run.coins += 6; result = 'No change. +6 coins for your trouble.'; }
  else {
    if (c.ed === 'holo' || c.ed === 'foil') { c.star = Math.max(1, c.star); result = 'Scuffed, but the shine survived.'; }
    else { c.ed = 'cracked'; c.cracks = 3; delete c.mp; result = 'CRACKED: ×2 numbers, shatters after 3 fights.'; }
  }
  return { grade, label: g.label, before, result };
}

// ---- events ---------------------------------------------------------------------
export const EVENTS = ['lost_booster', 'trader', 'gumball', 'dusty_box', 'sticker', 'card_doctor'];
export function pickEvent(run) { return rngOf(run).pick(EVENTS); }

export function tradeUp(run, c) {
  const rng = rngOf(run);
  const r = Math.min(3, RARITY_RANK[CARDS[c.id].r] + 1);
  const pool = CARD_LIST.filter(d => RARITY_RANK[d.r] === r && run.sets.includes(d.set) && d.id !== c.id);
  const def = rng.pick(pool.length ? pool : CARD_LIST.filter(d => RARITY_RANK[d.r] === r));
  const out = newCard(run, def.id, c.ed === 'cracked' ? 'normal' : c.ed, c.star, rng);
  if (c.boxed) out.boxed = c.boxed; // a traded-up Deck Box card still goes home as the new card
  return out;
}

export function gumball(run) {
  const rng = rngOf(run);
  const pool = CARD_LIST.filter(d => run.sets.includes(d.set) && d.set !== 'void' && d.r !== 'M');
  const def = rng.pick(pool);
  const ed = rng.weighted({ foil: 40, holo: 15, gilded: 25, misprint: 20 });
  return newCard(run, def.id, ed, 1, rng);
}

// ---- movement ---------------------------------------------------------------------
export function enterNode(run, id) {
  const nd = nodeById(run, id);
  run.pos = id; run.floor++;
  return nd;
}

export function completeNode(run) {
  const nd = nodeById(run, run.pos);
  if (nd) nd.done = true;
  if (nd && nd.type === 'boss') {
    if (run.act >= ACTS) { run.over = 'win'; return 'win'; }
    run.act++; run.actFights = 0; run.pos = null; run.map = genMap(run, run.act);
    return 'act';
  }
  return 'ok';
}

export function restHeal(run) { return Math.round(run.maxHp * (run.heat >= 8 ? 0.17 : 0.35)); }

export const pickBossId = run => ENCOUNTERS[run.act].boss[0];
