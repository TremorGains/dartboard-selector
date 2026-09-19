import { MAX_ENTRIES } from './entries.js';
import { MAX_BOARDS, makeBoard, normalizeBoardName } from './boards.js';
import { DEFAULT_THEME, normalizeTheme } from './themes.js';

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

// A dragged card's centre in board units, plus its stacking order.
function isValidPos(pos) {
  return (
    pos !== null &&
    typeof pos === 'object' &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isInteger(pos.z) &&
    pos.z >= 1
  );
}

function cleanEntry({ id, type, label, imageId, pos }) {
  const entry = type === 'image' ? { id, type, label, imageId } : { id, type, label };
  if (isValidPos(pos)) entry.pos = { x: pos.x, y: pos.y, z: pos.z };
  return entry;
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

// ---------- Version 2: several saved boards plus settings ----------
// { boards: [{ id, name, entries, layoutSeed }], activeBoardId, settings: { muted, theme } }

export const STORAGE_KEY_V2 = 'dartpick.v2';

export function emptyAppState() {
  const board = makeBoard();
  return { boards: [board], activeBoardId: board.id, settings: { muted: false, theme: { ...DEFAULT_THEME } } };
}

/** Turns a version-1 (single board) state into a version-2 state with one "My board". */
export function migrateFromV1({ entries, muted, layoutSeed }) {
  const board = makeBoard(undefined, { entries, layoutSeed });
  return { boards: [board], activeBoardId: board.id, settings: { muted, theme: { ...DEFAULT_THEME } } };
}

function hasBoardId(board) {
  return board !== null && typeof board === 'object' && typeof board.id === 'string' && board.id.length > 0;
}

function cleanBoard(board, index) {
  const entries = Array.isArray(board.entries) ? board.entries : [];
  return {
    id: board.id,
    name: normalizeBoardName(typeof board.name === 'string' ? board.name : '', `Board ${index + 1}`),
    entries: entries.filter(isValidEntry).slice(0, MAX_ENTRIES).map(cleanEntry),
    layoutSeed: isValidSeed(board.layoutSeed) ? board.layoutSeed : 1,
  };
}

/** Parses a version-2 save, repairing what it can. Returns null if there's nothing usable. */
export function parseAppState(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.boards)) return null;
  const boards = raw.boards.filter(hasBoardId).slice(0, MAX_BOARDS).map(cleanBoard);
  if (boards.length === 0) return null;
  const settings = raw.settings !== null && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    boards,
    activeBoardId: boards.some((board) => board.id === raw.activeBoardId) ? raw.activeBoardId : boards[0].id,
    settings: { muted: settings.muted === true, theme: normalizeTheme(settings.theme) },
  };
}

/** The current save if it's usable, else a migrated version-1 save, else a fresh board. */
export function loadAppState(storage) {
  const current = parseAppState(storage.getItem(STORAGE_KEY_V2));
  if (current) return current;
  const old = storage.getItem(STORAGE_KEY);
  return old === null ? emptyAppState() : migrateFromV1(parseState(old));
}

export function saveAppState(storage, { boards, activeBoardId, settings }) {
  storage.setItem(STORAGE_KEY_V2, JSON.stringify({ version: 2, boards, activeBoardId, settings }));
  storage.removeItem(STORAGE_KEY); // the single-board save now lives on as a board
}

/** hydrateImages for every board: loads picture blobs and drops entries whose picture is gone. */
export async function hydrateAppImages(appState, blobStore) {
  const images = new Map();
  const boards = [];
  for (const board of appState.boards) {
    const result = await hydrateImages({ entries: board.entries }, blobStore);
    for (const [imageId, blob] of result.images) images.set(imageId, blob);
    boards.push({ ...board, entries: result.state.entries });
  }
  return { state: { ...appState, boards }, images };
}
