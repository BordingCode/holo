// HOLO — screens & flow.
import { CARDS, CARD_LIST, SETS, SET_ORDER, HEROES, PACKS, RARITY, ENEMIES, RELICS, TACTICS } from './data.js?v=19';
import * as R from './run.js?v=19';
import * as X from './explore.js?v=19';
import { hashStr } from './rng.js?v=19';
import { h, $, $$, icon, cardEl, attachTilt, idleShimmer, enableGyro, toast, modal, zoomCard, arranger, detailSheet, pillHp, pillCoins, packColors, packName, packIcon } from './ui.js?v=19';
import { packScreen } from './pack.js?v=19';
import { battleScreen } from './battle.js?v=19';
import { sfx, music, unlockAudio, audioSettings } from './audio.js?v=19';
import { initFx, burst, centerOf, banner, shake, setReduceMotion, RARITY_FX, floatText } from './fx.js?v=19';
import { canGrow, growStage, cardName } from './engine.js?v=19';
import { meta, saveMeta, loadRun, saveRun, clearRun, UNLOCKS, unlockedSets, heroUnlocked, snapshotUnlocks, distinctPulled, todayKey, recordPull } from './meta.js?v=19';

const app = $('#app');
initFx(app, $('#fx'));
let run = loadRun();
if (run && run.v !== 1) run = null;
if (run) { run.tactics = run.tactics || []; run.relics = run.relics || []; run.pity = run.pity || 0; } // saves from before the expansion

function applySettings() {
  audioSettings({ sound: meta.settings.sound, music: meta.settings.music });
  setReduceMotion(meta.settings.reduceMotion);
  document.body.classList.toggle('reduce-motion', !!meta.settings.reduceMotion);
}
applySettings();
addEventListener('pointerdown', () => unlockAudio(), { capture: true });

function mount(scr) {
  $$('.screen, .modal-bg, .zoom, .banner, .float', app).forEach(e => e.remove());
  app.append(scr);
}
const save = () => { if (run) saveRun(run); };
const ctxFor = extra => ({ run, app, mount, save, ...extra });

// ===========================================================================
// TITLE
// ===========================================================================
function title() {
  music('calm');
  const scr = h('div', { class: 'screen' });
  const wrap = h('div', { class: 'title-wrap' });
  const fan = h('div', { class: 'title-fan' });
  const show = [{ id: 'wildfire', star: 1, ed: 'foil' }, { id: 'phoenix', star: 1, ed: 'holo' }, { id: 'jackpot', star: 2, ed: 'gilded' }];
  show.forEach((c, k) => {
    const el = cardEl(c, { tilt: true });
    el.style.transform = `translateX(-50%) rotate(${(k - 1) * 14}deg) translateY(${Math.abs(k - 1) * 14}px)`;
    el.style.zIndex = k === 1 ? 3 : 1;
    idleShimmer(el, 1 + k * 0.2);
    el.addEventListener('click', () => { zoomCard(c); sfx.tap(); });
    fan.append(el);
  });
  const menu = h('div', { class: 'menu' });
  if (run && !run.over) menu.append(h('button', { class: 'btn gold', onclick: () => { sfx.tap(); resume(); } }, `Continue — Act ${run.act}, floor ${run.floor}`));
  menu.append(h('button', { class: 'btn', onclick: () => { sfx.tap(); if (run && !run.over) confirmAbandon(() => heroSelect(false)); else heroSelect(false); } }, 'New Run'));
  const dk = todayKey(); const dres = meta.daily[dk];
  menu.append(h('button', { class: 'btn alt', onclick: () => { sfx.tap(); if (run && !run.over) confirmAbandon(() => startDaily()); else startDaily(); } }, dres ? `Daily Run — best: ${dres.win ? 'WON' : 'floor ' + dres.floor}` : 'Daily Run'));
  menu.append(h('div', { style: { display: 'flex', gap: '10px' } },
    h('button', { class: 'btn ghost', style: { flex: '1' }, onclick: () => { sfx.tap(); binder(); } }, `Binder ${distinctPulled()}/${CARD_LIST.length}`),
    h('button', { class: 'btn ghost', style: { flex: 'none', padding: '0 16px' }, onclick: settings, html: icon('gears') + '' }) ));
  menu.lastChild.lastChild.querySelector('svg').style.cssText = 'width:24px;height:24px;fill:#fff';
  wrap.append(h('h1', { class: 'logo-big' }, 'HOLO'), h('div', { class: 'tagline' }, 'rip packs · build combos · beat the shop'), fan, menu);
  scr.append(wrap, h('div', { class: 'foot', html: `Runs ${meta.stats.runs} · Wins ${meta.stats.wins}${meta.heatMax ? ' · Heat ' + meta.heatMax : ''} · Icons: game-icons.net (CC BY 3.0)` }));
  mount(scr);
}

function confirmAbandon(then) {
  const m = modal([h('div', { class: 'h2' }, 'Abandon your run?'), h('p', { class: 'sub' }, 'Your current run will count as a loss.'),
    h('div', { style: { display: 'flex', gap: '10px', 'margin-top': '10px' } },
      h('button', { class: 'btn ghost', style: { flex: '1' }, onclick: () => m.close() }, 'Keep it'),
      h('button', { class: 'btn', style: { flex: '1' }, onclick: () => { m.close(); run.over = 'lose'; recordRunEnd(false); run = null; clearRun(); then(); } }, 'Abandon'))]);
}

// ===========================================================================
// HERO SELECT
// ===========================================================================
function heroSelect() {
  let pick = 'kip', heat = Math.min(meta.heatMax, meta.lastHeat || 0);
  const scr = h('div', { class: 'screen' });
  const top = h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', onclick: () => { sfx.back(); title(); }, html: icon('anticlockwise-rotation') }), h('span', { class: 'h1' }, 'Choose a hero'));
  const list = h('div', { class: 'heroes' });
  const heatBox = h('div');
  const startBtn = h('button', { class: 'btn gold', style: { margin: '14px 16px calc(14px + env(safe-area-inset-bottom))' } }, 'Start run');
  function render() {
    list.innerHTML = '';
    for (const id in HEROES) {
      const H = HEROES[id], ok = heroUnlocked(id);
      const el = h('div', { class: 'hero' + (pick === id ? ' sel' : '') + (ok ? '' : ' locked'), style: { '--hc': H.color } });
      el.innerHTML = `<div class="port">${icon(ok ? H.icon : 'padlock')}</div><div style="min-width:0">
        <div class="nm">${H.name}<span>${H.title}</span></div>
        <div class="perk">${ok ? H.perk : 'Locked — ' + H.unlock.text}</div>
        ${ok ? `<div class="stats">${H.hp} HP · ${H.coins} coins · starts with ${H.start.map(s => CARDS[s].name).join(', ')}</div>` : ''}</div>`;
      if (ok) el.addEventListener('click', () => { pick = id; sfx.tap(); render(); });
      list.append(el);
    }
    heatBox.innerHTML = '';
    if (meta.heatMax > 0) {
      const lvl = h('div', { class: 'lvl' }, heat ? 'HEAT ' + heat : 'NO HEAT');
      heatBox.append(h('div', { class: 'heat' },
        h('div', { class: 'heat-row' },
          h('button', { class: 'btn ghost small', onclick: () => { heat = Math.max(0, heat - 1); sfx.tap(); render(); } }, '−'), lvl,
          h('button', { class: 'btn ghost small', onclick: () => { heat = Math.min(meta.heatMax, heat + 1); sfx.tap(); render(); } }, '+')),
        h('div', { class: 'sub', style: { 'margin-top': '6px' }, html: heat ? R.HEAT.slice(1, heat + 1).map((t, k) => `${k + 1}. ${t}`).join('<br>') : 'Win at your highest Heat to unlock the next level.' })));
    }
  }
  startBtn.addEventListener('click', () => {
    sfx.tap(); meta.lastHeat = heat; saveMeta();
    run = R.newRun({ hero: pick, heat, unlockedSets: unlockedSets() });
    save(); mapScreen(true);
  });
  render();
  scr.append(top, h('div', { class: 'scroll', style: { flex: '1' } }, list, heatBox), startBtn);
  mount(scr);
}

function startDaily() {
  const dk = todayKey();
  const day = Math.floor(Date.now() / 864e5);
  const hero = ['kip', 'wick', 'glint'][day % 3];
  run = R.newRun({ hero, heat: 0, seed: hashStr('holo-daily-' + dk), daily: dk, unlockedSets: SET_ORDER.slice() });
  save();
  mapScreen(true);
  toast(`<b>Daily run</b> — everyone gets the same map & packs today. Hero: ${HEROES[hero].name}.`, 3500);
}

// ===========================================================================
// RESUME / ROUTING
// ===========================================================================
function resume() {
  if (!run) return title();
  if (run.over) return endScreen();
  if (run.openPack) return openPackFlow(run.openPack.result, run.openPack.ret);
  const p = run.pending;
  if (p && p.type === 'battle') return battleFlow();
  if (p && p.type === 'reward') return rewardScreen();
  if (p && p.type === 'node') return nodeScreen();
  mapScreen();
}

function openPackFlow(result, ret) {
  run.openPack = { result, ret };
  save();
  music('calm');
  if (result.pityHit && !result.pityShown) { result.pityShown = true; save(); setTimeout(() => toast('<b style="color:#ff4fd8">MYTHIC METER FULL</b> — the last card is a guaranteed Mythic!', 3000), 300); }
  packScreen(ctxFor({ done: () => {
    run.openPack = null;
    if (result.tactic) {
      const T = TACTICS[result.tactic];
      if (R.addTactic(run, result.tactic)) setTimeout(() => toast(`${icon('ticket')} <b>Bonus Tactic!</b> ${T.name} — ${T.text}`, 3200), 250);
      else { run.coins += 4; setTimeout(() => toast(`Bonus Tactic ${T.name}, but you're full — sold for 4 coins.`, 2800), 250); }
    }
    save(); returnTo(ret);
  } }), result);
}
function returnTo(ret) {
  if (ret === 'reward') return rewardScreen();
  if (ret === 'shop') return nodeScreen();
  if (ret === 'event') { run.pending = null; return afterNode(); }
  return mapScreen();
}

// ===========================================================================
// MAP
// ===========================================================================
const NODE = {
  fight: { icon: 'crossed-swords', color: '#ff8a9b', label: 'Fight' },
  elite: { icon: 'horned-skull', color: '#ffb03a', label: 'Elite' },
  shop: { icon: 'shop', color: '#ffd166', label: 'Shop' },
  rest: { icon: 'campfire', color: '#6dffb0', label: 'Lounge' },
  grader: { icon: 'magnifying-glass', color: '#5fd3ff', label: 'Grader' },
  event: { icon: 'card-random', color: '#b07cff', label: '???' },
  treasure: { icon: 'open-treasure-chest', color: '#ffe27a', label: 'Treasure' },
  boss: { icon: 'crowned-skull', color: '#ff4fd8', label: 'Boss' },
};
const ACT_NAME = { 1: 'The Bottom Shelf', 2: 'The Display Case', 3: 'The Back Room' };

function topbarRun(extra) {
  const bar = h('div', { class: 'topbar' }, pillHp(run), pillCoins(run.coins), h('span', { class: 'spacer' }), ...(extra || []),
    h('button', { class: 'iconbtn', onclick: () => { sfx.tap(); binder(true); }, html: icon('card-draw') }),
    h('button', { class: 'iconbtn', onclick: settings, html: icon('gears') }));
  return h('div', { class: 'topwrap' }, bar, runStrip());
}
// Relics · tactics · Mythic meter — the run's "build" at a glance.
function runStrip() {
  const strip = h('div', { class: 'runstrip' });
  const rel = h('button', { class: 'relics' + (run.relics.length ? '' : ' none'), html: run.relics.length ? run.relics.map(r => `<i title="${RELICS[r].name}">${icon(RELICS[r].icon)}</i>`).join('') : `${icon('open-treasure-chest')}<span>No relics yet</span>` });
  rel.addEventListener('click', () => { sfx.tap(); showBuild(); });
  const tac = h('button', { class: 'tacs', html: `${icon('ticket')}<b>${run.tactics.length}</b>/${R.tacticCap(run)}` });
  tac.addEventListener('click', () => { sfx.tap(); showBuild(); });
  const pct = Math.min(100, run.pity / R.PITY_MAX * 100);
  const mm = h('button', { class: 'mythic' + (run.pity >= R.PITY_MAX ? ' full' : ''), html: `<span>MYTHIC</span><div class="mbar"><i style="width:${pct}%"></i></div>` });
  mm.addEventListener('click', () => { sfx.tap(); toast(run.pity >= R.PITY_MAX ? '<b>Mythic meter FULL!</b> The last card of your next pack is a guaranteed Mythic.' : `<b>Mythic meter ${run.pity}/${R.PITY_MAX}</b><br>Every card you pull without a Mythic charges it. When full, your next pack ends in a guaranteed Mythic.`, 3500); });
  strip.append(rel, tac, mm);
  return strip;
}
function showBuild() {
  const items = [h('div', { class: 'h2' }, 'Your build')];
  items.push(h('div', { class: 'sub', style: { margin: '8px 0 4px', 'font-weight': 900, 'letter-spacing': '.12em' } }, `RELICS (${run.relics.length})`));
  if (!run.relics.length) items.push(h('p', { class: 'sub' }, 'Beat a boss or open a Treasure chest on the map to get relics — permanent rule-changers for this run.'));
  for (const r of run.relics) items.push(h('div', { class: 'relic-line', html: `<i>${icon(RELICS[r].icon)}</i><div><b>${RELICS[r].name}</b><br><span>${RELICS[r].text}</span></div>` }));
  items.push(h('div', { class: 'sub', style: { margin: '12px 0 4px', 'font-weight': 900, 'letter-spacing': '.12em' } }, `TACTICS (${run.tactics.length}/${R.tacticCap(run)})`));
  if (!run.tactics.length) items.push(h('p', { class: 'sub' }, 'One-shot tricks you play during a fight. Find them in packs, elites and shops.'));
  for (const t of run.tactics) { const T = TACTICS[t]; items.push(h('div', { class: 'relic-line', style: { '--k': RARITY[T.r].color }, html: `<i>${icon(T.icon)}</i><div><b>${T.name}</b><br><span>${T.text}</span></div>` })); }
  items.push(h('button', { class: 'btn ghost small', style: { width: '100%', 'margin-top': '12px' }, onclick: () => m.close() }, 'Close'));
  const m = modal(items);
}
// Relic choice: big tappable relic cards; tap one, then confirm.
function relicPicker(choices, onPick, title = 'Choose a relic') {
  let sel = null;
  const wrap = h('div', { class: 'relic-pick' }, h('div', { class: 'h2', style: { 'text-align': 'center' } }, title), h('div', { class: 'sub', style: { 'text-align': 'center' } }, 'Permanent for the rest of this run.'));
  const list = h('div', { class: 'relic-cards' });
  const take = h('button', { class: 'btn gold', disabled: true, style: { width: '100%' } }, 'Take it');
  choices.forEach(id => {
    const Rl = RELICS[id];
    const c = h('div', { class: 'relic-card', html: `<div class="ric">${icon(Rl.icon)}</div><b>${Rl.name}</b><span>${Rl.text}</span>` });
    c.addEventListener('click', () => { sel = id; sfx.flip(); list.querySelectorAll('.relic-card').forEach(x => x.classList.toggle('sel', x === c)); take.disabled = false; take.textContent = 'Take ' + Rl.name; });
    list.append(c);
  });
  take.addEventListener('click', () => {
    if (!sel) return;
    const p = centerOf(list.querySelector('.sel'));
    burst(p.x, p.y, { count: 50, colors: ['#ffe27a', '#fff', '#ff4fd8'], kind: 'star', speed: 7 }); sfx.reveal('R');
    onPick(sel);
  });
  wrap.append(list, take);
  return wrap;
}

// ---- the floor plan (the old node map) — now a crumpled plan you can peek at ----
function floorPlan() {
  const rows = run.map.rows;
  const RH = 96, H = rows.length * RH + 70;
  const can = new Set(R.reachable(run));
  const scrollEl = h('div', { class: 'map-scroll plan' });
  const map = h('div', { class: 'map', style: { height: H + 'px' } });
  const pos = (nd) => ({ x: nd.x * 100, y: H - 50 - nd.r * RH });
  let svg = `<svg class="paths" viewBox="0 0 100 ${H}" preserveAspectRatio="none">`;
  for (const row of rows) for (const nd of row) for (const nid of nd.next) {
    const t = R.nodeById(run, nid); const a = pos(nd), b = pos(t);
    const lit = (run.pos === nd.id && can.has(nid)) || (nd.done && (t.done || run.pos === t.id));
    svg += `<path d="M${a.x} ${a.y} C ${a.x} ${a.y - RH / 2}, ${b.x} ${b.y + RH / 2}, ${b.x} ${b.y}" stroke="${lit ? '#ffffffcc' : '#ffffff26'}" stroke-width="${lit ? 2.6 : 1.6}" vector-effect="non-scaling-stroke" fill="none" ${lit ? '' : 'stroke-dasharray="4 5"'}/>`;
  }
  svg += '</svg>';
  map.innerHTML = svg;
  for (const row of rows) for (const nd of row) {
    const N = NODE[nd.type], p = pos(nd);
    const el = h('div', { class: `node ${nd.type === 'boss' ? 'boss' : ''}${nd.done ? ' done' : ''}${run.pos === nd.id ? ' here' : ''}${can.has(nd.id) ? ' can' : ''}`, style: { left: p.x + '%', top: p.y + 'px', '--nc': N.color } });
    el.innerHTML = icon(nd.type === 'boss' ? ENEMIES[R.pickBossId(run)].icon : N.icon) + `<span class="lbl">${nd.type === 'boss' ? ENEMIES[R.pickBossId(run)].name : N.label}</span>`
      + (nd.type === 'elite' && nd.loot && SETS[nd.loot] && !nd.done ? `<span class="loottag" style="--k:${SETS[nd.loot].color}">${icon(SETS[nd.loot].glyph)}${SETS[nd.loot].name}</span>` : '');
    map.append(el);
  }
  scrollEl.append(map);
  const legend = h('div', { class: 'legend', html: Object.entries(NODE).filter(([k]) => k !== 'boss').map(([k, n]) => `<span style="color:${n.color}">${icon(n.icon).replace('<svg', `<svg style="fill:${n.color}"`)}${n.label}</span>`).join('') });
  const m = modal([h('div', { class: 'h2' }, 'Crumpled floor plan'), h('div', { class: 'sub' }, `${ACT_NAME[run.act]} — someone sketched every room on this floor.`), legend, scrollEl,
    h('button', { class: 'btn ghost', style: { width: '100%', 'margin-top': '8px' }, onclick: () => m.close() }, 'Fold it away')]);
  requestAnimationFrame(() => {
    const curRow = run.pos == null ? 0 : R.nodeById(run, run.pos).r + 1;
    scrollEl.scrollTop = Math.max(0, H - 50 - curRow * RH - scrollEl.clientHeight * 0.6);
  });
}

// ---- the room you stand in, with a door for every way forward ----
const ROOM_NAMES = {
  1: ['Sale Bin Corner', 'Aisle 2 — Sleeves', 'The Dusty Stockroom', 'Bulk Box Alley', 'Under the Stairs', 'The Mop Closet', 'Aisle 5 — Starter Decks', 'The Loading Dock', 'Returns Counter', 'Clearance Rack'],
  2: ['The Glass Corridor', 'Aisle 9 — Premium', 'The Spotlit Alcove', 'The Velvet Rope', 'Locked Cabinets', 'The Mirror Hall', 'Collector\'s Nook', 'Preorder Shelf', 'The Window Display', 'Auction Corner'],
  3: ['The Shredder Room', 'Staff Only', 'The Vault Door', 'Old Ledgers', 'The Cold Archive', 'The Office', 'Boxes Nobody Opened', 'The Furnace Pipe', 'The Long Shelf', 'Lost & Found'],
};
const ENTRANCE = { 1: 'The Shop Floor, After Hours', 2: 'Up the Creaking Stairs', 3: 'Past the STAFF ONLY Sign' };
const DOOR_HINTS = {
  fight: ['Something scratches at the other side.', 'Torn wrappers on the floor. Fresh ones.', 'A shelf rattles. Then stops.', 'Little footsteps. Lots of them.'],
  elite: ['Heavy breathing. Something big.', 'Claw marks on the frame — high up.', 'The door is dented outward.'],
  shop: ['Warm light and a little bell.', 'Someone hums behind a counter.', 'It smells like new card stock.'],
  rest: ['A kettle, a couch, quiet music.', 'Soft lamp light. It feels safe in there.'],
  grader: ['A loupe glints through the keyhole.', 'Cold white light. Someone is inspecting.'],
  event: ['The door is ajar. You can\'t see a thing.', 'Odd noises. Could be anything.', 'A note on the door: DO NOT OPEN.'],
  treasure: ['Something glitters under the door.', 'A padlock hangs here — already broken.'],
  boss: ['The big double doors. Something waits.'],
};
const pickBy = (arr, key) => arr[hashStr(String(key)) % arr.length];
const roomName = () => run.pos == null ? ENTRANCE[run.act] : pickBy(ROOM_NAMES[run.act], run.seed + ':' + run.pos);

function mapScreen(fresh) { return roomScreen(fresh); }

const PROPS = {
  1: ['cardboard-box', 'shopping-bag', 'ticket', 'price-tag', 'rat', 'desk-lamp', 'film-strip', 'card-random'],
  2: ['holy-grail', 'laurel-crown', 'photo-camera', 'pocket-watch', 'padlock', 'desk-lamp', 'paint-brush', 'open-book'],
  3: ['scroll-unfurled', 'book-cover', 'stamper', 'candle-flame', 'hanging-spider', 'sands-of-time', 'padlock', 'cardboard-box'],
};
const PROP_SPOTS = ['sl-hi', 'sr-hi'];
function roomProps(key) {
  const out = []; let hsh = hashStr(String(key));
  const spots = PROP_SPOTS.slice(), pool = PROPS[run.act].slice();
  for (let i = 0; i < 2; i++) {
    const sp = spots.splice(hsh % spots.length, 1)[0]; hsh = (hsh * 31 + 7) >>> 0;
    const pr = pool.splice(hsh % pool.length, 1)[0]; hsh = (hsh * 17 + 3) >>> 0;
    out.push(`<span class="prop ${sp}">${icon(pr)}</span>`);
  }
  return out.join('');
}
function nightModal(first) {
  const N = X.NIGHTS[run.night.id];
  const m = modal([h('div', { class: 'night-head', style: { '--k': N.color }, html: `${icon(N.icon)}<div><div class="sub">${first ? 'TONIGHT' : 'TONIGHT\'S STORY'}</div><div class="h2">${N.name}</div></div>` }),
    h('p', { class: 'sub', style: { 'font-size': '15px', color: '#e9e1ff' } }, N.intro),
    h('div', { class: 'night-goal', style: { '--k': N.color }, html: `${icon(N.tokenIcon)}<div><b>${N.goal}</b> — ${run.night.done ? '<span style="color:#6dffb0">done!</span>' : `${run.night.got}/${N.need}`}<br><span>${N.reward}</span></div>` }),
    h('p', { class: 'sub', style: { 'font-size': '13px' } }, 'Poke around every room: bins, cases, machines, sleeping things. What you find in one room can open something in another.'),
    h('button', { class: 'btn gold', style: { width: '100%' }, onclick: () => m.close() }, first ? 'Into the dark' : 'OK')]);
}

function roomScreen(fresh) {
  music('explore' + run.act);
  if (!run.night) X.startNight(run);
  const scr = h('div', { class: 'screen room-screen' });
  const doors = R.reachable(run).map(id => R.nodeById(run, id)).sort((a, b) => a.x - b.x);
  const spots = X.roomSpots(run).spots; save();
  const room = h('div', { class: `room act-${run.act} night-${run.night.id}` });
  const scene = h('div', { class: 'rm-scene' });
  scene.innerHTML = '<div class="rm-ceil"></div><div class="rm-side l"></div><div class="rm-side r"></div><div class="rm-floor"></div><span class="lamp"></span>' + roomProps(run.seed + ':' + run.pos);
  const wall = h('div', { class: 'rm-wall' });
  scene.append(wall);
  room.append(scene, h('div', { class: 'rm-dark' }));
  let chosen = null, said = null; // chosen = {door} | {spot}
  const info = h('div', { class: 'door-info' });
  const showInfo = () => {
    info.innerHTML = '';
    if (!chosen) {
      const left = spots.filter(sp => !sp.used).length;
      info.append(h('div', { class: 'di-hint', html: `${left ? `<b>${left} thing${left > 1 ? 's' : ''}</b> to poke at. ` : ''}${doors.length > 1 ? `${doors.length} doors` : 'One door'} onward — <b>tap</b> to look closer.` }));
      return;
    }
    if (chosen.spot) {
      const sp = chosen.spot, D = X.SPOTS[sp.kind];
      info.append(h('div', { class: 'di-type', style: { color: D.color }, html: `${icon(D.icon)}<b>${D.name}</b>${D.goal ? '<span class="goaltag">TONIGHT</span>' : ''}` }));
      info.append(h('div', { class: 'di-hint' }, said || (sp.used ? 'Nothing more here.' : D.text)));
      if (!sp.used) {
        const row = h('div', { class: 'di-acts' });
        for (const a of D.actions) {
          const c = X.canDo(run, sp, a);
          row.append(h('button', { class: 'btn small ' + (c.ok ? (a.risk ? 'risk' : 'gold') : 'ghost'), disabled: !c.ok, onclick: () => poke(sp, a.id) },
            h('span', {}, a.label), a.risk ? h('em', {}, 'risky') : c.ok ? '' : h('em', {}, c.why)));
        }
        info.append(row);
      }
      return;
    }
    const nd = chosen.door, N = NODE[nd.type], boss = nd.type === 'boss' ? ENEMIES[R.pickBossId(run)] : null;
    info.append(h('div', { class: 'di-type', style: { color: N.color }, html: `${icon(boss ? boss.icon : N.icon)}<b>${boss ? boss.name : N.label}</b>` + (nd.type === 'elite' && nd.loot && SETS[nd.loot] ? `<span class="loottag" style="--k:${SETS[nd.loot].color}">${icon(SETS[nd.loot].glyph)}${SETS[nd.loot].name} loot</span>` : '') }),
      h('div', { class: 'di-hint' }, pickBy(DOOR_HINTS[nd.type], run.seed + ':' + nd.id)),
      h('button', { class: 'btn gold di-go', onclick: () => walkThrough(nd) }, nd.type === 'boss' ? 'Face it' : 'Go through'));
  };
  const select = (el, c) => { chosen = c; said = null; room.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); showInfo(); };
  const els = doors.map(nd => {
    const N = NODE[nd.type], boss = nd.type === 'boss';
    const d = h('button', { class: `door t-${nd.type}${boss ? ' boss' : ''}`, style: { '--nc': N.color } });
    d.innerHTML = `<span class="d-in">${icon(boss ? ENEMIES[R.pickBossId(run)].icon : N.icon)}</span>
      <span class="d-leaf">${boss ? '<span class="d-leaf2"></span>' : ''}<span class="d-plaque">${icon(boss ? 'crowned-skull' : N.icon)}</span><span class="d-knob"></span></span>
      <span class="d-spill"></span>`;
    d.addEventListener('click', () => {
      if (chosen && chosen.door === nd) return walkThrough(nd);
      sfx.listen(nd.type); select(d, { door: nd });
    });
    return d;
  });
  wall.append(...els);
  // the things lying around
  const SLOTS = ['fl', 'fr', 'sl', 'sr'];
  const spotEls = spots.map((sp, k) => {
    const D = X.SPOTS[sp.kind];
    const el = h('button', { class: `spot ${SLOTS[k % 4]}${sp.used ? ' used' : ''}${D.goal ? ' goal' : ''}`, style: { '--k': D.color } });
    el.innerHTML = `<span class="sp-ico">${icon(D.icon)}</span><span class="sp-lbl">${D.name}</span>`;
    el.addEventListener('click', () => { sfx.tap(); select(el, { spot: sp }); });
    scene.append(el);
    return el;
  });
  function poke(sp, actId) {
    const res = X.doSpot(run, sp, actId);
    said = res.say;
    const el = spotEls[spots.indexOf(sp)], p = centerOf(el);
    for (const o of res.out) {
      if (o.coins) { floatText(p.x, p.y - 30, (o.coins > 0 ? '+' : '') + o.coins + ' coins', '#ffd166'); o.coins > 0 ? sfx.coin() : sfx.back(); }
      if (o.hp) { floatText(p.x, p.y - 10, (o.hp > 0 ? '+' : '') + o.hp + ' HP', o.hp > 0 ? '#6dffb0' : '#ff5d73', o.hp < 0); if (o.hp < 0) { sfx.hurt(); shake(); } else sfx.heal(); }
      if (o.item) { const I = X.ITEMS[o.item]; toast(`${icon(I.icon)} <b>${I.name}</b> — ${I.text}`, 2600); sfx.buy(); }
      if (o.nothing) sfx.back();
    }
    if (res.out.some(o => o.token)) { burst(p.x, p.y, { count: 30, colors: [X.NIGHTS[run.night.id].color, '#fff'], kind: 'confetti', speed: 5 }); sfx.reveal('U'); }
    el.classList.toggle('used', sp.used);
    save(); refreshTop(); showInfo();
    // things that need their own screen come last, one after the other
    const queue = [];
    if (res.out.some(o => o.goalDone)) queue.push(done => { const N = X.NIGHTS[run.night.id]; banner('TONIGHT: DONE', N.reward, N.color); sfx.reveal('M'); setTimeout(done, 1700); });
    for (const o of res.out) {
      if (o.tactic) queue.push(done => { const id = R.randomTactic(run); const T = TACTICS[id]; if (R.addTactic(run, id)) toast(`${icon('ticket')} <b>Tactic: ${T.name}</b> — ${T.text}`, 3000); else { run.coins += 4; toast(`Tactic ${T.name}, but you're full — sold for 4 coins.`); } save(); refreshTop(); done(); });
      if (o.xp) queue.push(done => polishPick(o.xp, done));
      if (o.relic) queue.push(done => relicPick(done));
    }
    const pack = res.out.find(o => o.pack);
    const next = () => { const f = queue.shift(); if (f) f(next); else if (pack) setTimeout(() => openPackFlow(R.openPack(run, { type: pack.pack }), 'map'), 500); };
    setTimeout(next, 450);
  }
  function walkThrough(nd) {
    if (room.classList.contains('going')) return;
    const d = els[doors.indexOf(nd)];
    const rr = room.getBoundingClientRect(), dr = d.getBoundingClientRect();
    room.style.setProperty('--ox', ((dr.left + dr.width / 2 - rr.left) / rr.width * 100).toFixed(1) + '%');
    room.style.setProperty('--oy', ((dr.top + dr.height * 0.55 - rr.top) / rr.height * 100).toFixed(1) + '%');
    d.classList.add('open'); room.classList.add('going'); sfx.creak();
    setTimeout(() => enter(nd.id), 900);
  }
  const N = X.NIGHTS[run.night.id];
  const nightChip = h('button', { class: 'night-chip' + (run.night.done ? ' done' : ''), style: { '--k': N.color }, onclick: () => { sfx.tap(); nightModal(false); } });
  const pockets = h('div', { class: 'pockets' });
  const head = h('div', { class: 'actbanner' },
    h('div', { class: 'sub', style: { 'font-weight': 900, 'letter-spacing': '.2em' } }, `ACT ${run.act} · ${ACT_NAME[run.act].toUpperCase()}${run.daily ? ' · DAILY' : ''}${run.heat ? ' · HEAT ' + run.heat : ''}`),
    h('div', { class: 'h2 room-name' }, roomName()),
    h('div', { class: 'room-sub' }, nightChip, pockets));
  const planBtn = h('button', { class: 'iconbtn plan', title: 'Floor plan', onclick: () => { sfx.tap(); floorPlan(); }, html: icon('treasure-map') });
  let top = topbarRun([planBtn]);
  function refreshTop() {
    const t2 = topbarRun([planBtn]); top.replaceWith(t2); top = t2;
    nightChip.className = 'night-chip' + (run.night.done ? ' done' : '');
    nightChip.innerHTML = `${icon(N.icon)}<span>${N.name}</span><b>${run.night.done ? '✓' : `${run.night.got}/${N.need}`}</b>`;
    pockets.innerHTML = (run.items || []).length ? run.items.map(id => `<i title="${X.ITEMS[id].name}">${icon(X.ITEMS[id].icon)}</i>`).join('') : '<span>empty pockets</span>';
  }
  function polishPick(xp, done) {
    const cards = run.row.filter(c => c && canGrow(c));
    if (!cards.length) { run.coins += 6; toast('No card in your row can grow — you sell the kit for 6 coins.'); save(); refreshTop(); return done(); }
    const grid = h('div', { class: 'pick-grid' });
    const m = modal([h('div', { class: 'h2' }, 'Polish which card?'), h('div', { class: 'sub' }, `It grows +${xp}.`), grid]);
    cards.forEach(c => { const el = cardEl(c, { mini: true }); el.addEventListener('click', () => {
      const before = growStage(c); c.xp = (c.xp || 0) + xp; const after = growStage(c);
      m.close(); save(); sfx.buff();
      if (after > before) { banner(after === 2 ? 'FULL ART' : 'ALT ART', cardName(c) + ' grew!', after === 2 ? '#ff4fd8' : '#ffd166'); sfx.reveal(after === 2 ? 'M' : 'R'); }
      arr.render(); done();
    }); grid.append(el); });
  }
  function relicPick(done) {
    const choices = R.relicChoices(run, 2);
    if (!choices.length) { run.coins += 20; save(); refreshTop(); return done(); }
    const m = modal([h('div', { class: 'h2' }, 'Pick one'), h('div', { class: 'sub' }, 'Only one fits in your bag.'),
      ...choices.map(id => h('button', { class: 'relic-choice', onclick: () => { R.takeRelic(run, id); m.close(); sfx.reveal('R'); save(); refreshTop(); arr.render(); done(); },
        html: `${icon(RELICS[id].icon)}<div><b>${RELICS[id].name}</b><span>${RELICS[id].text}</span></div>` }))]);
  }
  const arr = arranger(run, { onChange: save, merge: true });
  showInfo(); refreshTop();
  scr.append(top, head, room, info, arr.detail, arr.el);
  mount(scr);
  const stole = run.thiefStruck; if (stole) { run.thiefStruck = 0; save(); setTimeout(() => { toast(`${icon('assassin-pocket')} <b>The thief!</b> A hand in your pocket — ${stole} coins gone.`, 3000); sfx.back(); }, 700); }
  if (fresh && run.floor === 0 && run.act === 1 && !meta.seen) {
    meta.seen = true; saveMeta();
    setTimeout(() => {
      const m = modal([h('div', { class: 'h2' }, 'How HOLO works'),
        h('div', { class: 'sub', style: { 'font-size': '14px', 'margin-top': '8px' }, html: `
          <p><b style="color:#fff">Your row of 6 cards fires left → right</b> every round of a fight. Order matters: buffs boost the card after them, Mirror copies the card to its left.</p>
          <p><b style="color:#fff">Cards in your row grow</b> as they fire — into Alt Art, then Full Art. Bench cards don't grow.</p>
          <p><b style="color:#fff">Win fights → rip packs.</b> Keep the pulls you like, merge duplicates for ★, and sell the rest for coins.</p>
          <p><b style="color:#fff">Explore the closed shop</b> room by room. Poke at what's lying around, pick a door, beat three bosses.</p>` }),
        h('button', { class: 'btn gold', style: { width: '100%', 'margin-top': '6px' }, onclick: () => { m.close(); nightModal(true); } }, "Let's rip")]);
    }, 400);
  } else if (fresh && run.floor === 0 && run.act === 1 && !run.night.seen) { run.night.seen = true; save(); setTimeout(() => nightModal(true), 400); }
  if (run.floor === 0 && run.act === 1) { run.night.seen = true; save(); }
}

function enter(id) {
  const nd = R.enterNode(run, id);
  const stole = X.thiefOnEnter(run); if (stole) run.thiefStruck = stole;
  if (nd.type === 'fight' || nd.type === 'elite' || nd.type === 'boss') { R.startBattle(run, nd.type); save(); return battleFlow(); }
  if (nd.type === 'shop') run.pending = { type: 'node', node: 'shop', shop: R.makeShop(run), line: shopLine() };
  if (nd.type === 'rest') run.pending = { type: 'node', node: 'rest' };
  if (nd.type === 'grader') run.pending = { type: 'node', node: 'grader' };
  if (nd.type === 'event') run.pending = { type: 'node', node: 'event', ev: R.pickEvent(run) };
  if (nd.type === 'treasure') run.pending = { type: 'node', node: 'treasure', choices: R.relicChoices(run, 2) };
  save(); nodeScreen();
}

function afterNode() {
  const r = R.completeNode(run);
  save();
  if (r === 'win') return endScreen();
  if (r === 'act') {
    mapScreen();
    setTimeout(() => { banner(`ACT ${run.act}`, ACT_NAME[run.act], '#4cc9f0'); sfx.reveal('R'); }, 200);
    return;
  }
  mapScreen();
}

// ===========================================================================
// BATTLE + REWARDS
// ===========================================================================
function battleFlow() {
  const B = R.makeBattle(run);
  const kind = run.pending.kind;
  B.act = run.act;
  battleScreen(ctxFor({
    onEnd: (B) => {
      const before = snapshotUnlocks();
      const actWas = run.act;
      const rew = R.finishBattle(run, B);
      if (!rew) { save(); return endScreen(); }
      if (kind === 'boss') { if (actWas === 1) meta.flags.beatShredder = true; if (actWas === 2) meta.flags.beatCollector = true; }
      saveMeta();
      rew.unlocks = snapshotUnlocks().filter(u => !before.includes(u));
      applyUnlocksToRun(rew.unlocks);
      run.pending = { type: 'reward', rew, opened: [] };
      save(); rewardScreen();
    },
  }), B, kind);
}

function applyUnlocksToRun(ids) {
  for (const id of ids) if (SETS[id] && !run.sets.includes(id)) run.sets.push(id);
}

function rewardScreen() {
  music('calm');
  const p = run.pending, rew = p.rew;
  const scr = h('div', { class: 'screen' });
  const body = h('div', { class: 'scroll center', style: { flex: '1', padding: '10px 16px', gap: '12px', 'justify-content': 'safe center' } });
  body.append(h('div', { class: 'h1', style: { color: '#6dffb0', 'font-size': '40px' } }, rew.kind === 'boss' ? 'BOSS DEFEATED' : 'VICTORY'));
  const lines = h('div', { class: 'reward-lines' }, h('span', { class: 'pill coins', html: `${icon('two-coins')}+${rew.coins}` }));
  if (rew.interest) lines.append(h('span', { class: 'pill coins', html: `${icon('coins-pile')}+${rew.interest} interest` }));
  if (rew.healed) lines.append(h('span', { class: 'pill hp', html: `${icon('heart-beats')}+${rew.healed} HP` }));
  if (rew.tactic) lines.append(h('span', { class: 'pill', style: { color: RARITY[TACTICS[rew.tactic].r].color }, html: `${icon('ticket')}Tactic: ${TACTICS[rew.tactic].name}` }));
  body.append(lines);
  const needRelic = rew.relics && rew.relics.length && !p.relic;
  if (needRelic) body.append(relicPicker(rew.relics, (id) => { p.relic = id; R.takeRelic(run, id); save(); toast(`<b>${RELICS[id].name}</b> — ${RELICS[id].text}`, 3000); rewardScreen(); }, 'Boss relic — choose one'));
  else if (p.relic) lines.append(h('span', { class: 'pill', style: { color: '#ffe27a' }, html: `${icon(RELICS[p.relic].icon)}${RELICS[p.relic].name}` }));
  if (rew.shattered.length) body.append(h('div', { class: 'rulebar', html: `<b>Shattered:</b> ${rew.shattered.map(c => CARDS[c.id].name).join(', ')} — Cracked cards break after 3 fights.` }));
  for (const u of rew.unlocks || []) { const U = UNLOCKS.find(x => x.id === u); body.append(h('div', { class: 'unlock done', html: `${icon('star-swirl')}<span><b>UNLOCKED:</b> ${U.text}</span>` })); }
  const packsEl = h('div', { style: { display: 'flex', gap: '8px', 'justify-content': 'center', 'flex-wrap': 'wrap' } });
  rew.packs.forEach((spec, k) => {
    const opened = p.opened.includes(k);
    const [pc, pc2] = packColors(spec);
    const w = h('div', { class: 'loot' + (opened ? ' opened' : ''), style: { '--pc': pc, '--pc2': pc2 } },
      h('div', { class: 'rays' }),
      h('div', { class: 'mini-pack', style: { '--pc': pc, '--pc2': pc2 }, html: icon(packIcon(spec)) }),
      h('div', { class: 'wn' }, packName(spec)), h('div', { class: 'cta' }, opened ? 'Opened' : 'Tap to rip it open'));
    if (!opened) w.addEventListener('click', () => { sfx.tap(); p.opened.push(k); const res = R.openPack(run, spec); openPackFlow(res, 'reward'); });
    packsEl.append(w);
  });
  if (rew.packs.length) body.append(packsEl);
  const allOpen = rew.packs.every((_, k) => p.opened.includes(k)) && !needRelic;
  const cont = h('button', { class: 'btn ' + (allOpen ? 'gold' : 'ghost'), style: { margin: '10px 16px calc(14px + env(safe-area-inset-bottom))' }, onclick: () => {
    if (!allOpen) { toast(needRelic ? 'Pick a relic first!' : 'Open your loot first!'); return; }
    sfx.tap(); run.pending = null; afterNode();
  } }, 'Continue');
  scr.append(topbarRun(), body, cont);
  mount(scr);
  if (!p.celebrated) { p.celebrated = true; save(); const c = centerOf(body.firstChild); burst(c.x, c.y, { count: 50, colors: ['#6dffb0', '#ffd166', '#fff'], kind: 'confetti', speed: 7 }); sfx.coin(); }
}

// ===========================================================================
// NODES: shop / rest / grader / event
// ===========================================================================
const SHOP_LINES = ['Packs fresh from the back. Mostly.', 'No refunds. No returns. No crying on the merchandise.', 'Feeling lucky? The foil ones are lucky.', 'I hear the Shredder hates spare cards on the left…', 'Everything must go! Including you, eventually.', 'Psst. Sell me your commons.'];
const shopLine = () => SHOP_LINES[Math.floor(Math.random() * SHOP_LINES.length)];

function nodeScreen() {
  const p = run.pending;
  if (p.node === 'shop') return shopScreen();
  if (p.node === 'rest') return restScreen();
  if (p.node === 'grader') return graderScreen();
  if (p.node === 'event') return eventScreen();
  if (p.node === 'treasure') return treasureScreen();
}

function leaveBtn(label = 'Leave') {
  return h('button', { class: 'btn ghost', style: { margin: '6px 16px calc(12px + env(safe-area-inset-bottom))' }, onclick: () => { sfx.back(); run.pending = null; afterNode(); } }, label);
}

function shopScreen() {
  music('calm');
  const S = run.pending.shop;
  const scr = h('div', { class: 'screen' });
  const body = h('div', { class: 'scroll', style: { flex: '1' } });
  let arr;
  const render = () => {
    body.innerHTML = '';
    body.append(h('div', { class: 'shopkeep', html: `${icon('shop')}<div class="bubble">${run.pending.line}</div>` }));
    const grid = h('div', { class: 'shop-grid' });
    S.stock.forEach(it => {
      const [pc, pc2] = packColors(it);
      const P = PACKS[it.type];
      const w = h('div', { class: 'ware' + (it.sold ? ' sold' : '') + (run.coins < it.price ? ' poor' : '') },
        h('div', { class: 'mini-pack', style: { '--pc': pc, '--pc2': pc2 }, html: icon(packIcon(it)) }),
        h('div', { class: 'wn' }, packName(it)), h('div', { class: 'wb' }, P.blurb),
        h('span', { class: 'price', html: `${icon('two-coins')}${it.sold ? 'SOLD' : it.price}` }));
      w.addEventListener('click', () => {
        if (run.coins < it.price) { toast('Not enough coins — sell a card below?'); sfx.back(); return; }
        run.coins -= it.price; it.sold = true; sfx.buy();
        openPackFlow(R.openPack(run, it), 'shop');
      });
      grid.append(w);
    });
    body.append(grid);
    // the display case: one shiny Rare/Mythic to save up for
    if (S.showcase) {
      const sc = S.showcase;
      const cardHost = h('div', { class: 'sc-card' }, cardEl(sc.card, { tilt: true }));
      if (!sc.sold) idleShimmer(cardHost.firstChild, 1.2);
      const def = CARDS[sc.card.id];
      const buy = h('button', { class: 'btn ' + (sc.sold ? 'ghost' : run.coins >= sc.price ? 'gold' : 'ghost') + ' small', disabled: sc.sold, html: sc.sold ? 'SOLD' : `${icon('two-coins')}${sc.price}` });
      buy.addEventListener('click', () => {
        if (run.coins < sc.price) { toast(`Save up! ${sc.price - run.coins} more coins.`); sfx.back(); return; }
        run.coins -= sc.price; sc.sold = true; sfx.buy();
        openPackFlow({ type: 'showcase', cards: [sc.card], tell: null }, 'shop');
      });
      cardHost.firstChild.addEventListener('click', () => zoomCard(sc.card));
      body.append(h('div', { class: 'showcase' + (sc.sold ? ' sold' : '') }, h('div', { class: 'sc-lab' }, 'DISPLAY CASE'), cardHost,
        h('div', { class: 'sc-info' }, h('b', {}, def.name), h('span', { html: `${RARITY[def.r].name}${sc.card.ed !== 'normal' ? ' · ' + sc.card.ed.toUpperCase() : ''}` }), buy)));
    }
    if (S.tactics && S.tactics.length) {
      const tl = h('div', { class: 'shop-tacs' }, h('div', { class: 'sc-lab' }, `TACTICS · you hold ${run.tactics.length}/${R.tacticCap(run)}`));
      for (const t of S.tactics) {
        const T = TACTICS[t.id];
        const w = h('button', { class: 'tac-ware' + (t.sold ? ' sold' : ''), style: { '--k': RARITY[T.r].color }, html: `<i>${icon(T.icon)}</i><div><b>${T.name}</b><span>${T.text}</span></div><em>${t.sold ? 'SOLD' : icon('two-coins') + t.price}</em>` });
        w.addEventListener('click', () => {
          if (t.sold) return;
          if (run.coins < t.price) { toast('Not enough coins'); sfx.back(); return; }
          if (!R.addTactic(run, t.id)) { toast(`You can only hold ${R.tacticCap(run)} Tactics.`); sfx.back(); return; }
          run.coins -= t.price; t.sold = true; sfx.buy(); save(); shopScreen();
        });
        tl.append(w);
      }
      body.append(tl);
    }
    const mend = h('div', { class: 'service' + (S.mend.used || run.hp >= run.maxHp ? ' used' : '') }, h('div', { class: 'wn' }, 'Mend'), h('div', { class: 'wb' }, `Heal ${S.mend.amt} HP`), h('span', { class: 'price', html: `${icon('two-coins')}${S.mend.price}` }));
    mend.addEventListener('click', () => {
      if (run.coins < S.mend.price) { toast('Not enough coins'); return; }
      run.coins -= S.mend.price; S.mend.used = true; run.hp = Math.min(run.maxHp, run.hp + S.mend.amt); sfx.heal(); save(); shopScreen();
    });
    const pol = h('div', { class: 'service' + (S.polish.used ? ' used' : '') }, h('div', { class: 'wn' }, 'Polish'), h('div', { class: 'wb' }, '+1★ to a card (select it below)'), h('span', { class: 'price', html: `${icon('two-coins')}${S.polish.price}` }));
    pol.addEventListener('click', () => toast('Tap one of your cards below, then <b>Polish</b>'));
    body.append(h('div', { class: 'services' }, mend, pol));
  };
  arr = arranger(run, {
    merge: true,
    onChange: () => { save(); shopScreen(); },
    actions: (c, where, idx) => {
      const a = [{ label: `Sell +${R.sellValue(run, c)}`, cls: 'ghost small', fn: () => arr.sell(where, idx) }];
      if (!S.polish.used && c.star < 3) a.push({ label: `Polish ★ (${S.polish.price})`, cls: 'gold small', disabled: run.coins < S.polish.price, fn: () => { run.coins -= S.polish.price; S.polish.used = true; c.star++; sfx.reveal('U'); toast(`<b>${CARDS[c.id].name}</b> is now ★${c.star}`); save(); shopScreen(); } });
      return a;
    },
  });
  render();
  scr.append(topbarRun(), body, arr.detail, arr.el, leaveBtn('Leave shop'));
  mount(scr);
}

function treasureScreen() {
  music('calm');
  const p = run.pending;
  const scr = h('div', { class: 'screen' });
  const body = h('div', { class: 'scroll center', style: { flex: '1', padding: '14px 16px', gap: '12px', 'justify-content': 'safe center' } });
  const chest = h('div', { class: 'chest' + (p.opened ? ' open' : ''), html: icon(p.opened ? 'open-treasure-chest' : 'locked-chest') });
  body.append(h('div', { class: 'h1', style: { color: '#ffe27a' } }, 'Treasure'), chest);
  const render = () => {
    [...body.querySelectorAll('.relic-pick, .helpline')].forEach(e => e.remove());
    if (!p.opened) { body.append(h('div', { class: 'helpline' }, 'Tap the chest to open it.')); return; }
    if (!p.choices.length) { body.append(h('div', { class: 'helpline' }, 'Empty! You already own every relic. Have 25 coins instead.')); return; }
    body.append(relicPicker(p.choices, (id) => { R.takeRelic(run, id); toast(`<b>${RELICS[id].name}</b> — ${RELICS[id].text}`, 3000); run.pending = null; afterNode(); }));
  };
  chest.addEventListener('click', () => {
    if (p.opened) return;
    p.opened = true; if (!p.choices.length) run.coins += 25; save();
    chest.classList.add('open'); chest.innerHTML = icon('open-treasure-chest');
    const c = centerOf(chest); burst(c.x, c.y, { count: 70, colors: ['#ffe27a', '#ffd166', '#fff'], kind: 'star', speed: 8, lift: 3 }); sfx.reveal('M'); shake();
    render(); if (p.choices.length) lv.textContent = 'Skip the relic';
  });
  render();
  const lv = leaveBtn(p.opened && p.choices.length ? 'Skip the relic' : 'Leave');
  scr.append(topbarRun(), body, lv);
  mount(scr);
}

function restScreen() {
  music('calm');
  const scr = h('div', { class: 'screen' });
  const heal = R.restHeal(run);
  const scene = h('div', { class: 'scene', style: { '--nc': '#6dffb055' } }, h('div', { class: 'big-ic', html: icon('campfire') }), h('div', { class: 'h1' }, 'Sleeve Lounge'),
    h('p', {}, 'A quiet pocket between the shelves. Rest up, or spend the time polishing a card until it gleams.'));
  const choices = h('div', { class: 'choices' },
    h('button', { class: 'choice', disabled: run.hp >= run.maxHp, onclick: () => { run.hp = Math.min(run.maxHp, run.hp + heal); sfx.heal(); toast(`+${heal} HP`); run.pending = null; afterNode(); } }, `Rest`, h('small', {}, `Heal ${heal} HP (${run.hp}/${run.maxHp})`)),
    h('div', { class: 'choice', style: { cursor: 'default' } }, 'Polish', h('small', {}, 'Tap a card below, then Polish for +1★ — free.')));
  const arr = arranger(run, {
    onChange: save,
    actions: (c) => c.star < 3 ? [{ label: 'Polish ★ (free)', cls: 'gold small', fn: () => { c.star++; sfx.reveal('U'); toast(`<b>${CARDS[c.id].name}</b> is now ★${c.star}`); run.pending = null; afterNode(); } }] : [{ label: 'Already ★★★', cls: 'ghost small', disabled: true }],
  });
  scr.append(topbarRun(), h('div', { class: 'scroll', style: { flex: '1' } }, scene, choices), arr.detail, arr.el, leaveBtn('Skip'));
  mount(scr);
}

function graderScreen() {
  music('calm');
  const scr = h('div', { class: 'screen' });
  const odds = R.GRADE_TABLE.map(g => `<tr><td style="padding:2px 8px 2px 0;font-weight:900">${g.label}</td><td style="color:var(--muted)">${g.p}%</td><td style="padding-left:8px">${g.desc}</td></tr>`).join('');
  const scene = h('div', { class: 'scene', style: { '--nc': '#5fd3ff55' } }, h('div', { class: 'big-ic', html: icon('magnifying-glass') }), h('div', { class: 'h1' }, 'The Grader'),
    h('p', {}, 'A monocled appraiser will grade ONE card for free. A great grade makes it shine. A bad one cracks it.'),
    h('table', { style: { 'font-size': '12px', 'text-align': 'left', 'border-collapse': 'collapse' }, html: odds }));
  const arr = arranger(run, {
    onChange: save,
    actions: (c) => [{ label: 'Submit for grading', cls: 'gold small', fn: () => doGrade(c) }],
  });
  scr.append(topbarRun(), h('div', { class: 'scroll', style: { flex: '1' } }, scene, h('div', { class: 'helpline' }, 'Tap a card below to submit it.')), arr.detail, arr.el, leaveBtn());
  mount(scr);

  function doGrade(c) {
    const res = R.gradeCard(run, c);
    save();
    const s2 = h('div', { class: 'screen' });
    const slabCard = cardEl(res.before, { tilt: true });
    const gradeEl = h('div', { class: 'grade-roll' }, '?');
    const lab = h('div', { class: 'lab' }, h('span', {}, 'HOLO GRADING CO.'), h('span', { class: 'g' }, '?'));
    const slab = h('div', { class: 'slab' }, lab, slabCard);
    const resEl = h('div', { class: 'sub', style: { 'font-size': '16px', 'min-height': '44px' } }, 'Grading…');
    const cont = h('button', { class: 'btn gold', style: { margin: '10px 16px calc(14px + env(safe-area-inset-bottom))', visibility: 'hidden' }, onclick: () => { run.pending = null; afterNode(); } }, 'Continue');
    s2.append(h('div', { class: 'scroll center', style: { flex: '1', 'justify-content': 'center', gap: '14px', padding: '20px' } }, slab, gradeEl, resEl), cont);
    mount(s2);
    let k = 0;
    const roll = setInterval(() => { gradeEl.textContent = 1 + Math.floor(Math.random() * 10); sfx.drum(k++); }, 90);
    setTimeout(() => {
      clearInterval(roll);
      gradeEl.textContent = res.grade; lab.lastChild.textContent = res.grade;
      gradeEl.style.color = res.grade >= 9 ? '#ffd166' : res.grade >= 7 ? '#6dffb0' : res.grade >= 4 ? '#fff' : '#ff5d73';
      const nc = cardEl(c, { tilt: true }); idleShimmer(nc, 1.5); slabCard.replaceWith(nc);
      resEl.innerHTML = `<b style="color:#fff">${res.label}</b><br>${res.result}`;
      const p = centerOf(slab);
      if (res.grade >= 9) { sfx.reveal(res.grade === 10 ? 'M' : 'R'); burst(p.x, p.y, { count: 80, colors: RARITY_FX.M, kind: 'star', speed: 8 }); shake(res.grade === 10); }
      else if (res.grade >= 7) { sfx.reveal('U'); burst(p.x, p.y, { count: 30, colors: RARITY_FX.U, speed: 5 }); }
      else if (res.grade <= 3) { sfx.shred(); shake(); }
      else sfx.coin();
      cont.style.visibility = 'visible';
    }, 1800);
  }
}

const EVENTS = {
  lost_booster: { icon: 'card-random', color: '#4cc9f0', title: 'Under the Shelf', text: 'Something glints in the dust: a sealed Booster Pack nobody bought.' },
  trader: { icon: 'swap-bag', color: '#b07cff', title: 'The Paper Crane', text: 'A folded-paper trader bows. "One of yours for one of mine — always a rarity higher. Same stars, same shine."' },
  gumball: { icon: 'slot-machine', color: '#ff6bd6', title: 'Gumball Machine', text: 'A dusty gumball machine full of capsules. Every capsule holds a SPECIAL EDITION card.' },
  dusty_box: { icon: 'mimic-chest', color: '#b07cff', title: 'The Humming Box', text: 'A cardboard box hums with violet light. Something inside bites — but it smells like rare foil.' },
  sticker: { icon: 'price-tag', color: '#ffd166', title: 'Sticker Gun Mishap', text: 'A malfunctioning price gun sprays coins everywhere… and some stickers stick to you. Permanently.' },
  card_doctor: { icon: 'bandage-roll', color: '#6dffb0', title: 'The Eraser Doctor', text: 'A kindly old eraser offers to patch you up — or buff out the cracks in a card.' },
};

function eventScreen() {
  music('calm');
  const p = run.pending, E = EVENTS[p.ev];
  const scr = h('div', { class: 'screen' });
  const scene = h('div', { class: 'scene', style: { '--nc': E.color + '55' } }, h('div', { class: 'big-ic', html: icon(E.icon) }), h('div', { class: 'h1' }, E.title), h('p', {}, E.text));
  const choices = h('div', { class: 'choices' });
  const done = (msg) => { if (msg) toast(msg); run.pending = null; afterNode(); };
  const ch = (label, small, fn, dis) => choices.append(h('button', { class: 'choice', disabled: dis, onclick: () => { sfx.tap(); fn(); } }, label, h('small', {}, small)));
  let arrActions = null, helpTxt = '';
  if (p.ev === 'lost_booster') { ch('Rip it open', 'A free Booster Pack.', () => openPackFlow(R.openPack(run, { type: 'booster' }), 'event')); ch('Leave it', 'Nothing happens.', () => done()); }
  if (p.ev === 'trader') {
    helpTxt = 'Tap a card below, then <b>Trade up</b>.';
    arrActions = (c, where, idx) => CARDS[c.id].r === 'M' ? [{ label: 'Already Mythic', cls: 'ghost small', disabled: true }] : [{ label: 'Trade up', cls: 'gold small', fn: () => {
      const nc = R.tradeUp(run, c); (where === 'row' ? run.row : run.bench)[idx] = nc; recordPull(nc); saveMeta(); sfx.reveal(CARDS[nc.id].r);
      zoomCard(nc, `You got <b>${CARDS[nc.id].name}</b>!`); done();
    } }];
    ch('Decline', 'Keep your cards as they are.', () => done());
  }
  if (p.ev === 'gumball') {
    ch('Spin — 6 coins', 'Get one random special-edition card.', () => { run.coins -= 6; sfx.buy(); const c = R.gumball(run); openPackFlow({ type: 'gumball', cards: [c], tell: null }, 'event'); }, run.coins < 6);
    ch('Walk away', 'Keep your coins.', () => done());
  }
  if (p.ev === 'dusty_box') {
    ch('Reach in', 'Lose 7 HP. Get a Cursed Pack (4 Void cards — keep at least one).', () => { run.hp = Math.max(1, run.hp - 7); sfx.hurt(); shake(); openPackFlow(R.openPack(run, { type: 'cursed' }), 'event'); });
    ch('Leave it', 'Probably wise.', () => done());
  }
  if (p.ev === 'sticker') {
    ch('Grab the coins', '+18 coins. Lose 4 max HP.', () => { run.coins += 18; run.maxHp -= 4; run.hp = Math.min(run.hp, run.maxHp); sfx.coin(); done('+18 coins, −4 max HP'); });
    ch('Duck and cover', 'Nothing happens.', () => done());
  }
  if (p.ev === 'card_doctor') {
    ch('Patch me up', 'Heal 12 HP.', () => { run.hp = Math.min(run.maxHp, run.hp + 12); sfx.heal(); done('+12 HP'); });
    if (R.allOwned(run).some(c => c.ed === 'cracked')) {
      helpTxt = 'Or tap a <b>Cracked</b> card below to repair it.';
      arrActions = (c) => c.ed === 'cracked' ? [{ label: 'Repair cracks', cls: 'gold small', fn: () => { c.ed = 'normal'; delete c.cracks; sfx.heal(); done(`${CARDS[c.id].name} repaired`); } }] : [];
    }
  }
  const arr = arranger(run, { onChange: save, merge: !arrActions, actions: arrActions || ((c, w, i) => [{ label: `Sell +${R.sellValue(run, c)}`, cls: 'ghost small', fn: () => arr.sell(w, i) }]) });
  scr.append(topbarRun(), h('div', { class: 'scroll', style: { flex: '1' } }, scene, choices, helpTxt ? h('div', { class: 'helpline', html: helpTxt }) : null), arr.detail, arr.el);
  mount(scr);
}

// ===========================================================================
// END
// ===========================================================================
function recordRunEnd(win) {
  meta.stats.runs++;
  if (win) meta.stats.wins++;
  meta.stats.bestFloor = Math.max(meta.stats.bestFloor, run.floor);
  if (win && !run.daily && run.heat >= meta.heatMax && meta.heatMax < 8) meta.heatMax = run.heat + 1;
  if (run.daily) { const d = meta.daily[run.daily] || { floor: 0, win: false }; d.floor = Math.max(d.floor, run.floor); d.win = d.win || win; meta.daily[run.daily] = d; }
  saveMeta();
}

function endScreen() {
  const win = run.over === 'win';
  if (!run.recorded) { run.recorded = true; recordRunEnd(win); save(); }
  music(null);
  const scr = h('div', { class: 'screen' });
  const H = HEROES[run.hero];
  const body = h('div', { class: 'scroll center', style: { flex: '1', 'justify-content': 'center', gap: '12px', padding: '20px' } });
  body.append(h('div', { class: 'h1', style: { 'font-size': '46px', color: win ? '#6dffb0' : '#ff5d73' } }, win ? 'YOU WON!' : 'RUN OVER'),
    h('div', { class: 'sub', style: { 'font-size': '15px' } }, win ? `${H.name} conquered the shop${run.heat ? ' at Heat ' + run.heat : ''}.` : `${H.name} fell on floor ${run.floor} (Act ${run.act})${run.killedBy ? ' to ' + run.killedBy : ''}.`));
  body.append(h('div', { class: 'endstats', html: `<div><b>${run.floor}</b><span>Floors</span></div><div><b>${run.stats.fights}</b><span>Fights won</span></div><div><b>${run.stats.packs}</b><span>Packs ripped</span></div>` }));
  const fan = h('div', { style: { display: 'flex', gap: '6px', 'justify-content': 'center', 'flex-wrap': 'wrap' } });
  run.row.filter(Boolean).forEach(c => { const el = cardEl(c, { cw: '70px' }); el.addEventListener('click', () => zoomCard(c)); fan.append(el); });
  body.append(h('div', { class: 'sub' }, 'Your final row'), fan);
  if (win && !run.daily && meta.heatMax > (run.heat || 0)) body.append(h('div', { class: 'unlock done', html: `${icon('flame')}<span><b>HEAT ${meta.heatMax}</b> unlocked: ${R.HEAT[meta.heatMax]}</span>` }));
  const btns = h('div', { class: 'menu', style: { 'margin-top': '10px' } },
    h('button', { class: 'btn gold', onclick: () => { sfx.tap(); run = null; clearRun(); heroSelect(); } }, 'New run'),
    h('button', { class: 'btn ghost', onclick: () => { sfx.tap(); run = null; clearRun(); title(); } }, 'Title'));
  body.append(btns);
  scr.append(body);
  mount(scr);
  if (win) { sfx.win(); const p = centerOf(body); setTimeout(() => burst(p.x, p.y * 0.6, { count: 140, colors: RARITY_FX.M, kind: 'confetti', speed: 11, lift: 4 }), 200); }
  else sfx.lose();
}

// ===========================================================================
// BINDER
// ===========================================================================
function binder(fromRun) {
  let tab = 'base';
  const scr = h('div', { class: 'screen' });
  const back = () => { sfx.back(); fromRun && run ? resume() : title(); };
  const top = h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', onclick: back, html: icon('anticlockwise-rotation') }), h('span', { class: 'h1' }, 'Binder'), h('span', { class: 'spacer' }), h('span', { class: 'pill' }, `${distinctPulled()}/${CARD_LIST.length}`));
  const tabs = h('div', { class: 'tabs' });
  const page = h('div', { class: 'scroll', style: { flex: '1' } });
  const sets = unlockedSets();
  function render() {
    tabs.innerHTML = '';
    for (const s of SET_ORDER) {
      const S = SETS[s];
      tabs.append(h('div', { class: 'tab' + (tab === s ? ' on' : '') + (sets.includes(s) ? '' : ' lock'), style: { '--k': S.color }, html: icon(S.glyph) + S.name, onclick: () => { tab = s; sfx.tap(); render(); } }));
    }
    tabs.append(h('div', { class: 'tab' + (tab === 'unlocks' ? ' on' : ''), style: { '--k': '#6dffb0' }, html: icon('padlock') + 'Unlocks', onclick: () => { tab = 'unlocks'; sfx.tap(); render(); } }));
    page.innerHTML = '';
    if (tab === 'unlocks') {
      const ul = h('div', { class: 'unlocks' });
      for (const u of UNLOCKS) {
        const ok = u.test(); const pr = u.prog ? u.prog() : null;
        ul.append(h('div', { class: 'unlock' + (ok ? ' done' : ''), html: `${icon(ok ? 'star-swirl' : 'padlock')}<div><div style="color:#fff">${u.text}</div><div class="sub" style="font-size:12px">${ok ? 'Unlocked' : u.req}${pr && !ok ? ` (${Math.min(pr[0], pr[1])}/${pr[1]})` : ''}</div></div>` }));
      }
      ul.append(h('div', { class: 'sub', style: { 'margin-top': '10px' }, html: `Runs: ${meta.stats.runs} · Wins: ${meta.stats.wins} · Best floor: ${meta.stats.bestFloor} · Cards pulled: ${meta.stats.pulls} · Mythics: ${meta.stats.mythics}` }));
      page.append(ul); return;
    }
    const cards = CARD_LIST.filter(c => c.set === tab);
    const have = cards.filter(c => meta.binder[c.id]).length;
    page.append(h('div', { style: { padding: '4px 14px 2px', display: 'flex', 'justify-content': 'space-between', 'font-weight': 800, 'font-size': '13px' } },
      h('span', {}, SETS[tab].name + (sets.includes(tab) ? '' : ' (locked — not in packs yet)')), h('span', { style: { color: 'var(--muted)' } }, `${have}/${cards.length}`)));
    page.append(h('div', { class: 'progress', html: `<i style="width:${have / cards.length * 100}%"></i>` }));
    const grid = h('div', { class: 'binder-page' });
    for (const d of cards) {
      const b = meta.binder[d.id];
      if (!b) { grid.append(h('div', { class: 'pocket empty' }, h('span', {}, '?'))); continue; }
      const inst = { id: d.id, star: 1, ed: b.ed };
      const pk = h('div', { class: 'pocket' }, cardEl(inst), h('span', { class: 'cnt' }, '×' + b.n));
      if (b.ed !== 'normal') idleShimmer(pk.firstChild);
      pk.addEventListener('click', () => { sfx.tap(); zoomCard(inst, `Pulled ${b.n}×`); });
      grid.append(pk);
    }
    page.append(grid);
  }
  render();
  scr.append(top, tabs, page);
  mount(scr);
}

// ===========================================================================
// SETTINGS
// ===========================================================================
function settings() {
  sfx.tap();
  const row = (label, key, after) => {
    const t = h('button', { class: 'toggle' + (meta.settings[key] ? ' on' : ''), 'aria-label': label });
    t.addEventListener('click', () => { meta.settings[key] = !meta.settings[key]; t.classList.toggle('on'); saveMeta(); applySettings(); after && after(); sfx.tap(); });
    return h('div', { class: 'setting' }, h('span', {}, label), t);
  };
  const items = [h('div', { class: 'h2' }, 'Settings'),
    row('Sound effects', 'sound'), row('Music', 'music', () => { const m = meta.settings.music; music(null); if (m) music('calm'); }), row('Reduce motion', 'reduceMotion'),
    h('button', { class: 'btn ghost small', style: { width: '100%', 'margin-top': '12px' }, onclick: () => enableGyro() }, 'Enable tilt-to-shine (phone)')];
  if (run && !run.over) items.push(h('button', { class: 'btn ghost small', style: { width: '100%', 'margin-top': '10px' }, onclick: () => { m.close(); confirmAbandon(title); } }, 'Abandon run'));
  items.push(h('button', { class: 'btn ghost small', style: { width: '100%', 'margin-top': '10px' }, onclick: () => { m.close(); title(); } }, 'Back to title'));
  items.push(h('button', { class: 'btn ghost small', style: { width: '100%', 'margin-top': '22px', color: '#ff8a9b' }, onclick: () => {
    if (!confirm('Erase ALL HOLO progress (binder, unlocks, heat)? This cannot be undone.')) return;
    try { localStorage.removeItem('holo.meta.v1'); localStorage.removeItem('holo.run.v1'); } catch (e) {}
    location.reload();
  } }, 'Reset all progress'));
  items.push(h('div', { class: 'sub', style: { 'margin-top': '12px', 'font-size': '11px' } }, 'HOLO v1 · Card icons by Lorc, Delapouite & contributors at game-icons.net (CC BY 3.0).'));
  const m = modal(items);
}

// ===========================================================================
// debug hooks (for testing)
// ===========================================================================
window.__holo = {
  get run() { return run; }, meta, R, CARDS,
  give(id, ed = 'normal', star = 1) { const c = R.newCard(run, id, ed, star); const i = run.bench.indexOf(null); if (i >= 0) run.bench[i] = c; else run.row[run.row.indexOf(null)] = c; save(); resume(); return c; },
  coins(n) { run.coins += n; save(); resume(); },
  pack(type = 'booster', set) { openPackFlow(R.openPack(run, { type, set }), 'map'); },
  // debug: open a booster containing exactly these pulls, e.g. pull([['jab','holo'],['jab','cracked']])
  pull(list) { const res = R.openPack(run, { type: 'booster' }); res.cards = list.map(([id, ed = 'normal', star = 1]) => R.newCard(run, id, ed, star)); openPackFlow(res, 'map'); },
  fight(kind = 'fight') { R.startBattle(run, kind); save(); battleFlow(); },
  goto(fn) { ({ title, binder, heroSelect, mapScreen, endScreen, resume })[fn](); },
  node(node, ev) { run.pending = { type: 'node', node, ev: ev || 'trader', shop: R.makeShop(run), line: 'Packs fresh from the back. Mostly.' }; save(); nodeScreen(); },
};

title();
