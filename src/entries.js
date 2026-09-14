import { newId } from './random.js';

export const MAX_ENTRIES = 50;
export const MAX_LABEL_LENGTH = 80;

/** Trims and caps a label at MAX_LABEL_LENGTH characters (never splits an emoji). */
export function normalizeLabel(text) {
  return Array.from(String(text).trim()).slice(0, MAX_LABEL_LENGTH).join('');
}

/** One label per non-blank line. */
export function parseTextEntries(text) {
  return text
    .split(/\r?\n/)
    .map(normalizeLabel)
    .filter((label) => label.length > 0);
}

export function makeTextEntry(label) {
  return { id: newId(), type: 'text', label: normalizeLabel(label) };
}

export function makeImageEntry(label, imageId) {
  return { id: newId(), type: 'image', label: normalizeLabel(label), imageId };
}

/** Filename without its extension, used as a picture's caption. */
export function labelFromFilename(filename) {
  return normalizeLabel(filename.replace(/\.[^.]*$/, '')) || 'Picture';
}

/** Appends additions up to MAX_ENTRIES; reports how many didn't fit. */
export function addEntries(existing, additions) {
  const room = Math.max(0, MAX_ENTRIES - existing.length);
  const accepted = additions.slice(0, room);
  return { entries: [...existing, ...accepted], dropped: additions.length - accepted.length };
}

/** Pins one entry where its card was dropped, stacked above every other pinned entry. */
export function pinEntry(entries, id, { x, y }) {
  const z = 1 + Math.max(0, ...entries.map((entry) => entry.pos?.z ?? 0));
  return entries.map((entry) => (entry.id === id ? { ...entry, pos: { x, y, z } } : entry));
}

/** Drops every manual placement, so the automatic layout applies to all entries again. */
export function clearPins(entries) {
  return entries.map(({ pos, ...entry }) => entry);
}
