// Builds one winding board per floor. Each board is a single snake-like path
// from Start to the Boss Room laid out on a grid (grid positions matter for
// Yessi's bombs and the Land Slide trap).
import { TILE } from './data.js';

function snakeRows(cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const xs = [...Array(cols).keys()];
    if (r % 2 === 0) xs.reverse();
    for (const x of xs) cells.push([x, r]);
  }
  return cells;
}
function snakeCols(cols, rows) {
  const cells = [];
  for (let c = 0; c < cols; c++) {
    const zs = [...Array(rows).keys()];
    if (c % 2 === 1) zs.reverse();
    for (const z of zs) cells.push([c, z]);
  }
  return cells;
}
function spiral(n) {
  const cells = [];
  let x0 = 0, y0 = 0, x1 = n - 1, y1 = n - 1;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) cells.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) cells.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) cells.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) cells.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  return cells;
}
// A path with gaps between rows (rows connected at alternating ends).
function ladder(cols, rungs) {
  const cells = [];
  for (let r = 0; r < rungs; r++) {
    const z = r * 2;
    const xs = [...Array(cols).keys()];
    if (r % 2 === 1) xs.reverse();
    for (const x of xs) cells.push([x, z]);
    if (r < rungs - 1) cells.push([r % 2 === 0 ? cols - 1 : 0, z + 1]);
  }
  return cells;
}

const SHAPES = {
  1: () => snakeRows(6, 6),
  2: () => snakeCols(6, 6),
  3: () => ladder(7, 5),
  4: () => spiral(6),
  5: () => snakeRows(7, 5),
};

export function buildBoard(floor, rng) {
  const cells = SHAPES[floor]();
  const n = cells.length;
  const inner = n - 2;
  const nMonster = Math.round(inner * 0.27);
  const nTreasure = Math.round(inner * 0.24);
  const nTrap = Math.round(inner * 0.24);
  const pool = [];
  for (let i = 0; i < nMonster; i++) pool.push(TILE.MONSTER);
  for (let i = 0; i < nTreasure; i++) pool.push(TILE.TREASURE);
  for (let i = 0; i < nTrap; i++) pool.push(TILE.TRAP);
  while (pool.length < inner) pool.push(TILE.BLANK);

  // Shuffle until there are no 3-in-a-row repeats and the first tile isn't a trap.
  let types;
  for (let attempt = 0; attempt < 500; attempt++) {
    types = rng.shuffle(pool.slice());
    let ok = types[0] !== TILE.TRAP;
    for (let i = 2; ok && i < types.length; i++) {
      if (types[i] === types[i - 1] && types[i] === types[i - 2]) ok = false;
    }
    if (ok) break;
  }
  const tiles = cells.map(([x, z], i) => ({
    i, x, z,
    type: i === 0 ? TILE.START : i === n - 1 ? TILE.BOSS : types[i - 1],
  }));
  return { floor, tiles, bossIdx: n - 1, cols: Math.max(...cells.map((c) => c[0])) + 1, rows: Math.max(...cells.map((c) => c[1])) + 1 };
}

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (n) => Math.floor(next() * n),
    die: () => 1 + Math.floor(next() * 6),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}
