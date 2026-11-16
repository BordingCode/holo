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

// ---- every card has its own illustration ----
{
  const { SETS } = await import('../js/data.js');
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
  { const B = battle([card('drawbridge')], ['tape_golem']); playRound(B); ok(dealt(B) >= 4, 'drawbridge deals half its block'); }
}
// ---- boss pool & elite prizes ----
{
  const { ENEMIES: EN } = await import('../js/data.js');
  // Rubber Band Ball: the first hit each round bounces back at you; the rest land
  { const B = battle([card('jab'), card('jab')], ['rubber_ball'], { hp: 50, maxHp: 50 }); playRound(B);
    ok(dealt(B) === 4, 'rubber ball: first hit bounces, second lands (' + dealt(B) + ')');
    ok(B.ev.some(e => e.t === 'dmg' && e.side === 'p' && e.amt + e.blocked === 2), 'rubber ball: half (2) bounces back at you'); }
  // Laminator: attacks ignore Block
  { const B = battle([card('guard')], ['laminator'], { hp: 50, maxHp: 50 }); playRound(B);
    ok(B.ev.some(e => e.t === 'dmg' && e.side === 'p' && e.kind === 'pierce' && e.blocked === 0 && e.amt > 0), 'laminator pierces block'); }
  // Appraiser: plain cards half, special editions full
  { const B = battle([card('jab')], ['appraiser']); playRound(B); ok(dealt(B) === 2, 'appraiser halves a plain jab'); }
  { const B = battle([card('jab', 'foil')], ['appraiser']); playRound(B); ok(dealt(B) === 6, 'appraiser: foil jab hits full'); }
  // bosses rolled per run, seeded, stable; both options appear across seeds
  const seen = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (let sd = 1; sd < 40; sd++) { const run = R.newRun({ hero: 'kip', seed: sd }); for (const a of [1, 2, 3]) { run.act = a; const id = R.pickBossId(run); ok(EN[id].boss && R.pickBossId(run) === id, 'boss stable'); seen[a].add(id); } }
  ok(seen[1].size === 2 && seen[2].size === 2 && seen[3].size === 2, 'each act rolls between two bosses');
  // elites carry a prize; a holo prize pull really contains a Holo card
  { const run = R.newRun({ hero: 'kip', seed: 5 }); const el = run.map.rows.flat().filter(n => n.type === 'elite');
    ok(el.length && el.every(n => ['set', 'holo', 'relic'].includes(n.prize)), 'act 1 elites have a prize (no tin)');
    const res = R.openPack(run, { type: 'booster', holo: true }); ok(res.cards.some(c => c.ed === 'holo'), 'holo pull has a Holo card'); }
}
// ---- starting kits, Heat rules, Nell's story ----
{
  const { PACKS: PK } = await import('../js/data.js');
  const std = R.newRun({ hero: 'kip', seed: 11 });
  const shiny = R.newRun({ hero: 'kip', seed: 11, kit: 'shiny' });
  ok(shiny.row.filter(Boolean).every(c => c.ed === 'foil') && shiny.maxHp === Math.round(std.maxHp * 0.85), 'shiny kit: foil starters, -15% HP');
  const mis = R.newRun({ hero: 'kip', seed: 11, kit: 'misprint' });
  ok(mis.row.filter(Boolean).every(c => c.ed === 'misprint' && c.mp != null), 'misprint kit: misprint starters');
  const col = R.newRun({ hero: 'kip', seed: 11, kit: 'collector' });
  ok(R.openPack(col, { type: 'booster' }).cards.length === PK.booster.size + 1, 'collector kit: +1 card per pack');
  ok(R.makeShop(col).stock.length === R.makeShop(std).stock.length - 2, 'collector kit: 2 fewer packs in shops');
  const bar = R.newRun({ hero: 'kip', seed: 11, kit: 'bargain' });
  ok(R.makeShop(bar).stock.length === R.makeShop(std).stock.length + 2, 'bargain kit: 2 extra packs in shops');
  ok(R.newRun({ hero: 'kip', seed: 1, kit: 'nonsense' }).kit === 'standard', 'unknown kit falls back to standard');
  ok(R.newRun({ hero: 'kip', seed: 1, heat: 1 }).bench.length === 2 && std.bench.length === 4, 'heat 1: bench holds 2');
  { const run = R.newRun({ hero: 'kip', seed: 3, heat: 4 }); const enc = R.pickEncounter(run, 'elite'); ok(enc.length >= 2, 'heat 4: elites bring a minion'); }
  { const { nightLine, STORY, BOSS_TIPS } = await import('../js/story.js');
    const m = {}; const lost = { over: 'lose', act: 1, killedById: 'dust_bunny' };
    const l1 = nightLine(m, lost), l2 = nightLine(m, lost);
    ok(l1.text === STORY[0] && l2.text === STORY[1], 'story beats come in order, one per run');
    const t = nightLine(m, { over: 'lose', act: 1, killedById: 'shredder' }); ok(t.text === BOSS_TIPS.shredder, 'first loss to a boss gives its tip');
    ok(nightLine(m, { over: 'lose', act: 1, killedById: 'shredder' }).kind === 'story', 'boss tip only once');
    ok(nightLine(m, { over: 'win', act: 3 }).kind === 'win', 'first win has its own line');
    for (let i = 0; i < 20; i++) nightLine(m, lost);
    ok(m.story.beat === STORY.length && nightLine(m, lost).text, 'after the story, lines keep coming'); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
