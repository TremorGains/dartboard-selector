import { MAX_ENTRIES } from './entries.js';

// Persistence. `storage` is anything with getItem/setItem/removeItem
// (localStorage in the browser). `blobStore` holds picture blobs:
// { get(id), put(id, blob), delete(id), clear() }, all returning promises.

export const STORAGE_KEY = 'dartboard.v1';

export function emptyState() {
  return { entries: [], muted: false, layoutSeed: 1 };
}

function isValidEntry(entry) {
  if (entry === null || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  if (typeof entry.label !== 'string') return false;
  if (entry.type === 'text') return entry.label.length > 0;
  if (entry.type === 'image') return typeof entry.imageId === 'string' && entry.imageId.length > 0;
  return false;
}

function cleanEntry({ id, type, label, imageId }) {
  return type === 'image' ? { id, type, label, imageId } : { id, type, label };
}

function isValidSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

/** Parses saved JSON; anything unreadable becomes an empty board. */
export function parseState(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptyState();
  }
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyState();
  return {
    entries: raw.entries.filter(isValidEntry).slice(0, MAX_ENTRIES).map(cleanEntry),
    muted: raw.muted === true,
    layoutSeed: isValidSeed(raw.layoutSeed) ? raw.layoutSeed : 1,
  };
}

export function loadState(storage) {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveState(storage, { entries, muted, layoutSeed }) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ entries, muted, layoutSeed }));
}

/**
 * Loads picture blobs for image entries. Entries whose blob is missing (or
 * when there is no blob store at all) are dropped.
 * Returns { state, images: Map<imageId, Blob> }.
 */
export async function hydrateImages(state, blobStore) {
  const images = new Map();
  const entries = [];
  for (const entry of state.entries) {
    if (entry.type !== 'image') {
      entries.push(entry);
      continue;
    }
    const blob = blobStore ? await blobStore.get(entry.imageId).catch(() => undefined) : undefined;
    if (blob) {
      images.set(entry.imageId, blob);
      entries.push(entry);
    }
  }
  return { state: { ...state, entries }, images };
}

/** In-memory stand-in for localStorage. */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** localStorage if it works here, otherwise an in-memory fallback. */
export function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = '__dartboard_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}
