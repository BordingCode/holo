// ---------------------------------------------------------------------------
// HOLO battle engine — pure logic, no DOM. A round resolves synchronously and
// returns an ordered list of events; the UI replays them with animation.
//
// Round order: start-of-round effects → your row fires (left→right, or
// reversed) → Burn/Poison tick on enemies → enemies act (aims land) →
// your Burn/Poison tick → Block fades → new intents + aims.
// ---------------------------------------------------------------------------
import { CARDS, ENEMIES, EDITIONS, STAR_MULT, MISPRINTS, RARITY_RANK, ED_RANK, SET_BONUS, TACTICS, ENEMY_EDITIONS } from './data.js';

export const ROW_SIZE = 6;

export function cardValues(inst) {
  const def = CARDS[inst.id];
  const mult = STAR_MULT[inst.star || 1] * EDITIONS[inst.ed || 'normal'].mult;
  const v = {};
  for (const k in def.v) {
    const base = def.v[k];
    v[k] = (def.fixed || []).includes(k) ? base : Math.max(1, Math.round(base * mult));
  }
  if (def.calc) Object.assign(v, def.calc(inst, mult));
  return { v, mult };
}

export function cardText(inst) {
  const def = CARDS[inst.id];
  const { v } = cardValues(inst);
  let t = def.text.replace(/\{(\w+)\}/g, (_, k) => k === 'grow' ? (inst.grow ? ` (+${inst.grow})` : '') : v[k]);
  if (inst.ed === 'misprint' && inst.mp != null) t += ' ' + MISPRINTS[inst.mp].text + '.';
  return t;
}

const snap = u => ({ hp: u.hp, maxHp: u.maxHp, block: u.block, burn: u.burn, poison: u.poison, vuln: u.vuln, weak: u.weak, str: u.str, thorns: u.thorns || 0, dead: !!u.dead });

export function makeEnemy(id, mods = {}, ed = null) {
  const d = ENEMIES[id];
  const E = ed ? ENEMY_EDITIONS[ed] : null;
  const hp = Math.max(1, Math.round(d.hp * (mods.hpMult || 1) * (E ? E.hp : 1)));
  return { id, side: 'e', name: d.name, ed, hp, maxHp: hp, block: 0, burn: 0, poison: 0, vuln: 0, weak: 0,
    str: mods.str || 0, moveIdx: 0, stunned: false, dead: false, dmgMult: (mods.dmgMult || 1) * (E ? E.dmg : 1), aim: null };
}

// Set counts for the row (+1 per matching relic core). Starter cards don't count.
export function setCounts(row, disabled = {}, relics = []) {
  const n = {};
  row.forEach((c, s) => { if (!c || disabled[s]) return; const set = CARDS[c.id].set; if (set !== 'base') n[set] = (n[set] || 0) + 1; });
  for (const r of relics) { const core = RELIC_CORE[r]; if (core) n[core] = (n[core] || 0) + 1; }
  return n;
}
const RELIC_CORE = { ember_core: 'ember', venom_core: 'venom', iron_core: 'iron', clock_core: 'clock', gilded_core: 'gilded', void_core: 'void' };
export function setTier(count) { return count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0; }
export function activeBonuses(row, disabled, relics) {
  const n = setCounts(row, disabled, relics), out = {};
  for (const s in SET_BONUS) out[s] = setTier(n[s] || 0);
  return { counts: n, tiers: out };
}

export function createBattle(o) {
  const B = {
    round: 0, rng: o.rng, coins: o.coins, perk: o.perk, mods: o.mods || {}, relics: o.relics || [],
    player: { side: 'p', hp: o.hp, maxHp: o.maxHp, block: 0, thorns: 0, burn: 0, poison: 0, vuln: 0, weak: 0, str: 0 },
    enemies: o.enemies.map((id, k) => makeEnemy(id, o.mods, (o.eds || [])[k] || null)),
    row: o.row, disabled: {}, mem: {}, flags: {}, target: 0, reverse: false, wrapped: 0,
    jammed: new Set(), pre: {}, maxHitLast: 0, maxHitThis: 0, fires: 0, phoenixUsed: false, over: null, ev: [],
    stats: { maxCombo: 0, maxHit: 0, maxRound: 0, set6: false, kills: 0 }, voidCharge: 0,
  };
  if (o.perk === 'steady') B.player.block = 6;
  if (B.relics.includes('spiked_binder')) B.player.thorns = 5;
  recomputeFlags(B);
  setAims(B);
  return B;
}

export const alive = B => B.enemies.filter(e => !e.dead);
export const working = (B, s) => !!B.row[s] && !B.disabled[s];
const has = (B, r) => B.relics.includes(r);

function recomputeFlags(B) {
  const f = {};
  B.row.forEach((c, s) => {
    if (!c || B.disabled[s]) return;
    const p = CARDS[c.id].passive;
    if (p) { f[p] = true; if (p === 'tortoise') f.tortoiseB = Math.max(f.tortoiseB || 0, cardValues(c).v.b); if (p === 'jackpot') f.jackpotD = Math.max(f.jackpotD || 0, cardValues(c).v.d); if (p === 'phoenix') f.phoenixH = Math.max(f.phoenixH || 0, cardValues(c).v.h); }
  });
  B.flags = f;
  const { tiers } = activeBonuses(B.row, B.disabled, B.relics);
  B.sets = tiers;
  if (tiers.ember >= 3) B.flags.burnKeep = true;
  if (Object.values(tiers).some(t => t >= 3)) B.stats.set6 = true;
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
  if (u.side === 'e') {
    if (k === 'burn') { if (B.perk === 'kindled') n += 1; if (B.sets.ember >= 1) n += 1; }
    if (k === 'poison' && B.sets.venom >= 1) n += 1;
  }
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
  if (kind === 'self' && B.sets && B.sets.void >= 1) amt = Math.max(0, amt - 1);
  const through = amt - blocked;
  const hpBefore = u.hp;
  u.hp -= through;
  push(B, { t: 'dmg', side: u.side, i: idxOf(B, u), amt: through, blocked, kind, u: snap(u), big: amt >= 20, huge: amt >= 60 });
  if (u.side === 'p') {
    const lost = Math.min(hpBefore, through);
    if (lost > 0 && B.sets && B.sets.void >= 2) B.voidCharge += 6;
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
    if (u.hp <= 0) {
      const over = -u.hp;
      killEnemy(B, u, src);
      if (over > 0 && kind === 'hit' && has(B, 'overflow') && !B.over) {
        const next = alive(B)[0];
        if (next) { push(B, { t: 'proc', name: 'Overflow' }); damage(B, next, over, 'hit'); }
      }
    }
  }
  return through;
}

function killEnemy(B, u, src) {
  u.hp = 0; u.dead = true; B.stats.kills++;
  push(B, { t: 'die', side: 'e', i: idxOf(B, u) });
  const def = ENEMIES[u.id];
  if (src && src.trophy && B.curInst) { B.curInst.grow = (B.curInst.grow || 0) + 2; push(B, { t: 'grow', uid: B.curInst.uid, n: 2, total: B.curInst.grow }); }
  if (u.ed === 'gilded') { B.coins += 12; push(B, { t: 'coins', n: 12, total: B.coins }); }
  if (B.sets.gilded >= 1) { B.coins += 2; push(B, { t: 'coins', n: 2, total: B.coins }); }
  if (B.flags.plague && u.poison > 0) {
    const p = u.poison; push(B, { t: 'proc', name: 'Plague Rat' });
    alive(B).forEach(e => addStatus(B, e, 'poison', p));
  }
  if (def.split) {
    for (let k = 0; k < 2; k++) {
      const s = makeEnemy(def.split, B.mods); B.enemies.push(s);
      push(B, { t: 'spawn', i: B.enemies.length - 1, id: s.id, name: s.name, u: snap(s) });
    }
    setAims(B, true);
  }
  if (!alive(B).length) { B.over = 'win'; push(B, { t: 'win' }); }
}

// ---- card firing ---------------------------------------------------------
function comboCount(B) { return B.firedThisRound * (B.chain ? 2 : 1) + (has(B, 'combo_core') ? 2 : 0); }

function makeCtx(B, inst, slot, depth, bonus) {
  const { v, mult } = cardValues(inst);
  const P = B.player;
  const x = {
    B, v, mult, slot, depth, inst, rng: B.rng,
    get target() { return curTarget(B); },
    get firedBefore() { return comboCount(B); },
    get mem() { return (B.mem[inst.uid] ||= { charge: 0, flip: false }); },
    allEnemies() { return alive(B); },
    hit(n, o = {}) {
      if (!(n > 0) || B.over) return 0;
      const tgts = o.all ? alive(B) : o.random ? [B.rng.pick(alive(B))] : [curTarget(B)];
      let total = 0;
      for (const t of tgts) {
        if (!t || t.dead) continue;
        let add = bonus + B.roundBonus + P.str + B.voidCharge;
        if (B.sets.venom >= 2 && t.poison > 0) add += 3;
        if (B.sets.gilded >= 2) add += Math.min(6, Math.floor(B.coins / 10));
        let d = n + add;
        if (P.weak > 0) d *= 0.75;
        if (t.vuln > 0) d *= 1.5;
        d *= B.roundMult;
        if (B.flags.crescendo) d *= 1 + 0.15 * B.firedThisRound;
        if (B.spotlight) { d *= 3; B.spotlightUsed = true; }
        d = Math.floor(d);
        B.voidCharge = 0;
        B.maxHitThis = Math.max(B.maxHitThis, d);
        B.stats.maxHit = Math.max(B.stats.maxHit, d);
        B.roundDmg += d;
        total += damage(B, t, d, 'hit', o);
        if (B.barbed && !t.dead) addStatus(B, t, 'poison', B.barbed);
      }
      return total;
    },
    block(n) { gainBlock(B, P, n); },
    heal(n) { const h = Math.min(n, P.maxHp - P.hp); if (h > 0) { P.hp += h; push(B, { t: 'heal', side: 'p', i: -1, n: h, u: snap(P) }); } },
    thorns(n) { P.thorns += n; push(B, { t: 'status', side: 'p', i: -1, k: 'thorns', n, u: snap(P) }); },
    burn(n, o = {}) { for (const t of (o.all ? alive(B) : [o.unit || curTarget(B)])) if (t) addStatus(B, t, 'burn', n); },
    poison(n, o = {}) { for (const t of (o.all ? alive(B) : [o.unit || curTarget(B)])) if (t) addStatus(B, t, 'poison', n); },
    vuln(n, o = {}) { for (const t of (o.all ? alive(B) : [curTarget(B)])) if (t) addStatus(B, t, 'vuln', n); },
    coins(n) { if (n <= 0) return; B.coins += n; push(B, { t: 'coins', n, total: B.coins }); },
    selfDmg(n) { damage(B, P, n, 'self'); },
    cleanse() { P.burn = 0; P.poison = 0; push(B, { t: 'status', side: 'p', i: -1, k: 'cleanse', n: 0, u: snap(P) }); },
    buffNext(n, count) { B.pendingNext.push({ n, left: count }); push(B, { t: 'buff', slot, n }); },
    roundBonus(n) { B.roundBonus += n; push(B, { t: 'buff', slot, n, round: true }); },
    barbed(n) { B.barbed += n; push(B, { t: 'buff', slot, n, barbed: true }); },
    amp(m) { B.roundMult *= m; push(B, { t: 'mult', slot, m: B.roundMult, by: m }); },
    chain() { B.chain = true; push(B, { t: 'buff', slot, n: 0, chain: true }); },
    grow(n, max) { const g = Math.min(max, (inst.grow || 0) + n); if (g !== (inst.grow || 0)) { inst.grow = g; push(B, { t: 'grow', uid: inst.uid, slot, n, total: g }); } },
    smash(d) { push(B, { t: 'jackpot', text: 'SMASH!' }); for (const e of alive(B)) damage(B, e, d, 'jackpot'); },
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
    fireRight() {
      const Rr = slot + 1;
      if (depth >= 3 || Rr >= B.row.length || !working(B, Rr) || CARDS[B.row[Rr].id].passive) { push(B, { t: 'fizzle', slot, text: 'Nothing to wind' }); return; }
      fireOnce(B, B.row[Rr], Rr, depth + 1, bonus, slot);
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
    countRowInst(pred) { let n = 0; B.row.forEach((c, s) => { if (working(B, s) && pred(c)) n++; }); return n; },
  };
  return x;
}

function fireOnce(B, inst, slot, depth, bonus, via) {
  if (B.over) return;
  const def = CARDS[inst.id];
  push(B, { t: 'fire', slot, uid: inst.uid, depth, via });
  const prevInst = B.curInst; B.curInst = inst;
  const x = makeCtx(B, inst, slot, depth, bonus);
  def.fire(x, x.v);
  if (inst.ed === 'misprint' && inst.mp != null && !B.over) {
    const m = MISPRINTS[inst.mp];
    if (m.k === 'd') x.hit(m.n); else if (m.k === 'b') x.block(m.n); else if (m.k === 'burn') x.burn(m.n);
    else if (m.k === 'poi') x.poison(m.n); else if (m.k === 'h') x.heal(m.n); else if (m.k === 'c') x.coins(m.n);
  }
  if (inst.ed === 'gilded') x.coins(1);
  B.curInst = prevInst;
}

function fireSlot(B, slot, extraTimes = 0) {
  if (B.over || !working(B, slot)) return;
  const inst = B.row[slot], def = CARDS[inst.id];
  if (def.passive) return;
  if (B.jamNow.has(slot)) { push(B, { t: 'skip', slot, text: 'Jammed!' }); return; }
  if (B.silenced.has(slot)) { B.silenced.delete(slot); push(B, { t: 'skip', slot, text: 'Silenced' }); return; }
  let bonus = 0;
  B.pendingNext.forEach(p => { bonus += p.n; p.left--; });
  B.pendingNext = B.pendingNext.filter(p => p.left > 0);
  let times = 1 + extraTimes + (inst.ed === 'holo' ? 1 : 0);
  if (def.set === 'void' && B.sets.void >= 3) times++;
  if (B.overclock.has(slot)) { times++; B.overclock.delete(slot); }
  const wasSpot = B.spotlight;
  for (let k = 0; k < times && !B.over; k++) {
    fireOnce(B, inst, slot, 0, bonus);
    B.firedThisRound++; B.fires++;
    B.stats.maxCombo = Math.max(B.stats.maxCombo, B.firedThisRound);
    push(B, { t: 'combo', n: comboCount(B), mult: B.roundMult });
    if (B.flags.jackpot && B.fires % 7 === 0 && !B.over) {
      push(B, { t: 'jackpot' });
      for (const e of alive(B)) damage(B, e, B.flags.jackpotD, 'jackpot');
      B.coins += 5; push(B, { t: 'coins', n: 5, total: B.coins });
    }
  }
  if (wasSpot && B.spotlightUsed) B.spotlight = false;
}

export function order(B) {
  const o = [...Array(B.row.length).keys()];
  return B.reverse ? o.reverse() : o;
}

// ---- intents & aims -------------------------------------------------------------
export function intentOf(e) { const m = ENEMIES[e.id].moves; return m[e.moveIdx % m.length]; }

function slotValue(B, s) {
  const c = B.row[s]; if (!c || B.disabled[s]) return -1;
  const def = CARDS[c.id];
  return (def.passive ? 0 : 10) + RARITY_RANK[def.r] * 5 + (c.star || 1) * 3 + ED_RANK[c.ed || 'normal'] + B.rng.next();
}
// Pick target slots for every enemy whose upcoming move is aimed.
function setAims(B, onlyMissing = false) {
  for (const e of B.enemies) {
    if (e.dead) continue;
    const m = intentOf(e);
    if (!m.aim) { e.aim = null; continue; }
    if (onlyMissing && e.aim != null) continue;
    const slots = [...Array(B.row.length).keys()].filter(s => working(B, s));
    if (!slots.length) { e.aim = B.rng.int(0, B.row.length - 1); continue; }
    if (m.aimAt === 'strong') e.aim = slots.reduce((a, b) => slotValue(B, b) > slotValue(B, a) ? b : a);
    else e.aim = B.rng.pick(slots);
  }
}

export function intentView(B, e) {
  const m = intentOf(e);
  const v = { ...m };
  const E = e.ed === 'holo' ? 2 : 1;
  if (m.atk || m.special === 'copy') {
    let base = m.special === 'copy' ? Math.max(3, Math.min(30, B.maxHitLast)) : m.atk;
    v.atk = enemyHitDmg(B, e, base);
    v.times = (m.times || 1) * E;
    if (m.special === 'copy') v.approx = true;
    if (m.aim === 'strike' && e.aim != null && (!B.row[e.aim] || B.disabled[e.aim])) v.miss = true;
  }
  if (m.block) v.block = m.block;
  v.aimSlot = m.aim ? e.aim : null;
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
    if (m.special === 'shred') s = [...Array(B.row.length).keys()].find(k => working(B, k));
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
  if (m.block) gainBlock(B, e, m.block * (e.ed === 'holo' ? 2 : 1));
  if (m.str) { e.str += m.str; push(B, { t: 'status', side: 'e', i, k: 'str', n: m.str, u: snap(e) }); }
  let atk = m.atk;
  if (m.special === 'copy') atk = Math.max(3, Math.min(30, B.maxHitThis));
  // Aimed moves
  let missed = false;
  if (m.aim && e.aim != null) {
    const occupied = !!B.row[e.aim] && !B.disabled[e.aim];
    if (m.aim === 'strike') {
      if (!occupied) { missed = true; push(B, { t: 'miss', i, slot: e.aim }); }
      else { B.jamNext.add(e.aim); push(B, { t: 'jam', i, slot: e.aim, kind: 'strike' }); }
    } else if (m.aim === 'blind') { B.jamNext.add(e.aim); push(B, { t: 'jam', i, slot: e.aim, kind: 'blind' }); }
  }
  if (atk && !missed) {
    const times = (m.times || 1) * (e.ed === 'holo' ? 2 : 1);
    for (let h = 0; h < times && !B.over && !e.dead; h++) {
      damage(B, P, enemyHitDmg(B, e, atk), 'atk');
      if (P.thorns > 0 && !B.over) damage(B, e, P.thorns * (B.flags.tortoise ? 2 : 1), 'thorns');
    }
  }
  if (!B.over && !e.dead) {
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
    const reps = isEnemy && B.sets.ember >= 2 ? 2 : 1;
    for (let r = 0; r < reps && !u.dead && !B.over; r++) damage(B, u, u.burn, 'burn');
    if (!(isEnemy && B.flags.burnKeep)) u.burn = Math.max(0, u.burn - 1);
  }
  if (u.poison > 0 && !u.dead && !B.over) {
    const reps = isEnemy && B.sets.venom >= 3 ? 2 : 1;
    for (let r = 0; r < reps && !u.dead && !B.over; r++) damage(B, u, u.poison * (isEnemy && B.flags.poisonDouble ? 2 : 1), 'poison');
    if (!(isEnemy && B.flags.plague)) u.poison = Math.max(0, u.poison - 1);
  }
  if (!u.dead) push(B, { t: 'statusSync', side: u.side, i: idxOf(B, u), u: snap(u) });
}

// ---- tactics (played between rounds) ---------------------------------------------
export function useTactic(B, id) {
  B.ev = [];
  const P = B.player, t = curTarget(B);
  push(B, { t: 'tactic', id, name: TACTICS[id].name });
  switch (id) {
    case 'bubble_wrap': gainBlock(B, P, 12); break;
    case 'first_aid': { const h = Math.min(12, P.maxHp - P.hp); if (h > 0) { P.hp += h; push(B, { t: 'heal', side: 'p', i: -1, n: h, u: snap(P) }); } break; }
    case 'lucky_coin': B.coins += 10; push(B, { t: 'coins', n: 10, total: B.coins }); break;
    case 'price_drop': alive(B).forEach(e => addStatus(B, e, 'vuln', 3)); break;
    case 'overcharge': B.pre.mult = (B.pre.mult || 1) * 1.5; push(B, { t: 'mult', m: B.pre.mult, by: 1.5, pre: true }); break;
    case 'spotlight': B.pre.spotlight = true; break;
    case 'smoke_bomb': if (t) { t.stunned = true; push(B, { t: 'stun', i: idxOf(B, t) }); } break;
    case 'accelerant': alive(B).forEach(e => { if (e.burn) addStatus(B, e, 'burn', e.burn); if (e.poison) addStatus(B, e, 'poison', e.poison); }); break;
    case 'hot_glue': {
      B.jammed = new Set();
      const s = Object.keys(B.disabled)[0];
      if (s != null) { delete B.disabled[s]; recomputeFlags(B); }
      push(B, { t: 'repair', slot: s != null ? +s : null });
      break;
    }
    case 'reshuffle': alive(B).forEach(e => { e.moveIdx++; }); setAims(B); push(B, { t: 'reshuffle' }); break;
    case 'echo': B.pre.echo = (B.pre.echo || 0) + 2; break;
    case 'encore': B.pre.passes = 2; break;
  }
  push(B, { t: 'roundEnd' });
  return B.ev;
}

// ---- one full round --------------------------------------------------------
export function playRound(B) {
  B.ev = [];
  if (B.over) return B.ev;
  B.round++;
  recomputeFlags(B);
  push(B, { t: 'round', round: B.round });
  B.firedThisRound = 0; B.roundBonus = 0; B.barbed = 0; B.pendingNext = []; B.chain = false; B.roundDmg = 0;
  B.silenced = new Set(); B.overclock = new Set(); B.maxHitThis = 0;
  B.jamNow = B.jammed; B.jamNext = new Set();
  const pre = B.pre; B.pre = {};
  B.roundMult = pre.mult || 1; B.spotlight = !!pre.spotlight; B.spotlightUsed = false;
  if (B.round > 25) alive(B).forEach(e => { e.str += 4; push(B, { t: 'status', side: 'e', i: idxOf(B, e), k: 'str', n: 4, u: snap(e), enrage: true }); });
  if (B.flags.tortoise) gainBlock(B, B.player, B.flags.tortoiseB);
  if (B.sets.iron >= 1) gainBlock(B, B.player, 4);
  if (B.sets.iron >= 3) { B.player.thorns += 3; push(B, { t: 'status', side: 'p', i: -1, k: 'thorns', n: 3, u: snap(B.player) }); }
  if (B.sets.gilded >= 3) { B.coins += 4; push(B, { t: 'coins', n: 4, total: B.coins }); }
  if (B.wrapped) {
    const s = order(B).find(s => working(B, s) && !CARDS[B.row[s].id].passive);
    if (s != null) B.silenced.add(s);
    B.wrapped = 0;
  }
  let passes = 1;
  if ((B.flags.grandClock || B.sets.clock >= 3) && B.round % 3 === 0) passes = 2;
  if (has(B, 'opening_salvo') && B.round === 1) passes = 2;
  if (pre.passes) passes = Math.max(passes, pre.passes);
  // first/last firing card (for Clockwork bonuses and Echo)
  const firing = order(B).filter(s => working(B, s) && !CARDS[B.row[s].id].passive && !B.jamNow.has(s));
  const first = firing[0], last = firing[firing.length - 1];
  for (let p = 0; p < passes && !B.over; p++) {
    if (p === 1) push(B, { t: 'proc', name: 'Again!' });
    for (const s of order(B)) {
      if (B.over) break;
      let extra = 0;
      if (p === 0 && s === first) { if (B.sets.clock >= 1) extra++; extra += pre.echo || 0; }
      if (p === 0 && s === last && s !== first && B.sets.clock >= 2) extra++;
      fireSlot(B, s, extra);
    }
  }
  B.stats.maxRound = Math.max(B.stats.maxRound, B.roundDmg);
  push(B, { t: 'cardsDone', dmg: B.roundDmg });
  // Damage-over-time on enemies, then they act.
  for (const e of [...B.enemies]) tick(B, e, true);
  for (const e of [...B.enemies]) {
    if (B.over) break;
    if (!e.dead) enemyAct(B, e);
  }
  if (!B.over) tick(B, B.player, false);
  if (!B.over) {
    if (!B.flags.blockKeep && B.player.block > 0) {
      B.player.block = B.sets.iron >= 2 ? Math.floor(B.player.block / 2) : 0;
      push(B, { t: 'statusSync', side: 'p', i: -1, u: snap(B.player) });
    }
    for (const u of [B.player, ...alive(B)]) { if (u.vuln > 0) u.vuln--; if (u.weak > 0) u.weak--; }
    push(B, { t: 'statusSync', side: 'p', i: -1, u: snap(B.player) });
    alive(B).forEach(e => push(B, { t: 'statusSync', side: 'e', i: idxOf(B, e), u: snap(e) }));
  }
  B.jammed = B.jamNext;
  B.maxHitLast = B.maxHitThis;
  setAims(B);
  push(B, { t: 'roundEnd' });
  return B.ev;
}

// Simulate a full fight with no animation (used by tests & the balance sim).
export function autoFight(B, maxRounds = 60, policy) {
  while (!B.over && B.round < maxRounds) { if (policy) policy(B); playRound(B); }
  if (!B.over) B.over = 'lose';
  return B.over;
}
