// PostHog product analytics wrapper.
// Only activates when VITE_POSTHOG_KEY is set — safe to deploy without it.
// To enable: add VITE_POSTHOG_KEY=your_project_api_key to your .env file.
// Get your key from app.posthog.com → Project Settings → Project API Key.

import posthog from 'posthog-js';

let initialized = false;

export const initAnalytics = () => {
  if (initialized || !import.meta.env.VITE_POSTHOG_KEY) return;
  try {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: true,   // auto-tracks page views on route changes
      autocapture: false,        // manual control — we track only meaningful events
      persistence: 'localStorage',
    });
    initialized = true;
  } catch {
    // analytics errors must never affect app functionality
  }
};

export const track = (event, properties = {}) => {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {}
};

export const identify = (userId, traits = {}) => {
  if (!initialized) return;
  try {
    posthog.identify(userId, traits);
  } catch {}
};

export const resetAnalytics = () => {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {}
};
