// One AdSense display unit per page, and the rules around it.
//
// Nothing is loaded unless both AdSense ids are set below, so the site behaves
// exactly as it did before approval. Ad requests go out non-personalised unless
// consent.js says otherwise (npa = 0), and a slot that doesn't fill — no ad, an
// ad blocker, an offline visit — gives its space back instead of leaving a hole.

// The site's AdSense ids. Neither value is a secret.
export const ADS_CLIENT = 'ca-pub-1879223413593135';
export const ADS_SLOT = '6885990393';

const SCRIPT_BASE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const FILL_TIMEOUT_MS = 4000;

export function isConfigured(client, slot) {
  return Boolean(client) && Boolean(slot);
}

export function scriptUrl(client) {
  return `${SCRIPT_BASE}?client=${client}`;
}

/**
 * @param loadScript  how the AdSense script gets onto the page (swapped out in tests)
 */
export function createAds({
  win = globalThis,
  doc = globalThis.document,
  client = ADS_CLIENT,
  slot = ADS_SLOT,
  loadScript = defaultLoadScript(doc),
  timeoutMs = FILL_TIMEOUT_MS,
} = {}) {
  let loaded = false;

  return {
    /**
     * Loads the AdSense script — which also brings in Google's consent prompt where
     * one is required — without requesting any ad yet. Ads stay non-personalised
     * until a choice is made.
     * @returns 'not-configured' | 'offline' | 'loading'
     */
    preload(npa = 1) {
      if (!isConfigured(client, slot)) return 'not-configured';
      if (win.navigator?.onLine === false) return 'offline';
      const queue = (win.adsbygoogle = win.adsbygoogle || []);
      queue.requestNonPersonalizedAds = npa;
      if (!loaded) {
        loaded = true;
        loadScript(scriptUrl(client));
      }
      return 'loading';
    },

    /** @returns 'not-configured' | 'offline' | 'requested' */
    start({ npa, slots }) {
      if (!isConfigured(client, slot)) return hideAll(slots, 'not-configured');
      if (win.navigator?.onLine === false) return hideAll(slots, 'offline');

      // The queue exists before the script does, so the npa flag is in place
      // before the script reads it or any slot is pushed onto it.
      const queue = (win.adsbygoogle = win.adsbygoogle || []);
      queue.requestNonPersonalizedAds = npa;

      if (!loaded) {
        loaded = true;
        loadScript(scriptUrl(client));
      }

      for (const entry of slots) {
        entry.ins.setAttribute('data-ad-client', client);
        entry.ins.setAttribute('data-ad-slot', slot);
        entry.wrapper.hidden = false;
        queue.push({});
      }
      win.setTimeout?.(() => this.collapseUnfilled(slots), timeoutMs);
      return 'requested';
    },

    /** Hides any slot AdSense didn't fill, so no empty box is left behind. */
    collapseUnfilled(slots) {
      for (const { wrapper, ins } of slots) {
        if (ins.dataset.adStatus !== 'filled') wrapper.hidden = true;
      }
    },
  };
}

function hideAll(slots, status) {
  for (const { wrapper } of slots) wrapper.hidden = true;
  return status;
}

function defaultLoadScript(doc) {
  return (src) => {
    const script = doc.createElement('script');
    script.async = true;
    script.src = src;
    script.crossOrigin = 'anonymous';
    doc.head.append(script);
  };
}

/** Finds the ad slots on the current page. */
export function findSlots(doc = globalThis.document) {
  return [...doc.querySelectorAll('[data-ad-wrapper]')].map((wrapper) => ({
    wrapper,
    ins: wrapper.querySelector('ins.adsbygoogle'),
  }));
}
