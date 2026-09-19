import { STORAGE_KEY, STORAGE_KEY_V2 } from './store.js';

// "Your data": everything the app keeps lives on this device. These helpers let a
// person download a copy of it, or wipe it completely.

export const APP_NAME = 'DartPick';
export const EXPORT_VERSION = 2;

// Every localStorage key this app owns (current and old saves). Add new keys here so
// deleteAllData covers them.
const OWNED_KEYS = [STORAGE_KEY_V2, STORAGE_KEY];

/**
 * A JSON-ready copy of the user's data: every board with its entries, and the settings.
 * Pictures become data URLs via `toDataUrl` (injected so this runs outside a browser too);
 * a picture missing from storage is null.
 */
export async function buildExport(appState, images, { toDataUrl, exportedAt = new Date().toISOString() }) {
  const boards = [];
  for (const board of appState.boards) {
    boards.push({ name: board.name, entries: await exportEntries(board.entries, images, toDataUrl) });
  }
  return {
    app: APP_NAME,
    version: EXPORT_VERSION,
    exportedAt,
    settings: { muted: appState.settings.muted, theme: appState.settings.theme },
    boards,
  };
}

async function exportEntries(entries, images, toDataUrl) {
  const exported = [];
  for (const { imageId, ...entry } of entries) {
    if (entry.type !== 'image') {
      exported.push(entry);
      continue;
    }
    const blob = images.get(imageId);
    exported.push({ ...entry, image: blob ? await toDataUrl(blob) : null });
  }
  return exported;
}

/** Wipes everything this app stores on the device: every board, the settings and all pictures. */
export async function deleteAllData({ storage, blobStore }) {
  for (const key of OWNED_KEYS) storage.removeItem(key);
  await blobStore?.clear();
}
