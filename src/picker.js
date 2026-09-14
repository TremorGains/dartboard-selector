import { cryptoUint32, randomInt, randomFloat } from './random.js';

// Fraction trimmed from each side of the card when choosing where the dart
// lands, so it always lands in the central 60%.
const LANDING_INSET = 0.2;

/** Index of the winning entry, chosen uniformly. */
export function pickWinner(entries, rng = cryptoUint32) {
  if (entries.length === 0) throw new Error('pickWinner: no entries to pick from');
  return randomInt(entries.length, rng);
}

/** Random point in the central 60% of rect ({ x, y, width, height }, top-left origin). */
export function pickLandingPoint(rect, rng = cryptoUint32) {
  const span = 1 - 2 * LANDING_INSET;
  return {
    x: rect.x + rect.width * (LANDING_INSET + randomFloat(rng) * span),
    y: rect.y + rect.height * (LANDING_INSET + randomFloat(rng) * span),
  };
}
