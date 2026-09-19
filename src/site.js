// Ads and the consent choice, shared by the board page and the content pages.
//
// Order of events, and why:
//   1. Load the AdSense script with ads set to non-personalised. That script also brings
//      in Google's own certified prompt, which is required in the EEA, the UK and
//      Switzerland. No ad is requested yet, so nothing is shown before a choice exists.
//   2. Wait briefly to see whether Google is going to ask this visitor.
//   3. If it isn't, and we've never asked, show our own one-time choice.
//   4. Request the ads with whatever that settles on.
// Until the AdSense ids in ads.js are filled in, none of this runs at all.

import { browserStorage } from './store.js';
import { decideNpa, googleWillAsk, loadChoice, saveChoice, shouldAskOurselves } from './consent.js';
import { ADS_CLIENT, ADS_SLOT, createAds, findSlots, isConfigured } from './ads.js';
import { createConsentUi } from './consent-ui.js';

const CMP_WAIT_MS = 2000;
const CMP_POLL_MS = 100;

export async function setupAds({ win = window, doc = document } = {}) {
  const slots = findSlots(doc);
  const link = doc.getElementById('privacy-choices');

  if (!isConfigured(ADS_CLIENT, ADS_SLOT)) {
    for (const { wrapper } of slots) wrapper.hidden = true;
    return 'no-ads'; // before AdSense approval the site behaves exactly as it did without ads
  }

  const storage = browserStorage();
  const ads = createAds({ win, doc });
  const ui = createConsentUi(doc);

  if (link) {
    link.hidden = false;
    link.addEventListener('click', async () => {
      const current = loadChoice(storage);
      const chosen = await ui.ask({ current, dismissable: true, googleOptions: googleOptions(win) });
      if (chosen) saveChoice(storage, chosen);
    });
  }

  if (slots.length === 0) return 'no-slots'; // e.g. the privacy policy page

  let choice = loadChoice(storage);
  // The script's own first request goes out with the choice already made, or
  // non-personalised where there isn't one yet.
  ads.preload(decideNpa(choice));

  // Someone who has already answered never waits: ask for the ad straight away.
  // Where Google's prompt applies it gates the request itself, so this is only
  // ever our own answer being honoured.
  if (choice === null) {
    const googleAsks = googleWillAsk(await cmpSignals(win));
    if (shouldAskOurselves({ choice, googleAsks })) {
      choice = (await ui.ask({})) ?? 'non-personalised'; // dismissed means plain ads
      saveChoice(storage, choice);
    }
  }
  return ads.start({ npa: decideNpa(choice), slots });
}

/** Reopens Google's own consent form, where one applies to this visitor. */
function googleOptions(win) {
  if (!win.googlefc?.callbackQueue || typeof win.googlefc.showRevocationMessage !== 'function') return null;
  return () => win.googlefc.callbackQueue.push(win.googlefc.showRevocationMessage);
}

/**
 * Waits for Google's consent platform to say whether it covers this visitor.
 * The TCF signal (EEA/UK/Switzerland) is well defined; the US state messages are read
 * defensively, so an unfamiliar shape just means we ask ourselves instead.
 */
async function cmpSignals(win) {
  const deadline = Date.now() + CMP_WAIT_MS;
  while (Date.now() < deadline) {
    if (typeof win.__tcfapi === 'function') {
      return { tcfPresent: true, gdprApplies: await gdprApplies(win), usStatesMessage: usStatesMessage(win) };
    }
    if (usStatesMessage(win)) return { usStatesMessage: true };
    await new Promise((resolve) => win.setTimeout(resolve, CMP_POLL_MS));
  }
  return { tcfPresent: false, gdprApplies: false, usStatesMessage: usStatesMessage(win) };
}

function gdprApplies(win) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value === true);
    };
    try {
      win.__tcfapi('addEventListener', 2, (data, success) => done(success && data?.gdprApplies));
    } catch {
      done(false);
    }
    win.setTimeout(() => done(false), CMP_WAIT_MS);
  });
}

function usStatesMessage(win) {
  try {
    return typeof win.googlefc?.ccpa?.getInitialCcpaStatus === 'function';
  } catch {
    return false;
  }
}
