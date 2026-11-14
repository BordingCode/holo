// HOLO — customers at the Back Room counter. Pure (no DOM).
// Invitation, not obligation: customers never leave on their own, a missed day costs nothing,
// and coming back after a while finds a small queue waiting (max 3).
import { CARDS, CARD_LIST, SETS, EDITIONS } from './data.js?v=9';
import { makeRng, hashStr } from './rng.js?v=9';

export const MAX_WAITING = 3;

// Regulars. `likes` biases which requests they make.
export const REGULARS = {
  tobi:   { name: 'Tobi', tag: 'age 9, very serious', icon: 'fox-head', color: '#ffb35c', likes: ['set', 'set', 'card', 'star'],
            hi: ['Do you have any', 'My mum said I can get ONE'], bye: 'YES! Thank you!!' },
  penny:  { name: 'Mrs. Penny', tag: 'retired collector', icon: 'old-king', color: '#e8c3ff', likes: ['ed', 'card', 'set_ed', 'graded'],
            hi: ['I\'m finishing a binder page', 'Dear, I\'m after'], bye: 'Lovely. Just lovely.' },
  coat:   { name: 'Trenchcoat', tag: 'asks no questions', icon: 'spectre', color: '#8ad8ff', likes: ['holo', 'rarity', 'set_ed', 'graded'],
            hi: ['Psst. Looking for', 'I pay well for'], bye: '…We never met.' },
  gwen:   { name: 'Grading Gwen', tag: 'carries a loupe', icon: 'raven', color: '#9fffcf', likes: ['graded', 'graded', 'star', 'ed'],
            hi: ['Only slabs for me:', 'Show me'], bye: 'Crisp corners. Nice.' },
  brick:  { name: 'Brick', tag: 'plays every Friday', icon: 'black-knight-helm', color: '#ff8a8a', likes: ['star', 'rarity', 'set', 'card'],
            hi: ['Need something for my deck:', 'Tournament\'s Friday. I need'], bye: 'Friday\'s mine now.' },
  dot:    { name: 'Dot', tag: 'budget brawler', icon: 'hound', color: '#c9f27a', likes: ['card', 'set', 'card', 'star'],
            hi: ['Got any cheap', 'Just need'], bye: 'You\'re the best, honestly.' },
};

const SPECIAL_EDS = ['foil', 'holo', 'gilded', 'misprint'];
const ED_REWARD = { foil: 40, holo: 55, gilded: 30, misprint: 35 };

// A request is data: {kind, set?, ed?, id?, r?, star?, grade?}. Text and matching derive from it.
export function matches(req, k) {
  const def = CARDS[k.id];
  if (!def) return false;
  if (req.kind === 'graded') return (k.grade || 0) >= req.grade;
  if (req.kind === 'card') return k.id === req.id;
  if (req.kind === 'set') return def.set === req.set;
  if (req.kind === 'ed') return k.ed === req.ed;
  if (req.kind === 'set_ed') return def.set === req.set && k.ed === req.ed;
  if (req.kind === 'rarity') return def.r === 'R' || def.r === 'M';
  if (req.kind === 'star') return (k.star || 1) >= req.star;
  return false;
}

export function requestText(req) {
  const S = req.set && SETS[req.set], E = req.ed && EDITIONS[req.ed];
  switch (req.kind) {
    case 'graded': return `a slab graded <b>${req.grade} or better</b>`;
    case 'card': return `<b>${CARDS[req.id].name}</b> (any copy)`;
    case 'set': return `any <b style="color:${S.color}">${S.name}</b> card`;
    case 'ed': return `any <b>${E.name}</b> card`;
    case 'set_ed': return `a <b>${E.name}</b> <b style="color:${S.color}">${S.name}</b> card`;
    case 'rarity': return 'any <b>Rare or Mythic</b> card';
    case 'star': return `any card at <b>${'★'.repeat(req.star)}</b> or more`;
  }
  return '?';
}

function makeRequest(rng, kind, sets) {
  const set = rng.pick(sets);
  switch (kind) {
    case 'graded': { const grade = rng.pick([7, 7, 8, 8, 9]); return { req: { kind, grade }, reward: { 7: 60, 8: 95, 9: 160 }[grade] }; }
    case 'card': {
      const pool = CARD_LIST.filter(d => sets.includes(d.set) && (d.r === 'C' || d.r === 'U'));
      const d = rng.pick(pool); return { req: { kind, id: d.id }, reward: d.r === 'C' ? 16 : 26 };
    }
    case 'set': return { req: { kind, set }, reward: 14 };
    case 'holo': return { req: { kind: 'ed', ed: 'holo' }, reward: ED_REWARD.holo };
    case 'ed': { const ed = rng.pick(SPECIAL_EDS); return { req: { kind, ed }, reward: ED_REWARD[ed] }; }
    case 'set_ed': { const ed = rng.pick(['foil', 'holo', 'gilded']); return { req: { kind, set, ed }, reward: Math.round(ED_REWARD[ed] * 1.6) }; }
    case 'rarity': return { req: { kind }, reward: 45 };
    case 'star': { const star = rng.next() < 0.75 ? 2 : 3; return { req: { kind, star }, reward: star === 2 ? 30 : 75 }; }
  }
}

// Build the customer number `seq`. Deterministic for a given seq+seed, so a reload can't reroll.
// Sometimes they pay with a sealed pack instead of Credit.
export function makeCustomer(seq, { sets, seed = 0, waiting = [] }) {
  const rng = makeRng(hashStr(`holo-customer-${seed}-${seq}`));
  const busy = new Set(waiting.map(c => c.who));
  const who = rng.pick(Object.keys(REGULARS).filter(w => !busy.has(w))) || 'dot';
  const R = REGULARS[who];
  const kind = rng.pick(R.likes);
  const { req, reward } = makeRequest(rng, kind, sets.filter(s => s !== 'void').length ? sets.filter(s => s !== 'void') : ['base']);
  const pay = reward >= 90 && rng.next() < 0.35 ? { pack: 'collector', credit: Math.round(reward * 0.25) } : { credit: reward };
  return { seq, who, req, pay, hi: rng.pick(R.hi) };
}

// How many new customers walk in now. daysAway = whole days since the last visit.
export function arrivals(waitingCount, daysAway) {
  return Math.max(0, Math.min(MAX_WAITING - waitingCount, daysAway));
}

export function dayNumber(d = new Date()) { return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5); }
