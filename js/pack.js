// The pack-opening ritual: tear → reveal (charged rares) → place your pulls.
import { CARDS, RARITY, EDITIONS, PACKS, RARITY_RANK } from './data.js';
import { h, $, icon, cardEl, attachTilt, idleShimmer, enableGyro, packColors, packName, packIcon, arranger, toast, detailSheet, pillCoins } from './ui.js';
import { sfx } from './audio.js';
import { burst, centerOf, shake, banner, RARITY_FX } from './fx.js';
import { recordPull, saveMeta, meta } from './meta.js';
import { sellValue, mergeInto, allOwned } from './run.js';

// result = {type, set, cards, tell, mustKeep}; ctx = {run, app, save, done()}
export function packScreen(ctx, result, { skipTear = false } = {}) {
  const { run } = ctx;
  const scr = h('div', { class: 'screen' });
  ctx.mount(scr);
  if (skipTear || result.revealed) return trayPhase();

  // ---------------- TEAR ----------------
  const [pc, pc2] = packColors(result);
  const top = h('div', { class: 'topbar' }, h('span', { class: 'h2' }, packName(result)), h('span', { class: 'spacer' }),
    h('button', { class: 'btn ghost small', onclick: () => finishTear() }, 'Rip it'));
  const stage = h('div', { class: 'pack-stage' });
  const pack = h('div', { class: 'pack' + (result.tell ? ' glow' : ''), style: { '--pc': pc, '--pc2': pc2 } });
  pack.innerHTML = `
    <div class="body"><div class="foilsheen"></div><div class="plogo">HOLO</div><div class="art">${icon(packIcon(result))}</div>
      <div class="pname">${packName(result)}<small>${result.cards.length} CARDS INSIDE</small></div><div class="crimp"></div></div>
    <div class="strip"><div class="foilsheen"></div><div class="crimp"></div></div>
    <div class="tearline"></div>`;
  const hint = h('div', { class: 'tearhint' }, h('span', { class: 'finger' }));
  const hint2 = h('div', { class: 'tapnext' }, 'Swipe across the top to tear it open');
  stage.append(pack, hint, hint2);
  scr.append(top, stage);
  if (result.tell) setTimeout(() => { sfx.charge(1); toast('This pack feels… <b>warm</b>.'); }, 500);

  let prog = 0, lastX = null, tracking = false, lastGrain = 0, done = false, taps = 0;
  const strip = pack.querySelector('.strip');
  const setProg = p => {
    prog = Math.min(1, p);
    pack.style.setProperty('--tp', prog);
    strip.style.transform = `rotate(${-prog * 7}deg) translate(${prog * 6}px, ${-prog * 6}px)`;
    if (prog - lastGrain > 0.05) { sfx.tearGrain(prog); lastGrain = prog; }
    if (prog >= 1) finishTear();
  };
  stage.addEventListener('pointermove', e => {
    const r = pack.getBoundingClientRect();
    pack.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(0));
    pack.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 16) + 'deg');
    pack.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 10) + 'deg');
    if (!tracking || done) return;
    if (lastX != null) setProg(prog + Math.abs(e.clientX - lastX) / (r.width * 0.9));
    lastX = e.clientX;
    if (Math.random() < 0.4) { const c = centerOf(pack); burst(e.clientX - ctx.app.getBoundingClientRect().left, c.y - c.h * 0.37, { count: 2, colors: ['#fff', pc], speed: 2, size: 2 }); }
  });
  stage.addEventListener('pointerdown', e => {
    enableGyro();
    const r = pack.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (y < 0.4 && y > -0.15) { tracking = true; lastX = e.clientX; hint.remove(); }
    else if (e.clientX > r.left && e.clientX < r.right && y >= 0.4 && y < 1.05) {
      taps++; pack.classList.remove('wobble'); void pack.offsetWidth; pack.classList.add('wobble'); sfx.flip();
      if (taps === 1) hint2.textContent = 'Swipe the TOP edge — or tap twice more';
      if (taps >= 3) finishTear();
    }
  });
  const stop = () => { tracking = false; lastX = null; };
  stage.addEventListener('pointerup', stop); stage.addEventListener('pointercancel', stop);

  function finishTear() {
    if (done) return; done = true;
    setProg(1);
    sfx.tearDone(); shake();
    const c = centerOf(pack), arect = ctx.app.getBoundingClientRect();
    burst(c.x, c.y - c.h * 0.42, { count: 40, colors: ['#fff', pc, '#ffd166'], speed: 7, kind: 'confetti', size: 3, lift: 2 });
    strip.style.transition = 'transform .6s cubic-bezier(.3,.7,.4,1), opacity .6s';
    strip.style.transform = 'translate(160px, -260px) rotate(70deg)'; strip.style.opacity = '0';
    pack.classList.remove('glow');
    setTimeout(() => {
      pack.querySelector('.body').style.transition = 'transform .5s cubic-bezier(.5,0,.7,.4), opacity .5s';
      pack.querySelector('.body').style.transform = 'translateY(70%)';
      pack.querySelector('.body').style.opacity = '0';
      pack.querySelector('.tearline').remove();
      sfx.whoosh();
      setTimeout(() => pack.remove(), 520);
      revealPhase(stage);
    }, 380);
    top.lastChild.remove();
    hint2.remove(); hint.remove();
  }

  // ---------------- REVEAL ----------------
  function revealPhase(stage) {
    const stack = h('div', { class: 'reveal-stack' });
    stage.append(stack);
    const label = h('div', { class: 'pull-label' });
    const tapnext = h('div', { class: 'tapnext' }, 'Tap to reveal');
    scr.append(label, tapnext);
    const skip = h('button', { class: 'btn ghost small', onclick: () => revealAll() }, 'Reveal all');
    top.append(skip);
    const els = result.cards.map((c, k) => {
      const def = CARDS[c.id];
      const rc = h('div', { class: `rc c-${def.r}`, style: { transform: `translateY(${80 + k * 4}px) scale(.85)`, opacity: '0', 'z-index': String(100 - k) } });
      const face = h('div', { class: 'face' }, cardEl(c, { tilt: true }));
      const bk = h('div', { class: 'bk' }, h('div', { class: 'cardback', html: '<span class="logo">HOLO</span>' }));
      rc.append(h('div', { class: 'flipper' }, bk, face));
      stack.append(rc);
      setTimeout(() => { rc.style.opacity = '1'; rc.style.transform = `translate(${k * 3}px, ${-k * 3}px) rotate(${(k - 1) * 1.5}deg)`; }, 60 + k * 90);
      return rc;
    });
    let cur = 0, busy = false, flipped = false;
    const pulls = [];

    function flip() {
      const c = result.cards[cur], def = CARDS[c.id], rc = els[cur];
      const big = RARITY_RANK[def.r] >= 2 || c.ed === 'holo';
      const charge = RARITY_RANK[def.r] >= 1 || c.ed !== 'normal';
      busy = true;
      const go = () => {
        rc.classList.remove('charged');
        rc.classList.add('flipped'); sfx.flip();
        setTimeout(() => {
          sfx.reveal(def.r);
          if (c.ed === 'holo' || c.ed === 'foil') sfx.holo();
          const pos = centerOf(rc);
          burst(pos.x, pos.y, { count: [10, 24, 50, 110][RARITY_RANK[def.r]], colors: RARITY_FX[def.r], speed: [3, 5, 8, 11][RARITY_RANK[def.r]], kind: RARITY_RANK[def.r] >= 2 ? 'star' : 'spark', size: 3 });
          if (def.r === 'M') { shake(true); banner('MYTHIC!', def.name, '#ff4fd8'); setTimeout(() => burst(pos.x, pos.y, { count: 80, colors: RARITY_FX.M, kind: 'confetti', speed: 9, lift: 3 }), 300); }
          else if (def.r === 'R') shake();
          const rec = recordPull(c); saveMeta();
          pulls.push({ c, rec });
          const owned = allOwned(run).some(o => o.id === c.id);
          label.innerHTML = `<div class="rar" style="color:${RARITY[def.r].color}">${RARITY[def.r].name.toUpperCase()}</div>
            ${EDITIONS[c.ed].name ? `<div class="edn">${EDITIONS[c.ed].name} edition</div>` : ''}
            ${rec.isNew ? '<span class="new">NEW FOR YOUR BINDER</span>' : owned ? '<span class="new dupe">DUPLICATE — MERGE FOR ★</span>' : ''}`;
          const card = rc.querySelector('.card');
          if (c.ed !== 'normal' || def.r === 'M') idleShimmer(card, 1.4);
          busy = false; flipped = true;
          tapnext.textContent = cur === els.length - 1 ? 'Tap to keep your pulls' : 'Tap for the next card';
        }, 260);
      };
      if (charge) {
        rc.classList.add('charged');
        sfx.charge(RARITY_RANK[def.r]);
        setTimeout(go, big ? 900 : 450);
      } else go();
    }
    function next() {
      const rc = els[cur];
      rc.style.transform = `translate(${-30 - cur * 6}%, 120%) rotate(-14deg) scale(.4)`; rc.style.opacity = '0';
      sfx.whoosh();
      label.innerHTML = '';
      cur++; flipped = false;
      if (cur >= els.length) { setTimeout(() => { result.revealed = true; ctx.save(); trayPhase(); }, 350); return; }
      tapnext.textContent = 'Tap to reveal';
    }
    stage.addEventListener('click', () => {
      if (busy) return;
      if (!flipped) flip(); else next();
    });
    function revealAll() {
      skip.remove();
      for (let k = cur; k < result.cards.length; k++) { const c = result.cards[k]; if (!(flipped && k === cur)) pulls.push({ c, rec: recordPull(c) }); }
      saveMeta();
      result.revealed = true; ctx.save(); trayPhase();
    }
  }

  // ---------------- PLACE YOUR PULLS ----------------
  function trayPhase() {
    scr.innerHTML = '';
    // placed-flags live on the saved result so a reload can't duplicate cards
    result.placed ||= [];
    const left = result.cards.map((c, k) => ({ c, get placed() { return !!result.placed[k]; }, set placed(v) { result.placed[k] = v; } }));
    let selPull = null;
    const coinsPill = pillCoins(run.coins);
    const top = h('div', { class: 'topbar' }, h('span', { class: 'h2' }, 'Your pulls'), h('span', { class: 'spacer' }), coinsPill);
    const tray = h('div', { class: 'tray' });
    const help = h('div', { class: 'helpline' });
    const mid = h('div', { class: 'scroll', style: { flex: '1' } });
    const doneBtn = h('button', { class: 'btn gold', style: { flex: '1' } }, 'Done');
    const ctrl = h('div', { class: 'battle-controls' }, doneBtn);
    const arr = arranger(run, {
      external: () => selPull,
      hint: '',
      onPlaceExternal: (where, i) => place(where, i),
      onChange: () => refresh(),
      onRender: () => { coinsPill.querySelector('.coinv').textContent = run.coins; },
    });
    mid.append(tray, help, arr.detail);
    scr.append(top, mid, arr.el, ctrl);

    function keptCount() { return left.filter(p => p.placed).length; }
    function refresh() {
      tray.innerHTML = '';
      left.forEach((p, k) => {
        const owned = allOwned(run).find(o => o.id === p.c.id && !p.placed);
        const isNew = (meta.binder[p.c.id] || {}).n === 1;
        const el = h('div', { class: 'pull' + (selPull === p ? ' sel' : '') + (p.placed ? ' placed' : '') }, cardEl(p.c));
        if (!p.placed && owned) el.append(h('span', { class: 'tag dupe' }, 'MERGE ★'));
        else if (!p.placed && isNew) el.append(h('span', { class: 'tag new' }, 'NEW'));
        el.addEventListener('click', () => { selPull = selPull === p ? null : p; sfx.tap(); arr.clear(); refresh(); });
        tray.append(el);
      });
      arr.detail.innerHTML = '';
      if (selPull) {
        const c = selPull.c;
        const owned = allOwned(run).find(o => o.id === c.id);
        const acts = [];
        if (owned) acts.push({ label: owned.star >= 3 ? `Merge (max ★ → +${sellValue(run, c)})` : `Merge → ★${owned.star + 1}`, cls: 'gold small', fn: () => merge(selPull, owned) });
        acts.push({ label: `Sell +${sellValue(run, c)}`, cls: 'ghost small', fn: () => sellPull(selPull) });
        arr.detail.append(detailSheet(c, acts));
        help.innerHTML = owned ? 'Tap <b>Merge</b> to level up your copy, or tap a slot to place it' : 'Tap a slot below to place it. A card already there gets <b>sold</b>.';
      } else {
        const remaining = left.filter(p => !p.placed);
        help.innerHTML = remaining.length ? 'Tap a pull to keep it. Unkept pulls are <b>sold</b> when you tap Done.' : 'All placed. Arrange your row, then tap Done.';
      }
      const unsold = left.filter(p => !p.placed).reduce((s, p) => s + sellValue(run, p.c), 0);
      doneBtn.textContent = unsold ? `Done (sell rest +${unsold})` : 'Done';
      doneBtn.disabled = result.mustKeep && !keptCount();
      if (result.mustKeep && !keptCount()) help.innerHTML = '<b>Cursed:</b> you must keep at least one of these.';
      arr.render();
    }
    function place(where, i) {
      const p = selPull; if (!p) return;
      const A = where === 'row' ? run.row : run.bench;
      if (A[i]) { const v = sellValue(run, A[i]); run.coins += v; toast(`Sold <b>${CARDS[A[i].id].name}</b> (+${v})`); sfx.coin(); }
      A[i] = p.c; p.placed = true; selPull = null; sfx.flip();
      const slot = arr.el.querySelector(`.slot[data-where="${where}"][data-idx="${i}"]`);
      ctx.save(); refresh();
      const s2 = arr.el.querySelector(`.slot[data-where="${where}"][data-idx="${i}"]`);
      if (s2) { const c = centerOf(s2); burst(c.x, c.y, { count: 14, colors: RARITY_FX[CARDS[p.c.id].r], speed: 3 }); }
    }
    function merge(p, owned) {
      const r = mergeInto(run, owned, p.c);
      p.placed = true; selPull = null;
      if (r.star) { sfx.reveal('U'); toast(`<b>${CARDS[owned.id].name}</b> is now ★${r.star}!`); }
      else { sfx.coin(); toast(`Already max — sold for ${r.coins}`); }
      ctx.save(); refresh();
    }
    function sellPull(p) { run.coins += sellValue(run, p.c); p.placed = true; selPull = null; sfx.coin(); ctx.save(); refresh(); }
    doneBtn.addEventListener('click', () => {
      const rest = left.filter(p => !p.placed);
      const v = rest.reduce((s, p) => s + sellValue(run, p.c), 0);
      if (v) { run.coins += v; sfx.coin(); }
      ctx.done(v);
    });
    refresh();
  }
}
