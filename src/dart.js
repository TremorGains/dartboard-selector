import { toPercent } from './board.js';

export const FLIGHT_MS = 700;

const WOBBLE_MS = 450;
const FLIGHT_STEPS = 10;

// Constant markup only — never put user text in here.
const DART_SVG = `
<svg class="dart-svg" viewBox="0 -12 120 24" aria-hidden="true">
  <path d="M0 0 L18 -1.4 L18 1.4 Z" fill="#cfd4db"/>
  <rect x="18" y="-3.4" width="30" height="6.8" rx="2.4" fill="#3b4048"/>
  <path d="M24 -3.4v6.8M29 -3.4v6.8M34 -3.4v6.8M39 -3.4v6.8M44 -3.4v6.8" stroke="#6b727d" stroke-width="1"/>
  <rect x="48" y="-1.7" width="28" height="3.4" rx="1" fill="#1e1f22"/>
  <path d="M72 0 L94 -11 L118 -11 L104 0 L118 11 L94 11 Z" fill="#e0442f" stroke="#8e1f12" stroke-width="1"/>
  <path d="M72 0 H112" stroke="#8e1f12" stroke-width="1.2"/>
</svg>`;

export function clearDarts(layer) {
  layer.replaceChildren();
}

/**
 * Sticks a dart into the board at `point` (board units). Resolves on impact;
 * the wobble afterwards runs on its own.
 */
export function throwDart(layer, point, { reducedMotion = false } = {}) {
  clearDarts(layer);
  const dart = document.createElement('div');
  dart.className = 'dart';
  dart.style.left = `${toPercent(point.x)}%`;
  dart.style.top = `${toPercent(point.y)}%`;
  const body = document.createElement('div');
  body.className = 'dart-body';
  body.innerHTML = DART_SVG;
  dart.append(body);
  layer.append(dart);

  if (reducedMotion) return Promise.resolve();

  const flight = dart.animate(flightKeyframes(layer.clientWidth), { duration: FLIGHT_MS, easing: 'ease-in' });
  return flight.finished.then(() => {
    body.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-7deg)' },
        { transform: 'rotate(5deg)' },
        { transform: 'rotate(-3deg)' },
        { transform: 'rotate(1.5deg)' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: WOBBLE_MS, easing: 'ease-out' },
    );
  });
}

/** A curved path in from the bottom right, shrinking as it "moves away" into the board. */
function flightKeyframes(boardWidth) {
  const start = { x: 0.95 * boardWidth, y: 1.1 * boardWidth };
  const control = { x: 0.55 * boardWidth, y: 0.05 * boardWidth };
  const frames = [];
  for (let i = 0; i <= FLIGHT_STEPS; i++) {
    const t = i / FLIGHT_STEPS;
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x; // quadratic Bézier ending at (0, 0)
    const y = u * u * start.y + 2 * u * t * control.y;
    frames.push({
      offset: t,
      opacity: Math.min(1, t / 0.15),
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(2.6 - 1.6 * t).toFixed(3)}) rotate(${(-14 * u).toFixed(2)}deg)`,
    });
  }
  return frames;
}
