import type { PostHog } from '@posthog/types';

declare global {
  interface Window {
    /** Set by the PostHog HTML loader in index.html; loads the SDK from PostHog's CDN. */
    posthog?: PostHog;
  }
}

export {};
