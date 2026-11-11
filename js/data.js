// ---------------------------------------------------------------------------
// HOLO — all game content: sets, cards, editions, enemies, heroes, packs.
// Card `fire(x, v)` receives the engine context `x` and the card's SCALED
// values `v` (star level + edition already applied). See engine.js for x.*.
// ---------------------------------------------------------------------------

export const SETS = {
  base:   { name: 'Starter',   color: '#c9b79c', c2: '#7d6a52', glyph: 'card-draw' },
  ember:  { name: 'Ember',     color: '#ff7a3d', c2: '#a3200f', glyph: 'flame' },
  venom:  { name: 'Venom',     color: '#9be15d', c2: '#2f6b1b', glyph: 'poison' },
  iron:   { name: 'Iron',      color: '#9fb4c8', c2: '#3b4c66', glyph: 'templar-shield' },
  clock:  { name: 'Clockwork', color: '#f2c14e', c2: '#8a5a12', glyph: 'cog' },
  gilded: { name: 'Gilded',    color: '#ffe07a', c2: '#a8741a', glyph: 'two-coins' },
  void:   { name: 'Void',      color: '#b07cff', c2: '#3a1470', glyph: 'portal' },
};
export const SET_ORDER = ['base', 'ember', 'venom', 'iron', 'clock', 'gilded', 'void'];

export const RARITY = {
  C: { name: 'Common',   color: '#d8d2c4', sell: 2 },
  U: { name: 'Uncommon', color: '#5fd3ff', sell: 4 },
  R: { name: 'Rare',     color: '#ffcc33', sell: 7 },
  M: { name: 'Mythic',   color: '#ff4fd8', sell: 14 },
};
export const RARITY_RANK = { C: 0, U: 1, R: 2, M: 3 };

export const EDITIONS = {
  normal:   { name: '',         mult: 1,   desc: '' },
  foil:     { name: 'Foil',     mult: 1.5, desc: 'Foil: numbers ×1.5' },
  holo:     { name: 'Holo',     mult: 1,   desc: 'Holo: fires twice' },
  gilded:   { name: 'Gilded',   mult: 1,   desc: 'Gilded: +1 coin each time it fires' },
  cracked:  { name: 'Cracked',  mult: 2,   desc: 'Cracked: numbers ×2, shatters after 3 fights' },
  misprint: { name: 'Misprint', mult: 1,   desc: 'Misprint: a random bonus effect' },
};
export const ED_RANK = { normal: 0, cracked: 1, misprint: 2, gilded: 3, foil: 4, holo: 5 };
export const STAR_MULT = [0, 1, 1.5, 2.1];

export const MISPRINTS = [
  { k: 'd', n: 3, text: '+ Deal 3' },
  { k: 'b', n: 3, text: '+ Gain 3 Block' },
  { k: 'burn', n: 2, text: '+ Apply 2 Burn' },
  { k: 'poi', n: 2, text: '+ Apply 2 Poison' },
  { k: 'h', n: 2, text: '+ Heal 2' },
  { k: 'c', n: 1, text: '+ Gain 1 coin' },
];

const C = [];
const card = (set, id, name, r, icon, v, text, fire, extra = {}) =>
  C.push({ set, id, name, r, icon, v, text, fire, ...extra });

// ---------- Starter ----------
card('base', 'jab', 'Jab', 'C', 'punch', { d: 4 }, 'Deal {d}.', (x, v) => x.hit(v.d));
card('base', 'guard', 'Guard', 'C', 'templar-shield', { b: 5 }, 'Gain {b} Block.', (x, v) => x.block(v.b));
card('base', 'whetstone', 'Whetstone', 'C', 'sharp-axe', { n: 3 }, 'The next card deals +{n} damage per hit.', (x, v) => x.buffNext(v.n, 1));
card('base', 'patch', 'Patch Up', 'C', 'bandage-roll', { h: 3, b: 3 }, 'Heal {h}. Gain {b} Block.', (x, v) => { x.heal(v.h); x.block(v.b); });
card('base', 'second_wind', 'Second Wind', 'U', 'whirlwind', { h: 6 }, 'Heal {h}. Cleanse your Burn and Poison.', (x, v) => { x.heal(v.h); x.cleanse(); });
card('base', 'battle_cry', 'Battle Cry', 'R', 'trumpet', { n: 3 }, 'Every hit deals +{n} for the rest of this round.', (x, v) => x.roundBonus(v.n));

// ---------- Ember ----------
card('ember', 'ember_fang', 'Ember Fang', 'C', 'fangs', { d: 3, burn: 2 }, 'Deal {d}. Apply {burn} Burn.', (x, v) => { x.hit(v.d); x.burn(v.burn); });
card('ember', 'kindling', 'Kindling', 'C', 'burning-embers', { burn: 4 }, 'Apply {burn} Burn.', (x, v) => x.burn(v.burn));
card('ember', 'matchstick', 'Matchstick', 'C', 'match-head', { d: 5, burn: 3 }, 'Deal {d}. If the target is Burning, apply {burn} Burn.', (x, v) => { const was = x.target && x.target.burn > 0; x.hit(v.d); if (was) x.burn(v.burn); });
card('ember', 'fan_flames', 'Fan the Flames', 'U', 'fluffy-flame', { d: 2 }, 'Deal {d}. Double the target\'s Burn.', (x, v) => { x.hit(v.d); if (x.target) x.burn(x.target.burn); });
card('ember', 'firebreath', 'Firebreath', 'U', 'fire-breath', { burn: 3 }, 'Apply {burn} Burn to ALL enemies.', (x, v) => x.burn(v.burn, { all: true }));
card('ember', 'wildfire', 'Wildfire', 'R', 'burning-forest', {}, 'Deal damage equal to the target\'s Burn to ALL enemies.', (x) => { if (x.target) x.hit(Math.round(x.target.burn * x.mult), { all: true }); });
card('ember', 'cinder_heart', 'Cinder Heart', 'R', 'fire-gem', {}, 'PASSIVE. Burn never fades.', null, { passive: 'burnKeep' });
card('ember', 'phoenix', 'Phoenix Plume', 'M', 'feathered-wing', { h: 20 }, 'PASSIVE. Once per fight, when you would fall, rise with {h} HP and apply 6 Burn to ALL.', null, { passive: 'phoenix' });

// ---------- Venom ----------
card('venom', 'needle', 'Needle', 'C', 'sewing-needle', { d: 2 }, 'Deal {d} twice.', (x, v) => { x.hit(v.d); x.hit(v.d); });
card('venom', 'toxin', 'Toxin Vial', 'C', 'poison-bottle', { poi: 4 }, 'Apply {poi} Poison.', (x, v) => x.poison(v.poi));
card('venom', 'venom_spit', 'Venom Spit', 'C', 'snake-tongue', { d: 3, poi: 2 }, 'Deal {d}. Apply {poi} Poison.', (x, v) => { x.hit(v.d); x.poison(v.poi); });
card('venom', 'leech', 'Leech', 'C', 'leeching-worm', { d: 4, h: 2 }, 'Deal {d}. Heal {h}.', (x, v) => { x.hit(v.d); x.heal(v.h); });
card('venom', 'swarm', 'Swarm', 'U', 'bee', { d: 2 }, 'Deal {d} to a random enemy 5 times.', (x, v) => { for (let i = 0; i < 5; i++) x.hit(v.d, { random: true }); });
card('venom', 'spore', 'Spore Cloud', 'U', 'poison-cloud', { poi: 2 }, 'Apply {poi} Poison to ALL enemies.', (x, v) => x.poison(v.poi, { all: true }));
card('venom', 'barbed', 'Barbed Tail', 'U', 'scorpion-tail', { poi: 1 }, 'For the rest of this round, every hit also applies {poi} Poison.', (x, v) => x.barbed(v.poi));
card('venom', 'virulence', 'Virulence', 'R', 'virus', {}, 'PASSIVE. Poison deals double damage.', null, { passive: 'poisonDouble' });
card('venom', 'plague_rat', 'Plague Rat', 'M', 'rat', {}, 'PASSIVE. Poison never fades. When a Poisoned enemy falls, its Poison spreads to ALL enemies.', null, { passive: 'plague' });

// ---------- Iron ----------
card('iron', 'buckler', 'Buckler', 'C', 'cross-shield', { b: 7 }, 'Gain {b} Block.', (x, v) => x.block(v.b));
card('iron', 'spiked_shell', 'Spiked Shell', 'C', 'spiked-shell', { b: 3, t: 2 }, 'Gain {b} Block and {t} Thorns.', (x, v) => { x.block(v.b); x.thorns(v.t); });
card('iron', 'counterweight', 'Counterweight', 'C', 'weight', { d: 5, b: 5 }, 'Deal {d}. Gain {b} Block.', (x, v) => { x.hit(v.d); x.block(v.b); });
card('iron', 'shield_bash', 'Shield Bash', 'U', 'shield-impact', {}, 'Deal damage equal to your Block.', (x) => x.hit(Math.round(x.B.player.block * x.mult)));
card('iron', 'iron_skin', 'Iron Skin', 'U', 'spiked-armor', { t: 4 }, 'Gain {t} Thorns (hurt attackers each hit).', (x, v) => x.thorns(v.t));
card('iron', 'rally', 'Rally', 'U', 'knight-banner', { b: 3 }, 'Gain {b} Block for each Iron card in your row.', (x, v) => x.block(v.b * x.countRow(c => c.set === 'iron')));
card('iron', 'tower_shield', 'Tower Shield', 'U', 'tribal-shield', { b: 12 }, 'Gain {b} Block.', (x, v) => x.block(v.b));
card('iron', 'bulwark', 'Bulwark', 'R', 'locked-fortress', {}, 'PASSIVE. Your Block no longer fades between rounds.', null, { passive: 'blockKeep' });
card('iron', 'tortoise', 'Ancient Tortoise', 'M', 'turtle', { b: 6 }, 'PASSIVE. Gain {b} Block at the start of every round. Thorns deal double.', null, { passive: 'tortoise' });

// ---------- Clockwork ----------
card('clock', 'gear', 'Gear', 'C', 'cog', { d: 3, n: 2 }, 'Deal {d}. Gains +{n} damage each time it fires this fight.', (x, v) => { x.hit(v.d + x.mem.charge); x.mem.charge += v.n; });
card('clock', 'spring', 'Spring', 'C', 'bouncing-spring', { d: 3, n: 10 }, 'Deal {d}. If it\'s the first card to fire this round, deal {n} instead.', (x, v) => x.hit(x.firedBefore === 0 ? v.n : v.d));
card('clock', 'metronome', 'Metronome', 'C', 'metronome', { d: 2 }, 'Deal {d} for each card fired before it this round.', (x, v) => x.hit(v.d * x.firedBefore));
card('clock', 'mirror', 'Mirror', 'U', 'mirror-mirror', {}, 'Copy the card to the LEFT.', (x) => x.copyLeft());
card('clock', 'pendulum', 'Pendulum', 'U', 'pendulum-swing', { d: 10, b: 10 }, 'Alternates each time: deal {d} / gain {b} Block.', (x, v) => { if (x.mem.flip) x.block(v.b); else x.hit(v.d); x.mem.flip = !x.mem.flip; });
card('clock', 'spark_plug', 'Spark Plug', 'U', 'lightning-arc', { n: 2 }, 'The next 2 cards deal +{n} damage per hit.', (x, v) => x.buffNext(v.n, 2));
card('clock', 'overclock', 'Overclock', 'R', 'gears', {}, 'The card to the RIGHT fires twice.', (x) => x.overclockRight());
card('clock', 'escapement', 'Escapement', 'R', 'anticlockwise-rotation', {}, 'Fire your FIRST card again.', (x) => x.fireFirst());
card('clock', 'grand_clock', 'Grand Clock', 'M', 'clock-tower', {}, 'PASSIVE. Every 3rd round, your whole row fires twice.', null, { passive: 'grandClock' });

// ---------- Gilded ----------
card('gilded', 'pickpocket', 'Pickpocket', 'C', 'assassin-pocket', { d: 3, c: 1 }, 'Deal {d}. Gain {c} coin.', (x, v) => { x.hit(v.d); x.coins(v.c); });
card('gilded', 'coin_toss', 'Coin Toss', 'C', 'coinflip', { d: 10, c: 3 }, 'Flip! Heads: deal {d}. Tails: gain {c} coins.', (x, v) => { if (x.rng.chance(0.5)) x.hit(v.d); else x.coins(v.c); });
card('gilded', 'gold_leaf', 'Gold Leaf', 'C', 'gold-shell', { b: 5, c: 1 }, 'Gain {b} Block. Gain {c} coin.', (x, v) => { x.block(v.b); x.coins(v.c); });
card('gilded', 'price_tag', 'Price Tag', 'C', 'price-tag', { n: 2 }, 'Apply {n} Vulnerable (takes +50% damage).', (x, v) => x.vuln(v.n));
card('gilded', 'bribe', 'Bribe', 'U', 'cash', { c: 4 }, 'Pay {c} coins: the target skips its next action.', (x, v) => x.bribe(v.c), { fixed: ['c'] });
card('gilded', 'appraiser', 'Appraiser', 'U', 'gems', { d: 6 }, 'Deal {d} for each Rare or Mythic card in your row.', (x, v) => x.hit(v.d * x.countRow(c => c.r === 'R' || c.r === 'M')));
card('gilded', 'lucky_clover', 'Lucky Clover', 'U', 'clover', {}, 'PASSIVE. Special editions show up twice as often in packs (while in row or bench).', null, { passive: 'clover' });
card('gilded', 'golden_gun', 'Golden Gun', 'R', 'gold-bar', { n: 14 }, 'Deal damage equal to a third of your coins (max {n}).', (x, v) => x.hit(Math.min(v.n, Math.round(x.B.coins / 3 * x.mult))));
card('gilded', 'interest', 'Compound Interest', 'R', 'coins-pile', {}, 'PASSIVE. After each fight, gain 1 coin per 5 you hold (max 8).', null, { passive: 'interest' });
card('gilded', 'jackpot', 'Jackpot', 'M', 'slot-machine', { d: 20 }, 'PASSIVE. Every 7th card you fire hits the JACKPOT: deal {d} to ALL and gain 5 coins.', null, { passive: 'jackpot' });

// ---------- Void (cursed: big numbers, real costs) ----------
card('void', 'ritual_knife', 'Ritual Knife', 'C', 'dripping-knife', { n: 8, s: 2 }, 'Lose {s} HP. The next card deals +{n} damage per hit.', (x, v) => { x.selfDmg(v.s); x.buffNext(v.n, 1); }, { fixed: ['s'] });
card('void', 'null_shard', 'Null Shard', 'C', 'shard-sword', { d: 7, s: 3 }, 'Deal {d} to ALL enemies. Lose {s} HP.', (x, v) => { x.hit(v.d, { all: true }); x.selfDmg(v.s); }, { fixed: ['s'] });
card('void', 'hungry_maw', 'Hungry Maw', 'U', 'carnivore-mouth', { d: 14, s: 3 }, 'Deal {d}. Lose {s} HP.', (x, v) => { x.hit(v.d); x.selfDmg(v.s); }, { fixed: ['s'] });
card('void', 'hollow', 'Hollow', 'U', 'portal', { d: 20 }, 'Deal {d}. The card to the RIGHT does not fire.', (x, v) => { x.hit(v.d); x.silenceRight(); });
card('void', 'abyss_gaze', 'Abyss Gaze', 'U', 'all-seeing-eye', { n: 2, s: 3 }, 'Apply {n} Vulnerable to ALL enemies. Lose {s} HP.', (x, v) => { x.vuln(v.n, { all: true }); x.selfDmg(v.s); }, { fixed: ['s'] });
card('void', 'blood_pact', 'Blood Pact', 'R', 'sacrificial-dagger', { d: 30, s: 7 }, 'Deal {d}. Lose {s} HP.', (x, v) => { x.hit(v.d); x.selfDmg(v.s); }, { fixed: ['s'] });
card('void', 'echoing_void', 'Echoing Void', 'R', 'magic-portal', { s: 3 }, 'Copy the card to the LEFT twice. Lose {s} HP.', (x, v) => { x.copyLeft(); x.copyLeft(); x.selfDmg(v.s); }, { fixed: ['s'] });
card('void', 'hollow_king', 'The Hollow King', 'M', 'crowned-skull', {}, 'PASSIVE. Whenever you lose HP, deal 3× that much to a random enemy.', null, { passive: 'hollowKing' });

export const CARDS = Object.fromEntries(C.map(c => [c.id, c]));
export const CARD_LIST = C;

// ---------------------------------------------------------------------------
// Enemies. Moves are intents: {atk, times, block, str, burn, poison, vuln, weak, heal, special}
// ---------------------------------------------------------------------------
export const ENEMIES = {
  // Act 1 — the dusty bottom shelf
  dust_bunny:  { name: 'Dust Bunny',  icon: 'dust-cloud', hp: 15, color: '#b9a98f', moves: [{ atk: 5 }, { block: 5, atk: 3 }, { atk: 7 }] },
  paper_plane: { name: 'Paper Plane', icon: 'paper-plane', hp: 9, color: '#e8e2d0', moves: [{ atk: 3, times: 2 }, { atk: 5 }] },
  paper_clip:  { name: 'Paper Clip',  icon: 'paper-clip', hp: 20, color: '#aab6c2', moves: [{ block: 8 }, { atk: 7 }, { atk: 4, block: 4 }] },
  silverfish:  { name: 'Silverfish',  icon: 'centipede', hp: 14, color: '#c5d3e0', moves: [{ poison: 3 }, { atk: 3, times: 2 }, { atk: 5 }] },
  staple_beast:{ name: 'Staple Beast',icon: 'stapler-heavy-duty', hp: 52, color: '#7f8fa6', elite: true, moves: [{ atk: 4, times: 3 }, { str: 2, block: 8 }, { atk: 12 }] },
  price_gun:   { name: 'Price Gun',   icon: 'zat-gun', hp: 44, color: '#ff8f6b', elite: true, moves: [{ vuln: 2, atk: 4 }, { atk: 15 }, { atk: 6, times: 2 }] },
  shredder:    { name: 'The Shredder',icon: 'box-cutter', hp: 130, color: '#ff5d5d', boss: true, title: 'Act I Boss',
    rule: 'Every other round it SHREDS your leftmost working card for the rest of the fight. Put something you can spare on the left.',
    moves: [{ atk: 11 }, { special: 'shred', atk: 6 }, { block: 10, atk: 7 }, { special: 'shred', atk: 6 }] },

  // Act 2 — the display case
  sleeve_slime:{ name: 'Sleeve Slime',icon: 'slime', hp: 26, color: '#7fe0c2', split: 'slimelet', moves: [{ atk: 7 }, { poison: 4 }, { atk: 5, block: 5 }] },
  slimelet:    { name: 'Slimelet',    icon: 'slime', hp: 11, color: '#a9f0d9', small: true, moves: [{ atk: 4 }, { poison: 2 }] },
  tape_golem:  { name: 'Tape Golem',  icon: 'metal-golem-head', hp: 38, color: '#d6b98a', moves: [{ block: 12 }, { atk: 11 }, { atk: 6, block: 6 }] },
  dust_moth:   { name: 'Dust Moth',   icon: 'butterfly', hp: 14, color: '#d9c7f2', moves: [{ atk: 4 }, { weak: 1, atk: 2 }, { atk: 3, times: 2 }] },
  bootleg:     { name: 'Bootleg',     icon: 'two-shadows', hp: 34, color: '#8c8aa8',
    rule: 'COPY: hits you back as hard as the biggest single hit you dealt this round (3–30).', moves: [{ special: 'copy' }, { atk: 6 }, { special: 'copy' }, { block: 8 }] },
  shrink_wraith:{ name: 'Shrink Wraith', icon: 'floating-ghost', hp: 28, color: '#cfe8ff',
    rule: 'WRAP: your first card won\'t fire next round.', moves: [{ special: 'wrap', atk: 4 }, { atk: 10 }, { atk: 6 }] },
  mimic:       { name: 'Booster Mimic', icon: 'mimic-chest', hp: 88, color: '#ffb347', elite: true, moves: [{ block: 30 }, { atk: 20 }, { atk: 7, times: 3 }, { str: 3, atk: 8 }] },
  ink_kraken:  { name: 'Ink Kraken',  icon: 'octopus', hp: 78, color: '#6f7cff', elite: true, moves: [{ weak: 2, atk: 7 }, { atk: 3, times: 5 }, { block: 12, atk: 9 }] },
  collector:   { name: 'The Collector', icon: 'old-king', hp: 240, color: '#ffd166', boss: true, title: 'Act II Boss',
    rule: 'Every 3rd move it STEALS your rarest working card into its binder. Beat it to get them back.',
    moves: [{ atk: 12 }, { atk: 4, times: 4 }, { special: 'steal', block: 12 }, { str: 2, atk: 9 }, { atk: 18 }, { special: 'steal', block: 12 }] },

  // Act 3 — the back room
  holo_hound:  { name: 'Holo Hound',  icon: 'hound', hp: 44, color: '#7ff0ff', moves: [{ atk: 6, times: 2 }, { str: 2, block: 8 }, { atk: 14 }] },
  foil_serpent:{ name: 'Foil Serpent',icon: 'cobra', hp: 56, color: '#b6ff6b', moves: [{ poison: 6 }, { atk: 15 }, { atk: 6, poison: 3 }] },
  raven:       { name: 'Shoplift Raven', icon: 'raven', hp: 34, color: '#9aa0b8',
    rule: 'PILFER: steals 4 of your coins.', moves: [{ special: 'pilfer', atk: 6 }, { atk: 10 }, { atk: 5, times: 2 }] },
  web_spinner: { name: 'Web Spinner', icon: 'hanging-spider', hp: 44, color: '#c9a0ff', moves: [{ weak: 2, atk: 5 }, { atk: 6, times: 3 }, { block: 10, atk: 6 }] },
  chase_dragon:{ name: 'Chase Dragon',icon: 'dragon-head', hp: 150, color: '#ff6b9d', elite: true, moves: [{ burn: 6, atk: 8 }, { atk: 26 }, { block: 20, str: 3 }] },
  grading_golem:{ name: 'Grading Golem', icon: 'rock-golem', hp: 170, color: '#c2b280', elite: true,
    rule: 'Grows stronger every round.', moves: [{ str: 3, atk: 10 }, { str: 3, block: 15 }, { str: 3, atk: 6, times: 2 }] },
  proprietor:  { name: 'The Proprietor', icon: 'spectre', hp: 460, color: '#ff4fd8', boss: true, title: 'Final Boss',
    rule: 'At half HP: CLOSING TIME. The lights go out and your row fires RIGHT-TO-LEFT.',
    moves: [{ atk: 16 }, { burn: 5, atk: 8 }, { block: 20, str: 2 }, { atk: 6, times: 4 }, { poison: 6, atk: 10 }] },
};

export const ENCOUNTERS = {
  1: {
    easy: [['dust_bunny'], ['paper_plane', 'paper_plane'], ['silverfish']],
    normal: [['dust_bunny', 'paper_plane'], ['paper_clip', 'silverfish'], ['paper_plane', 'paper_plane', 'paper_plane'], ['dust_bunny', 'dust_bunny'], ['paper_clip', 'paper_plane']],
    elite: [['staple_beast'], ['price_gun']],
    boss: ['shredder'],
  },
  2: {
    easy: [['sleeve_slime'], ['tape_golem'], ['dust_moth', 'dust_moth']],
    normal: [['dust_moth', 'dust_moth', 'dust_moth'], ['bootleg', 'dust_moth'], ['shrink_wraith', 'sleeve_slime'], ['tape_golem', 'dust_moth'], ['bootleg', 'shrink_wraith']],
    elite: [['mimic'], ['ink_kraken']],
    boss: ['collector'],
  },
  3: {
    easy: [['holo_hound'], ['foil_serpent']],
    normal: [['raven', 'raven'], ['web_spinner', 'raven'], ['holo_hound', 'web_spinner'], ['foil_serpent', 'raven'], ['holo_hound', 'foil_serpent']],
    elite: [['chase_dragon'], ['grading_golem']],
    boss: ['proprietor'],
  },
};

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
export const HEROES = {
  kip: { name: 'Kip', title: 'the Paper Knight', icon: 'black-knight-helm', color: '#9fd0ff', hp: 60, coins: 12,
    start: ['jab', 'jab', 'guard', 'whetstone'], perk: 'STEADY: start every fight with 6 Block.', perkId: 'steady' },
  wick: { name: 'Wick', title: 'the Candle Witch', icon: 'candle-flame', color: '#ff9a4d', hp: 55, coins: 12,
    start: ['ember_fang', 'kindling', 'jab', 'guard'], perk: 'KINDLED: all Burn you apply is +1.', perkId: 'kindled',
    unlock: { text: 'Defeat The Shredder', key: 'beatShredder' } },
  glint: { name: 'Glint', title: 'the Fox Thief', icon: 'fox-head', color: '#ffd166', hp: 52, coins: 30,
    start: ['pickpocket', 'jab', 'guard', 'coin_toss'], perk: 'FENCE: packs cost 20% less, sold cards give +1 coin.', perkId: 'fence',
    unlock: { text: 'Pull 25 different cards', key: 'binder25' } },
};

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------
export const PACKS = {
  booster:   { name: 'Booster Pack', price: 12, size: 4, odds: { C: 64, U: 26, R: 8.5, M: 1.5 }, ed: 1, color: '#4cc9f0', c2: '#3a0ca3',
    blurb: '4 cards from every unlocked set.' },
  set:       { name: 'Set Box', price: 17, size: 4, odds: { C: 50, U: 35, R: 12, M: 3 }, ed: 1, oneSet: true, guaranteeU: true,
    blurb: '4 cards from ONE set. At least one Uncommon+.' },
  cursed:    { name: 'Cursed Pack', price: 9, size: 4, odds: { C: 45, U: 35, R: 15, M: 5 }, ed: 1.5, setLock: 'void', color: '#b07cff', c2: '#12001f',
    blurb: '4 Void cards. You MUST keep at least one.', mustKeep: true },
  collector: { name: 'Collector\'s Tin', price: 38, size: 3, odds: { C: 0, U: 0, R: 82, M: 18 }, ed: 2.5, color: '#ffe07a', c2: '#7a4a00',
    blurb: '3 cards, every one Rare or better. Better editions.' },
};
export const ED_ODDS = { normal: 80, foil: 8, holo: 4, gilded: 4, cracked: 2.5, misprint: 1.5 };
