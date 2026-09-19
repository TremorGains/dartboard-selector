import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_KEY,
  decideNpa,
  googleWillAsk,
  loadChoice,
  saveChoice,
  clearChoice,
  shouldAskOurselves,
} from '../src/consent.js';
import { createMemoryStorage } from '../src/store.js';

test('ads are non-personalised until someone opts in', () => {
  assert.equal(decideNpa(null), 1);
  assert.equal(decideNpa('non-personalised'), 1);
  assert.equal(decideNpa('nonsense'), 1);
  assert.equal(decideNpa('personalised'), 0);
});

test('a choice survives being saved and loaded', () => {
  const storage = createMemoryStorage();
  assert.equal(loadChoice(storage), null);
  saveChoice(storage, 'personalised');
  assert.equal(loadChoice(storage), 'personalised');
  saveChoice(storage, 'non-personalised');
  assert.equal(loadChoice(storage), 'non-personalised');
  clearChoice(storage);
  assert.equal(loadChoice(storage), null);
});

test('rubbish in storage reads as no choice yet', () => {
  const storage = createMemoryStorage();
  storage.setItem(CONSENT_KEY, 'not json');
  assert.equal(loadChoice(storage), null);
  storage.setItem(CONSENT_KEY, JSON.stringify({ choice: 'maybe' }));
  assert.equal(loadChoice(storage), null);
});

test('an unusable storage never throws', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(loadChoice(broken), null);
  assert.doesNotThrow(() => saveChoice(broken, 'personalised'));
  assert.doesNotThrow(() => clearChoice(broken));
});

test('Google asks for itself in the EEA, the UK and Switzerland', () => {
  assert.equal(googleWillAsk({ tcfPresent: true, gdprApplies: true }), true);
  assert.equal(googleWillAsk({ tcfPresent: true, gdprApplies: false }), false);
  assert.equal(googleWillAsk({ tcfPresent: false, gdprApplies: true }), false);
  assert.equal(googleWillAsk({}), false);
});

test('Google also asks where a US state message applies', () => {
  assert.equal(googleWillAsk({ usStatesMessage: true }), true);
});

test('we only ask where Google does not, and only once', () => {
  assert.equal(shouldAskOurselves({ choice: null, googleAsks: false }), true);
  assert.equal(shouldAskOurselves({ choice: null, googleAsks: true }), false);
  assert.equal(shouldAskOurselves({ choice: 'non-personalised', googleAsks: false }), false);
  assert.equal(shouldAskOurselves({ choice: 'personalised', googleAsks: false }), false);
});
