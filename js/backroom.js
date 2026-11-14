// HOLO — the Back Room: your card shop between runs.
// Collection (sell / grade / merge / display), sealed packs bought with Credit, upgrades.
import { CARDS, CARD_LIST, SET_ORDER, RARITY, EDITIONS, SETS, PACKS } from './data.js?v=11';
import * as R from './run.js?v=11';
import { h, $, icon, cardEl, toast, modal, zoomCard, doMerge, packName, idleShimmer } from './ui.js?v=11';
import { packScreen } from './pack.js?v=11';
import { sfx, music } from './audio.js?v=11';
import { burst, centerOf, banner, shake, RARITY_FX } from './fx.js?v=11';
import { meta, saveMeta, unlocked, unlockedSets, creditValue, GRADE_PRICE, HOME_PACKS, UPGRADES, buyUpgrade, displaySlots, displayIncome } from './meta.js?v=11';
import { makeCustomer, arrivals, matches, requestText, REGULARS, dayNumber, MAX_WAITING } from './customers.js?v=11';
import { GRADE_NAMES, centeringScore, surfaceScore, rollCorner, cornersScore, finalGrade } from './grade.js?v=11';

let env; // { mount, back }
const RR = { C: 0, U: 1, R: 2, M: 3 }, ER = { normal: 0, cracked: 1, misprint: 2, gilded: 3, foil: 4, holo: 5 };
const sorted = list => list.slice().sort((a, b) => ((b.grade || 0) - (a.grade || 0)) || (RR[CARDS[b.id].r] - RR[CARDS[a.id].r]) || (b.star - a.star) || (ER[b.ed] - ER[a.ed]) || CARDS[a.id].name.localeCompare(CARDS[b.id].name));
const find = cid => meta.collection.find(k => k.cid === cid);

// ---- customers ----------------------------------------------------------------------------------
function ensureCustomerState() {
  meta.customers ||= []; meta.custSeq ||= 0;
  meta.custSeed ||= (Math.random() * 2 ** 31) >>> 0;
}
function addCustomer() {
  ensureCustomerState();
  if (meta.customers.length >= MAX_WAITING) return false;
  meta.customers.push(makeCustomer(++meta.custSeq, { sets: unlockedSets(), seed: meta.custSeed, waiting: meta.customers }));
  return true;
}
// Called when the Back Room opens: one customer per calendar day since the last visit (queue max 3).
function dailyArrivals() {
  ensureCustomerState();
  const today = dayNumber();
  if (meta.custDay == null) { addCustomer(); addCustomer(); meta.custDay = today; saveMeta(); return 2; } // first visit: two regulars waiting
  const n = arrivals(meta.customers.length, today - meta.custDay);
  for (let i = 0; i < n; i++) addCustomer();
  if (today !== meta.custDay) { meta.custDay = today; saveMeta(); }
  return n;
}
// Called once per finished run: one more customer walks in (if there's room).
export function runArrival() { const ok = addCustomer(); if (ok) saveMeta(); return ok; }
// ---- milestones: set releases & completed binder pages ---------------------------------------------
export const SET_REWARD = 50;
function milestones() {
  meta.flags ||= {};
  const out = [];
  if (unlocked('vintage') && !meta.flags.vintageReleased) {
    meta.flags.vintageReleased = true;
    out.push(() => {
      banner('NEW SET RELEASED', 'Vintage — now in every pack', SETS.vintage.color); sfx.jackpot();
      setTimeout(() => {
        const fan = h('div', { class: 'release-fan' });
        ['heirloom', 'golden_age', 'mint_condition'].forEach((id, i) => { const c = cardEl({ id, star: 1, ed: i === 1 ? 'holo' : 'normal' }, { tilt: true }); if (i === 1) idleShimmer(c, 1.2); c.addEventListener('click', () => zoomCard({ id, star: 1, ed: i === 1 ? 'holo' : 'normal' })); fan.append(c); });
        const m = modal([h('div', { class: 'h2', style: { color: SETS.vintage.color } }, 'Vintage is out!'),
          h('div', { class: 'sub', html: '12 first editions from the back of the shop. They <b>love ★ stars</b> (merge your copies!) and <b>special editions</b>. Find them in every pack, in runs and here.' }), fan,
          h('button', { class: 'btn gold', style: { width: '100%', 'margin-top': '12px' }, onclick: () => m.close() }, 'Can\'t wait')]);
      }, 1800);
    });
  }
  meta.setsDone ||= [];
  for (const s of SET_ORDER) {
    if (meta.setsDone.includes(s)) continue;
    const cards = CARD_LIST.filter(c => c.set === s);
    if (cards.length && cards.every(c => meta.binder[c.id])) {
      meta.setsDone.push(s); meta.credit += SET_REWARD;
      out.push(() => { banner('SET COMPLETE', `${SETS[s].name} binder page · +${SET_REWARD} Credit`, SETS[s].color); sfx.win(); });
    }
  }
  if (out.length) { saveMeta(); out.forEach((f, i) => setTimeout(f, 500 + i * 2600)); }
}

export const customersWaiting = () => (meta.customers || []).length;
export const creditPill = () => h('span', { class: 'pill credit', html: `${icon('gems')}<span>${meta.credit}</span>` });

// A graded card sealed in its slab.
export function slabEl(k, o = {}) {
  const c = cardEl(k, o.mini ? { mini: true } : {});
  return h('div', { class: 'slab' + (k.grade === 10 ? ' gem' : '') },
    h('div', { class: 'slab-lab' }, h('span', {}, CARDS[k.id].name), h('b', {}, String(k.grade)), h('small', {}, GRADE_NAMES[k.grade])), h('div', { class: 'slab-win' }, c));
}

export function backRoom(e) {
  env = e || env;
  music('calm');
  if (meta.homePack) return openHomePack(meta.homePack);
  const scr = h('div', { class: 'screen backroom' });
  const top = h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', onclick: () => { sfx.back(); env.back(); }, html: icon('anticlockwise-rotation') }),
    h('span', { class: 'h1' }, 'The Back Room'), h('span', { class: 'spacer' }), creditPill());
  const body = h('div', { class: 'scroll', style: { flex: '1' } });
  milestones();
  const arrived = dailyArrivals();
  if (arrived > 1 && meta.custSeq > 2) setTimeout(() => toast(`Welcome back! <b>${arrived} new customers</b> came by while you were away.`, 2800), 300);

  // ---- customers ----
  const counterSec = h('div', { class: 'br-sec' }, h('div', { class: 'br-head' }, h('b', {}, 'At the counter'),
    h('span', { class: 'sub' }, meta.customers.length ? 'They\'ll wait as long as it takes' : 'A new customer comes in each day, and after every run')));
  const queue = h('div', { class: 'queue' });
  meta.customers.forEach(c => queue.append(customerEl(c)));
  if (!meta.customers.length) queue.append(h('div', { class: 'cust empty' }, 'The shop is quiet. Go rip some packs.'));
  counterSec.append(queue);
  body.append(counterSec);

  // ---- display case ----
  const n = displaySlots();
  meta.display = meta.display.filter(cid => { const k = find(cid); return k && k.grade; }).slice(0, n);
  const shelf = h('div', { class: 'shelf' });
  for (let i = 0; i < n; i++) {
    const k = meta.display[i] && find(meta.display[i]);
    const slot = h('div', { class: 'shelf-slot' + (k ? '' : ' empty') });
    if (k) { slot.append(slabEl(k, { mini: true })); slot.addEventListener('click', () => { sfx.tap(); cardSheet(k); }); }
    else slot.append(h('span', {}, 'Empty'));
    if (!k) slot.addEventListener('click', () => { sfx.tap(); toast(meta.collection.some(k => k.grade) ? 'Tap a graded card below, then <b>Put on display</b>.' : 'Grade a card first — only slabs go in the display case.', 2600); });
    shelf.append(slot);
  }
  const inc = displayIncome();
  body.append(h('div', { class: 'br-sec' },
    h('div', { class: 'br-head' }, h('b', {}, 'Display Case'), h('span', { class: 'sub', html: inc ? `Earns <b style="color:var(--gold)">+${inc} Credit</b> after every run` : 'Slabs here earn Credit every run' })),
    shelf));

  // ---- counter: packs + upgrades ----
  const counter = h('div', { class: 'br-counter' });
  for (const type in HOME_PACKS) {
    const P = HOME_PACKS[type], price = P.price;
    const btn = h('button', { class: 'br-pack', disabled: meta.credit < price, style: { '--pc': PACKS[type].color || '#c9b79c', '--pc2': PACKS[type].c2 || '#5a4630' } },
      h('span', { class: 'nm' }, type === 'set' ? 'Set Box' : PACKS[type].name), h('span', { class: 'pr', html: `${icon('gems')}${price}` }));
    btn.addEventListener('click', () => buyPack(type));
    counter.append(btn);
  }
  body.append(h('div', { class: 'br-sec' }, h('div', { class: 'br-head' }, h('b', {}, 'Sealed stock'), h('span', { class: 'sub' }, 'Open packs for your collection')), counter));
  const upg = h('div', { class: 'br-upgs' });
  for (const key in UPGRADES) {
    const U = UPGRADES[key], lvl = meta.upg[key], L = U.levels[lvl];
    const b = h('button', { class: 'br-upg', disabled: !L || meta.credit < L.price, html: `${icon(U.icon)}<span><b>${U.name}</b><small>${L ? L.text : 'Fully upgraded'}</small></span>${L ? `<em>${icon('gems')}${L.price}</em>` : '<em>MAX</em>'}` });
    if (L) b.addEventListener('click', () => { if (buyUpgrade(key)) { sfx.buy(); toast(`<b>${U.name}</b> — ${L.text}`); backRoom(); } });
    upg.append(b);
  }
  body.append(h('div', { class: 'br-sec' }, h('div', { class: 'br-head' }, h('b', {}, 'Upgrades')), upg));

  // ---- collection ----
  const list = sorted(meta.collection);
  const grid = h('div', { class: 'coll-grid big' });
  list.forEach(k => {
    const el = h('div', { class: 'coll-item' + (meta.display.includes(k.cid) ? ' shown' : '') }, k.grade ? slabEl(k, { mini: true }) : cardEl(k, { mini: true }));
    if (k.grade) el.classList.add('graded');
    el.addEventListener('click', () => { sfx.tap(); cardSheet(k); });
    grid.append(el);
  });
  const worth = meta.collection.reduce((s, k) => s + creditValue(k), 0);
  body.append(h('div', { class: 'br-sec' },
    h('div', { class: 'br-head' }, h('b', {}, `Collection · ${list.length}`), h('span', { class: 'sub', html: list.length ? `Worth ${icon('gems')}${worth}` : '' })),
    list.length ? grid : h('div', { class: 'sub', style: { padding: '8px 2px' } }, 'Empty for now. At the end of every run you take cards home — and packs bought here land straight in your collection.')));
  scr.append(top, body);
  env.mount(scr);
}

// ---- a customer at the counter ----------------------------------------------------------------
function payText(pay) {
  const parts = [];
  if (pay.credit) parts.push(`${icon('gems')}${pay.credit}`);
  if (pay.pack) parts.push(`${icon('open-treasure-chest')}${PACKS[pay.pack].name}`);
  return parts.join(' + ');
}
function customerEl(c) {
  const Rg = REGULARS[c.who];
  const fits = meta.collection.filter(k => matches(c.req, k));
  const el = h('div', { class: 'cust', style: { '--cc': Rg.color } },
    h('div', { class: 'ava', html: icon(Rg.icon) }),
    h('div', { class: 'cbody' },
      h('div', { class: 'cname', html: `<b>${Rg.name}</b><span>${Rg.tag}</span>` }),
      h('div', { class: 'say', html: `“${c.hi} ${requestText(c.req)}.”` }),
      h('div', { class: 'crow' },
        h('span', { class: 'pay', html: payText(c.pay) }),
        h('button', { class: 'btn small ' + (fits.length ? 'gold' : 'ghost'), disabled: !fits.length, onclick: () => { sfx.tap(); serve(c); } }, fits.length ? `Serve (${fits.length} fit)` : 'Nothing fits yet'))));
  return el;
}
function serve(c) {
  const Rg = REGULARS[c.who];
  const fits = sorted(meta.collection.filter(k => matches(c.req, k))).reverse(); // cheapest first
  const grid = h('div', { class: 'coll-grid' });
  let m;
  fits.forEach(k => {
    const el = h('div', { class: 'coll-item' }, k.grade ? slabEl(k, { mini: true }) : cardEl(k, { mini: true }), h('span', { class: 'cost', html: `${creditValue(k)}` }));
    el.addEventListener('click', () => {
      const v = creditValue(k);
      if (v > (c.pay.credit || 0) && !c.pay.pack && !confirm(`${CARDS[k.id].name} would sell for ${v} Credit, but ${Rg.name} pays ${c.pay.credit}. Hand it over anyway?`)) return;
      m.close(); handOver(c, k);
    });
    grid.append(el);
  });
  m = modal([h('div', { class: 'h2' }, `${Rg.name} wants ${requestText(c.req).replace(/<[^>]+>/g, '')}`),
    h('div', { class: 'sub', html: `Pays ${payText(c.pay)}. Tap a card to hand it over — the small number is what it would sell for.` }), grid,
    h('div', { style: { display: 'flex', gap: '8px', 'margin-top': '12px' } },
      h('button', { class: 'btn ghost small', style: { flex: '1' }, onclick: () => { m.close(); } }, 'Not yet'),
      h('button', { class: 'btn ghost small', style: { flex: '1' }, onclick: () => { meta.customers = meta.customers.filter(x => x !== c); saveMeta(); sfx.back(); m.close(); toast(`${Rg.name} shrugs and heads out. Someone new will come by.`); backRoom(); } }, 'Send away'))]);
}
function handOver(c, k) {
  const Rg = REGULARS[c.who];
  meta.collection = meta.collection.filter(x => x !== k);
  meta.display = meta.display.filter(cid => cid !== k.cid);
  meta.customers = meta.customers.filter(x => x !== c);
  meta.credit += c.pay.credit || 0;
  meta.served = (meta.served || 0) + 1;
  saveMeta(); sfx.buy();
  toast(`<b>${Rg.name}:</b> “${Rg.bye}” <span style="color:var(--credit)">+${c.pay.credit || 0} Credit</span>`, 2600);
  if (c.pay.pack) return giftPack(c.pay.pack);
  backRoom();
}

// ---- one card: actions ----------------------------------------------------------------------
function cardSheet(k) {
  const def = CARDS[k.id];
  const acts = h('div', { class: 'acts' });
  const add = (label, cls, fn, disabled) => acts.append(h('button', { class: 'btn small ' + cls, disabled, onclick: fn }, label));
  const shown = meta.display.includes(k.cid);
  let m;
  if (!k.grade) {
    add(`Grade it (${GRADE_PRICE} Credit)`, 'gold', () => { m.close(); startGrading(k); }, meta.credit < GRADE_PRICE);
    // merge with another copy (same rules as in a run)
    for (const o of meta.collection) {
      if (o === k || o.id !== k.id || o.grade) continue;
      const out = R.mergeOutcome(k, o);
      if (!out.useful) continue;
      const nm = o.ed !== 'normal' ? EDITIONS[o.ed].name + ' ' : '';
      add(`Merge with ${nm}★${o.star} copy → ★${out.star}${out.options.length > 1 ? ' (pick edition)' : ''}`, '', () => {
        m.close();
        doMerge({ hero: 'kip', coins: 0 }, k, o, () => { meta.collection = meta.collection.filter(x => x !== o); saveMeta(); backRoom(); });
      });
    }
  } else {
    if (shown) add('Take off display', '', () => { meta.display = meta.display.filter(c => c !== k.cid); saveMeta(); m.close(); backRoom(); });
    else add(meta.display.length < displaySlots() ? 'Put on display' : 'Swap onto display', 'gold', () => {
      if (meta.display.length >= displaySlots()) meta.display.shift();
      meta.display.push(k.cid); saveMeta(); sfx.holo(); m.close(); backRoom();
    });
    add('Crack the slab', 'ghost', () => {
      if (!confirm('Crack the slab open? The grade is lost, but the card can be played and merged again.')) return;
      delete k.grade; meta.display = meta.display.filter(c => c !== k.cid); saveMeta(); sfx.shred(); m.close(); backRoom();
    });
  }
  add(`Sell for ${creditValue(k)} Credit`, 'ghost', () => {
    if ((RR[def.r] >= 2 || k.grade || k.ed !== 'normal') && !confirm(`Sell ${def.name} for ${creditValue(k)} Credit? It leaves your collection for good.`)) return;
    meta.credit += creditValue(k); meta.collection = meta.collection.filter(x => x !== k); meta.display = meta.display.filter(c => c !== k.cid);
    saveMeta(); sfx.coin(); m.close(); toast(`Sold <b>${def.name}</b> for ${creditValue(k)} Credit`); backRoom();
  });
  const big = k.grade ? slabEl(k) : cardEl(k);
  big.addEventListener('click', () => zoomCard(k, k.grade ? `Graded <b>${k.grade} · ${GRADE_NAMES[k.grade]}</b>` : ''));
  const ed = EDITIONS[k.ed || 'normal'];
  m = modal([h('div', { class: 'br-sheet' }, big, h('div', { class: 'info' },
    h('div', { class: 'h2' }, def.name + (k.star > 1 ? ' ' + '★'.repeat(k.star) : '')),
    h('div', { class: 'm', html: `${SETS[def.set].name} · ${RARITY[def.r].name}${ed.desc ? ' · ' + ed.desc : ''}` }),
    h('div', { class: 'm', html: k.grade ? 'Sealed in a slab — can\'t go in the Deck Box until cracked.' : 'Can go in your Deck Box.' }))), acts]);
}

// ---- sealed packs at home ----------------------------------------------------------------------
function tmpRun() { return R.newRun({ hero: 'kip', unlockedSets: unlockedSets() }); }

function buyPack(type) {
  const price = HOME_PACKS[type].price;
  if (meta.credit < price) return;
  const run = tmpRun();
  const spec = { type };
  if (type === 'set') { const sets = run.sets.filter(s => s !== 'void'); spec.set = sets[Math.floor(Math.random() * sets.length)]; }
  const result = R.openPack(run, spec);
  result.type = type; if (spec.set) result.set = spec.set;
  meta.credit -= price;
  meta.homePack = result; // saved, so a reload mid-tear keeps the pack
  saveMeta(); sfx.buy();
  openHomePack(result);
}

function giftPack(type) {
  const run = tmpRun();
  const result = R.openPack(run, { type });
  result.type = type;
  meta.homePack = result; saveMeta();
  setTimeout(() => openHomePack(result), 600);
}

function openHomePack(result) {
  const run = tmpRun();
  packScreen({ run, app: $('#app'), mount: env.mount, save: saveMeta, home: res => {
    const added = res.added || res.cards.map(c => importCard(c).cid);
    res.added = added; meta.homePack = null; saveMeta();
    packSummary(res.cards);
  } }, result);
}

function importCard(c) {
  const k = { cid: 'k' + (meta.cuid++), id: c.id, ed: c.ed || 'normal', star: c.star || 1 };
  if (k.ed === 'misprint') k.mp = c.mp ?? 0;
  if (k.ed === 'cracked') k.cracks = 3;
  meta.collection.push(k);
  return k;
}

function packSummary(cards) {
  const scr = h('div', { class: 'screen' });
  const fan = h('div', { class: 'endfan' });
  cards.forEach(c => { const el = cardEl(c, { cw: '120px' }); if (c.ed !== 'normal') idleShimmer(el, 1.2); el.addEventListener('click', () => zoomCard(c)); fan.append(el); });
  scr.append(h('div', { class: 'scroll center', style: { flex: '1', 'justify-content': 'center', gap: '14px', padding: '20px' } },
    h('div', { class: 'h1' }, 'Into the collection'),
    h('div', { class: 'sub' }, `${cards.length} cards added. Merge duplicates, grade the shiny ones, or sell what you don't need.`), fan,
    h('button', { class: 'btn gold', style: { 'margin-top': '8px', width: '100%', 'max-width': '320px' }, onclick: () => { sfx.tap(); backRoom(); } }, 'Back to the Back Room')));
  env.mount(scr);
}

// ---- grading minigame ----------------------------------------------------------------------------
// 1 CENTERING: the card slides in its slab — tap when it's dead centre.
// 2 SURFACE: wipe the dust off before the timer runs out.
// 3 CORNERS: the loupe checks each corner (luck of the print).
// 4 REVEAL: the slab label counts up to the grade.
function startGrading(k) {
  if (meta.credit < GRADE_PRICE) return;
  meta.credit -= GRADE_PRICE; saveMeta();
  const reduce = document.body.classList.contains('reduce-motion');
  const ov = h('div', { class: 'grader' });
  const title = h('div', { class: 'g-title' });
  const hint = h('div', { class: 'g-hint' });
  const stage = h('div', { class: 'g-stage' });
  const subs = h('div', { class: 'g-subs' });
  ov.append(title, stage, hint, subs);
  $('#app').append(ov);
  const sub = {};
  const showSub = (name, v) => { subs.append(h('span', { class: 'g-sub' + (v >= 9 ? ' good' : v <= 6 ? ' bad' : '') }, h('small', {}, name), h('b', {}, String(v)))); };

  // ---- 1. centering ----
  title.textContent = 'Centering';
  hint.innerHTML = 'Tap when the card is <b>dead centre</b> in the slab';
  const frame = h('div', { class: 'g-frame' }, h('i', { class: 'g-mark' }));
  const card = cardEl(k, { cw: 'min(52vw, 210px)' });
  card.append(h('i', { class: 'g-ctr' })); // the card's own centre notch, to line up with the frame's line
  frame.append(card); stage.append(frame);
  const period = reduce ? 2600 : 1500 + Math.random() * 300, t0 = performance.now();
  let raf, off = 0, done1 = false;
  const loop = now => { off = Math.sin(((now - t0) / period) * Math.PI * 2); card.style.transform = `translateX(${off * 34}%)`; raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  const stop1 = () => {
    if (done1) return; done1 = true; cancelAnimationFrame(raf);
    sub.centering = centeringScore(off); sfx.flip(); showSub('Centering', sub.centering);
    ov.removeEventListener('pointerdown', stop1);
    setTimeout(surface, 700);
  };
  setTimeout(() => ov.addEventListener('pointerdown', stop1), 250);

  // ---- 2. surface ----
  function surface() {
    title.textContent = 'Surface';
    hint.innerHTML = 'Rub the <b>dust</b> off — quick!';
    card.style.transition = 'transform .3s'; card.style.transform = 'none';
    frame.classList.add('no-mark'); card.querySelector('.g-ctr')?.remove();
    const N = 9, specks = [];
    for (let i = 0; i < N; i++) {
      const s = h('i', { class: 'speck', style: { left: (10 + Math.random() * 80) + '%', top: (8 + Math.random() * 84) + '%', '--s': (0.7 + Math.random() * 0.7).toFixed(2) } });
      frame.append(s); specks.push(s);
    }
    const bar = h('div', { class: 'g-timer' }, h('i'));
    stage.append(bar);
    const T = reduce ? 6000 : 3600;
    requestAnimationFrame(() => { bar.firstChild.style.transition = `transform ${T}ms linear`; bar.firstChild.style.transform = 'scaleX(0)'; });
    let wiped = 0, over = false, down = false;
    const rub = ev => {
      if (over || (!down && ev.type === 'pointermove' && ev.pointerType === 'mouse')) return;
      for (const s of specks) {
        if (s.dataset.gone) continue;
        const r = s.getBoundingClientRect();
        if (Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)) < 34) {
          s.dataset.gone = 1; s.classList.add('gone'); wiped++; sfx.tearGrain(wiped / N);
          if (wiped === N) finish();
        }
      }
    };
    const onDown = ev => { down = true; rub(ev); }, onUp = () => { down = false; };
    ov.addEventListener('pointerdown', onDown); ov.addEventListener('pointermove', rub); addEventListener('pointerup', onUp);
    const timer = setTimeout(finish, T);
    function finish() {
      if (over) return; over = true; clearTimeout(timer);
      ov.removeEventListener('pointerdown', onDown); ov.removeEventListener('pointermove', rub); removeEventListener('pointerup', onUp);
      sub.surface = surfaceScore(wiped / N); sfx.flip(); showSub('Surface', sub.surface);
      bar.remove();
      setTimeout(corners, 700);
    }
  }

  // ---- 3. corners ----
  function corners() {
    title.textContent = 'Corners';
    hint.innerHTML = 'The loupe checks every corner…';
    frame.style.visibility = 'hidden';
    const W = 300, Hh = Math.round(W * 88 / 63), L = 220, inset = 16;
    const lc = cardEl(k, { cw: W + 'px' });
    const loupe = h('div', { class: 'loupe' }, lc);
    const verdict = h('div', { class: 'g-verdict' });
    stage.append(loupe, verdict);
    const pos = [[inset, inset], [W - inset, inset], [W - inset, Hh - inset], [inset, Hh - inset]];
    const words = { 10: 'Razor sharp', 9: 'Sharp', 8: 'Slight wear', 7: 'Soft', 6: 'Dinged' };
    const rolls = [];
    let i = 0;
    const step = () => {
      if (i >= 4) {
        sub.corners = cornersScore(rolls); showSub('Corners', sub.corners);
        setTimeout(() => { loupe.remove(); verdict.remove(); reveal(); }, 700);
        return;
      }
      const [x, y] = pos[i];
      lc.style.transform = `translate(${L / 2 - x}px, ${L / 2 - y}px)`;
      setTimeout(() => {
        const g = rollCorner(); rolls.push(g);
        verdict.innerHTML = `<b class="${g >= 9 ? 'good' : g <= 7 ? 'bad' : ''}">${words[g]}</b>`;
        sfx.drum(i); i++;
        setTimeout(step, reduce ? 500 : 650);
      }, reduce ? 200 : 450);
    };
    setTimeout(step, 200);
  }

  // ---- 4. reveal ----
  function reveal() {
    const g = finalGrade(sub);
    title.textContent = 'Your grade';
    hint.innerHTML = '';
    frame.remove();
    k.grade = g; saveMeta();
    const slab = slabEl({ ...k, grade: g });
    const num = slab.querySelector('.slab-lab b'), nm = slab.querySelector('.slab-lab small');
    num.textContent = '1'; nm.textContent = '';
    stage.append(slab);
    let n = 1;
    const tick = () => {
      if (n < g) { n++; num.textContent = n; sfx.combo(n); setTimeout(tick, reduce ? 60 : 90 + n * 18); return; }
      nm.textContent = GRADE_NAMES[g];
      slab.classList.add('landed');
      const p = centerOf(slab);
      if (g === 10) { sfx.jackpot(); shake(true); banner('GEM MINT 10', CARDS[k.id].name, '#ffd166'); burst(p.x, p.y, { count: 140, colors: RARITY_FX.M, kind: 'confetti', speed: 10, lift: 3 }); }
      else if (g >= 9) { sfx.holo(); burst(p.x, p.y, { count: 50, colors: RARITY_FX.R, kind: 'star', speed: 7 }); }
      else if (g >= 7) sfx.reveal('U');
      else sfx.lose();
      const val = creditValue(k);
      hint.innerHTML = `Now worth <b style="color:var(--gold)">${val} Credit</b>${g >= 8 ? ' — put it on display to earn Credit every run.' : '.'}`;
      ov.append(h('button', { class: 'btn gold', style: { margin: '0 auto', width: 'min(320px, 90%)' }, onclick: () => { sfx.tap(); ov.remove(); backRoom(); } }, 'Nice'));
    };
    setTimeout(tick, 400);
  }
}
