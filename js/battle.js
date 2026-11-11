// Battle screen: plan (rearrange, target) → FIGHT → animated event playback.
import { CARDS, ENEMIES, HEROES, TACTICS, ENEMY_EDITIONS, RARITY } from './data.js';
import { playRound, intentView, alive, useTactic } from './engine.js';
import { h, $, $$, icon, arranger, toast, pillCoins, modal } from './ui.js';
import { sfx, music } from './audio.js';
import { burst, centerOf, floatText, shake, banner } from './fx.js';
import { meta, saveMeta } from './meta.js';

const STATUS = [['burn', 'flame', '#ff8a3d'], ['poison', 'poison', '#9be15d'], ['vuln', 'broken-shield', '#ff6bd6'], ['weak', 'broken-bone', '#b8aee0'], ['str', 'biceps', '#ffb03a'], ['thorns', 'thorny-vine', '#c7e07a']];
const SPECIAL_ICON = { shred: 'box-cutter', steal: 'old-king', copy: 'two-shadows', wrap: 'floating-ghost', pilfer: 'two-coins' };
const SPECIAL_TEXT = { shred: 'Shred', steal: 'Steal', copy: 'Copy', wrap: 'Wrap', pilfer: 'Pilfer' };
const DMG_COLOR = { hit: '#ffffff', atk: '#ff5d73', burn: '#ff8a3d', poison: '#9be15d', thorns: '#c7e07a', king: '#b07cff', jackpot: '#ffd166', self: '#ff5d73' };

export function battleScreen(ctx, B, kind) {
  const { run } = ctx;
  const hero = HEROES[run.hero];
  const scr = h('div', { class: 'screen' });
  ctx.mount(scr);
  const isBoss = kind === 'boss';
  music(isBoss ? 'boss' : 'fight');

  let playing = false, auto = false, benchOpen = false;
  const speeds = [1, 2, 3];
  let speed = meta.settings.speed || 1;

  // ---- top bar
  const roundLbl = h('span', { class: 'pill' }, 'Round 1');
  const coinsPill = pillCoins(B.coins);
  const speedBtn = h('button', { class: 'pill', style: { cursor: 'pointer' }, onclick: () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; meta.settings.speed = speed; saveMeta(); speedBtn.textContent = speed + '×'; sfx.tap(); } }, speed + '×');
  const top = h('div', { class: 'topbar' }, roundLbl, h('span', { class: 'spacer' }), coinsPill, speedBtn);

  // ---- arena
  const arena = h('div', { class: 'arena' });
  const enemiesEl = h('div', { class: 'enemies' });
  const combo = h('div', { class: 'combo' });
  // back-shelf stock silhouettes (seeded by round-independent randomness)
  const stockRow = (top) => {
    const d = h('div', { class: 'stock', style: { top } });
    const cols = ['#3d2b63', '#2b3d63', '#4a2b4f', '#2b4a45', '#5a3a2a'];
    let html = '';
    for (let k = 0; k < 14; k++) {
      if (k === 4 || k === 9) { html += '<span class="gap"></span>'; continue; }
      const box = Math.random() < 0.3, w = box ? 22 + Math.random() * 14 : 13 + Math.random() * 5, ht = box ? 14 + Math.random() * 8 : 20 + Math.random() * 8;
      html += `<i class="${box ? 'box' : ''}" style="width:${w.toFixed(0)}px;height:${ht.toFixed(0)}px;--c:${cols[k % cols.length]}"></i>`;
    }
    d.innerHTML = html; d.style.transform = 'translateY(-100%)';
    return d;
  };
  arena.append(stockRow('22%'), stockRow('46%'), h('div', { class: 'lamp' }), enemiesEl, combo);
  const foeEls = [];

  function foeEl(e, i) {
    const d = ENEMIES[e.id];
    const el = h('div', { class: 'foe' + (d.boss ? ' boss' : '') + (d.small ? ' small' : '') + (e.ed ? ' fed-' + e.ed : ''), style: { '--fc': d.color } });
    el.innerHTML = `<div class="body"><div class="aura"></div>${e.ed ? '<div class="fshine"></div>' : ''}${icon(d.icon)}<span class="blockbadge"></span></div>
      <div class="nm">${e.ed ? `<span class="edtag">${ENEMY_EDITIONS[e.ed].name}</span>` : ''}${e.name}</div><div class="bar"><b></b><i></i><span></span></div><div class="stats-row"></div><div class="intent"></div>`;
    el.addEventListener('click', () => {
      if (e.dead) return;
      B.target = i; sfx.tap(); updateTargets(); showRule(e);
    });
    updUnit(el, e);
    return el;
  }
  function updUnit(el, u) {
    const pct = Math.max(0, u.hp / u.maxHp * 100);
    el.querySelector('.bar i').style.width = pct + '%';
    el.querySelector('.bar b').style.width = pct + '%';
    el.querySelector('.bar span').textContent = `${Math.max(0, u.hp)}/${u.maxHp}`;
    const bb = el.querySelector('.blockbadge');
    bb.classList.toggle('on', u.block > 0); bb.textContent = u.block;
    const sr = el.querySelector('.stats-row');
    sr.innerHTML = STATUS.filter(([k]) => u[k] > 0).map(([k, ic, col]) => `<span class="st" style="--k:${col}" title="${k}">${icon(ic)}${u[k]}</span>`).join('');
  }
  function renderFoes() {
    enemiesEl.innerHTML = ''; foeEls.length = 0;
    B.enemies.forEach((e, i) => { const el = foeEl(e, i); if (e.dead) el.classList.add('dead'); foeEls.push(el); enemiesEl.append(el); });
    enemiesEl.classList.toggle('n3', B.enemies.length >= 3);
    updateTargets(); renderIntents();
  }
  function updateTargets() {
    const t = B.enemies[B.target] && !B.enemies[B.target].dead ? B.target : B.enemies.indexOf(alive(B)[0]);
    B.target = t;
    foeEls.forEach((el, i) => el.classList.toggle('targeted', i === t && alive(B).length > 1));
  }
  function renderIntents() {
    B.enemies.forEach((e, i) => {
      const el = foeEls[i]; if (!el) return;
      const box = el.querySelector('.intent');
      if (e.dead) { box.style.display = 'none'; return; }
      const v = intentView(B, e);
      const parts = [];
      if (v.special) parts.push(`<span class="spc">${icon(SPECIAL_ICON[v.special])}${SPECIAL_TEXT[v.special]}</span>`);
      if (v.atk) parts.push(`<span class="atk${v.miss ? ' miss' : ''}">${icon('crossed-swords')}${v.approx ? '~' : ''}${v.atk}${v.times > 1 ? '×' + v.times : ''}</span>`);
      if (v.aimSlot != null && v.aim) parts.push(`<span class="aim ${v.aim}${v.miss ? ' miss' : ''}">${icon(v.aim === 'blind' ? 'all-seeing-eye' : 'target-arrows')}${v.miss ? 'MISS' : '#' + (v.aimSlot + 1)}</span>`);
      if (v.block) parts.push(`<span class="blk">${icon('templar-shield')}${v.block}</span>`);
      if (v.str) parts.push(`<span class="buf">${icon('biceps')}+${v.str}</span>`);
      for (const [k, ic] of [['burn', 'flame'], ['poison', 'poison'], ['vuln', 'broken-shield'], ['weak', 'broken-bone']]) if (v[k]) parts.push(`<span class="deb">${icon(ic)}${v[k]}</span>`);
      box.innerHTML = e.stunned ? '<span class="spc">Bribed — skips</span>' : parts.join('');
      box.style.display = 'flex';
      box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    });
  }

  // ---- rule bar
  const rulebar = h('div', { class: 'rulebar', style: { display: 'none' } });
  function showRule(e) {
    const d = e ? ENEMIES[e.id] : null;
    const withRule = d && (d.rule || e.ed) ? e : B.enemies.find(x => !x.dead && (ENEMIES[x.id].rule || x.ed));
    const aimer = alive(B).some(x => intentOf2(x).aim);
    if (!withRule) {
      if (aimer && !meta.seenAim) { rulebar.style.display = 'block'; rulebar.innerHTML = `${icon('target-arrows')}<b>Aimed attacks!</b> A target marks which card gets hit (and jammed next round). Move that card away — an empty slot makes it <b>MISS</b>.`; return; }
      rulebar.style.display = 'none'; return;
    }
    rulebar.style.display = 'block';
    const D = ENEMIES[withRule.id];
    rulebar.innerHTML = `<b>${withRule.name}:</b> ${D.rule || ''}${withRule.ed ? ` <span class="edtag">${ENEMY_EDITIONS[withRule.ed].name}</span> ${ENEMY_EDITIONS[withRule.ed].text}` : ''}`;
  }

  function intentOf2(x) { const v = intentView(B, x); return v; }

  // ---- me
  const me = h('div', { class: 'me', style: { '--hc': hero.color } });
  me.innerHTML = `<div class="port">${icon(hero.icon)}<span class="blockbadge"></span></div>
    <div style="flex:1;min-width:0"><div class="who"><b>${hero.name}</b><span class="incoming"></span></div><div class="bar"><b></b><i></i><span></span></div><div class="stats-row" style="justify-content:flex-start"></div></div>`;
  const updMe = u => { updUnit(me, u || B.player); updIncoming(); };
  function updIncoming() {
    const el = me.querySelector('.incoming'); if (!el) return;
    if (playing || B.over) { el.innerHTML = ''; return; }
    let tot = 0;
    for (const e of alive(B)) { if (e.stunned) continue; const v = intentView(B, e); if (v.atk) tot += v.atk * (v.times || 1); }
    const blk = B.player.block;
    el.className = 'incoming ' + (tot === 0 ? 'safe' : tot > blk ? 'danger' : 'safe');
    el.innerHTML = tot ? `${icon('crossed-swords')}Incoming ${tot}${blk ? ` · Block ${blk}` : ''}` : 'No attacks coming';
  }

  // ---- row
  const offLabel = (where, i) => where === 'row' && B.disabled[i] ? (B.disabled[i] === 'shred' ? 'SHREDDED' : 'STOLEN') : null;
  const arr = arranger(run, {
    noSell: true, noBench: false, rowLabel: B.reverse ? 'Your row — fires RIGHT → left!' : 'Your row — fires left → right',
    locked: (where, i) => where === 'row' && !!B.disabled[i],
    offLabel,
    actions: () => [],
    hint: 'Tap two cards to swap',
    benchHidden: () => !benchOpen,
    disabled: () => B.disabled,
    onChange: () => { ctx.save(); renderIntents(); updIncoming(); },
    slotMarks: (where, i) => {
      if (where !== 'row' || B.over) return null;
      const m = [];
      if (B.jammed && B.jammed.has(i)) m.push(`<span class="mk jam">JAMMED</span>`);
      if (!playing) for (const e of alive(B)) {
        if (e.stunned) continue;
        const v = intentView(B, e);
        if (v.aimSlot !== i || !v.aim) continue;
        if (v.aim === 'blind') m.push(`<span class="mk blind" title="${e.name} will blind this slot">${icon('all-seeing-eye')}</span>`);
        else m.push(`<span class="mk strike${v.miss ? ' miss' : ''}" title="${e.name} aims here">${icon('target-arrows')}</span>`);
      }
      return m;
    },
  });
  const fightBtn = h('button', { class: 'btn', style: { flex: '1' } }, 'FIGHT');
  const autoBtn = h('button', { class: 'btn ghost small' }, 'Auto: off');
  const controls = h('div', { class: 'battle-controls' }, autoBtn, fightBtn);
  const benchToggle = h('button', { class: 'btn ghost small' }, 'Bench');
  controls.prepend(benchToggle);
  benchToggle.addEventListener('click', () => { benchOpen = !benchOpen; benchToggle.classList.toggle('gold', benchOpen); arr.render(); sfx.tap(); });

  const tacBar = h('div', { class: 'tacbar' });
  function renderTactics() {
    tacBar.innerHTML = '';
    if (!run.tactics || !run.tactics.length) { tacBar.style.display = 'none'; return; }
    tacBar.style.display = 'flex';
    tacBar.append(h('span', { class: 'tl' }, 'Tactics'));
    run.tactics.forEach((id, k) => {
      const T = TACTICS[id];
      const b = h('button', { class: 'ticket r-' + T.r, style: { '--k': RARITY[T.r].color }, html: `${icon(T.icon)}<span>${T.name}</span>` });
      b.addEventListener('click', () => {
        if (playing || B.over) return;
        sfx.tap();
        const md = modal([h('div', { class: 'tac-big', style: { '--k': RARITY[T.r].color }, html: icon(T.icon) }), h('div', { class: 'h2' }, T.name), h('p', { class: 'sub', style: { 'font-size': '15px' } }, T.text),
          h('p', { class: 'sub', style: { 'font-size': '12px' } }, 'One use. Plays right now, before you press FIGHT.'),
          h('div', { style: { display: 'flex', gap: '10px', 'margin-top': '10px' } },
            h('button', { class: 'btn ghost', style: { flex: '1' }, onclick: () => md.close() }, 'Keep'),
            h('button', { class: 'btn gold', style: { flex: '1' }, onclick: () => { md.close(); playTactic(k); } }, 'Use it'))]);
      });
      tacBar.append(b);
    });
  }
  async function playTactic(k) {
    if (playing || B.over) return;
    const id = run.tactics[k];
    run.tactics.splice(k, 1); ctx.save();
    playing = true; fightBtn.disabled = true; renderTactics();
    const evs = useTactic(B, id);
    for (const e of evs) await handle(e);
    playing = false; fightBtn.disabled = false;
    arr.render(); renderIntents(); updIncoming(); renderTactics(); showRule(); showMult(B.pre && B.pre.mult);
    if (B.over) return end();
  }
  const multBadge = h('div', { class: 'multbadge' });
  arena.append(multBadge);
  // shows the live damage multiplier during a round, or the tactic effects queued for the next round
  const showMult = (m) => {
    const parts = [];
    if (m && m > 1) parts.push('×' + (+m.toFixed(2)) + ' DMG');
    if (!playing && B.pre) {
      if (B.pre.passes) parts.push('ENCORE: row ×2');
      if (B.pre.echo) parts.push('ECHO: 1st card ×3');
      if (B.pre.spotlight) parts.push('SPOTLIGHT');
    }
    if (!parts.length) { multBadge.classList.remove('on'); return; }
    const txt = (!playing && parts.length ? 'NEXT ROUND · ' : '') + parts.join(' · ');
    if (multBadge.textContent === txt && multBadge.classList.contains('on')) return;
    multBadge.textContent = txt; multBadge.classList.remove('on'); void multBadge.offsetWidth; multBadge.classList.add('on');
  };

  const bottom = h('div', {}, arr.detail, arr.el);
  scr.append(top, arena, rulebar, me, bottom, tacBar, controls);
  renderTactics();
  renderFoes(); updMe(); showRule();

  // intro banner
  if (isBoss) { const e = B.enemies[0]; setTimeout(() => { banner(e.name.toUpperCase(), ENEMIES[e.id].title, ENEMIES[e.id].color); sfx.phase(); }, 250); }
  else if (kind === 'elite') setTimeout(() => banner('ELITE', B.enemies.map(e => e.name).join(' & '), '#ffb03a'), 250);

  // ---- playback
  const delay = ms => new Promise(r => setTimeout(r, ms / speed));
  const slotEl = i => arr.el.querySelector(`.slot[data-where="row"][data-idx="${i}"]`);
  const at = el => centerOf(el);
  const unitEl = (side, i) => side === 'p' ? me : foeEls[i];

  async function handle(e) {
    switch (e.t) {
      case 'round': roundLbl.textContent = 'Round ' + e.round; combo.classList.remove('pop'); combo.style.opacity = '0'; return delay(120);
      case 'fire': {
        const s = slotEl(e.slot); if (!s) return;
        s.classList.add('firing');
        if (e.via != null) { const p = at(s); floatText(p.x, p.y - 40, 'COPY', '#b07cff'); }
        setTimeout(() => s.classList.remove('firing'), 330 / speed);
        return delay(170);
      }
      case 'combo':
        if (e.n >= 2) { combo.innerHTML = `×${e.n}<small>COMBO</small>`; combo.classList.remove('pop'); void combo.offsetWidth; combo.classList.add('pop'); }
        sfx.combo(e.n); return delay(70);
      case 'dmg': {
        const el = unitEl(e.side, e.i); if (!el) return;
        const p = at(el.querySelector('.body, .port'));
        if (e.side === 'e') {
          el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
          if (e.amt > 0) { floatText(p.x + (Math.random() - 0.5) * 30, p.y - 10, String(e.amt), DMG_COLOR[e.kind] || '#fff', e.big); burst(p.x, p.y, { count: Math.min(30, 6 + e.amt), colors: [DMG_COLOR[e.kind] || '#fff', '#ffd166'], speed: 3 + Math.min(6, e.amt / 4) }); }
          if (e.blocked) floatText(p.x + 30, p.y + 10, 'Blocked ' + e.blocked, '#7cc6ff');
          if (e.amt > 0) sfx.hit(e.big); else if (e.blocked) sfx.blocked();
          if (e.big) shake();
        } else {
          me.classList.remove('hurt'); void me.offsetWidth; if (e.amt > 0) me.classList.add('hurt');
          if (e.amt > 0) { floatText(p.x + 40, p.y - 10, '-' + e.amt, '#ff5d73', e.amt >= 12); sfx.hurt(); if (e.amt >= 8) shake(e.amt >= 16); }
          if (e.blocked) { floatText(p.x + 70, p.y + 14, 'Blocked ' + e.blocked, '#7cc6ff'); sfx.blocked(); }
        }
        updUnit(el, e.u);
        return delay(e.kind === 'burn' || e.kind === 'poison' ? 230 : 150);
      }
      case 'block': { const el = unitEl(e.side, e.i); const p = at(el.querySelector('.body, .port')); floatText(p.x, p.y, '+' + e.n, '#7cc6ff'); updUnit(el, e.u); sfx.block(); return delay(130); }
      case 'heal': { const p = at(me.querySelector('.port')); floatText(p.x + 40, p.y, '+' + e.n, '#6dffb0'); updMe(e.u); sfx.heal(); burst(p.x, p.y, { colors: ['#6dffb0', '#fff'], count: 12, speed: 2, gravity: -0.05 }); return delay(130); }
      case 'status': {
        const el = unitEl(e.side, e.i); if (!el) return;
        updUnit(el, e.u);
        if (e.k === 'cleanse') return delay(80);
        const st = STATUS.find(s => s[0] === e.k);
        const p = at(el.querySelector('.body, .port'));
        floatText(p.x, p.y + 20, `+${e.n} ${e.k === 'vuln' ? 'Vulnerable' : e.k[0].toUpperCase() + e.k.slice(1)}`, st ? st[2] : '#fff');
        if (e.k === 'burn') { sfx.burn(); burst(p.x, p.y + 20, { colors: ['#ff8a3d', '#ffd166'], count: 10, speed: 2, gravity: -0.08 }); }
        else if (e.k === 'poison') sfx.poison(); else sfx.buff();
        return delay(110);
      }
      case 'statusSync': { const el = unitEl(e.side, e.i); if (el) updUnit(el, e.u); return; }
      case 'coins': { coinsPill.querySelector('.coinv').textContent = e.total; const p = at(coinsPill); floatText(p.x, p.y + 26, (e.n > 0 ? '+' : '') + e.n, '#ffd166'); if (e.n > 0) sfx.coin(); return delay(90); }
      case 'die': {
        if (e.side === 'e') { const el = foeEls[e.i]; const p = at(el.querySelector('.body')); burst(p.x, p.y, { count: 40, colors: [ENEMIES[B.enemies[e.i].id].color, '#fff'], speed: 6, kind: 'confetti' }); el.classList.add('dead'); sfx.die(); updateTargets(); }
        return delay(380);
      }
      case 'spawn': { const el = foeEl(B.enemies[e.i], e.i); foeEls[e.i] = el; enemiesEl.append(el); burst(at(el).x, at(el).y, { colors: ['#a9f0d9'], count: 16 }); return delay(260); }
      case 'act': {
        const el = foeEls[e.i]; if (!el) return;
        if (e.stunned) { const p = at(el); floatText(p.x, p.y, 'Skipped!', '#ffd166'); return delay(300); }
        el.classList.remove('lunge'); void el.offsetWidth; el.classList.add('lunge'); sfx.enemyAtk(); updUnit(el, e.u);
        return delay(300);
      }
      case 'shred': case 'steal': {
        sfx.shred(); arr.render();
        const s = slotEl(e.slot); if (s) { const p = at(s); burst(p.x, p.y, { colors: ['#fff', '#ff5d73'], count: 30, kind: 'confetti', speed: 5 }); floatText(p.x, p.y - 40, e.t === 'shred' ? 'SHREDDED!' : 'STOLEN!', '#ff5d73', true); }
        shake(true); return delay(650);
      }
      case 'wrap': toast('<b>Wrapped!</b> Your first card won\'t fire next round.'); return delay(300);
      case 'phase': banner('CLOSING TIME', 'Your row now fires right-to-left!', '#ff4fd8'); sfx.phase(); scr.classList.add('lightsout'); arr.render(); updUnit(foeEls[e.i], e.u); return delay(1700);
      case 'jackpot': banner('JACKPOT!', '', '#ffd166'); sfx.jackpot(); { const p = at(arena); burst(p.x, p.y, { count: 60, colors: ['#ffd166', '#fff'], kind: 'confetti', speed: 9 }); } return delay(650);
      case 'revive': banner('REBORN', 'Phoenix Plume', '#ff8a3d'); updMe(e.u); sfx.reveal('R'); return delay(900);
      case 'proc': toast(`<b>${e.name}</b>`, 900); return delay(150);
      case 'buff': { const s = slotEl(e.slot); if (s) { const p = at(s); floatText(p.x, p.y - 44, e.overclock != null ? 'OVERCLOCK →' : e.barbed ? 'Barbed!' : e.round ? `+${e.n} all hits` : `+${e.n} next`, '#ffb03a'); } sfx.buff(); return delay(120); }
      case 'fizzle': case 'skip': { const s = slotEl(e.slot); if (s) { const p = at(s); floatText(p.x, p.y - 40, e.text, '#a99fcc'); } return delay(200); }
      case 'stun': { const el = foeEls[e.i]; const p = at(el); floatText(p.x, p.y, 'Bribed!', '#ffd166'); sfx.coin(); return delay(250); }
      case 'cardsDone': if (e.dmg >= 60) { const p = at(arena); floatText(p.x, p.y + 40, e.dmg + ' this round!', '#ffd166', true); } return delay(220);
      case 'roundEnd': renderIntents(); enemiesEl.classList.toggle('n3', alive(B).length >= 3); if (!B.pre || !B.pre.mult) multBadge.classList.remove('on'); arr.render(); return;
      case 'mult': { showMult(e.m); const s = e.slot != null ? slotEl(e.slot) : null; const p = at(s || arena); floatText(p.x, p.y - 44, '×' + e.by, '#ffd166', true); sfx.buff(); return delay(160); }
      case 'grow': { const s = e.slot != null ? slotEl(e.slot) : null; if (s) { const p = at(s); floatText(p.x, p.y - 30, `+${e.n} grows`, '#6dffb0'); } return delay(120); }
      case 'miss': { const s = slotEl(e.slot); const p = at(s || arena); floatText(p.x, p.y - 30, 'MISS!', '#6dffb0', true); sfx.blocked(); const el = foeEls[e.i]; if (el) { el.classList.remove('lunge'); void el.offsetWidth; el.classList.add('lunge'); } return delay(350); }
      case 'jam': {
        const s = slotEl(e.slot);
        if (s) { s.classList.remove('jolt'); void s.offsetWidth; s.classList.add('jolt'); const p = at(s); floatText(p.x, p.y - 30, e.kind === 'blind' ? 'BLINDED' : 'JAMMED', e.kind === 'blind' ? '#b07cff' : '#ff8a9b', true); }
        sfx.shred(); return delay(260);
      }
      case 'tactic': { const p = at(arena); floatText(p.x, p.y, e.name + '!', '#4cc9f0', true); sfx.reveal('U'); burst(p.x, p.y, { count: 24, colors: ['#4cc9f0', '#fff'], speed: 5 }); return delay(420); }
      case 'repair': arr.render(); sfx.heal(); toast('<b>Hot Glue</b> — jams cleared' + (e.slot != null ? ', a card is back in action!' : '.')); return delay(250);
      case 'reshuffle': renderIntents(); sfx.flip(); return delay(250);
      default: return;
    }
  }

  async function doRound() {
    if (playing || B.over) return;
    playing = true; arr.clear(); bottom.style.pointerEvents = 'none'; tacBar.style.pointerEvents = 'none'; fightBtn.disabled = true;
    if (!meta.seenAim && alive(B).some(x => intentView(B, x).aim)) { meta.seenAim = true; saveMeta(); }
    const evs = playRound(B);
    for (const e of evs) await handle(e);
    playing = false; bottom.style.pointerEvents = ''; tacBar.style.pointerEvents = ''; fightBtn.disabled = false; updIncoming(); arr.render(); showRule(); showMult(B.pre && B.pre.mult);
    if (B.over) return end();
    if (auto) setTimeout(doRound, 350 / speed);
  }

  fightBtn.addEventListener('click', () => { sfx.tap(); doRound(); });
  autoBtn.addEventListener('click', () => { auto = !auto; autoBtn.textContent = 'Auto: ' + (auto ? 'on' : 'off'); sfx.tap(); if (auto) doRound(); });

  function end() {
    fightBtn.disabled = true; autoBtn.disabled = true;
    if (B.over === 'win') {
      sfx.win(); banner('VICTORY', '', '#6dffb0');
      const p = at(arena); burst(p.x, p.y, { count: 90, colors: ['#ff4fd8', '#ffd166', '#6dffb0', '#4cc9f0'], kind: 'confetti', speed: 9, lift: 3 });
    } else { sfx.lose(); banner('DEFEATED', '', '#ff5d73'); music(null); }
    setTimeout(() => ctx.onEnd(B), 1500);
  }
}
