// Seeded RNG (mulberry32). Whole runs are reproducible from a seed + step count,
// which powers the Daily run and lets a saved run resume identically.
export function makeRng(seed) {
  let s = seed >>> 0;
  const r = {
    get state() { return s; },
    set state(v) { s = v >>> 0; },
    next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(r.next() * arr.length)]; },
    chance(p) { return r.next() < p; },
    weighted(obj) { // {key: weight}
      let tot = 0; for (const k in obj) tot += obj[k];
      let x = r.next() * tot;
      for (const k in obj) { x -= obj[k]; if (x < 0) return k; }
      return Object.keys(obj)[0];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
  };
  return r;
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
