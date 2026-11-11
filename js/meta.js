// HOLO persistence: meta-progress (binder, unlocks, heat) + the in-progress run.
import { CARD_LIST, CARDS, ED_RANK, SET_ORDER } from './data.js';

const META_KEY = 'holo.meta.v1', RUN_KEY = 'holo.run.v1';

const fresh = () => ({
  binder: {}, flags: {}, heatMax: 0, seen: false,
  stats: { runs: 0, wins: 0, bestFloor: 0, pulls: 0, mythics: 0 },
  daily: {}, settings: { sound: true, music: true, reduceMotion: false, fast: false },
});

function read(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

export const meta = Object.assign(fresh(), read(META_KEY) || {});
meta.settings = Object.assign(fresh().settings, meta.settings);
meta.stats = Object.assign(fresh().stats, meta.stats);
export const saveMeta = () => write(META_KEY, meta);

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
  { id: 'heat', kind: 'heat', text: 'HEAT difficulty ladder', req: 'Win a run', test: () => meta.stats.wins > 0 },
];

export function unlocked(id) { const u = UNLOCKS.find(u => u.id === id); return u ? !!u.test() : true; }
export function unlockedSets() {
  return SET_ORDER.filter(s => ['base', 'ember', 'venom', 'iron'].includes(s) || unlocked(s));
}
export function heroUnlocked(h) { return h === 'kip' || unlocked(h); }
export function snapshotUnlocks() { return UNLOCKS.filter(u => u.test()).map(u => u.id); }

export function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
