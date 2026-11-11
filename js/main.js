// HOLO — screens & flow.
import { CARDS, CARD_LIST, SETS, SET_ORDER, HEROES, PACKS, RARITY, ENEMIES } from './data.js';
import * as R from './run.js';
import { hashStr } from './rng.js';
import { h, $, $$, icon, cardEl, attachTilt, idleShimmer, enableGyro, toast, modal, zoomCard, arranger, detailSheet, pillHp, pillCoins, packColors, packName, packIcon } from './ui.js';
import { packScreen } from './pack.js';
import { battleScreen } from './battle.js';
import { sfx, music, unlockAudio, audioSettings } from './audio.js';
import { initFx, burst, centerOf, banner, shake, setReduceMotion, RARITY_FX } from './fx.js';
import { meta, saveMeta, loadRun, saveRun, clearRun, UNLOCKS, unlockedSets, heroUnlocked, snapshotUnlocks, distinctPulled, todayKey, recordPull } from './meta.js';

const app = $('#app');
initFx(app, $('#fx'));
let run = loadRun();
if (run && run.v !== 1) run = null;

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
  packScreen(ctxFor({ done: () => { run.openPack = null; save(); returnTo(ret); } }), result);
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
  boss: { icon: 'crowned-skull', color: '#ff4fd8', label: 'Boss' },
};
const ACT_NAME = { 1: 'The Bottom Shelf', 2: 'The Display Case', 3: 'The Back Room' };

function topbarRun(extra) {
  return h('div', { class: 'topbar' }, pillHp(run), pillCoins(run.coins), h('span', { class: 'spacer' }), ...(extra || []),
    h('button', { class: 'iconbtn', onclick: () => { sfx.tap(); binder(true); }, html: icon('card-draw') }),
    h('button', { class: 'iconbtn', onclick: settings, html: icon('gears') }));
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
    el.innerHTML = icon(nd.type === 'boss' ? ENEMIES[R.pickBossId(run)].icon : N.icon) + `<span class="lbl">${nd.type === 'boss' ? ENEMIES[R.pickBossId(run)].name : N.label}</span>`;
    if (can.has(nd.id)) el.addEventListener('click', () => { sfx.tap(); enter(nd.id); });
    map.append(el);
  }
  scrollEl.append(map);
  const legend = h('div', { class: 'legend', html: Object.entries(NODE).filter(([k]) => k !== 'boss').map(([k, n]) => `<span style="color:${n.color}">${icon(n.icon).replace('<svg', `<svg style="fill:${n.color}"`)}${n.label}</span>`).join('') });
  const banner2 = h('div', { class: 'actbanner' }, h('div', { class: 'sub', style: { 'font-weight': 900, 'letter-spacing': '.2em' } }, `ACT ${run.act} · FLOOR ${run.floor}${run.daily ? ' · DAILY' : ''}${run.heat ? ' · HEAT ' + run.heat : ''}`), h('div', { class: 'h2' }, ACT_NAME[run.act]));
  const arr = arranger(run, { onChange: save });
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
  body.append(lines);
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
  const allOpen = rew.packs.every((_, k) => p.opened.includes(k));
  const cont = h('button', { class: 'btn ' + (allOpen ? 'gold' : 'ghost'), style: { margin: '10px 16px calc(14px + env(safe-area-inset-bottom))' }, onclick: () => {
    if (!allOpen) { toast('Open your loot first!'); return; }
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
  const arr = arranger(run, { onChange: save, actions: arrActions || ((c, w, i) => [{ label: `Sell +${R.sellValue(run, c)}`, cls: 'ghost small', fn: () => arr.sell(w, i) }]) });
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
  fight(kind = 'fight') { R.startBattle(run, kind); save(); battleFlow(); },
  goto(fn) { ({ title, binder, heroSelect, mapScreen, endScreen, resume })[fn](); },
  node(node, ev) { run.pending = { type: 'node', node, ev: ev || 'trader', shop: R.makeShop(run), line: 'Packs fresh from the back. Mostly.' }; save(); nodeScreen(); },
};

title();
