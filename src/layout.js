import { mulberry32, randomInt, randomFloat } from './random.js';

// Card positions in board units: (0, 0) is the board centre and every card
// lies entirely inside a circle of `radius`. Cards are squares of side
// `size`, rotated by `tilt` degrees, placed on a square grid clipped to the
// circle and then nudged by a little jitter so the board looks hand-pinned.
//
// Why cards can't overlap: two grid cells differ by at least one pitch on
// some axis. After jitter they still differ by pitch − 2·jitter on that axis,
// which is at least the width of two tilted cards' bounding boxes.

const MAX_TILT_DEG = 8;
const MAX_TILT_RAD = (MAX_TILT_DEG * Math.PI) / 180;
const TILT_SPREAD = Math.cos(MAX_TILT_RAD) + Math.sin(MAX_TILT_RAD); // tilted bounding box / card side ≈ 1.129
const PITCH_PER_SIZE = 1.25; // grid pitch / card side
const JITTER = ((PITCH_PER_SIZE - TILT_SPREAD) / 2) * 0.95; // max per-axis jitter / card side
const MAX_SIZE_FRACTION = 0.5; // largest card side, as a fraction of radius
const SHRINK_STEP = 0.98;

/** Returns [{ x, y, size, tilt }], one per entry, in entry order. */
export function layoutEntries(count, radius, seed) {
  if (count === 0) return [];
  const rng = mulberry32(seed);
  const { cells, size } = fitGrid(count, radius);

  // Partial Fisher–Yates: a random subset of cells, in random order.
  const pool = cells.slice();
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(pool.length - i, rng);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count).map((cell) => ({
    x: cell.x + (randomFloat(rng) * 2 - 1) * JITTER * size,
    y: cell.y + (randomFloat(rng) * 2 - 1) * JITTER * size,
    size,
    tilt: (randomFloat(rng) * 2 - 1) * MAX_TILT_DEG,
  }));
}

/** Pulls a card's centre back so the whole card, at any tilt, stays inside `radius`. */
export function clampToBoard({ x, y }, size, radius) {
  const reach = radius - size * Math.SQRT1_2; // centre limit for the card's circumscribed circle
  if (reach <= 0) return { x: 0, y: 0 };
  const distance = Math.hypot(x, y);
  if (distance <= reach) return { x, y };
  return { x: (x / distance) * reach, y: (y / distance) * reach };
}

/**
 * Moves the cards of dragged entries (those with `pos`) to where they were dropped,
 * kept inside the board. Dragged cards may overlap others — that's the user's choice.
 */
export function applyPins(cards, entries, radius) {
  return cards.map((card, i) => {
    const pos = entries[i]?.pos;
    return pos ? { ...card, ...clampToBoard(pos, card.size, radius) } : card;
  });
}

/** Largest card size whose grid has at least `count` cells inside the board. */
function fitGrid(count, radius) {
  let size = radius * MAX_SIZE_FRACTION;
  for (;;) {
    const cells = gridCells(size, radius);
    if (cells.length >= count) return { cells, size };
    size *= SHRINK_STEP;
  }
}

/** Grid cell centres far enough from the edge for a tilted, jittered card. */
function gridCells(size, radius) {
  const pitch = size * PITCH_PER_SIZE;
  const reach = radius - size * (Math.SQRT1_2 + JITTER * Math.SQRT2);
  if (reach < 0) return [];
  const steps = Math.ceil(reach / pitch) + 1;
  let best = [];
  // A cell on the centre suits odd counts, a grid line on the centre suits even ones.
  for (const offset of [0, 0.5]) {
    const cells = [];
    for (let i = -steps; i <= steps; i++) {
      for (let j = -steps; j <= steps; j++) {
        const x = (i + offset) * pitch;
        const y = (j + offset) * pitch;
        if (Math.hypot(x, y) <= reach) cells.push({ x, y });
      }
    }
    if (cells.length > best.length) best = cells;
  }
  return best;
}
