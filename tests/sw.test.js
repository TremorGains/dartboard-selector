import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// The service worker is a classic script (not a module), so read it as text and
// collect the single-quoted paths in its app-shell list.
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const quoted = [...sw.matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('the service worker caches every app module, so the app works offline', () => {
  const modules = readdirSync(new URL('../src/', import.meta.url))
    .filter((file) => file.endsWith('.js'))
    .map((file) => `src/${file}`);
  for (const file of modules) assert.ok(quoted.includes(file), `sw.js does not cache ${file}`);
});

test('the service worker caches the page, styles, privacy policy, manifest and icons', () => {
  for (const file of ['./', 'index.html', 'styles.css', 'privacy.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']) {
    assert.ok(quoted.includes(file), `sw.js does not cache ${file}`);
  }
});

test('every file the service worker caches exists', () => {
  const files = quoted.filter((path) => /\.(js|css|html|png|svg|webmanifest)$/.test(path));
  for (const file of files) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `sw.js lists a missing file: ${file}`);
  }
});
