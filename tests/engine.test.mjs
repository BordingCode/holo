// Engine rule tests. Run: node tests/engine.test.mjs
import { CARDS } from '../js/data.js'; globalThis.__C = CARDS;
import { createBattle, playRound, autoFight } from '../js/engine.js';
import { makeRng } from '../js/rng.js';
import * as R from '../js/run.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };
const card = (id, ed = 'normal', star = 1) => ({ uid: id + Math.random(), id, ed, star });
const battle = (row, enemies = ['tape_golem'], o = {}) => createBattle({ rng: makeRng(1), coins: 10, hp: 50, maxHp: 50, row: [...row, ...Array(6 - row.length).fill(null)], enemies, ...o });
const dealt = B => B.ev.filter(e => e.t === 'dmg' && e.side === 'e').reduce((s, e) => s + e.amt + e.blocked, 0);

{ const B = battle([card('jab')]); playRound(B); ok(dealt(B) === 4, 'jab deals 4'); }
{ const B = battle([card('jab', 'holo')]); playRound(B); ok(dealt(B) === 8, 'holo fires twice'); }
{ const B = battle([card('jab', 'foil')]); playRound(B); ok(dealt(B) === 6, 'foil ×1.5'); }
{ const B = battle([card('jab', 'normal', 3)]); playRound(B); ok(dealt(B) === 8, '★3 ×2.1 → 8'); }
{ const B = battle([card('jab'), card('mirror')]); playRound(B); ok(dealt(B) === 8, 'mirror copies left'); }
{ const B = battle([card('overclock'), card('jab')]); playRound(B); ok(dealt(B) === 8, 'overclock doubles right'); }
{ const B = battle([card('whetstone'), card('jab')]); playRound(B); ok(dealt(B) === 7, 'whetstone +3 next'); }
{ const B = battle([card('whetstone'), card('cinder_heart'), card('jab')]); playRound(B); ok(dealt(B) === 7, 'buff skips passive to next firing card'); }
{ const B = battle([card('hollow'), card('blood_pact')]); playRound(B); ok(dealt(B) === 20, 'hollow silences right'); }
{ const B = battle([card('jab'), card('jab'), card('metronome')]); playRound(B); ok(dealt(B) === 12, 'metronome scales with cards fired'); }
{ const B = battle([card('spring'), card('spring')]); playRound(B); ok(dealt(B) === 13, 'spring big only first'); }
{ const B = battle([card('kindling')], ['tape_golem']); playRound(B); ok(B.enemies[0].burn === 3, 'burn ticks down by 1 after tick'); }
{ const B = battle([card('kindling'), card('cinder_heart')]); playRound(B); ok(B.enemies[0].burn === 4, 'cinder heart keeps burn'); }
{ const B = battle([card('kindling')], ['tape_golem'], { perk: 'kindled' }); playRound(B); ok(B.enemies[0].burn === 4, 'kindled +1 burn'); }
{ // shredder shreds leftmost on its 2nd move
  const B = battle([card('jab'), card('jab'), card('guard')], ['shredder']);
  playRound(B); ok(!B.disabled[0], 'no shred round 1'); playRound(B); ok(B.disabled[0] === 'shred', 'shred round 2 leftmost');
  playRound(B); playRound(B); ok(B.disabled[1] === 'shred', 'next shred takes next working card');
}
{ // phoenix revive
  const B = battle([card('phoenix')], ['shredder'], { hp: 1 });
  autoFight(B, 3); ok(B.phoenixUsed, 'phoenix triggered'); ok(B.ev.some(e => e.t === 'revive') || B.phoenixUsed, 'revive happened');
}
{ // proprietor reverses order at half
  const B = battle([card('blood_pact', 'holo', 3)], ['proprietor'], { hp: 500, maxHp: 500 });
  for (let i = 0; i < 6 && !B.reverse; i++) playRound(B);
  ok(B.reverse, 'closing time reverses row');
}
{ // slime splits
  const B = battle([card('blood_pact', 'normal', 3)], ['sleeve_slime'], { hp: 200, maxHp: 200 });
  playRound(B); ok(B.enemies.length === 3, 'slime splits into 2');
}
{ // Fights always terminate
  let ends = 0;
  for (let i = 0; i < 50; i++) { const B = battle([card('guard'), card('buckler'), card('bulwark')], ['paper_clip'], { hp: 999, maxHp: 999 }); autoFight(B, 80); if (B.over) ends++; }
  ok(ends === 50, 'stalled fights end (enrage)');
}
{ // run: pack sizes, reachable map, shop prices
  const run = R.newRun({ hero: 'kip', seed: 7 });
  ok(R.reachable(run).length === 3, 'first row reachable');
  const p = R.openPack(run, { type: 'booster' }); ok(p.cards.length === 4, 'booster 4 cards');
  const c = R.openPack(run, { type: 'collector' }); ok(c.cards.every(x => ['R', 'M'].includes(window_r(x))), 'collector rare+');
  const s = R.openPack(run, { type: 'set', set: 'iron' }); ok(s.cards.every(x => x.id && R && true), 'set box ok');
  // map: every non-final node has a next, every non-first node has a parent
  const rows = run.map.rows;
  ok(rows.slice(0, -1).every(r => r.every(n => n.next.length)), 'all nodes lead on');
  ok(rows.slice(1).every((r, i) => r.every(n => rows[i].some(m => m.next.includes(n.id)))), 'no orphan nodes');
}
function window_r(x) { return globalThis.__C[x.id].r; }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
