// Grading rules for the Back Room's slab minigame. Pure — no DOM.
// A grade (1–10) comes from three sub-grades, like real card grading:
//   centering (your timing), surface (how much dust you wiped), corners (luck of the print).
// The final grade can't be more than 1 above the worst sub-grade, and a 10 needs all three perfect.

export const GRADE_NAMES = { 10: 'GEM MINT', 9: 'MINT', 8: 'NM-MT', 7: 'NEAR MINT', 6: 'EX-MT', 5: 'EXCELLENT', 4: 'VG-EX', 3: 'VERY GOOD', 2: 'GOOD', 1: 'POOR' };

// off = distance from perfect centre, 0..1 (1 = at the edge of travel)
export function centeringScore(off) {
  const a = Math.abs(off);
  if (a < 0.05) return 10;
  if (a < 0.12) return 9;
  if (a < 0.22) return 8;
  if (a < 0.34) return 7;
  if (a < 0.5) return 6;
  return 5;
}

// frac = share of dust specks wiped away, 0..1
export function surfaceScore(frac) {
  if (frac >= 1) return 10;
  if (frac >= 0.85) return 9;
  if (frac >= 0.7) return 8;
  if (frac >= 0.5) return 7;
  if (frac >= 0.25) return 6;
  return 4;
}

// One corner's condition, rolled with rnd() in [0,1).
const CORNERS = [[10, 22], [9, 38], [8, 24], [7, 10], [6, 6]];
export function rollCorner(rnd = Math.random) {
  let x = rnd() * 100;
  for (const [g, p] of CORNERS) { if ((x -= p) < 0) return g; }
  return 6;
}
export const cornersScore = corners => Math.round(corners.reduce((s, c) => s + c, 0) / corners.length);

export function finalGrade({ centering, surface, corners }) {
  const subs = [centering, surface, corners];
  const avg = Math.round(subs.reduce((s, v) => s + v, 0) / subs.length);
  // GEM MINT 10 only when every sub-grade is perfect
  return Math.max(1, Math.min(subs.every(v => v === 10) ? 10 : 9, avg, Math.min(...subs) + 1));
}
