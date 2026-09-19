import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAds, isConfigured, scriptUrl } from '../src/ads.js';

function fakeSlot() {
  return { wrapper: { hidden: false }, ins: { dataset: {}, setAttribute(name, value) { this.dataset[name] = value; } } };
}

function fakeWin({ online = true } = {}) {
  return { navigator: { onLine: online } };
}

function setup({ online = true, client = 'ca-pub-123', slot = '456' } = {}) {
  const loaded = [];
  const win = fakeWin({ online });
  const ads = createAds({ win, client, slot, loadScript: (src) => loaded.push(src) });
  return { ads, win, loaded };
}

test('a publisher id and a slot id are both needed', () => {
  assert.equal(isConfigured('ca-pub-123', '456'), true);
  assert.equal(isConfigured('', '456'), false);
  assert.equal(isConfigured('ca-pub-123', ''), false);
  assert.equal(isConfigured(undefined, undefined), false);
});

test('the script url carries the publisher id', () => {
  assert.match(scriptUrl('ca-pub-123'), /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-123$/);
});

test('nothing loads until AdSense ids are set, and the space is given back', () => {
  const { ads, win, loaded } = setup({ client: '', slot: '' });
  const slots = [fakeSlot()];
  assert.equal(ads.start({ npa: 1, slots }), 'not-configured');
  assert.deepEqual(loaded, []);
  assert.equal(win.adsbygoogle, undefined);
  assert.equal(slots[0].wrapper.hidden, true);
});

test('nothing loads while offline', () => {
  const { ads, loaded } = setup({ online: false });
  const slots = [fakeSlot()];
  assert.equal(ads.start({ npa: 1, slots }), 'offline');
  assert.deepEqual(loaded, []);
  assert.equal(slots[0].wrapper.hidden, true);
});

test('ads are requested non-personalised before the first push', () => {
  const { ads, win, loaded } = setup();
  const slots = [fakeSlot(), fakeSlot()];
  assert.equal(ads.start({ npa: 1, slots }), 'requested');
  assert.equal(loaded.length, 1);
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 1);
  // the npa flag is set on the queue before any slot is pushed onto it
  assert.equal(win.adsbygoogle.length, 2);
  for (const { wrapper, ins } of slots) {
    assert.equal(wrapper.hidden, false);
    assert.equal(ins.dataset['data-ad-client'], 'ca-pub-123');
    assert.equal(ins.dataset['data-ad-slot'], '456');
  }
});

test('opting in switches personalisation on', () => {
  const { ads, win } = setup();
  ads.start({ npa: 0, slots: [fakeSlot()] });
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 0);
});

test('the script is only ever loaded once', () => {
  const { ads, loaded } = setup();
  ads.start({ npa: 1, slots: [fakeSlot()] });
  ads.start({ npa: 1, slots: [fakeSlot()] });
  assert.equal(loaded.length, 1);
});

test('a slot that never fills gives its space back', () => {
  const { ads } = setup();
  const filled = fakeSlot();
  const empty = fakeSlot();
  ads.start({ npa: 1, slots: [filled, empty] });
  filled.ins.dataset.adStatus = 'filled';
  ads.collapseUnfilled([filled, empty]);
  assert.equal(filled.wrapper.hidden, false);
  assert.equal(empty.wrapper.hidden, true);
});

test('preloading brings in the script without requesting an ad', () => {
  const { ads, win, loaded } = setup();
  assert.equal(ads.preload(1), 'loading');
  assert.equal(loaded.length, 1);
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 1);
  assert.equal(win.adsbygoogle.length, 0);
});

test('preloading does nothing without ids, or offline', () => {
  assert.equal(setup({ client: '', slot: '' }).ads.preload(1), 'not-configured');
  assert.equal(setup({ online: false }).ads.preload(1), 'offline');
});

test('a slot pushed after preloading still carries the latest choice', () => {
  const { ads, win, loaded } = setup();
  ads.preload(1);
  ads.start({ npa: 0, slots: [fakeSlot()] });
  assert.equal(loaded.length, 1);
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 0);
  assert.equal(win.adsbygoogle.length, 1);
});
