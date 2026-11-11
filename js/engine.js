// ---------------------------------------------------------------------------
// HOLO battle engine — pure logic, no DOM. A round resolves synchronously and
// returns an ordered list of events; the UI replays them with animation.
// ---------------------------------------------------------------------------
import { CARDS, ENEMIES, EDITIONS, STAR_MULT, MISPRINTS, RARITY_RANK, ED_RANK } from './data.js';

export const ROW_SIZE = 6;

export function cardValues(inst) {
  const def = CARDS[inst.id];
  const mult = STAR_MULT[inst.star || 1] * EDITIONS[inst.ed || 'normal'].mult;
  const v = {};
  for (const k in def.v) {
    const base = def.v[k];
    v[k] = (def.fixed || []).includes(k) ? base : Math.max(1, Math.round(base * mult));
  }
  return { v, mult };
}

export function cardText(inst) {
  const def = CARDS[inst.id];
  const { v } = cardValues(inst);
  let t = def.text.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  if (inst.ed === 'misprint' && inst.mp != null) t += ' ' + MISPRINTS[inst.mp].text + '.';
  return t;
}

const snap = u => ({ hp: u.hp, maxHp: u.maxHp, block: u.block, burn: u.burn, poison: u.poison, vuln: u.vuln, weak: u.weak, str: u.str, thorns: u.thorns || 0, dead: !!u.dead });

export function makeEnemy(id, mods = {}) {
  const d = ENEMIES[id];
  const hp = Math.round(d.hp * (mods.hpMult || 1));
  return { id, side: 'e', name: d.name, hp, maxHp: hp, block: 0, burn: 0, poison: 0, vuln: 0, weak: 0,
    str: mods.str || 0, moveIdx: 0, stunned: false, dead: false, dmgMult: mods.dmgMult || 1, uid: Math.random().toString(36).slice(2) };
}

export function createBattle(o) {
  const B = {
    round: 0, rng: o.rng, coins: o.coins, perk: o.perk, mods: o.mods || {},
    player: { side: 'p', hp: o.hp, maxHp: o.maxHp, block: 0, thorns: 0, burn: 0, poison: 0, vuln: 0, weak: 0, str: 0 },
    enemies: o.enemies.map(id => makeEnemy(id, o.mods)),
    row: o.row, disabled: {}, mem: {}, flags: {}, target: 0, reverse: false, wrapped: 0,
    maxHitLast: 0, maxHitThis: 0, fires: 0, phoenixUsed: false, over: null, ev: [],
  };
  if (o.perk === 'steady') B.player.block = 6;
  recomputeFlags(B);
  return B;
}

export const alive = B => B.enemies.filter(e => !e.dead);
export const working = (B, s) => !!B.row[s] && !B.disabled[s];

function recomputeFlags(B) {
  const f = {};
  B.row.forEach((c, s) => {
    if (!c || B.disabled[s]) return;
    const p = CARDS[c.id].passive;
    if (p) { f[p] = true; if (p === 'tortoise') f.tortoiseB = Math.max(f.tortoiseB || 0, cardValues(c).v.b); if (p === 'jackpot') f.jackpotD = Math.max(f.jackpotD || 0, cardValues(c).v.d); if (p === 'phoenix') f.phoenixH = Math.max(f.phoenixH || 0, cardValues(c).v.h); }
  });
  B.flags = f;
}

function curTarget(B) {
  let t = B.enemies[B.target];
  if (!t || t.dead) { t = alive(B)[0]; B.target = B.enemies.indexOf(t); }
  return t;
}

// ---- unit helpers --------------------------------------------------------
function idxOf(B, u) { return u.side === 'p' ? -1 : B.enemies.indexOf(u); }
function push(B, e) { B.ev.push(e); }

function addStatus(B, u, k, n) {
  if (n <= 0 || u.dead) return;
  if (k === 'burn' && u.side === 'e' && B.perk === 'kindled') n += 1;
  u[k] = (u[k] || 0) + n;
  push(B, { t: 'status', side: u.side, i: idxOf(B, u), k, n, u: snap(u) });
}

function gainBlock(B, u, n) {
  if (n <= 0) return;
  u.block += n;
  push(B, { t: 'block', side: u.side, i: idxOf(B, u), n, u: snap(u) });
}

function damage(B, u, amt, kind, src) {
  if (u.dead || B.over) return 0;
  amt = Math.max(0, Math.floor(amt));
  let blocked = 0;
  if (kind === 'hit' || kind === 'atk' || kind === 'thorns' || kind === 'king' || kind === 'jackpot') {
    blocked = Math.min(u.block, amt); u.block -= blocked;
  }
  const lost = Math.min(u.hp, amt - blocked);
  u.hp -= amt - blocked;
  push(B, { t: 'dmg', side: u.side, i: idxOf(B, u), amt: amt - blocked, blocked, kind, u: snap(u), big: amt >= 20 });
  if (u.side === 'p') {
    if (lost > 0 && B.flags.hollowKing && kind !== 'king') {
      const tgts = alive(B);
      if (tgts.length) { const t = B.rng.pick(tgts); push(B, { t: 'proc', name: 'The Hollow King' }); damage(B, t, lost * 3, 'king'); }
    }
    if (u.hp <= 0) {
      if (B.flags.phoenix && !B.phoenixUsed) {
        B.phoenixUsed = true; u.hp = B.flags.phoenixH; u.burn = 0; u.poison = 0;
        push(B, { t: 'revive', u: snap(u) });
        alive(B).forEach(e => addStatus(B, e, 'burn', 6));
      } else { u.hp = 0; u.dead = true; B.over = 'lose'; push(B, { t: 'die', side: 'p', i: -1 }); }
    }
  } else {
    if (u.id === 'proprietor' && !u.phased && u.hp > 0 && u.hp <= u.maxHp / 2) {
      u.phased = true; B.reverse = true; u.str += 2;
      push(B, { t: 'phase', i: idxOf(B, u), text: 'CLOSING TIME — your row now fires right-to-left!', u: snap(u) });
    }
    if (u.hp <= 0) killEnemy(B, u);
  }
  return amt - blocked;
}

function killEnemy(B, u) {
  u.hp = 0; u.dead = true;
  push(B, { t: 'die', side: 'e', i: idxOf(B, u) });
  const def = ENEMIES[u.id];
  if (B.flags.plague && u.poison > 0) {
    const p = u.poison; push(B, { t: 'proc', name: 'Plague Rat' });
    alive(B).forEach(e => addStatus(B, e, 'poison', p));
  }
  if (def.split) {
    for (let k = 0; k < 2; k++) {
      const s = makeEnemy(def.split, B.mods); B.enemies.push(s);
      push(B, { t: 'spawn', i: B.enemies.length - 1, id: s.id, name: s.name, u: snap(s) });
    }
  }
  if (!alive(B).length) { B.over = 'win'; push(B, { t: 'win' }); }
}

// ---- card firing ---------------------------------------------------------
function makeCtx(B, inst, slot, depth, bonus) {
  const { v, mult } = cardValues(inst);
  const P = B.player;
  const x = {
    B, v, mult, slot, depth, rng: B.rng,
    get target() { return curTarget(B); },
    get firedBefore() { return B.firedThisRound; },
    get mem() { return (B.mem[inst.uid] ||= { charge: 0, flip: false }); },
    hit(n, o = {}) {
      if (!(n > 0) || B.over) return;
      const tgts = o.all ? alive(B) : o.random ? [B.rng.pick(alive(B))] : [curTarget(B)];
      for (const t of tgts) {
        if (!t || t.dead) continue;
        let d = n + bonus + B.roundBonus + P.str;
        if (P.weak > 0) d *= 0.75;
        if (t.vuln > 0) d *= 1.5;
        d = Math.floor(d);
        B.maxHitThis = Math.max(B.maxHitThis, d);
        damage(B, t, d, 'hit');
        if (B.barbed && !t.dead) addStatus(B, t, 'poison', B.barbed);
      }
    },
    block(n) { gainBlock(B, P, n); },
    heal(n) { const h = Math.min(n, P.maxHp - P.hp); if (h > 0) { P.hp += h; push(B, { t: 'heal', side: 'p', i: -1, n: h, u: snap(P) }); } },
    thorns(n) { P.thorns += n; push(B, { t: 'status', side: 'p', i: -1, k: 'thorns', n, u: snap(P) }); },
    burn(n, o = {}) { for (const t of (o.all ? alive(B) : [curTarget(B)])) if (t) addStatus(B, t, 'burn', n); },
    poison(n, o = {}) { for (const t of (o.all ? alive(B) : [curTarget(B)])) if (t) addStatus(B, t, 'poison', n); },
    vuln(n, o = {}) { for (const t of (o.all ? alive(B) : [curTarget(B)])) if (t) addStatus(B, t, 'vuln', n); },
    coins(n) { B.coins += n; push(B, { t: 'coins', n, total: B.coins }); },
    selfDmg(n) { damage(B, P, n, 'self'); },
    cleanse() { P.burn = 0; P.poison = 0; push(B, { t: 'status', side: 'p', i: -1, k: 'cleanse', n: 0, u: snap(P) }); },
    buffNext(n, count) { B.pendingNext.push({ n, left: count }); push(B, { t: 'buff', slot, n }); },
    roundBonus(n) { B.roundBonus += n; push(B, { t: 'buff', slot, n, round: true }); },
    barbed(n) { B.barbed += n; push(B, { t: 'buff', slot, n, barbed: true }); },
    bribe(c) {
      const t = curTarget(B);
      if (B.coins >= c && t) { B.coins -= c; t.stunned = true; push(B, { t: 'coins', n: -c, total: B.coins }); push(B, { t: 'stun', i: idxOf(B, t) }); }
      else push(B, { t: 'fizzle', slot, text: 'Not enough coins' });
    },
    copyLeft() {
      const L = slot - 1;
      if (depth >= 3 || L < 0 || !working(B, L) || CARDS[B.row[L].id].passive) { push(B, { t: 'fizzle', slot, text: 'Nothing to copy' }); return; }
      fireOnce(B, B.row[L], L, depth + 1, bonus, slot);
    },
    overclockRight() { B.overclock.add(slot + 1); push(B, { t: 'buff', slot, n: 0, overclock: slot + 1 }); },
    silenceRight() { B.silenced.add(slot + 1); },
    fireFirst() {
      if (depth >= 3) return;
      const s = order(B).find(s => working(B, s) && !CARDS[B.row[s].id].passive && B.row[s].id !== 'escapement');
      if (s == null) { push(B, { t: 'fizzle', slot, text: 'Nothing to rewind' }); return; }
      fireOnce(B, B.row[s], s, depth + 1, bonus, slot);
    },
    countRow(pred) { let n = 0; B.row.forEach((c, s) => { if (working(B, s) && pred(CARDS[c.id])) n++; }); return n; },
  };
  return x;
}

function fireOnce(B, inst, slot, depth, bonus, via) {
  if (B.over) return;
  const def = CARDS[inst.id];
  push(B, { t: 'fire', slot, uid: inst.uid, depth, via });
  const x = makeCtx(B, inst, slot, depth, bonus);
  def.fire(x, x.v);
  if (inst.ed === 'misprint' && inst.mp != null && !B.over) {
    const m = MISPRINTS[inst.mp];
    if (m.k === 'd') x.hit(m.n); else if (m.k === 'b') x.block(m.n); else if (m.k === 'burn') x.burn(m.n);
    else if (m.k === 'poi') x.poison(m.n); else if (m.k === 'h') x.heal(m.n); else if (m.k === 'c') x.coins(m.n);
  }
  if (inst.ed === 'gilded') x.coins(1);
}

function fireSlot(B, slot) {
  if (B.over || !working(B, slot)) return;
  const inst = B.row[slot], def = CARDS[inst.id];
  if (def.passive) return;
  if (B.silenced.has(slot)) { B.silenced.delete(slot); push(B, { t: 'skip', slot, text: 'Silenced' }); return; }
  let bonus = 0;
  B.pendingNext.forEach(p => { bonus += p.n; p.left--; });
  B.pendingNext = B.pendingNext.filter(p => p.left > 0);
  let times = 1 + (inst.ed === 'holo' ? 1 : 0);
  if (B.overclock.has(slot)) { times++; B.overclock.delete(slot); }
  for (let k = 0; k < times && !B.over; k++) {
    fireOnce(B, inst, slot, 0, bonus);
    B.firedThisRound++; B.fires++;
    push(B, { t: 'combo', n: B.firedThisRound });
    if (B.flags.jackpot && B.fires % 7 === 0 && !B.over) {
      push(B, { t: 'jackpot' });
      for (const e of alive(B)) damage(B, e, B.flags.jackpotD, 'jackpot');
      B.coins += 5; push(B, { t: 'coins', n: 5, total: B.coins });
    }
  }
}

export function order(B) {
  const o = [...Array(ROW_SIZE).keys()];
  return B.reverse ? o.reverse() : o;
}

// ---- intents --------------------------------------------------------------
export function intentOf(e) { const m = ENEMIES[e.id].moves; return m[e.moveIdx % m.length]; }

export function intentView(B, e) {
  const m = intentOf(e);
  const v = { ...m };
  if (m.atk || m.special === 'copy') {
    let base = m.special === 'copy' ? Math.max(3, Math.min(30, B.maxHitLast)) : m.atk;
    v.atk = enemyHitDmg(B, e, base);
    if (m.special === 'copy') v.approx = true;
    v.times = m.times || 1;
  }
  if (m.block) v.block = m.block;
  return v;
}

function enemyHitDmg(B, e, base) {
  let d = (base + e.str) * e.dmgMult;
  if (e.weak > 0) d *= 0.75;
  if (B.player.vuln > 0) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

function enemyAct(B, e) {
  const P = B.player, i = idxOf(B, e);
  e.block = 0;
  if (e.stunned) { e.stunned = false; e.moveIdx++; push(B, { t: 'act', i, stunned: true, u: snap(e) }); return; }
  const m = intentOf(e);
  push(B, { t: 'act', i, m, u: snap(e) });
  if (m.special === 'shred' || m.special === 'steal') {
    let s = null;
    if (m.special === 'shred') s = [...Array(ROW_SIZE).keys()].find(k => working(B, k));
    else {
      let best = -1;
      B.row.forEach((c, k) => {
        if (!working(B, k)) return;
        const sc = RARITY_RANK[CARDS[c.id].r] * 100 + (c.star || 1) * 10 + ED_RANK[c.ed || 'normal'];
        if (sc > best) { best = sc; s = k; }
      });
    }
    if (s != null) { B.disabled[s] = m.special; push(B, { t: m.special, slot: s, i }); recomputeFlags(B); }
  }
  if (m.special === 'wrap') { B.wrapped = 1; push(B, { t: 'wrap', i }); }
  if (m.special === 'pilfer') { const n = Math.min(4, B.coins); B.coins -= n; push(B, { t: 'coins', n: -n, total: B.coins, pilfer: true }); }
  if (m.block) gainBlock(B, e, m.block);
  if (m.str) { e.str += m.str; push(B, { t: 'status', side: 'e', i, k: 'str', n: m.str, u: snap(e) }); }
  let atk = m.atk;
  if (m.special === 'copy') atk = Math.max(3, Math.min(30, B.maxHitThis));
  if (atk) {
    for (let h = 0; h < (m.times || 1) && !B.over && !e.dead; h++) {
      damage(B, P, enemyHitDmg(B, e, atk), 'atk');
      if (P.thorns > 0 && !B.over) damage(B, e, P.thorns * (B.flags.tortoise ? 2 : 1), 'thorns');
    }
  }
  if (!B.over) {
    if (m.burn) addStatus(B, P, 'burn', m.burn);
    if (m.poison) addStatus(B, P, 'poison', m.poison);
    if (m.vuln) addStatus(B, P, 'vuln', m.vuln);
    if (m.weak) addStatus(B, P, 'weak', m.weak);
  }
  e.moveIdx++;
}

function tick(B, u, isEnemy) {
  if (u.dead || B.over) return;
  if (u.burn > 0) {
    damage(B, u, u.burn, 'burn');
    if (!(isEnemy && B.flags.burnKeep)) u.burn = Math.max(0, u.burn - 1);
  }
  if (u.poison > 0 && !u.dead && !B.over) {
    damage(B, u, u.poison * (isEnemy && B.flags.poisonDouble ? 2 : 1), 'poison');
    if (!(isEnemy && B.flags.plague)) u.poison = Math.max(0, u.poison - 1);
  }
  if (!u.dead) push(B, { t: 'statusSync', side: u.side, i: idxOf(B, u), u: snap(u) });
}

// ---- one full round --------------------------------------------------------
export function playRound(B) {
  B.ev = [];
  if (B.over) return B.ev;
  B.round++;
  recomputeFlags(B);
  push(B, { t: 'round', round: B.round });
  B.firedThisRound = 0; B.roundBonus = 0; B.barbed = 0; B.pendingNext = [];
  B.silenced = new Set(); B.overclock = new Set(); B.maxHitThis = 0;
  if (B.round > 25) alive(B).forEach(e => { e.str += 4; push(B, { t: 'status', side: 'e', i: idxOf(B, e), k: 'str', n: 4, u: snap(e), enrage: true }); });
  if (B.flags.tortoise) gainBlock(B, B.player, B.flags.tortoiseB);
  if (B.wrapped) {
    const s = order(B).find(s => working(B, s) && !CARDS[B.row[s].id].passive);
    if (s != null) B.silenced.add(s);
    B.wrapped = 0;
  }
  const passes = B.flags.grandClock && B.round % 3 === 0 ? 2 : 1;
  for (let p = 0; p < passes && !B.over; p++) {
    if (p === 1) push(B, { t: 'proc', name: 'Grand Clock' });
    for (const s of order(B)) { if (B.over) break; fireSlot(B, s); }
  }
  push(B, { t: 'cardsDone' });
  // Damage-over-time on enemies, then they act.
  for (const e of [...B.enemies]) tick(B, e, true);
  for (const e of [...B.enemies]) {
    if (B.over) break;
    if (!e.dead) enemyAct(B, e);
  }
  if (!B.over) tick(B, B.player, false);
  if (!B.over) {
    if (!B.flags.blockKeep && B.player.block > 0) { B.player.block = 0; push(B, { t: 'statusSync', side: 'p', i: -1, u: snap(B.player) }); }
    for (const u of [B.player, ...alive(B)]) { if (u.vuln > 0) u.vuln--; if (u.weak > 0) u.weak--; }
    push(B, { t: 'statusSync', side: 'p', i: -1, u: snap(B.player) });
    alive(B).forEach(e => push(B, { t: 'statusSync', side: 'e', i: idxOf(B, e), u: snap(e) }));
  }
  B.maxHitLast = B.maxHitThis;
  push(B, { t: 'roundEnd' });
  return B.ev;
}

// Simulate a full fight with no animation (used by tests & the balance sim).
export function autoFight(B, maxRounds = 60) {
  while (!B.over && B.round < maxRounds) playRound(B);
  if (!B.over) B.over = 'lose';
  return B.over;
}
