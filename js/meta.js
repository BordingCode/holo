// HOLO persistence: meta-progress (binder, unlocks, heat) + the in-progress run.
import { CARD_LIST, CARDS, ED_RANK, SET_ORDER } from './data.js?v=11';

const META_KEY = 'holo.meta.v1', RUN_KEY = 'holo.run.v1';

const fresh = () => ({
  binder: {}, flags: {}, heatMax: 0, seen: false,
  collection: [], cuid: 1, boxCap: 3,
  stats: { runs: 0, wins: 0, bestFloor: 0, pulls: 0, mythics: 0 },
  daily: {}, settings: { sound: true, music: true, reduceMotion: false, fast: false },
});

function read(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

export const meta = Object.assign(fresh(), read(META_KEY) || {});
meta.settings = Object.assign(fresh().settings, meta.settings);
meta.stats = Object.assign(fresh().stats, meta.stats);
if (!Array.isArray(meta.collection)) meta.collection = [];
meta.cuid ||= 1; meta.boxCap ||= 3;
meta.credit ||= 0; meta.display ||= []; meta.upg = Object.assign({ box: 0, display: 0 }, meta.upg);
export const saveMeta = () => write(META_KEY, meta);

// ---- the collection: physical cards you own between runs ----------------------
// A collection card: {cid, id, ed, star, mp?, cracks?}. Run-only state (growth, uid) is stripped.
export const BOX_COST = { C: 1, U: 1, R: 2, M: 3 };
export const boxCost = c => BOX_COST[CARDS[c.id].r];
// Deck Box capacity in points; Heat squeezes it.
export const boxCapacity = heat => Math.max(1, meta.boxCap - (heat >= 4 ? 1 : 0) - (heat >= 7 ? 1 : 0));

export function addToCollection(c) {
  const k = { cid: 'k' + (meta.cuid++), id: c.id, ed: c.ed || 'normal', star: c.star || 1 };
  if (k.ed === 'misprint') k.mp = c.mp ?? 0;
  if (k.ed === 'cracked') k.cracks = c.cracks || 3;
  if (c.grade) k.grade = c.grade;
  meta.collection.push(k);
  return k;
}
export function removeFromCollection(cids) {
  const set = new Set(cids);
  const out = meta.collection.filter(k => set.has(k.cid));
  meta.collection = meta.collection.filter(k => !set.has(k.cid));
  return out;
}
// ---- the Back Room: Credit, values, upgrades -----------------------------------
const CV_BASE = { C: 3, U: 6, R: 15, M: 40 };
const CV_STAR = [0, 1, 2.2, 4.5];
const CV_ED = { normal: 1, foil: 2, holo: 2.5, gilded: 1.6, misprint: 1.8, cracked: 0.5 };
const CV_GRADE = [1, 0.4, 0.5, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2.4, 4];
// What a collection card sells for, in Credit.
export function creditValue(k) {
  const v = CV_BASE[CARDS[k.id].r] * CV_STAR[k.star || 1] * CV_ED[k.ed || 'normal'] * (k.grade ? CV_GRADE[k.grade] : 1);
  return Math.max(1, Math.round(v));
}
export const GRADE_PRICE = 15;
export const HOME_PACKS = {
  booster: { price: 40, text: '4 cards from every unlocked set.' },
  set: { price: 60, text: '4 cards from one set, at least one Uncommon+.' },
  collector: { price: 160, text: '3 cards, all Rare or better. Shinier editions.' },
};
export const UPGRADES = {
  box: { name: 'Bigger Deck Box', icon: 'locked-chest', levels: [{ price: 120, text: 'Deck Box holds 4 spaces' }, { price: 300, text: 'Deck Box holds 5 spaces' }] },
  display: { name: 'Display Case', icon: 'gems', levels: [{ price: 100, text: '2 slabs on display' }, { price: 260, text: '3 slabs on display' }] },
};
export function buyUpgrade(key) {
  const U = UPGRADES[key], lvl = meta.upg[key], L = U.levels[lvl];
  if (!L || meta.credit < L.price) return false;
  meta.credit -= L.price; meta.upg[key]++;
  meta.boxCap = 3 + meta.upg.box;
  saveMeta(); return true;
}
export const displaySlots = () => 1 + meta.upg.display;
// slabs on display earn their grade in Credit after every run (shoppers pay to look)
export function displayIncome() {
  return meta.display.map(cid => meta.collection.find(k => k.cid === cid)).filter(k => k && k.grade).reduce((s, k) => s + k.grade, 0);
}
// Credit for finishing a run.
export function runCredit(run, win) {
  const base = run.floor * 2 + (run.stats.fights || 0) + (run.stats.bosses || 0) * 10 + (win ? 40 + (run.heat || 0) * 10 : 0);
  const display = displayIncome();
  return { base, display, total: base + display };
}

// How many cards you may take home when a run ends.
export const takeHomeCount = win => win ? 3 : 1;

export const loadRun = () => read(RUN_KEY);
export const saveRun = run => write(RUN_KEY, run);
export const clearRun = () => { try { localStorage.removeItem(RUN_KEY); } catch (e) {} };

// Record a pulled card in the binder. Returns {isNew, betterEd}.
export function recordPull(c) {
  const b = meta.binder[c.id] || { n: 0, ed: 'normal' };
  const isNew = b.n === 0;
  const betterEd = !isNew && ED_RANK[c.ed] > ED_RANK[b.ed];
  b.n++; if (isNew || betterEd) b.ed = c.ed;
  meta.binder[c.id] = b;
  meta.stats.pulls++;
  if (CARDS[c.id].r === 'M') meta.stats.mythics++;
  return { isNew, betterEd };
}

export const distinctPulled = () => Object.keys(meta.binder).filter(k => CARDS[k]).length;

// ---- unlocks ---------------------------------------------------------------
export const UNLOCKS = [
  { id: 'clock', kind: 'set', text: 'Clockwork set joins the packs', req: 'Defeat The Shredder (Act I boss)', test: () => meta.flags.beatShredder },
  { id: 'wick', kind: 'hero', text: 'Hero: Wick, the Candle Witch', req: 'Defeat The Shredder (Act I boss)', test: () => meta.flags.beatShredder },
  { id: 'gilded', kind: 'set', text: 'Gilded set joins the packs', req: 'Pull 18 different cards', test: () => distinctPulled() >= 18, prog: () => [distinctPulled(), 18] },
  { id: 'glint', kind: 'hero', text: 'Hero: Glint, the Fox Thief', req: 'Pull 25 different cards', test: () => distinctPulled() >= 25, prog: () => [distinctPulled(), 25] },
  { id: 'void', kind: 'set', text: 'Cursed Packs (Void set) appear in shops', req: 'Defeat The Collector (Act II boss)', test: () => meta.flags.beatCollector },
  { id: 'vintage', kind: 'set', text: 'Vintage set released — in packs & shops', req: 'Serve 5 customers in the Back Room', test: () => (meta.served || 0) >= 5, prog: () => [Math.min(5, meta.served || 0), 5] },
  { id: 'heat', kind: 'heat', text: 'HEAT difficulty ladder', req: 'Win a run', test: () => meta.stats.wins > 0 },
];

export function unlocked(id) { const u = UNLOCKS.find(u => u.id === id); return u ? !!u.test() : true; }
export function unlockedSets() {
  return SET_ORDER.filter(s => ['base', 'ember', 'venom', 'iron'].includes(s) || unlocked(s));
}
export function heroUnlocked(h) { return h === 'kip' || unlocked(h); }
export function snapshotUnlocks() { return UNLOCKS.filter(u => u.test()).map(u => u.id); }

export function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
