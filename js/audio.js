// HOLO sound — everything synthesised with Web Audio (no files).
// Musical palette: A minor pentatonic so rising combo notes always sound good.
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
const S = { sound: true, music: true };
const PENTA = [0, 3, 5, 7, 10];

export function audioSettings(o) {
  Object.assign(S, o);
  if (master) { sfxBus.gain.value = S.sound ? 0.9 : 0; musicBus.gain.value = S.music ? 0.32 : 0; }
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    audioSettings({});
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const now = () => ctx.currentTime;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const penta = (i, base = 69) => base + Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5];

function tone(freq, { t = 0, dur = 0.25, type = 'sine', vol = 0.3, attack = 0.005, slide = 0, bus = sfxBus, filter = 0 } = {}) {
  if (!ctx) return;
  const t0 = now() + t;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ t = 0, dur = 0.2, vol = 0.3, freq = 2000, q = 1, type = 'bandpass', sweep = 0 } = {}) {
  if (!ctx) return;
  const t0 = now() + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}

// a soft bell: sine + quiet octave partial
function bell(n, t = 0, vol = 0.22, dur = 0.9) {
  tone(midi(n), { t, dur, vol, type: 'sine' });
  tone(midi(n + 12), { t, dur: dur * 0.6, vol: vol * 0.35, type: 'triangle' });
}

export const sfx = {
  tap() { tone(1200, { dur: 0.05, vol: 0.08, type: 'triangle' }); },
  back() { tone(700, { dur: 0.07, vol: 0.08, type: 'triangle', slide: 0.7 }); },
  tearGrain(p) { noise({ dur: 0.05, vol: 0.12 + p * 0.1, freq: 2500 + p * 3500, q: 0.8, type: 'highpass' }); },
  tearDone() { noise({ dur: 0.35, vol: 0.4, freq: 6000, q: 0.6, type: 'highpass', sweep: 0.3 }); tone(220, { dur: 0.3, vol: 0.12, type: 'sine', slide: 0.5 }); },
  whoosh() { noise({ dur: 0.3, vol: 0.18, freq: 600, q: 0.7, sweep: 4 }); },
  flip() { noise({ dur: 0.06, vol: 0.2, freq: 3000, q: 2 }); tone(900, { dur: 0.05, vol: 0.06, type: 'square', filter: 2000 }); },
  charge(level) { // building tension before a rare reveal
    const n = 57 + level * 5;
    for (let i = 0; i < 6; i++) tone(midi(n + i * 2), { t: i * 0.09, dur: 0.12, vol: 0.06 + i * 0.015, type: 'sawtooth', filter: 1800 + i * 400 });
  },
  reveal(r) {
    if (r === 'C') { bell(81, 0, 0.12, 0.4); return; }
    if (r === 'U') { bell(81, 0, 0.16); bell(88, 0.08, 0.16); return; }
    if (r === 'R') { [0, 1, 2, 3, 4, 5].forEach(i => bell(penta(i + 5, 69), i * 0.06, 0.16)); noise({ t: 0.05, dur: 0.6, vol: 0.06, freq: 9000, type: 'highpass' }); return; }
    // Mythic: a chord swell + glittering cascade
    [57, 64, 69, 72, 76].forEach(n => tone(midi(n), { dur: 1.8, vol: 0.09, type: 'sawtooth', attack: 0.15, filter: 2400 }));
    for (let i = 0; i < 14; i++) bell(penta(14 - i + 5, 69), 0.2 + i * 0.05, 0.1, 0.6);
    noise({ dur: 1.2, vol: 0.1, freq: 8000, type: 'highpass' });
  },
  holo() { for (let i = 0; i < 5; i++) tone(midi(96 + PENTA[i]), { t: i * 0.04, dur: 0.25, vol: 0.05, type: 'sine' }); },
  combo(n) { const m = penta(Math.min(n - 1, 16), 64); tone(midi(m), { dur: 0.18, vol: 0.14, type: 'triangle' }); tone(midi(m + 12), { dur: 0.1, vol: 0.04, type: 'sine' }); },
  hit(big) {
    tone(big ? 90 : 140, { dur: big ? 0.35 : 0.16, vol: big ? 0.45 : 0.3, type: 'sine', slide: 0.45 });
    noise({ dur: big ? 0.25 : 0.1, vol: big ? 0.35 : 0.2, freq: big ? 1200 : 1800, q: 0.8 });
  },
  blocked() { tone(1400, { dur: 0.25, vol: 0.1, type: 'triangle' }); tone(2100, { dur: 0.2, vol: 0.05, type: 'sine' }); },
  block() { tone(660, { dur: 0.18, vol: 0.1, type: 'triangle', slide: 1.5 }); },
  burn() { noise({ dur: 0.25, vol: 0.18, freq: 900, q: 0.5, type: 'lowpass', sweep: 3 }); },
  poison() { for (let i = 0; i < 3; i++) tone(300 + Math.random() * 200, { t: i * 0.05, dur: 0.08, vol: 0.07, type: 'sine', slide: 1.8 }); },
  heal() { [0, 2, 4].forEach((i, k) => bell(penta(i + 10, 64), k * 0.05, 0.08, 0.5)); },
  coin() { tone(midi(88), { dur: 0.08, vol: 0.1, type: 'square', filter: 4000 }); tone(midi(95), { t: 0.07, dur: 0.25, vol: 0.1, type: 'square', filter: 4000 }); },
  buff() { tone(midi(76), { dur: 0.15, vol: 0.08, type: 'triangle', slide: 1.5 }); },
  enemyAtk() { noise({ dur: 0.18, vol: 0.2, freq: 500, q: 1, sweep: 0.5 }); },
  hurt() { tone(110, { dur: 0.3, vol: 0.35, type: 'square', slide: 0.6, filter: 900 }); },
  die() { tone(400, { dur: 0.5, vol: 0.18, type: 'triangle', slide: 0.25 }); noise({ dur: 0.4, vol: 0.15, freq: 1500, sweep: 0.2 }); },
  shred() { for (let i = 0; i < 8; i++) noise({ t: i * 0.035, dur: 0.05, vol: 0.25, freq: 3000 + i * 300, q: 3 }); },
  win() { [0, 2, 4, 5, 7].forEach((i, k) => bell(penta(i + 5, 64), k * 0.1, 0.18, 1.2)); },
  lose() { [4, 3, 1, 0].forEach((i, k) => tone(midi(penta(i, 57)), { t: k * 0.22, dur: 0.6, vol: 0.12, type: 'triangle' })); },
  buy() { tone(midi(84), { dur: 0.06, vol: 0.12, type: 'square', filter: 3000 }); tone(midi(91), { t: 0.06, dur: 0.06, vol: 0.12, type: 'square', filter: 3000 }); noise({ t: 0.1, dur: 0.15, vol: 0.12, freq: 5000, type: 'highpass' }); },
  drum(i) { tone(160 + i * 6, { dur: 0.08, vol: 0.18, type: 'sine', slide: 0.5 }); noise({ dur: 0.04, vol: 0.08, freq: 2500 }); },
  jackpot() { for (let i = 0; i < 12; i++) tone(midi(penta(i + 5, 69)), { t: i * 0.04, dur: 0.15, vol: 0.1, type: 'square', filter: 5000 }); },
  phase() { tone(55, { dur: 1.6, vol: 0.4, type: 'sawtooth', filter: 300 }); noise({ dur: 1.2, vol: 0.2, freq: 200, type: 'lowpass' }); },
};

// ---------------- music: gentle generative loop ----------------
let musicTimer = null, musicMode = null, step = 0;
const PROGS = {
  calm: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  fight: [[57, 60, 64], [57, 60, 65], [53, 57, 60], [52, 56, 59]],
  boss: [[45, 48, 52], [46, 50, 53], [45, 48, 52], [44, 47, 52]],
};
export function music(mode) {
  if (musicMode === mode) return;
  musicMode = mode;
  clearInterval(musicTimer); musicTimer = null;
  if (!mode || !ctx) return;
  const prog = PROGS[mode] || PROGS.calm;
  const bpm = mode === 'boss' ? 104 : mode === 'fight' ? 92 : 72;
  const beat = 60 / bpm / 2; // 8th notes
  step = 0;
  const tick = () => {
    if (!ctx || ctx.state !== 'running') return;
    const bar = Math.floor(step / 8) % prog.length, b = step % 8;
    const chord = prog[bar];
    if (b === 0) chord.forEach(n => tone(midi(n), { dur: beat * 8.5, vol: 0.05, type: 'sawtooth', attack: 0.4, filter: mode === 'boss' ? 900 : 700, bus: musicBus }));
    if (b === 0) tone(midi(chord[0] - 12), { dur: beat * 4, vol: 0.14, type: 'sine', bus: musicBus });
    if (mode !== 'calm' && b === 4) tone(midi(chord[0] - 12), { dur: beat * 3, vol: 0.1, type: 'sine', bus: musicBus });
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    if (mode !== 'calm' || b % 2 === 0) tone(midi(chord[arp[b]] + 12), { dur: beat * 1.6, vol: 0.035, type: 'triangle', bus: musicBus });
    if (mode === 'boss' && b % 2 === 1) noise({ dur: 0.05, vol: 0.03, freq: 7000, type: 'highpass' });
    step++;
  };
  tick();
  musicTimer = setInterval(tick, beat * 1000);
}
