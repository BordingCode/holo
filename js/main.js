// HOLO — screens & flow.
import { CARDS, CARD_LIST, SETS, SET_ORDER, HEROES, PACKS, RARITY, ENEMIES, RELICS, TACTICS } from './data.js?v=10';
import * as R from './run.js?v=10';
import { hashStr } from './rng.js?v=10';
import { h, $, $$, icon, cardEl, attachTilt, idleShimmer, enableGyro, toast, modal, zoomCard, arranger, detailSheet, pillHp, pillCoins, packColors, packName, packIcon } from './ui.js?v=10';
import { packScreen } from './pack.js?v=10';
import { backRoom, creditPill, runArrival, customersWaiting, SET_REWARD } from './backroom.js?v=10';
import { battleScreen } from './battle.js?v=10';
import { sfx, music, unlockAudio, audioSettings } from './audio.js?v=10';
import { initFx, burst, centerOf, banner, shake, setReduceMotion, RARITY_FX } from './fx.js?v=10';
import { meta, saveMeta, loadRun, saveRun, clearRun, UNLOCKS, unlockedSets, heroUnlocked, snapshotUnlocks, distinctPulled, todayKey, recordPull, boxCost, boxCapacity, addToCollection, removeFromCollection, takeHomeCount, runCredit } from './meta.js?v=10';

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
  $$('.screen, .modal-bg, .zoom, .banner, .float, .grader', app).forEach(e => e.remove());
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
  menu.append(h('button', { class: 'btn backroom-btn', onclick: () => { sfx.tap(); openBackRoom(); }, html: `${icon('shop')}<span>The Back Room</span><em>${icon('gems')}${meta.credit} · ${meta.collection.length} cards${customersWaiting() ? ` · ${customersWaiting()} waiting` : ''}</em>` }));
  menu.append(h('div', { style: { display: 'flex', gap: '10px' } },
    h('button', { class: 'btn ghost', style: { flex: '1' }, onclick: () => { sfx.tap(); binder(); } }, `Binder ${distinctPulled()}/${CARD_LIST.length}`),
    h('button', { class: 'btn ghost', style: { flex: 'none', padding: '0 16px' }, onclick: settings, html: icon('gears') + '' }) ));
  menu.lastChild.lastChild.querySelector('svg').style.cssText = 'width:24px;height:24px;fill:#fff';
  wrap.append(h('h1', { class: 'logo-big' }, 'HOLO'), h('div', { class: 'tagline' }, 'rip packs · build combos · beat the shop'), fan, menu);
  scr.append(wrap, h('div', { class: 'foot', html: `Runs ${meta.stats.runs} · Wins ${meta.stats.wins}${meta.heatMax ? ' · Heat ' + meta.heatMax : ''} · Icons: game-icons.net (CC BY 3.0)` }));
  mount(scr);
}

function openBackRoom() { backRoom({ mount, back: title }); }

function confirmAbandon(then) {
  const m = modal([h('div', { class: 'h2' }, 'Abandon your run?'), h('p', { class: 'sub', html: 'Your current run will count as a loss.' + (run && R.boxedSurvivors(run).length ? ' <b style="color:#ff8a8a">Your Deck Box cards will be shredded.</b>' : '') }),
    h('div', { style: { display: 'flex', gap: '10px', 'margin-top': '10px' } },
      h('button', { class: 'btn ghost', style: { flex: '1' }, onclick: () => m.close() }, 'Keep it'),
      h('button', { class: 'btn', style: { flex: '1' }, onclick: () => { m.close(); run.over = 'lose'; recordRunEnd(false); run = null; clearRun(); then(); } }, 'Abandon'))]);
}

// Collection sorted best-first: rarity, stars, edition.
function sortedCollection() {
  const RR = { C: 0, U: 1, R: 2, M: 3 }, ER = { normal: 0, cracked: 1, misprint: 2, gilded: 3, foil: 4, holo: 5 };
  return meta.collection.slice().sort((a, b) => (RR[CARDS[b.id].r] - RR[CARDS[a.id].r]) || (b.star - a.star) || (ER[b.ed] - ER[a.ed]) || CARDS[a.id].name.localeCompare(CARDS[b.id].name));
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
  const boxEl = h('div');
  let box = []; // collection cids
  const boxUsed = () => box.reduce((s, cid) => { const k = meta.collection.find(k => k.cid === cid); return s + (k ? boxCost(k) : 0); }, 0);
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
    renderBox();
  }
  function renderBox() {
    const cap = boxCapacity(heat);
    // heat may have shrunk the box: drop cards from the end until it fits
    while (boxUsed() > cap) box.pop();
    boxEl.innerHTML = '';
    const pips = h('span', { class: 'box-pips' }, ...Array.from({ length: cap }, (_, i) => h('i', { class: i < boxUsed() ? 'on' : '' })));
    const head = h('div', { class: 'box-head' }, h('span', { html: `${icon('locked-chest')}<b>Deck Box</b>` }), pips);
    const slots = h('div', { class: 'box-cards' });
    box.forEach(cid => { const k = meta.collection.find(k => k.cid === cid); if (k) slots.append(h('div', {}, cardEl(k, { mini: true }))); });
    const has = meta.collection.filter(k => !k.grade).length;
    const note = h('div', { class: 'sub', html: has
      ? `Bring cards from your collection. Commons & Uncommons take 1 space, Rares 2, Mythics 3.${cap < meta.boxCap ? ` <b>Heat shrinks your box to ${cap}.</b>` : ''} <b style="color:#ff8a8a">Lose the run and they are shredded.</b>`
      : 'Your collection is empty. After each run you take cards home — bring them back here to start stronger. But if you lose, the cards you brought are shredded.' });
    const btn = has ? h('button', { class: 'btn ghost small', onclick: () => { sfx.tap(); pickBox(); } }, box.length ? 'Change' : 'Choose cards') : null;
    boxEl.append(h('div', { class: 'deckbox' }, head, box.length ? slots : null, note, btn));
  }
  function pickBox() {
    const grid = h('div', { class: 'coll-grid' });
    const cap = boxCapacity(heat);
    const capEl = h('div', { class: 'sub' });
    const draw = () => {
      grid.innerHTML = '';
      capEl.innerHTML = `Space used: <b>${boxUsed()}/${cap}</b>`;
      sortedCollection().filter(k => !k.grade).forEach(k => {
        const on = box.includes(k.cid);
        const fits = on || boxUsed() + boxCost(k) <= cap;
        const el = h('div', { class: 'coll-item' + (on ? ' on' : '') + (fits ? '' : ' nofit') }, cardEl(k, { mini: true }), h('span', { class: 'cost' }, '◆'.repeat(boxCost(k))));
        el.addEventListener('click', () => {
          if (on) box = box.filter(c => c !== k.cid);
          else if (fits) box.push(k.cid); else { toast('Not enough space in the Deck Box'); return; }
          sfx.tap(); draw();
        });
        grid.append(el);
      });
    };
    draw();
    const m = modal([h('div', { class: 'h2' }, 'Pack your Deck Box'), capEl, grid,
      h('button', { class: 'btn gold', style: { width: '100%', 'margin-top': '10px' }, onclick: () => { m.close(); renderBox(); } }, 'Done')], { onClose: renderBox });
  }
  startBtn.addEventListener('click', () => {
    sfx.tap(); meta.lastHeat = heat; saveMeta();
    // brought cards leave the collection now; they come back only if the run is won
    const brought = removeFromCollection(box);
    run = R.newRun({ hero: pick, heat, unlockedSets: unlockedSets(), box: brought });
    saveMeta(); save(); mapScreen(true);
    if (brought.length) toast(`<b>Deck Box packed</b> — ${brought.length} card${brought.length > 1 ? 's' : ''} at stake. Win to bring ${brought.length > 1 ? 'them' : 'it'} home.`, 3200);
  });
  render();
  scr.append(top, h('div', { class: 'scroll', style: { flex: '1' } }, list, boxEl, heatBox), startBtn);
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

function mapScreen(fresh) {
  music('calm');
  const scr = h('div', { class: 'screen' });
  const rows = run.map.rows;
  const RH = 96, H = rows.length * RH + 70;
  const can = new Set(R.reachable(run));
  const scrollEl = h('div', { class: 'map-scroll' });
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
    if (can.has(nd.id)) el.addEventListener('click', () => { sfx.tap(); enter(nd.id); });
    map.append(el);
  }
  scrollEl.append(map);
  const legend = h('div', { class: 'legend', html: Object.entries(NODE).filter(([k]) => k !== 'boss').map(([k, n]) => `<span style="color:${n.color}">${icon(n.icon).replace('<svg', `<svg style="fill:${n.color}"`)}${n.label}</span>`).join('') });
  const banner2 = h('div', { class: 'actbanner' }, h('div', { class: 'sub', style: { 'font-weight': 900, 'letter-spacing': '.2em' } }, `ACT ${run.act} · FLOOR ${run.floor}${run.daily ? ' · DAILY' : ''}${run.heat ? ' · HEAT ' + run.heat : ''}`), h('div', { class: 'h2' }, ACT_NAME[run.act]));
  const arr = arranger(run, { onChange: save, merge: true });
  scr.append(topbarRun(), banner2, legend, scrollEl, arr.detail, arr.el);
  mount(scr);
  // scroll so the next choices are visible
  requestAnimationFrame(() => {
    const curRow = run.pos == null ? 0 : R.nodeById(run, run.pos).r + 1;
    scrollEl.scrollTop = Math.max(0, H - 50 - curRow * RH - scrollEl.clientHeight * 0.6);
  });
  if (fresh && run.floor === 0 && run.act === 1 && !meta.seen) {
    meta.seen = true; saveMeta();
    setTimeout(() => modal([h('div', { class: 'h2' }, 'How HOLO works'),
      h('div', { class: 'sub', style: { 'font-size': '14px', 'margin-top': '8px' }, html: `
        <p><b style="color:#fff">Your row of 6 cards fires left → right</b> every round of a fight. Order matters: buffs boost the card after them, Mirror copies the card to its left.</p>
        <p><b style="color:#fff">Win fights → rip packs.</b> Keep the pulls you like, merge duplicates for ★, and sell the rest for coins.</p>
        <p><b style="color:#fff">Pick your path</b> up the shelf. Beat three bosses to win. If your HP hits 0, the run is over.</p>
        <p>Tap the pulsing node below to start.</p>` }),
      h('button', { class: 'btn gold', style: { width: '100%', 'margin-top': '6px' }, onclick: e => e.target.closest('.modal-bg').remove() }, "Let's rip")]), 400);
  }
}

function enter(id) {
  const nd = R.enterNode(run, id);
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
  if (win && !run.daily && meta.heatMax > (run.heat || 0)) body.append(h('div', { class: 'unlock done', html: `${icon('flame')}<span><b>HEAT ${meta.heatMax}</b> unlocked: ${R.HEAT[meta.heatMax]}</span>` }));
  // ---- Credit for the Back Room ----
  if (!run.credit) { run.credit = runCredit(run, win); meta.credit += run.credit.total; run.newCustomer = runArrival(); saveMeta(); save(); }
  body.append(h('div', { class: 'credit-gain', html: `${icon('gems')}<b>+${run.credit.total} Credit</b><span>${run.credit.display ? `run ${run.credit.base} + display case ${run.credit.display}` : 'spend it in the Back Room'}${run.newCustomer ? ' · a customer just walked in' : ''}</span>` }));
  // ---- Deck Box result ----
  const boxed = R.boxedSurvivors(run), lostBox = (run.box || []).length;
  if (win && boxed.length && !run.boxReturned) { boxed.forEach(c => addToCollection(c)); run.boxReturned = true; } // once, even across reloads
  if (boxed.length || lostBox) {
    const row = h('div', { class: 'endfan' + (win ? '' : ' shredded') });
    boxed.forEach(c => row.append(h('div', { class: 'shred-wrap' }, cardEl(c, { cw: '62px' }))));
    body.append(h('div', { class: 'sub', html: win ? `<b style="color:#6dffb0">Deck Box returned</b> — ${boxed.length} card${boxed.length === 1 ? '' : 's'} back in your collection.`
      : `<b style="color:#ff5d73">Deck Box shredded</b> — the ${lostBox} card${lostBox === 1 ? '' : 's'} you brought ${lostBox === 1 ? 'is' : 'are'} gone.` }));
    if (boxed.length) body.append(row);
  }
  // ---- take cards home ----
  const pool = R.takeHomePool(run);
  const n = Math.min(takeHomeCount(win), pool.length);
  let picked = run.homePicked || [];
  const btns = h('div', { class: 'menu', style: { 'margin-top': '10px' } });
  const takeBtn = h('button', { class: 'btn gold' });
  const fan = h('div', { class: 'endfan' });
  const heading = h('div', { class: 'sub' });
  const leave = then => {
    if (!run.homeDone) {
      run.homeDone = true;
      pool.filter(c => picked.includes(c.uid)).forEach(c => addToCollection(c));
      saveMeta(); save();
    }
    run = null; clearRun(); then();
  };
  function drawPick() {
    fan.innerHTML = '';
    pool.forEach(c => {
      const on = picked.includes(c.uid);
      const el = h('div', { class: 'take' + (on ? ' on' : '') }, cardEl(c, { cw: '70px' }));
      if (!run.homeDone) el.addEventListener('click', () => {
        if (on) picked = picked.filter(u => u !== c.uid);
        else if (picked.length < n) picked.push(c.uid);
        else if (n === 1) picked = [c.uid];
        else { toast(`You can take ${n} home`); return; }
        run.homePicked = picked; save(); sfx.tap(); drawPick();
      });
      fan.append(el);
    });
    heading.innerHTML = n ? `<b>Take ${n} card${n > 1 ? 's' : ''} home</b> to your collection${win ? '' : ' — the rest is lost'} · ${picked.length}/${n}` : 'Your final row';
    takeBtn.textContent = picked.length ? `Take ${picked.length} home & new run` : 'New run';
  }
  drawPick();
  body.append(heading, fan);
  takeBtn.addEventListener('click', () => { sfx.tap(); leave(heroSelect); });
  btns.append(takeBtn, h('button', { class: 'btn ghost', onclick: () => { sfx.tap(); leave(title); } }, 'Title'));
  body.append(btns);
  saveMeta(); save();
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
      const done = (meta.setsDone || []).includes(s);
      tabs.append(h('div', { class: 'tab' + (tab === s ? ' on' : '') + (sets.includes(s) ? '' : ' lock') + (done ? ' done' : ''), style: { '--k': S.color }, html: icon(S.glyph) + S.name + (done ? ' ★' : ''), onclick: () => { tab = s; sfx.tap(); render(); } }));
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
      h('span', {}, SETS[tab].name + (sets.includes(tab) ? '' : ' (locked — not in packs yet)')), h('span', { style: { color: have === cards.length ? 'var(--gold)' : 'var(--muted)' } }, have === cards.length ? `COMPLETE ★ ${have}/${cards.length}` : `${have}/${cards.length} · complete it for ${SET_REWARD} Credit`)));
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
  goto(fn) { ({ title, binder, heroSelect, mapScreen, endScreen, resume, backRoom: openBackRoom })[fn](); },
  credit(n) { meta.credit += n; saveMeta(); },
  node(node, ev) { run.pending = { type: 'node', node, ev: ev || 'trader', shop: R.makeShop(run), line: 'Packs fresh from the back. Mostly.' }; save(); nodeScreen(); },
};

title();
