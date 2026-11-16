// Card audit on REAL fights. Run: node tests/cards.mjs [contexts] [onlyIds,comma]
// For every card: drop it into many random 6-card rows (random slot) and play a real encounter
// (random act 1–3, fight or elite) to the end. Score = HP lost + 5 per round taken (lower = better).
// Gain = how much better the row does with this card than with a plain Jab in the same slot.
// Same row, same enemies, same seed — only the one card differs.
import { CARDS, CARD_LIST } from '../js/data.js';
import { autoFight } from '../js/engine.js';
import { makeRng } from '../js/rng.js';
import * as R from '../js/run.js';

const N = +(process.argv[2] || 200);
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const POOL = CARD_LIST.map(c => c.id);
const rng = makeRng(1234);
const mk = (id, ed = 'normal', star = 1) => ({ uid: Math.random(), id, ed, star });
const ALLSETS = ['base', 'ember', 'venom', 'iron', 'clock', 'gilded', 'void'];

function fightScore(ctx, row) {
  const run = R.newRun({ hero: 'kip', seed: ctx.seed, unlockedSets: ALLSETS });
  run.act = ctx.act; run.hp = run.maxHp = 400; run.coins = 25;
  run.row = row.map(c => c && { ...c });
  R.startBattle(run, ctx.kind);
  const B = R.makeBattle(run);
  autoFight(B, 30);
  return (400 - B.player.hp) + 5 * B.round + (B.over === 'win' ? 0 : 150) - 0.8 * (B.coins - 25); // coins buy packs

}

const contexts = [];
for (let i = 0; i < N; i++) {
  const row = Array.from({ length: 6 }, () => mk(rng.pick(POOL)));
  contexts.push({ row, slot: rng.int(0, 5), seed: 5000 + i, act: rng.int(1, 3), kind: rng.chance(0.25) ? 'elite' : 'fight' });
}
// themed rows: 4 cards of the card's own set + 1 random — how good is it in its home deck?
const setPool = s => POOL.filter(id => CARDS[id].set === s);
const themed = {};
for (const s of ALLSETS) {
  themed[s] = [];
  const r2 = makeRng(777 + s.length);
  for (let i = 0; i < N; i++) {
    const row = [...Array.from({ length: 4 }, () => mk(r2.pick(setPool(s)))), mk(r2.pick(POOL)), mk(r2.pick(POOL))];
    themed[s].push({ row, slot: r2.int(0, 5), seed: 9000 + i, act: r2.int(1, 3), kind: r2.chance(0.25) ? 'elite' : 'fight' });
  }
}
const scoreWith = (ctx, id) => { const a = ctx.row.slice(); a[ctx.slot] = mk(id); return fightScore(ctx, a); };
const base = contexts.map(ctx => scoreWith(ctx, 'jab'));
const baseT = Object.fromEntries(ALLSETS.map(s => [s, themed[s].map(ctx => scoreWith(ctx, 'jab'))]));
const res = [];
for (const id of (ONLY || POOL)) {
  const s = CARDS[id].set;
  let gain = 0, gainT = 0;
  contexts.forEach((ctx, k) => { gain += base[k] - scoreWith(ctx, id); });
  themed[s].forEach((ctx, k) => { gainT += baseT[s][k] - scoreWith(ctx, id); });
  // placed well: the card in its best slot vs Jab in ITS best slot (a player places cards on purpose)
  let gainP = 0; const NP = Math.min(N, 60);
  for (let k = 0; k < NP; k++) {
    const ctx = contexts[k];
    const best = id2 => Math.min(...[0, 1, 2, 3, 4, 5].map(sl => { const a = ctx.row.slice(); a[sl] = mk(id2); return fightScore(ctx, a); }));
    gainP += best('jab') - best(id);
  }
  gainP /= NP;
  res.push({ id, set: s, r: CARDS[id].r, passive: !!CARDS[id].passive, gain: gain / N, gainT: gainT / N, gainP, best: Math.max(gain / N, gainT / N, gainP) });
}
const byR = { C: [], U: [], R: [], M: [] };
res.forEach(x => byR[x.r].push(x.best));
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const M = Object.fromEntries(Object.entries(byR).map(([k, v]) => [k, med(v)]));
console.log('median BEST gain vs Jab by rarity:', Object.entries(M).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  '));
res.sort((a, b) => a.best - b.best);
for (const x of res) console.log(`${x.id.padEnd(16)} ${x.set.padEnd(7)} ${x.r} ${x.passive ? 'P' : ' '} random ${x.gain.toFixed(1).padStart(6)}  themed ${x.gainT.toFixed(1).padStart(6)}  placed ${x.gainP.toFixed(1).padStart(6)}  BEST ${x.best.toFixed(1).padStart(6)}`);
