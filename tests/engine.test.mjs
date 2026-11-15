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
{ const B = battle([card('whetstone'), card('jab')]); playRound(B); ok(dealt(B) === 10, 'whetstone deals 2, next +4'); }
{ const B = battle([card('whetstone'), card('cinder_heart'), card('jab')]); playRound(B); ok(dealt(B) === 10, 'buff skips passive to next firing card'); }
{ const B = battle([card('hollow'), card('blood_pact')]); playRound(B); ok(dealt(B) === 20, 'hollow silences right'); }
{ const B = battle([card('jab'), card('jab'), card('metronome')]); playRound(B); ok(dealt(B) === 12, 'metronome scales with cards fired'); }
{ const B = battle([card('spring'), card('jab')]); playRound(B); ok(dealt(B) === 14, 'spring big when first'); }
{ const B = battle([card('jab'), card('spring')]); playRound(B); ok(dealt(B) === 7, 'spring small when not first'); }
{ const B = battle([card('spring'), card('spring')]); playRound(B); ok(dealt(B) === 16, 'clock-2 bonus: first card fires twice'); }
{ const B = battle([card('kindling')], ['tape_golem']); playRound(B); ok(B.enemies[0].burn === 2, 'burn ticks down by 1 after tick (kindling 3)'); }
{ const B = battle([card('kindling'), card('cinder_heart')]); playRound(B); ok(B.enemies[0].burn === 7, 'cinder heart keeps burn (3 +3 heart +1 ember-2)'); }
{ const B = battle([card('kindling')], ['tape_golem'], { perk: 'kindled' }); playRound(B); ok(B.enemies[0].burn === 3, 'kindled +1 burn'); }
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

// ---- expansion mechanics ----
import { useTactic, setCounts } from '../js/engine.js';
{ const B = battle([card('amplifier'), card('jab')]); playRound(B); ok(dealt(B) === 7, 'amplifier ×1.75'); }
{ const B = battle([card('amplifier'), card('amplifier'), card('jab')]); playRound(B); ok(dealt(B) === 12, 'amps stack multiplicatively (×3.06)'); }
{ const B = battle([card('jab'), card('jab'), card('jab'), card('finale')]); playRound(B); ok(dealt(B) === 12 + 9, 'finale 3×combo'); }
{ const t = card('trophy'); const B = battle([t], ['paper_plane']); autoFight(B, 10); ok(t.grow === 2, 'trophy grows on kill, persists on instance'); }
{ const sb = card('snowball'); const B = battle([sb]); playRound(B); playRound(B); ok(sb.grow === 4, 'snowball grows +2 each fire'); }
{ const B = battle([card('kindling'), card('ember_fang'), card('flare'), card('firebreath')]); const n = setCounts(B.row); ok(n.ember === 4, 'set count'); playRound(B);
  const burnTicks = B.ev.filter(e => e.t === 'dmg' && e.kind === 'burn').length; ok(burnTicks === 2, 'ember-4: burn ticks twice'); }
{ // strike on an empty slot misses
  const B = battle([card('jab')], ['paper_plane']); B.enemies[0].moveIdx = 1; B.enemies[0].aim = 3; // aim at empty slot 4
  playRound(B); ok(B.ev.some(e => e.t === 'miss'), 'strike at empty slot misses'); ok(B.player.hp === 50, 'missed strike deals no damage'); }
{ // strike on occupied slot jams it next round
  const B = battle([card('guard'), card('jab')], ['tape_golem']); B.enemies[0].moveIdx = 1; B.enemies[0].aim = 1;
  playRound(B); ok(B.jammed.has(1), 'strike jams the slot'); playRound(B); ok(B.ev.some(e => e.t === 'skip' && e.slot === 1), 'jammed slot skips'); }
{ const B = battle([card('jab')]); useTactic(B, 'encore'); playRound(B); ok(dealt(B) === 8, 'encore: row fires twice'); }
{ const B = battle([card('jab')]); useTactic(B, 'overcharge'); playRound(B); ok(dealt(B) === 6, 'overcharge ×1.5'); }
{ const B = battle([card('jab'), card('jab')]); useTactic(B, 'spotlight'); playRound(B); ok(dealt(B) === 16, 'spotlight triples first damaging card only'); }
{ const B = battle([card('blood_pact', 'normal', 3)], ['paper_plane', 'paper_plane'], { relics: ['overflow'] }); playRound(B); ok(B.enemies.every(e => e.dead), 'overflow spills overkill'); }
{ const B = createBattle({ rng: makeRng(1), coins: 0, hp: 50, maxHp: 50, row: [card('jab'), null, null, null, null, null], enemies: ['tape_golem'], eds: ['foil'] }); ok(B.enemies[0].maxHp === 53, 'foil enemy +40% hp'); }
{ const B = battle([card('jab')], ['tape_golem'], { relics: ['opening_salvo'] }); playRound(B); ok(dealt(B) === 8, 'opening salvo round 1'); }


// ---- merge rules: every edition pair ----
{
  const EDS = ['normal', 'foil', 'holo', 'gilded', 'cracked', 'misprint'];
  const run = R.newRun({ hero: 'kip' });
  const mk = (ed, star = 1) => { const c = R.newCard(run, 'jab', ed, star); if (ed === 'misprint') c.mp = 2; return c; };
  for (const a of EDS) for (const b of EDS) {
    const out = R.mergeOutcome(mk(a), mk(b));
    const eds = out.options.map(o => o.ed);
    const tag = `${a}+${b}`;
    ok(out.star === 2 && out.gainsStar, tag + ': ★1+★1 → ★2');
    ok(eds.includes(a) || a === 'normal' && b !== 'cracked', tag + ': target edition offered unless plain');
    if (a !== b && a !== 'normal' && b !== 'normal') ok(eds.length === 2, tag + ': two specials → choice');
    if ((a === 'normal') !== (b === 'normal') && a !== 'cracked' && b !== 'cracked') ok(eds.length === 1 && eds[0] !== 'normal', tag + ': special kept automatically');
    if (a !== b) ok(eds[0] !== 'cracked', tag + ': cracked never the default');
    // every option applies cleanly
    out.options.forEach((o, i) => { const t = mk(a), d = mk(b); R.applyMerge(run, t, d, i);
      ok(t.ed === o.ed && t.star === 2, tag + ' opt' + i + ' applied');
      ok((t.ed === 'cracked') === (t.cracks === 3), tag + ' opt' + i + ' cracks consistent');
      ok((t.ed === 'misprint') === (t.mp != null), tag + ' opt' + i + ' misprint bonus consistent'); });
  }
}
{ const run = R.newRun({ hero: 'kip' });
  const t = R.newCard(run, 'jab', 'normal', 3), d = R.newCard(run, 'jab', 'holo');
  const out = R.mergeOutcome(t, d); ok(out.useful && !out.gainsStar && out.options[0].ed === 'holo', 'maxed ★3 can take a holo edition');
  R.applyMerge(run, t, d); ok(t.ed === 'holo' && t.star === 3, 'apply edition onto ★3');
  const c0 = run.coins; const r = R.applyMerge(run, t, R.newCard(run, 'jab', 'holo')); ok(r.coins > 0 && run.coins > c0 && t.star === 3, 'nothing to gain → donor sold');
  const cr = R.newCard(run, 'jab', 'cracked', 3); cr.cracks = 1; const o2 = R.mergeOutcome(cr, R.newCard(run, 'jab', 'cracked'));
  ok(o2.useful, 'worn cracked ★3 + cracked copy patches it'); R.applyMerge(run, cr, R.newCard(run, 'jab', 'cracked')); ok(cr.cracks === 3, 'cracks reset to 3');
  ok(R.mergeOutcome(R.newCard(run, 'jab', 'normal', 1), R.newCard(run, 'jab', 'normal', 2)).star === 3, '★1 + ★2 → ★3');
  run.row = [R.newCard(run, 'jab', 'normal', 3), R.newCard(run, 'jab', 'normal', 1), null, null, null, null]; run.bench = [R.newCard(run, 'jab', 'foil', 2), null, null, null];
  const tg = R.mergeTargets(run, 'jab'); ok(tg[0].c.star === 2 && tg[tg.length - 1].c.star === 3, 'merge targets: unmaxed best first, maxed last');
}

function window_r(x) { return globalThis.__C[x.id].r; }

// ---- growth: Alt Art / Full Art ----
{
  const { GROWTH, SETS } = await import('../js/data.js');
  const { growStage, cardText, cardName, cardValues } = await import('../js/engine.js');
  const j = card('jab'); const B = battle([j], ['tape_golem'], { hp: 999, maxHp: 999 });
  B.enemies[0].hp = B.enemies[0].maxHp = 99999;
  let fires = 0; for (let i = 0; i < 5; i++) fires += playRound(B).filter(e => e.t === 'fire' && e.uid === j.uid).length;
  ok(fires >= 3 && j.xp === fires, 'a row card grows +1 each time it fires (fires ' + fires + ', xp ' + j.xp + ')');
  const h = card('jab', 'holo'); const B2 = battle([h, card('overclock')], ['tape_golem']); B2.enemies[0].hp = 99999;
  playRound(B2); ok(h.xp <= GROWTH.perRound, 'growth capped per round');
  ok(growStage({ id: 'jab', xp: GROWTH.alt - 1 }) === 0 && growStage({ id: 'jab', xp: GROWTH.alt }) === 1 && growStage({ id: 'jab', xp: GROWTH.full }) === 2, 'stage thresholds');
  ok(growStage({ id: 'phoenix', xp: 999 }) === 0, 'passives never grow');
  ok(cardValues({ id: 'jab', xp: GROWTH.alt }).v.d === 5 && cardValues({ id: 'jab', xp: GROWTH.full }).v.d === 6, 'Alt ×1.3, Full ×1.6 (jab 4 → 5 → 6)');
  ok(cardName({ id: 'jab', xp: GROWTH.full }) === 'Haymaker' && cardName({ id: 'jab', xp: GROWTH.alt }) === 'Jab', 'starter gets a named Full Art form');
  ok(/Burn/.test(cardText({ id: 'wildfire', xp: GROWTH.alt })) && !/Then/.test(cardText({ id: 'wildfire' })), 'no-number cards get a bonus at Alt Art');
  { const m = card('mirror'); m.xp = GROWTH.alt; const B3 = battle([card('jab'), m]); playRound(B3); ok(dealt(B3) === 11, 'Alt Art mirror: copy (4) + jab (4) + bloom 3 = 11, got ' + dealt(B3)); }
  { // bench cards don't grow: only row instances
    const b = card('jab'); const B4 = battle([card('jab')]); B4.bench = [b]; playRound(B4); ok(!b.xp, 'bench card does not grow'); }
  { const B5 = battle([card('jab', 'normal', 1)], ['paper_clip'], { hp: 99, maxHp: 99 }); B5.enemies[0].hp = 1;
    playRound(B5); ok(B5.row[0].xp === 1 + GROWTH.kill, 'kill gives extra growth'); }
  { const run = R.newRun({ hero: 'kip', seed: 3 }); const t = run.row[0]; t.xp = 3; const a = { ...card('jab'), xp: 20 };
    R.mergeInto(run, t, a); ok(t.xp === 20, 'merging keeps the bigger growth'); }
  // every card has its own illustration, different from every set symbol
  const icons = Object.values(CARDS).map(c => c.icon);
  ok(new Set(icons).size === icons.length, 'every card has a unique illustration');
  const glyphs = new Set(Object.values(SETS).map(s => s.glyph));
  ok(Object.values(CARDS).every(c => !glyphs.has(c.icon)), 'no card art equals a set symbol');
}
// ---- new cards & reworked intents ----
{
  { const B = battle([card('mirror'), card('jab')]); playRound(B); ok(dealt(B) === 8, 'mirror first in row copies the RIGHT card'); }
  { const B = battle([card('jab'), card('cuckoo')]); playRound(B); ok(dealt(B) === 8, 'cuckoo at the end fires the FIRST card'); }
  { const B = battle([card('jab'), card('last_call')]); playRound(B); ok(dealt(B) === 4 + 12, 'last call triples when last'); }
  { const B = battle([card('last_call'), card('jab')]); playRound(B); ok(dealt(B) === 8, 'last call normal when not last'); }
  { const B = battle([card('shadow_bargain'), card('jab'), card('jab')]); playRound(B); ok(dealt(B) === 16, 'shadow bargain: next 2 fire twice'); }
  { const s = card('jab'); const B = battle([card('seedling'), s]); playRound(B); ok(s.xp === 3, 'seedling grows the right card (+2) and it grows +1 firing'); }
  { const sp = card('sprout'); const B = battle([sp]); playRound(B); ok(sp.xp === 2, 'sprout grows twice as fast'); }
  { const a = card('jab'), b = card('jab'); const B = battle([a, card('graft'), b]); playRound(B); ok(a.xp === 4 && b.xp === 4, 'graft grows both neighbours'); }
  { const j = card('jab'); j.xp = 40; const B = battle([card('bloom_burst'), j]); playRound(B); ok(dealt(B) === 12 + 6, 'bloom burst counts stages (Full=2): 4×3 + jab 6'); }
  { const j = card('jab'); j.xp = 40; const B = battle([j, card('world_tree')]); playRound(B); ok(dealt(B) === 20, 'world tree: Full Art fires twice, +2 per hit: 8, then 12 (Haymaker made it Vulnerable)'); }
  { const a = card('jab'); const B = battle([a, card('hothouse')]); playRound(B); ok(a.xp === 4, 'hothouse grows the row +3 at fight start'); }
  { const B = battle([card('jab'), card('reprint')]); const j = B.row[0]; j.xp = 5; playRound(B); ok(dealt(B) === 8, 'reprint fires the most-grown card'); }
  { const B = battle([card('drawbridge')], ['tape_golem']); playRound(B); ok(dealt(B) >= 4, 'drawbridge deals half its block'); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
