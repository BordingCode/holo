// ---------------------------------------------------------------------------
// HOLO run logic — map, packs, rewards, shop, grader, events. Pure (no DOM).
// ---------------------------------------------------------------------------
import { CARDS, CARD_LIST, PACKS, ED_ODDS, RARITY, RARITY_RANK, ED_RANK, ENCOUNTERS, HEROES, MISPRINTS, SET_ORDER } from './data.js';
import { makeRng, hashStr } from './rng.js';
import { createBattle, ROW_SIZE } from './engine.js';

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
  'Enemies have +10% HP.',
  'Enemies hit 10% harder.',
  'Fights pay 20% fewer coins.',
  'Elites have +25% HP.',
  'Start with 10% less max HP.',
  'Packs cost 3 more.',
  'Bosses start with +3 Strength.',
  'Rest stops heal half as much.',
];

export function enemyMods(run, kind) {
  const h = run.heat;
  const ACT_HP = { 1: 1.1, 2: 1.35, 3: 1.6 }, ACT_DMG = { 1: 1.2, 2: 1.3, 3: 1.4 };
  let hpMult = (ACT_HP[run.act] || 1) * (1 + (h >= 1 ? 0.1 : 0) + (kind === 'elite' && h >= 4 ? 0.25 : 0));
  const dmgMult = (ACT_DMG[run.act] || 1) * (h >= 2 ? 1.1 : 1);
  const str = kind === 'boss' && h >= 7 ? 3 : 0;
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
export function newRun({ hero = 'kip', heat = 0, seed, daily = false, unlockedSets }) {
  seed = seed ?? (Math.random() * 2 ** 32) >>> 0;
  const H = HEROES[hero];
  const maxHp = Math.round(H.hp * (heat >= 5 ? 0.9 : 1));
  const run = {
    v: 1, seed, rngState: seed, daily, hero, heat, hp: maxHp, maxHp, coins: H.coins,
    row: Array(ROW_SIZE).fill(null), bench: Array(BENCH_SIZE).fill(null), uid: 1,
    act: 1, map: null, pos: null, floor: 0, sets: unlockedSets || ['base', 'ember', 'venom', 'iron'],
    stats: { fights: 0, elites: 0, bosses: 0, packs: 0, pulls: [], dmgBest: 0, coinsEarned: 0 },
    pending: null, over: null, startedAt: Date.now(),
  };
  H.start.forEach((id, k) => { run.row[k] = newCard(run, id); });
  run.map = genMap(run, 1);
  return run;
}

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
  run.pending = { type: 'battle', kind, enemies, rngAtStart: run.rngState };
  return run.pending;
}

export function makeBattle(run) {
  const p = run.pending;
  const r = makeRng(0); r.state = p.rngAtStart;
  return createBattle({ rng: r, coins: run.coins, perk: HEROES[run.hero].perkId, hp: run.hp, maxHp: run.maxHp,
    row: run.row, enemies: p.enemies, mods: enemyMods(run, p.kind) });
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
  if (kind === 'fight') packs.push({ type: 'booster' });
  if (kind === 'elite') { run.stats.elites++; packs.push({ type: 'set', set: rng.pick(run.sets.filter(s => s !== 'base' && s !== 'void')) }); }
  let healed = 0;
  if (kind === 'boss') {
    run.stats.bosses++;
    packs.push({ type: 'collector' });
    healed = Math.round((run.maxHp - run.hp) * 0.6); run.hp += healed;
  }
  return { coins, interest, packs, shattered, healed, kind };
}

// ---- packs --------------------------------------------------------------------
export function packPrice(run, type) {
  let p = PACKS[type].price + (run.heat >= 6 ? 3 : 0);
  if (HEROES[run.hero].perkId === 'fence') p = Math.round(p * 0.8);
  return p;
}

export function openPack(run, spec) {
  const rng = rngOf(run);
  const P = PACKS[spec.type];
  const clover = hasPassive(run, 'clover', true) ? 2 : 1;
  let pool;
  if (P.setLock) pool = CARD_LIST.filter(c => c.set === P.setLock);
  else if (spec.set) pool = CARD_LIST.filter(c => c.set === spec.set);
  else pool = CARD_LIST.filter(c => run.sets.includes(c.set) && c.set !== 'void');
  const cards = [];
  for (let k = 0; k < P.size; k++) {
    let r = rng.weighted(P.odds);
    if (P.guaranteeU && k === P.size - 1 && !cards.some(c => RARITY_RANK[CARDS[c.id].r] >= 1) && r === 'C') r = 'U';
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
  // reveal order: rarest last (the classic pack "rare slot" drama)
  cards.sort((a, b) => score(a) - score(b));
  const best = cards[cards.length - 1];
  const tell = RARITY_RANK[CARDS[best.id].r] >= 3 || best.ed === 'holo' ? (rng.chance(0.65) ? 'glow' : null) : (rng.chance(0.06) ? 'glow' : null);
  run.stats.packs++;
  return { type: spec.type, set: spec.set, cards, tell, mustKeep: !!P.mustKeep };
}

export function score(c) { return RARITY_RANK[CARDS[c.id].r] * 10 + ED_RANK[c.ed] + (c.star - 1) * 4; }

// Merge a pulled duplicate into an owned card. Returns description.
export function mergeInto(run, owned, pulled) {
  if (owned.star >= 3) { const v = sellValue(run, pulled); run.coins += v; return { coins: v }; }
  owned.star++;
  if (ED_RANK[pulled.ed] > ED_RANK[owned.ed]) { owned.ed = pulled.ed; if (pulled.mp != null) owned.mp = pulled.mp; if (pulled.cracks) owned.cracks = pulled.cracks; }
  return { star: owned.star };
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
  return { stock: stock.map(s => ({ ...s, price: packPrice(run, s.type), sold: false })), mend: { price: 10, amt: 15, used: false }, polish: { price: 22, used: false } };
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
  return newCard(run, def.id, c.ed === 'cracked' ? 'normal' : c.ed, c.star, rng);
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
