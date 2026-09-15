import { STORAGE_KEY } from './store.js';

// "Your data": everything the app keeps lives on this device. These helpers let a
// person download a copy of it, or wipe it completely.

export const APP_NAME = 'DartPick';
export const EXPORT_VERSION = 1;

// Every localStorage key this app owns. Add new keys here so deleteAllData covers them.
const OWNED_KEYS = [STORAGE_KEY];

/**
 * A JSON-ready copy of the user's data. Pictures become data URLs via `toDataUrl`
 * (injected so this runs outside a browser too); a picture missing from storage is null.
 */
export async function buildExport(state, images, { toDataUrl, exportedAt = new Date().toISOString() }) {
  const entries = [];
  for (const { imageId, ...entry } of state.entries) {
    if (entry.type !== 'image') {
      entries.push(entry);
      continue;
    }
    const blob = images.get(imageId);
    entries.push({ ...entry, image: blob ? await toDataUrl(blob) : null });
  }
  return {
    app: APP_NAME,
    version: EXPORT_VERSION,
    exportedAt,
    settings: { muted: state.muted, layoutSeed: state.layoutSeed },
    entries,
  };
}

/** Wipes everything this app stores on the device: saved board, settings and pictures. */
export async function deleteAllData({ storage, blobStore }) {
  for (const key of OWNED_KEYS) storage.removeItem(key);
  await blobStore?.clear();
}
