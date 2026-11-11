// Shared UI helpers: DOM builder, icons, card rendering, tilt/shine, arranger, modals.
import { ICONS } from './icons.js';
import { CARDS, SETS, RARITY, EDITIONS, PACKS, HEROES, SET_BONUS, TACTICS, RELICS } from './data.js';
import { cardText, cardValues, activeBonuses } from './engine.js';
import { sellValue } from './run.js';
import { sfx } from './audio.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 512 512" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
}
export const iconEl = (name, cls) => { const t = document.createElement('template'); t.innerHTML = icon(name, cls); return t.content.firstChild; };

// gradient-filled card art icon
let gradId = 0;
function artIcon(name, set) {
  const id = 'g' + (gradId++);
  const c = SETS[set].color;
  return `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="${c}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><path fill="url(#${id})" stroke="#140c20" stroke-opacity=".75" stroke-width="12" paint-order="stroke" d="${ICONS[name] || ''}"/></svg>`;
}

const CHIP_KEYS = [['d', '#ff8a9b'], ['b', '#7cc6ff'], ['burn', '#ff8a3d'], ['poi', '#9be15d'], ['h', '#6dffb0'], ['t', '#c7e07a'], ['n', '#ffffff'], ['c', '#ffd166']];

// Render a card element. inst = {id, star, ed, mp}
export function cardEl(inst, o = {}) {
  const def = CARDS[inst.id], set = SETS[def.set];
  const el = h('div', { class: `card r-${def.r} ed-${inst.ed || 'normal'} set-${def.set}${o.mini ? ' mini' : ''}`, style: { '--sc': set.color, '--sc2': set.c2, ...(o.cw ? { '--cw': o.cw } : {}) } });
  const stars = '★'.repeat(inst.star || 1);
  const ed = EDITIONS[inst.ed || 'normal'];
  let chip = '';
  if (o.mini) {
    const { v } = cardValues(inst);
    const k = CHIP_KEYS.find(([key]) => v[key] != null && !(def.fixed || []).includes(key));
    if (k) chip = `<span class="chip" style="--k:${k[1]}">${v[k[0]]}</span>`;
  }
  const text = cardText(inst).replace(/^PASSIVE\./, '<b>PASSIVE.</b>').replace(/(\d+)/g, '<b>$1</b>');
  el.innerHTML = `<div class="ci"><div class="cf">
      <div class="ch"><span class="cn">${def.name}</span>${(inst.star || 1) > 1 ? `<span class="cs">${stars}</span>` : ''}</div>
      <div class="ca">${artIcon(def.icon, def.set)}</div>
      <div class="ct"><span class="gem"></span>${set.name} · ${RARITY[def.r].name}</div>
      <div class="cx">${text}</div>
      ${o.mini ? `<span class="mname">${def.name}</span>${(inst.star || 1) > 1 ? `<span class="cs">${stars}</span>` : ''}${chip}${def.passive ? '<span class="pas">PASSIVE</span>' : ''}` : ''}
    </div>
    ${ed.name ? `<span class="ced">${ed.name.toUpperCase()}${inst.ed === 'cracked' && inst.cracks ? ' ' + inst.cracks : ''}</span>` : ''}
    <div class="shine"></div><div class="glare"></div></div>`;
  if (o.tilt) attachTilt(el);
  return el;
}

// pointer-driven tilt + shine. Also follows the phone's gyro while visible.
const tilting = new Set();
export function attachTilt(el, strength = 14) {
  el.classList.add('live');
  const set = (px, py) => {
    el.style.setProperty('--mx', (px * 100).toFixed(1));
    el.style.setProperty('--my', (py * 100).toFixed(1));
    el.style.setProperty('--rx', ((0.5 - py) * strength).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((px - 0.5) * strength).toFixed(2) + 'deg');
    el.style.setProperty('--gl', '1');
  };
  el._tiltSet = set;
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
  el.addEventListener('pointerleave', () => { set(0.5, 0.5); el.style.setProperty('--gl', '0'); });
  tilting.add(el);
  return el;
}
let gyroOn = false;
export function enableGyro() {
  if (gyroOn) return;
  const start = () => {
    gyroOn = true;
    addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      const px = Math.max(0, Math.min(1, 0.5 + e.gamma / 50)), py = Math.max(0, Math.min(1, 0.5 + (e.beta - 45) / 50));
      for (const el of tilting) { if (!el.isConnected) { tilting.delete(el); continue; } el._tiltSet(px, py); }
    });
  };
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') start(); }).catch(() => {});
    } else start();
  } catch (e) {}
}
// idle shimmer so holo cards sparkle even without input
export function idleShimmer(el, speed = 1) {
  let t = Math.random() * 10;
  const step = () => {
    if (!el.isConnected) return;
    if (!el.matches(':hover')) {
      t += 0.012 * speed;
      el.style.setProperty('--mx', (50 + Math.sin(t) * 40).toFixed(1));
      el.style.setProperty('--my', (50 + Math.cos(t * 0.7) * 30).toFixed(1));
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function packColors(spec) {
  if (spec.type === 'gumball') return ['#ff6bd6', '#6a1d8c'];
  if (spec.type === 'showcase') return ['#ffe27a', '#7a4a00'];
  if (spec.type === 'set') return [SETS[spec.set].color, SETS[spec.set].c2];
  return [PACKS[spec.type].color, PACKS[spec.type].c2];
}
export function packName(spec) { if (spec.type === 'gumball') return 'Gumball Capsule'; if (spec.type === 'showcase') return 'Display Case'; return spec.type === 'set' ? `${SETS[spec.set].name} Box` : PACKS[spec.type].name; }
export function packIcon(spec) {
  if (spec.type === 'set') return SETS[spec.set].glyph;
  return { showcase: 'open-treasure-chest', gumball: 'slot-machine', booster: 'star-swirl', cursed: 'all-seeing-eye', collector: 'crowned-skull' }[spec.type] || 'card-random';
}

// ---------- toasts / modals ----------
export function toast(msg, ms = 2200) {
  const app = $('#app');
  $$('.toast', app).forEach(t => t.remove());
  const t = h('div', { class: 'toast', html: msg });
  app.append(t); setTimeout(() => t.remove(), ms);
}

export function modal(content, { onClose } = {}) {
  const bg = h('div', { class: 'modal-bg' });
  const m = h('div', { class: 'modal' });
  m.append(...[].concat(content));
  bg.append(m);
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  $('#app').append(bg);
  return { close, el: m };
}

export function zoomCard(inst, extra = '') {
  const def = CARDS[inst.id];
  const z = h('div', { class: 'zoom' });
  const c = cardEl(inst, { tilt: true });
  idleShimmer(c);
  const ed = EDITIONS[inst.ed || 'normal'];
  z.append(h('div', { class: 'center' }, c, h('div', { class: 'meta', html: `${ed.desc ? `<b>${ed.desc}</b><br>` : ''}${extra}<br>Tap anywhere to close` })));
  z.addEventListener('click', () => { sfx.back(); z.remove(); });
  $('#app').append(z);
}

export function pillHp(run) { return h('span', { class: 'pill hp', html: `${icon('heart-beats')}<span>${run.hp}/${run.maxHp}</span>` }); }
export function pillCoins(n) { return h('span', { class: 'pill coins', html: `${icon('two-coins')}<span class="coinv">${n}</span>` }); }

// ---------------------------------------------------------------------------
// Arranger: the player's row (6) + bench (4). Tap to select, tap another slot
// to swap/move. A detail sheet shows the selected card with contextual actions.
// opts.actions(card, where, idx) → [{label, cls, fn}]
// opts.onPlaceExternal(where, idx) → used when an external card (pull) is selected
// ---------------------------------------------------------------------------
export function arranger(run, opts = {}) {
  const wrap = h('div', { class: 'rowbar' });
  const detailHost = h('div');
  let sel = null; // {where, idx}
  const lockedSlot = opts.locked || (() => false);
  const offLabel = opts.offLabel || (() => null);

  function render() {
    wrap.innerHTML = '';
    const ext = opts.external && opts.external();
    if (!ext) detailHost.innerHTML = '';
    const lab = h('div', { class: 'lab' }, h('span', {}, opts.rowLabel || 'Your row — fires left → right'), h('span', {}, opts.hint || (sel ? 'Tap a slot to move' : 'Tap a card')));
    const row = h('div', { class: 'slots', style: { 'grid-template-columns': `repeat(${run.row.length}, minmax(0, 1fr))` } });
    const bench = h('div', { class: 'slots bench' });
    const mk = (where, arr, host, n) => {
      for (let i = 0; i < n; i++) {
        const c = arr[i];
        const off = offLabel(where, i);
        const s = h('div', { class: 'slot' + (sel && sel.where === where && sel.idx === i ? ' sel' : '') + (off ? ' off' : '') + ((sel || ext) && !lockedSlot(where, i) && !(sel && sel.where === where && sel.idx === i) ? ' target' : ''), 'data-off': off || '', 'data-where': where, 'data-idx': i });
        if (c) s.append(cardEl(c, { mini: true }));
        else s.append(h('span', { class: 'num' }, where === 'row' ? String(i + 1) : ''));
        const marks = opts.slotMarks && opts.slotMarks(where, i);
        if (marks && marks.length) { s.classList.add('marked'); s.append(h('div', { class: 'marks', html: marks.join('') })); }
        s.addEventListener('click', () => tap(where, i));
        host.append(s);
      }
    };
    mk('row', run.row, row, run.row.length);
    const showBench = !opts.noBench && !(opts.benchHidden && opts.benchHidden());
    if (showBench) mk('bench', run.bench, bench, run.bench.length);
    wrap.append(lab);
    if (!opts.noChips) { const ch = setChips(run, opts.disabled ? opts.disabled() : {}); if (ch) wrap.append(ch); }
    wrap.append(row);
    if (showBench) wrap.append(h('div', { class: 'lab', style: { 'padding-top': '6px' } }, h('span', {}, 'Bench — kept, but does not fire')), bench);
    if (sel) {
      const c = (sel.where === 'row' ? run.row : run.bench)[sel.idx];
      if (c) detailHost.append(detailSheet(c, opts.actions ? opts.actions(c, sel.where, sel.idx) : defaultActions(c, sel.where, sel.idx)));
    }
    opts.onRender && opts.onRender();
  }

  function defaultActions(c, where, idx) {
    if (opts.noSell) return [];
    return [{ label: `Sell +${sellValue(run, c)}`, cls: 'ghost small', fn: () => sell(where, idx) }];
  }
  function sell(where, idx) {
    const arr = where === 'row' ? run.row : run.bench;
    const c = arr[idx]; if (!c) return;
    if (run.row.filter(Boolean).length <= 1 && where === 'row') { toast('Keep at least one card in your row!'); return; }
    run.coins += sellValue(run, c); arr[idx] = null; sel = null; sfx.coin();
    toast(`Sold <b>${CARDS[c.id].name}</b> for ${sellValue(run, c)} coins`);
    opts.onChange && opts.onChange(); render();
  }

  function tap(where, i) {
    if (opts.external && opts.external()) { opts.onPlaceExternal(where, i); sel = null; render(); return; }
    const arr = where === 'row' ? run.row : run.bench;
    if (lockedSlot(where, i)) { toast('That slot is out of action this fight'); return; }
    if (!sel) { if (arr[i]) { sel = { where, idx: i }; sfx.tap(); opts.onSelect && opts.onSelect(arr[i], where, i); } render(); return; }
    if (sel.where === where && sel.idx === i) { sel = null; sfx.back(); render(); return; }
    const A = sel.where === 'row' ? run.row : run.bench;
    const tmp = A[sel.idx]; A[sel.idx] = arr[i]; arr[i] = tmp;
    if (!run.row.some(Boolean)) { arr[i] = A[sel.idx]; A[sel.idx] = tmp; toast('Keep at least one card in your row!'); sel = null; render(); return; }
    sel = null; sfx.flip(); opts.onChange && opts.onChange(); render();
  }

  render();
  return { el: wrap, detail: detailHost, render, clear() { sel = null; render(); }, get sel() { return sel; }, sell };
}

// Set-bonus chips: one per set present in the row, lit when a tier is active.
export function setChips(run, disabled = {}) {
  const { counts, tiers } = activeBonuses(run.row, disabled, run.relics || []);
  const sets = Object.keys(counts).filter(s => SET_BONUS[s]).sort((a, b) => counts[b] - counts[a]);
  if (!sets.length) return null;
  const el = h('div', { class: 'setchips' });
  for (const s of sets) {
    const n = counts[s], t = tiers[s], S = SETS[s];
    const next = SET_BONUS[s].find(([k]) => k > n);
    const chip = h('button', { class: 'setchip' + (t ? ' on' : ''), style: { '--k': S.color }, html: `${icon(S.glyph)}<b>${n}</b>${next ? `<span>/${next[0]}</span>` : '<span>MAX</span>'}${t ? '<i>' + '●'.repeat(t) + '</i>' : ''}` });
    chip.addEventListener('click', (ev) => {
      ev.stopPropagation(); sfx.tap();
      toast(`<b style="color:${S.color}">${S.name} set (${n} cards)</b><br>` + SET_BONUS[s].map(([k, txt]) => `<span style="opacity:${n >= k ? 1 : .5}">${n >= k ? '✔' : '○'} ${k}: ${txt}</span>`).join('<br>'), 3800);
    });
    el.append(chip);
  }
  return el;
}

export function detailSheet(c, actions = [], extraNote = '') {
  const def = CARDS[c.id];
  const ed = EDITIONS[c.ed || 'normal'];
  const card = cardEl(c);
  card.addEventListener('click', () => zoomCard(c));
  const acts = h('div', { class: 'acts' }, ...actions.map(a => h('button', { class: 'btn ' + (a.cls || 'small'), onclick: a.fn, disabled: a.disabled }, a.label)));
  return h('div', { class: 'detail' }, card, h('div', { class: 'info' },
    h('div', { class: 'h2' }, def.name + ((c.star || 1) > 1 ? ' ' + '★'.repeat(c.star) : '')),
    h('div', { class: 't', html: cardText(c) }),
    h('div', { class: 'm', html: `${SETS[def.set].name} · ${RARITY[def.r].name}${ed.desc ? ' · ' + ed.desc : ''}${extraNote ? '<br>' + extraNote : ''}` }),
    acts));
}
