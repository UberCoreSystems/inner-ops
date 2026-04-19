// PostHog product analytics wrapper.
// Only activates when VITE_POSTHOG_KEY is set — safe to deploy without it.
// To enable: add VITE_POSTHOG_KEY=your_project_api_key to your .env file.
// Get your key from app.posthog.com → Project Settings → Project API Key.
//
// Uses a lazy dynamic import so posthog-js is never loaded unless the key is
// configured. This prevents the package from affecting the app bundle or
// causing load errors when analytics is not set up.

import logger from './logger.js';

let ph = null;

// Pass 3 New Finding 8 remediation: PostHog failures are logged in dev so
// engineers can see when events fail to track. Production stays quiet.
const warnDev = (...args) => {
  if (import.meta.env.DEV) logger.warn(...args);
};

const load = () => {
  if (ph) return Promise.resolve(ph);
  if (!import.meta.env.VITE_POSTHOG_KEY) return Promise.resolve(null);
  return import('posthog-js')
    .then((mod) => {
      const posthog = mod.default ?? mod;
      posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        capture_pageview: true,
        autocapture: false,
        persistence: 'localStorage',
      });
      ph = posthog;
      return ph;
    })
    .catch((err) => {
      warnDev('analytics: posthog load failed:', err?.message);
      return null;
    });
};

// Call at app startup to eagerly load posthog when the key is set.
export const initAnalytics = () => { load(); };

// Fire-and-forget — never throws, never blocks.
export const track = (event, properties = {}) => {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  load().then((posthog) => {
    try { posthog?.capture(event, properties); }
    catch (err) { warnDev('analytics: track failed:', event, err?.message); }
  });
};

export const identify = (userId, traits = {}) => {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  load().then((posthog) => {
    try { posthog?.identify(userId, traits); }
    catch (err) { warnDev('analytics: identify failed:', err?.message); }
  });
};
