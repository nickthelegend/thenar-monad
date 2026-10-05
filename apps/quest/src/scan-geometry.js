// From a camera picture of the table to the arm's frame, with a sheet of A4 as
// the ruler. No markers to print, no API key: every desk has paper.
//
// The sheet lies flat in front of the arm, long side pointing away from it,
// and its near edge centred on the base, `A4_GAP_MM` ahead of the base's
// centre. Clicking its four corners in the picture fixes a homography from
// image pixels to table millimetres, which is exact for anything on the table
// plane: where an object touches the table (the bottom of its box) maps to a
// true position the arm can reach.

export const A4 = { long: 297, short: 210 };
export const A4_GAP_MM = 90;

/** The sheet's corners in the arm frame (mm, Z up, +X away from the base),
 *  in the order the user is asked to click them. */
export function sheetCorners(gap = A4_GAP_MM) {
  const h = A4.short / 2;
  return [
    { name: "near left", x: gap, y: h },
    { name: "near right", x: gap, y: -h },
    { name: "far right", x: gap + A4.long, y: -h },
    { name: "far left", x: gap + A4.long, y: h },
  ];
}

/** Solve A x = b (n×n, row-major) by Gaussian elimination with pivoting. */
function solve(A, b, n) {
  A = A.slice();
  b = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (Math.abs(A[p * n + c]) < 1e-12) throw new Error("the four points are degenerate (three in a line?)");
    if (p !== c) {
      for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
      [b[c], b[p]] = [b[p], b[c]];
    }
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / A[c * n + c];
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return x;
}

/** The 3×3 homography (h33 = 1) taking four `from` points onto four `to` points. */
export function homography(from, to) {
  if (from.length !== 4 || to.length !== 4) throw new Error("a homography needs exactly four point pairs");
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push(x, y, 1, 0, 0, 0, -u * x, -u * y);
    b.push(u);
    A.push(0, 0, 0, x, y, 1, -v * x, -v * y);
    b.push(v);
  }
  return [...solve(A, b, 8), 1];
}

export function apply(H, { x, y }) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) throw new Error("point maps to infinity");
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Is the clicked quadrilateral a plausible picture of a flat sheet? Convex,
 * clicked in order (no crossing), and not a sliver. Returns a sentence when it
 * is not, so the page can say what to fix.
 */
export function checkQuad(pts) {
  if (pts.length !== 4) return "Click all four corners.";
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return "Three of the corners are in a line; click the sheet's four corners.";
    const s = Math.sign(cross);
    if (sign && s !== sign) return "The corners cross over: click them in order, near left → near right → far right → far left.";
    sign = s;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) area += pts[i].x * pts[(i + 1) % 4].y - pts[(i + 1) % 4].x * pts[i].y;
  if (Math.abs(area) / 2 < 400) return "The sheet is too small in the picture: move the camera closer.";
  return null;
}

/** Where an object's box touches the table: the middle of its bottom edge. */
export const footprint = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h });
