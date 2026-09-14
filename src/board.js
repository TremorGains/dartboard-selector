// The SVG dartboard and the entry cards pinned to it.
// Board units: the SVG viewBox spans -100..100 on both axes, so a board-unit
// coordinate u sits at CSS percentage (u + 100) / 2 of the board's width.

import { clampToBoard } from './layout.js';

export const PLAYABLE_RADIUS = 85;

const DRAG_THRESHOLD_PX = 4; // smaller pointer moves count as a click, not a drag

const SVG_NS = 'http://www.w3.org/2000/svg';
const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Regulation proportions, scaled so the outer double wire sits at 80.
const R = { bull: 3, outerBull: 7.5, trebleIn: 46.6, trebleOut: 50.4, doubleIn: 76.2, doubleOut: 80, numbers: 90, edge: 100 };
const COLORS = { dark: '#1b1b1b', light: '#efe3c2', red: '#c8243a', green: '#12804a', wire: '#b9bcc0', surround: '#101010' };
const SEGMENT = (2 * Math.PI) / 20;

export function toPercent(u) {
  return (u + 100) / 2;
}

/**
 * `canDrag()` says whether cards may be moved right now; `onMove(index, point)` is called
 * when a card is dropped, with its new centre in board units (already kept inside the board).
 */
export function createBoard(container, { canDrag = () => true, onMove = () => {} } = {}) {
  const cardsLayer = el('div', 'cards');
  const empty = el('p', 'board-empty');
  empty.textContent = 'Add names or pictures to pin them here';
  const dartLayer = el('div', 'dart-layer');
  container.append(buildDartboardSvg(), cardsLayer, empty, dartLayer);
  let cardEls = [];
  let slots = [];

  cardsLayer.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.card');
    if (!card || !event.isPrimary || event.button !== 0 || !canDrag()) return;
    event.preventDefault(); // no text selection or native image drag
    dragCard(card, cardEls.indexOf(card), event);
  });

  function dragCard(card, index, start) {
    const slot = slots[index];
    const rect = container.getBoundingClientRect();
    const toBoard = (e) => ({
      x: ((e.clientX - rect.left) / rect.width) * 200 - 100,
      y: ((e.clientY - rect.top) / rect.height) * 200 - 100,
    });
    const grab = toBoard(start);
    const offset = { x: slot.x - grab.x, y: slot.y - grab.y };
    let dropAt = null;

    const place = ({ x, y }) => {
      card.style.left = `${toPercent(x)}%`;
      card.style.top = `${toPercent(y)}%`;
    };
    const onPointerMove = (e) => {
      if (!dropAt && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < DRAG_THRESHOLD_PX) return;
      card.classList.add('is-dragging');
      const p = toBoard(e);
      dropAt = clampToBoard({ x: p.x + offset.x, y: p.y + offset.y }, slot.size, PLAYABLE_RADIUS);
      place(dropAt);
    };
    const onPointerEnd = (e) => {
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerEnd);
      card.removeEventListener('pointercancel', onPointerEnd);
      card.classList.remove('is-dragging');
      if (!dropAt) return;
      if (e.type === 'pointerup') onMove(index, dropAt);
      else place(slot); // cancelled: snap back
    };

    card.setPointerCapture(start.pointerId);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerEnd);
    card.addEventListener('pointercancel', onPointerEnd);
  }

  return {
    dartLayer,
    render(entries, layout, imageUrlFor) {
      slots = layout;
      cardEls = entries.map((entry, i) => buildCard(entry, layout[i], imageUrlFor(entry)));
      cardsLayer.replaceChildren(...cardEls);
      empty.hidden = entries.length > 0;
    },
    highlight(index) {
      cardEls.forEach((card, i) => card.classList.toggle('is-hit', i === index));
    },
    shake() {
      container.animate(
        [
          { translate: '0 0' },
          { translate: '-4px 3px' },
          { translate: '3px -2px' },
          { translate: '-2px 1px' },
          { translate: '0 0' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
    },
  };
}

function buildCard(entry, slot, imageUrl) {
  const card = el('div', `card card-${entry.type}`);
  card.style.left = `${toPercent(slot.x)}%`;
  card.style.top = `${toPercent(slot.y)}%`;
  card.style.setProperty('--s', String(slot.size / 2)); // side as % of board width
  card.style.setProperty('--tilt', `${slot.tilt}deg`);
  if (entry.pos) card.style.setProperty('--z', String(entry.pos.z)); // dragged cards stack in drop order
  card.title = entry.label;
  if (entry.type === 'image' && imageUrl) {
    const img = el('img');
    img.src = imageUrl;
    img.alt = entry.label;
    img.draggable = false;
    card.append(img);
  } else {
    const text = el('span', 'card-label');
    text.textContent = entry.label;
    card.append(text);
  }
  return card;
}

function buildDartboardSvg() {
  const svg = svgEl('svg', { viewBox: '-100 -100 200 200', class: 'dartboard', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', { r: R.edge, fill: COLORS.surround }));

  NUMBERS.forEach((number, i) => {
    const mid = -Math.PI / 2 + i * SEGMENT; // 20 at the top, clockwise
    const a1 = mid - SEGMENT / 2;
    const a2 = mid + SEGMENT / 2;
    const single = i % 2 === 0 ? COLORS.dark : COLORS.light;
    const ring = i % 2 === 0 ? COLORS.red : COLORS.green;
    svg.append(
      sector(R.outerBull, R.trebleIn, a1, a2, single),
      sector(R.trebleIn, R.trebleOut, a1, a2, ring),
      sector(R.trebleOut, R.doubleIn, a1, a2, single),
      sector(R.doubleIn, R.doubleOut, a1, a2, ring),
    );
    const label = svgEl('text', {
      x: (R.numbers * Math.cos(mid)).toFixed(2),
      y: (R.numbers * Math.sin(mid)).toFixed(2),
      class: 'board-number',
    });
    label.textContent = String(number);
    svg.append(label);
  });

  svg.append(
    svgEl('circle', { r: R.outerBull, fill: COLORS.green }),
    svgEl('circle', { r: R.bull, fill: COLORS.red }),
  );

  const wires = svgEl('g', { fill: 'none', stroke: COLORS.wire, 'stroke-width': 0.35 });
  for (const r of [R.bull, R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut]) {
    wires.append(svgEl('circle', { r }));
  }
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * SEGMENT;
    wires.append(
      svgEl('line', {
        x1: (R.outerBull * Math.cos(a)).toFixed(3),
        y1: (R.outerBull * Math.sin(a)).toFixed(3),
        x2: (R.doubleOut * Math.cos(a)).toFixed(3),
        y2: (R.doubleOut * Math.sin(a)).toFixed(3),
      }),
    );
  }
  svg.append(wires);
  return svg;
}

/** Annular sector between radii r1 < r2 and angles a1 < a2 (radians, clockwise). */
function sector(r1, r2, a1, a2, fill) {
  const pt = (r, a) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
  const d = `M ${pt(r2, a1)} A ${r2} ${r2} 0 0 1 ${pt(r2, a2)} L ${pt(r1, a2)} A ${r1} ${r1} 0 0 0 ${pt(r1, a1)} Z`;
  return svgEl('path', { d, fill });
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
