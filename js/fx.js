// HOLO particles + floating text + shake. One overlay canvas over #app.
let cv, cx, parts = [], raf = 0, app, reduce = false;

export function initFx(appEl, canvas) {
  app = appEl; cv = canvas; cx = cv.getContext('2d');
  const fit = () => { const r = app.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit);
}
export function setReduceMotion(v) { reduce = v; }

// position of an element's centre relative to #app
export function centerOf(el) {
  const a = app.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, w: r.width, h: r.height };
}

export function burst(x, y, o = {}) {
  const n = reduce ? Math.ceil((o.count || 16) / 4) : (o.count || 16);
  const colors = o.colors || [o.color || '#fff'];
  for (let i = 0; i < n; i++) {
    const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2;
    const sp = (o.speed || 4) * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0), life: 1, decay: 0.012 + Math.random() * 0.02 * (o.fast ? 2 : 1),
      size: (o.size || 3) * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], kind: o.kind || 'spark', g: o.gravity ?? 0.12, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}

function loop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98; p.life -= p.decay; p.rot += p.vr;
    cx.globalAlpha = Math.max(0, p.life);
    cx.fillStyle = p.color;
    if (p.kind === 'confetti') {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); cx.restore();
    } else if (p.kind === 'star') {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.beginPath();
      for (let k = 0; k < 8; k++) { const r = k % 2 ? p.size * 0.4 : p.size * 1.4; cx.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); }
      cx.fill(); cx.restore();
    } else {
      cx.globalCompositeOperation = 'lighter';
      cx.beginPath(); cx.arc(p.x, p.y, p.size * p.life + 0.5, 0, Math.PI * 2); cx.fill();
      cx.globalCompositeOperation = 'source-over';
    }
  }
  cx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}

export function floatText(x, y, text, color = '#fff', big = false) {
  const d = document.createElement('div');
  d.className = 'float' + (big ? ' big' : '');
  d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.color = color;
  app.appendChild(d); setTimeout(() => d.remove(), 1000);
}

export function shake(big = false) {
  if (reduce) return;
  const el = app.querySelector('.screen:last-of-type') || app;
  el.classList.remove('shake', 'bigshake'); void el.offsetWidth;
  el.classList.add(big ? 'bigshake' : 'shake');
  setTimeout(() => el.classList.remove('shake', 'bigshake'), 600);
  if (navigator.vibrate) try { navigator.vibrate(big ? 40 : 15); } catch (e) {}
}

export function banner(text, sub = '', color = '#ff4fd8') {
  const d = document.createElement('div');
  d.className = 'banner'; d.style.setProperty('--bc', color);
  d.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  app.appendChild(d); setTimeout(() => d.remove(), 1650);
}

export const RARITY_FX = {
  C: ['#ffffff', '#d8d2c4'],
  U: ['#5fd3ff', '#bff0ff', '#ffffff'],
  R: ['#ffcc33', '#fff3b0', '#ff9a3d', '#ffffff'],
  M: ['#ff4fd8', '#ffd166', '#6dffb0', '#4cc9f0', '#b07cff', '#ffffff'],
};
