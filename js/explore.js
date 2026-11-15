// HOLO — exploring the shop after hours. Pure rules (no DOM): tonight's story, the things
// lying around in each room, what you carry in your pockets, and what happens when you poke at stuff.
// Every roll is seeded from the run seed + room + spot, so reloading never re-rolls an outcome.
import { makeRng, hashStr } from './rng.js?v=19';

// ---- tonight: one story per run ---------------------------------------------------------
export const NIGHTS = {
  blackout: { name: 'The Power Is Out', icon: 'candle-flame', color: '#ffcf7a',
    intro: 'A storm knocked the power out. Every aisle is dark, and the vending machines are dead.',
    goal: 'Find 3 fuses for the fuse box', token: 'fuse', need: 3, tokenName: 'Fuse', tokenIcon: 'lightning-arc',
    reward: 'The lights come back on: heal to full and choose a relic.' },
  flood: { name: 'The Sprinklers Went Off', icon: 'drop', color: '#7cc6ff',
    intro: 'Something set off the sprinklers. Puddles everywhere, and odd things have washed up.',
    goal: 'Close 3 water valves', token: 'valve', need: 3, tokenName: 'Valve', tokenIcon: 'cog',
    reward: 'The water stops: 40 coins and a relic.' },
  thief: { name: 'A Thief Is Loose', icon: 'assassin-pocket', color: '#ff8a9b',
    intro: 'Someone broke in before you. You hear them running between the aisles — and they love coins.',
    goal: 'Corner the thief 3 times', token: 'thief', need: 3, tokenName: 'Cornered', tokenIcon: 'assassin-pocket',
    reward: 'The thief drops the loot bag: 50 coins and a Collector pack.' },
  ghost: { name: 'The Old Owner Walks', icon: 'spectre', color: '#b07cff',
    intro: 'The shop\'s first owner never really left. Tonight he is looking for three things he lost.',
    goal: 'Find his 3 lost belongings', token: 'belonging', need: 3, tokenName: 'Belonging', tokenIcon: 'pocket-watch',
    reward: 'He gives his blessing: heal to full and a Collector pack.' },
  delivery: { name: 'The Late Delivery', icon: 'cardboard-box', color: '#ffd166',
    intro: 'A truck dropped crates all over the shop. Most hold packs. Some hold… something else.',
    goal: 'Open 4 delivery crates', token: 'crate', need: 4, tokenName: 'Crate', tokenIcon: 'cardboard-box',
    reward: 'The last crate holds the manifest bonus: a relic and 30 coins.' },
};
export const NIGHT_IDS = Object.keys(NIGHTS);

export function pickNight(run) {
  return NIGHT_IDS[hashStr('night:' + run.seed) % NIGHT_IDS.length];
}
export function startNight(run) {
  run.night = { id: pickNight(run), got: 0, done: false, thiefStole: 0 };
  run.items = [];
  run.rooms = {};
  return run.night;
}

// ---- things you can carry ------------------------------------------------------------------
export const ITEMS = {
  key: { name: 'Small Key', icon: 'key', text: 'Opens one locked display case.' },
  crowbar: { name: 'Crowbar', icon: 'sharp-axe', text: 'Pries open a case or a till. Bends after one use.' },
  code: { name: 'Till Code', icon: 'scroll-unfurled', text: 'Four numbers scribbled on a receipt. Opens one till.' },
};
export const MAX_ITEMS = 4;
export const hasItem = (run, id) => (run.items || []).includes(id);
function useItem(run, id) { const i = run.items.indexOf(id); if (i >= 0) run.items.splice(i, 1); }
function giveItem(run, id) { if (run.items.length >= MAX_ITEMS) return false; run.items.push(id); return true; }

// ---- the things lying around in rooms -------------------------------------------------------
// Each spot: name, icon, color, text, and actions. An action resolves to an outcome list:
//   {coins:n} {hp:n} {item:id} {pack:type} {xp:n} {relic:true} {tactic:true} {token:true} {nothing:true}
// plus `say` (the line shown to the player).
export const SPOTS = {
  bin: { name: 'Overflowing Bin', icon: 'trash-can', color: '#9be15d',
    text: 'Wrappers, receipts, something that squeaks.',
    actions: [{ id: 'dig', label: 'Dig through it', risk: true }] },
  case: { name: 'Locked Display Case', icon: 'locked-chest', color: '#ffd166',
    text: 'A rare card sits on velvet behind the glass.',
    actions: [{ id: 'key', label: 'Use the key', needs: 'key' }, { id: 'pry', label: 'Pry it open', needs: 'crowbar' }, { id: 'smash', label: 'Smash the glass', risk: true }] },
  vend: { name: 'Vending Machine', icon: 'soda-can', color: '#4cc9f0',
    text: 'It hums. Snacks, energy drinks, and one suspicious button.',
    actions: [{ id: 'buy', label: 'Pay 6 coins', cost: 6, uses: 2 }] },
  critter: { name: 'Something Asleep', icon: 'rat', color: '#ff8a9b',
    text: 'A big shop rat, curled up on a pile of shiny things.',
    actions: [{ id: 'grab', label: 'Grab the shiny things', risk: true }] },
  till: { name: 'Old Cash Register', icon: 'cash', color: '#ffe27a',
    text: 'The drawer is locked. It rattles when you shake it.',
    actions: [{ id: 'code', label: 'Type the code', needs: 'code' }, { id: 'pry', label: 'Pry the drawer', needs: 'crowbar' }] },
  lost: { name: 'Lost & Found Box', icon: 'swap-bag', color: '#b8aee0',
    text: 'Gloves, a lanyard… and something useful at the bottom.',
    actions: [{ id: 'take', label: 'Take something' }] },
  shelf: { name: 'Dusty Shelf', icon: 'bookshelf', color: '#c9b79c',
    text: 'An old card-polishing kit, still half full.',
    actions: [{ id: 'polish', label: 'Polish a card in your row' }] },
  pack: { name: 'Dropped Booster', icon: 'star-swirl', color: '#ff4fd8',
    text: 'A sealed booster under a shelf. Somebody missed it.',
    actions: [{ id: 'take', label: 'Rip it open' }] },
  secret: { name: 'Loose Shelf Panel', icon: 'magnifying-glass', color: '#6dffb0',
    text: 'It wobbles. There is a draught behind it.',
    actions: [{ id: 'push', label: 'Push it' }] },
  // tonight's goal tokens
  fuse: { name: 'Spare Fuse', icon: 'lightning-arc', color: '#ffcf7a', goal: true, text: 'Still in its little box.', actions: [{ id: 'take', label: 'Take the fuse' }] },
  valve: { name: 'Water Valve', icon: 'cog', color: '#7cc6ff', goal: true, text: 'Pipes groan. The wheel is stiff.', actions: [{ id: 'turn', label: 'Turn it shut', risk: true }] },
  thief: { name: 'The Thief!', icon: 'assassin-pocket', color: '#ff8a9b', goal: true, text: 'A hooded figure, frozen mid-step, pockets full.', actions: [{ id: 'grab', label: 'Grab them', risk: true }] },
  belonging: { name: 'Something of His', icon: 'pocket-watch', color: '#b07cff', goal: true, text: 'Old, cared-for, and cold to the touch.', actions: [{ id: 'take', label: 'Take it for him' }] },
  crate: { name: 'Delivery Crate', icon: 'cardboard-box', color: '#ffd166', goal: true, text: 'Stamped FRAGILE — HOLO DISTRIBUTION.', actions: [{ id: 'open', label: 'Open it', risk: true }] },
};

const BASE_WEIGHTS = { bin: 10, case: 5, vend: 6, critter: 6, till: 5, lost: 7, shelf: 6, pack: 2, secret: 2 };
const NIGHT_WEIGHTS = {
  blackout: { vend: 0, bin: 12, lost: 9 },
  flood: { bin: 14, critter: 8 },
  thief: { till: 2, case: 8 },
  ghost: { secret: 4, shelf: 8 },
  delivery: { pack: 5 },
};

// Rooms are keyed by where you stand: the node you just finished, or the act's entrance.
export const roomKey = run => run.pos == null ? 'entrance-' + run.act : String(run.pos);

// Build (once) and return the spots in the room you stand in.
export function roomSpots(run) {
  if (!run.night) startNight(run);
  const key = roomKey(run);
  if (run.rooms[key]) return run.rooms[key];
  const rng = makeRng(hashStr(`room:${run.seed}:${key}`));
  const W = { ...BASE_WEIGHTS, ...(NIGHT_WEIGHTS[run.night.id] || {}) };
  const n = rng.chance(0.45) ? 2 : 1;
  const kinds = [];
  for (let i = 0; i < n; i++) {
    const w = { ...W }; kinds.forEach(k => { w[k] = 0; }); // no duplicates in one room
    kinds.push(rng.weighted(w));
  }
  // tonight's goal shows up often, until it's done
  const N = NIGHTS[run.night.id];
  if (!run.night.done && rng.chance(run.pos == null ? 0.5 : 0.45)) kinds.push(N.token);
  run.rooms[key] = { spots: kinds.map((kind, i) => ({ kind, i, used: false, uses: 0 })) };
  return run.rooms[key];
}

export function canDo(run, spot, act) {
  if (spot.used) return { ok: false, why: 'Already done' };
  if (act.needs && !hasItem(run, act.needs)) return { ok: false, why: `Needs: ${ITEMS[act.needs].name}` };
  if (act.cost && run.coins < act.cost) return { ok: false, why: `Needs ${act.cost} coins` };
  return { ok: true };
}

// Resolve an action. Mutates run (coins, hp, items, tokens) and returns {out:[...], say, done}
// Outcomes needing UI (pack, relic, tactic, xp target) are returned for the screen to finish.
export function doSpot(run, spot, actId) {
  const def = SPOTS[spot.kind], act = def.actions.find(a => a.id === actId);
  const chk = canDo(run, spot, act); if (!chk.ok) return { out: [], say: chk.why, fail: true };
  const rng = makeRng(hashStr(`spot:${run.seed}:${roomKey(run)}:${spot.i}:${spot.uses}:${actId}`));
  const out = [];
  let say = '';
  const coins = n => { run.coins += n; out.push({ coins: n }); };
  const hurt = n => { const d = Math.min(n, run.hp - 1); run.hp -= d; out.push({ hp: -d }); };
  const heal = n => { const d = Math.min(n, run.maxHp - run.hp); run.hp += d; out.push({ hp: d }); };
  const item = id => { if (giveItem(run, id)) out.push({ item: id }); else { coins(5); say += ' (Pockets full — you pawn it for 5 coins.)'; } };
  const act1 = run.act;
  if (act.needs) useItem(run, act.needs);
  if (act.cost) { run.coins -= act.cost; out.push({ coins: -act.cost }); }
  spot.uses++;
  const finish = () => { spot.used = !(act.uses && spot.uses < act.uses); };

  switch (spot.kind + ':' + actId) {
    case 'bin:dig': {
      const r = rng.next();
      if (r < 0.45) { const n = rng.int(3, 6) + act1; coins(n); say = `Under the wrappers: ${n} coins.`; }
      else if (r < 0.72) { const id = rng.pick(['key', 'crowbar', 'code']); item(id); say = `You fish out a ${ITEMS[id].name.toLowerCase()}.` + say; }
      else { hurt(4 + act1); say = 'A rat was in there. It bites, and is gone.'; }
      break;
    }
    case 'case:key': case 'case:pry': out.push({ pack: 'collector' }); say = act.needs === 'key' ? 'Click. The case swings open.' : 'The lock gives with a crack.'; break;
    case 'case:smash': {
      if (rng.chance(0.55)) { hurt(5 + act1 * 2); out.push({ pack: 'collector' }); say = 'Glass everywhere — your hands are cut, but you got it.'; }
      else { hurt(6 + act1 * 2); say = 'The glass is tougher than it looks. You only hurt yourself.'; }
      break;
    }
    case 'vend:buy': {
      const r = rng.next();
      if (r < 0.4) { heal(12); say = 'A fizzy energy drink. You feel better.'; }
      else if (r < 0.7) { out.push({ tactic: true }); say = 'Out drops a strange little token. A Tactic!'; }
      else if (r < 0.8) { out.push({ pack: 'booster' }); say = 'The suspicious button. It dispenses… a booster pack!'; }
      else { say = 'It eats your coins and hums smugly.'; out.push({ nothing: true }); }
      break;
    }
    case 'critter:grab': {
      if (rng.chance(0.5)) { const n = rng.int(8, 12) + act1 * 2; coins(n); if (rng.chance(0.4)) item(rng.pick(['key', 'crowbar'])); say = `You slip ${n} coins out from under it. It doesn't wake.`; }
      else { hurt(7 + act1 * 2); say = 'It wakes. It bites. It keeps the shiny things.'; }
      break;
    }
    case 'till:code': case 'till:pry': { const n = rng.int(12, 18) + act1 * 3; coins(n); say = `Ka-ching. ${n} coins in the drawer.`; break; }
    case 'lost:take': { const id = rng.pick(['key', 'key', 'crowbar', 'code']); item(id); say = `At the bottom: a ${ITEMS[id].name.toLowerCase()}.` + say; break; }
    case 'shelf:polish': out.push({ xp: 8 }); say = 'You polish a card until it gleams. It grows!'; break;
    case 'pack:take': out.push({ pack: 'booster' }); say = 'Finders keepers.'; break;
    case 'secret:push': {
      if (rng.chance(0.6)) { out.push({ relic: true }); say = 'It swings inward: a hidden storeroom with something special on a shelf.'; }
      else { const n = rng.int(8, 14); coins(n); say = `Just a crawlspace. Someone hid ${n} coins here, though.`; }
      break;
    }
    // ---- tonight's goal ----
    case 'fuse:take': case 'belonging:take': out.push({ token: true }); say = spot.kind === 'fuse' ? 'One more fuse for the box.' : 'You feel a cold hand on your shoulder. "Thank you."'; break;
    case 'valve:turn': {
      out.push({ token: true });
      if (rng.chance(0.35)) { hurt(3 + act1); say = 'It turns — and sprays you in the face first.'; } else say = 'The pipes go quiet.';
      break;
    }
    case 'thief:grab': {
      if (rng.chance(0.7)) { out.push({ token: true }); say = 'You corner them! They drop some coins and bolt.'; coins(4); }
      else { const n = Math.min(run.coins, 6); run.coins -= n; out.push({ coins: -n }); run.night.thiefStole += n; say = `They slip away — with ${n} of your coins.`; }
      break;
    }
    case 'crate:open': {
      out.push({ token: true });
      if (rng.chance(0.75)) { out.push({ pack: 'booster' }); say = 'Packed in straw: a booster.'; }
      else { hurt(6 + act1); say = 'A mimic crate! It snaps at you before you kick it shut.'; }
      break;
    }
    default: say = 'Nothing happens.';
  }
  finish();
  // tokens count toward tonight's goal
  if (out.some(o => o.token)) {
    run.night.got++;
    const N = NIGHTS[run.night.id];
    if (run.night.got >= N.need && !run.night.done) { run.night.done = true; out.push(...nightReward(run)); out.push({ goalDone: true }); }
  }
  return { out, say: say.trim() };
}

function nightReward(run) {
  const id = run.night.id, out = [];
  const heal = () => { const d = run.maxHp - run.hp; run.hp = run.maxHp; out.push({ hp: d }); };
  if (id === 'blackout') { heal(); out.push({ relic: true }); }
  if (id === 'flood') { run.coins += 40; out.push({ coins: 40 }, { relic: true }); }
  if (id === 'thief') { const n = 50 + (run.night.thiefStole || 0); run.coins += n; out.push({ coins: n }, { pack: 'collector' }); }
  if (id === 'ghost') { heal(); out.push({ pack: 'collector' }); }
  if (id === 'delivery') { run.coins += 30; out.push({ coins: 30 }, { relic: true }); }
  return out;
}

// The thief also strikes on their own: walking into a room, they may lift a few coins.
export function thiefOnEnter(run) {
  if (!run.night || run.night.id !== 'thief' || run.night.done) return 0;
  const rng = makeRng(hashStr(`thiefwalk:${run.seed}:${run.act}:${run.floor}`));
  if (!rng.chance(0.18) || run.coins <= 0) return 0;
  const n = Math.min(run.coins, 3 + run.act * 2);
  run.coins -= n; run.night.thiefStole += n;
  return n;
}
