// Balance simulator: a simple bot plays N full runs headlessly.
// node tests/sim.mjs [runs] [hero] [heat]
import { CARDS, SETS, CARD_LIST } from '../js/data.js';
if (process.env.EXCLUDE) for (const id of process.env.EXCLUDE.split(',')) CARD_LIST.splice(CARD_LIST.findIndex(c => c.id === id), 1);
import { autoFight, ROW_SIZE, createBattle, playRound, useTactic, intentView, alive } from '../js/engine.js';
import { makeRng } from '../js/rng.js';
import * as R from '../js/run.js';

const N = +(process.argv[2] || 300), HERO = process.argv[3] || 'kip', HEAT = +(process.argv[4] || 0);
const ALLSETS = process.env.SETS ? process.env.SETS.split(',') : process.env.NEWBIE ? ['base','ember','venom','iron','clock'] : ['base', 'ember', 'venom', 'iron', 'clock', 'gilded', 'void'];

// Score a row by test-firing it for 4 rounds against a training dummy.
function evalRow(run, row) {
  const B = createBattle({ rng: makeRng(9), coins: run.coins, perk: 'none', hp: 999, maxHp: 999, row, relics: run.relics, enemies: ['tape_golem', 'dust_moth'], mods: { hpMult: 40 } });
  let dmg = 0, blk = 0;
  for (let r = 0; r < 4; r++) for (const e of playRound(B)) {
    if (e.t === 'dmg' && e.side === 'e') dmg += e.amt + e.blocked;
    if (e.t === 'block' && e.side === 'p') blk += e.n;
    if (e.t === 'heal') blk += e.n;
  }
  return dmg + 0.6 * blk;
}
const SMART = !process.env.DUMB;
function improveOrder(run) {
  let best = evalRow(run, run.row), improved = true, guard = 0;
  while (improved && guard++ < 6) {
    improved = false;
    const L = run.row.length; for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) {
      [run.row[i], run.row[j]] = [run.row[j], run.row[i]];
      const sc = evalRow(run, run.row);
      if (sc > best + 0.01) { best = sc; improved = true; } else [run.row[i], run.row[j]] = [run.row[j], run.row[i]];
    }
  }
  // Shredder-proofing: put the least valuable card leftmost if that barely costs anything
}
function placeCards(run, cards, mustKeep) {
  let kept = 0;
  for (const c of cards) {
    const owned = R.allOwned(run).find(o => o.id === c.id);
    if (owned && owned.star < 3) { R.mergeInto(run, owned, c); kept++; continue; }
    if (!SMART) {
      const empty = run.row.indexOf(null);
      if (empty >= 0) { run.row[empty] = c; kept++; continue; }
      let wi = -1, ws = 1e9;
      run.row.forEach((o, k) => { const s = R.score(o); if (s < ws) { ws = s; wi = k; } });
      if (R.score(c) > ws || (mustKeep && !kept)) { run.coins += R.sellValue(run, run.row[wi]); run.row[wi] = c; kept++; }
      else run.coins += R.sellValue(run, c);
      continue;
    }
    const base = evalRow(run, run.row);
    let bestK = -1, bestS = base;
    for (let k = 0; k < run.row.length; k++) {
      const old = run.row[k]; run.row[k] = c;
      const sc = evalRow(run, run.row);
      if (sc > bestS + 0.5) { bestS = sc; bestK = k; }
      run.row[k] = old;
    }
    if (bestK >= 0 || (mustKeep && !kept)) {
      if (bestK < 0) bestK = 0;
      if (run.row[bestK]) run.coins += R.sellValue(run, run.row[bestK]);
      run.row[bestK] = c; kept++;
    } else run.coins += R.sellValue(run, c);
  }
  if (SMART) improveOrder(run); else run.row.sort((a, b) => (a ? R.score(a) : -1) - (b ? R.score(b) : -1));
}

// simple tactic policy: defend when about to take a big hit, otherwise spend damage tactics on bosses/elites
function tacticPolicy(run, kind) {
  return (B) => {
    if (!run.tactics.length || process.env.NOTAC) return;
    const inc = alive(B).reduce((s, e) => { const v = intentView(B, e); return s + (v.atk && !v.miss ? v.atk * (v.times || 1) : 0); }, 0);
    const danger = inc - B.player.block > B.player.hp * 0.35;
    const def = ['bubble_wrap', 'smoke_bomb', 'first_aid', 'reshuffle'];
    const off = ['encore', 'echo', 'overcharge', 'spotlight', 'price_drop', 'accelerant', 'hot_glue', 'lucky_coin'];
    let pick = danger ? run.tactics.find(t => def.includes(t)) : (kind !== 'fight' || B.round >= 3) ? run.tactics.find(t => off.includes(t)) : null;
    if (pick) { run.tactics.splice(run.tactics.indexOf(pick), 1); useTactic(B, pick); }
  };
}
function openAndPlace(run, spec) { const r = R.openPack(run, spec); if (r.tactic) R.addTactic(run, r.tactic); placeCards(run, r.cards, r.mustKeep); }
function play(run, kind) {
  R.startBattle(run, kind);
  const B = R.makeBattle(run);
  autoFight(B, 60, tacticPolicy(run, kind));
  const rew = R.finishBattle(run, B);
  if (!rew) return false;
  for (const p of rew.packs) openAndPlace(run, p);
  if (rew.relics && rew.relics.length) R.takeRelic(run, rew.relics[0]);
  return true;
}

const res = { win: 0, deaths: {}, act: { 1: 0, 2: 0, 3: 0 }, floors: 0 };
for (let i = 0; i < N; i++) {
  // BOX=id:ed:star,... → bring these collection cards in the Deck Box (e.g. BOX=golden_age:holo:2)
  const box = process.env.BOX ? process.env.BOX.split(',').map((t, k) => { const [id, ed = 'normal', star = 1] = t.split(':'); return { cid: 'k' + k, id, ed, star: +star }; }) : [];
  const run = R.newRun({ hero: HERO, heat: HEAT, seed: 1000 + i, unlockedSets: ALLSETS, box });
  let guard = 0;
  while (!run.over && guard++ < 200) {
    const opts = R.reachable(run).map(id => R.nodeById(run, id));
    const pref = { treasure: 6, shop: run.coins >= 20 ? 5 : 1, rest: 3, fight: 3, event: 2, grader: 2, elite: run.hp > run.maxHp * 0.6 ? 3 : 0, boss: 9 };
    opts.sort((a, b) => (pref[b.type] || 0) - (pref[a.type] || 0));
    const nd = R.enterNode(run, opts[0].id);
    res.act[run.act]++;
    if (nd.type === 'fight' || nd.type === 'elite' || nd.type === 'boss') {
      if (!play(run, nd.type)) { const k = `${run.act}:${run.killedBy}`; res.deaths[k] = (res.deaths[k] || 0) + 1; break; }
    } else if (nd.type === 'shop') {
      const S = R.makeShop(run);
      if (run.hp < run.maxHp * 0.5 && run.coins >= S.mend.price) { run.coins -= S.mend.price; run.hp = Math.min(run.maxHp, run.hp + S.mend.amt); }
      for (const it of [...S.stock].sort((a, b) => b.price - a.price)) {
        if (it.type === 'cursed') continue;
        if (run.coins >= it.price) { run.coins -= it.price; openAndPlace(run, it); }
      }
      if (!S.showcase.sold && run.coins >= S.showcase.price) { run.coins -= S.showcase.price; placeCards(run, [S.showcase.card]); }
    } else if (nd.type === 'rest') {
      if (run.hp < run.maxHp * 0.65) run.hp = Math.min(run.maxHp, run.hp + R.restHeal(run));
      else { const c = run.row.filter(Boolean).sort((a, b) => R.score(b) - R.score(a)).find(c => c.star < 3); if (c) c.star++; }
    } else if (nd.type === 'grader') {
      const c = run.row.filter(c => c && c.ed === 'normal').sort((a, b) => R.score(b) - R.score(a))[0];
      if (c) R.gradeCard(run, c);
    } else if (nd.type === 'event') {
      openAndPlace(run, { type: 'booster' });
    } else if (nd.type === 'treasure') {
      R.takeRelic(run, R.relicChoices(run, 2)[0]);
    }
    R.completeNode(run);
  }
  res.floors += run.floor;
  if (process.env.SHOW && i < 6) console.log(run.over||'dead', 'act', run.act, 'floor', run.floor, 'coins', run.coins, run.row.map(c => c ? c.id + '★' + c.star + (c.ed !== 'normal' ? '(' + c.ed + ')' : '') : '-').join(' '));
  if (run.over === 'win') res.win++;
}
console.log(`hero=${HERO} heat=${HEAT} runs=${N}  WIN ${(100 * res.win / N).toFixed(1)}%  avg floor ${(res.floors / N).toFixed(1)}`);
console.log('reached act2:', (100 * (N - Object.entries(res.deaths).filter(([k]) => k[0] === '1').reduce((s, [, v]) => s + v, 0)) / N).toFixed(0) + '%',
  ' act3:', (100 * (N - Object.entries(res.deaths).filter(([k]) => k[0] !== '3').reduce((s, [, v]) => s + v, 0)) / N).toFixed(0) + '%');
console.log('deaths:', Object.entries(res.deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
