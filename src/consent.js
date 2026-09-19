// Whether ads may be personalised, and who does the asking.
//
// The rule: ads are non-personalised for everyone until that person says otherwise.
// Google's own certified prompt is required in the EEA, the UK and Switzerland (and
// covers some US states), so where it appears we stay out of the way — nobody should
// be asked the same thing twice. Everywhere else we ask once, in our own words.
//
// `storage` is anything with getItem/setItem/removeItem — browserStorage() in store.js.

export const CONSENT_KEY = 'dartpick.consent';

const PERSONALISED = 'personalised';
const NON_PERSONALISED = 'non-personalised';

/** The ad tag's `npa` value: 1 keeps ads non-personalised. */
export function decideNpa(choice) {
  return choice === PERSONALISED ? 0 : 1;
}

/** True when Google's own prompt will ask this visitor, so we shouldn't. */
export function googleWillAsk({ tcfPresent = false, gdprApplies = false, usStatesMessage = false } = {}) {
  return (tcfPresent && gdprApplies) || usStatesMessage;
}

/** We ask only where Google doesn't, and only until there's an answer. */
export function shouldAskOurselves({ choice, googleAsks }) {
  return choice === null && !googleAsks;
}

export function loadChoice(storage) {
  try {
    const saved = JSON.parse(storage.getItem(CONSENT_KEY));
    const choice = saved?.choice;
    return choice === PERSONALISED || choice === NON_PERSONALISED ? choice : null;
  } catch {
    return null;
  }
}

export function saveChoice(storage, choice) {
  try {
    storage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, choice, at: new Date().toISOString() }));
  } catch {
    // A browser that won't store the choice simply asks again next time.
  }
}

export function clearChoice(storage) {
  try {
    storage.removeItem(CONSENT_KEY);
  } catch {
    // Nothing to do — see saveChoice.
  }
}
