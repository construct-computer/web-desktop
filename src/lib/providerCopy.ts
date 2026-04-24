/**
 * Single source of truth for provider-state UI copy.
 *
 * Every surface (StatusWidget, SpotlightInput, ChatWindow banner, toasts,
 * mobile settings screen) reads from this map so copy changes live in one
 * place.
 *
 * Note: all platform tiers currently use the same primary model (kimi-k2.6),
 * so we do not surface a separate `platform-lite` state. If a tier-specific
 * downgrade is reintroduced on the worker, add the kind here and render it.
 */

import type { EffectiveProvider } from '@/stores/billingStore';

export type ProviderTone = 'neutral' | 'cyan' | 'cyan-subtle' | 'amber' | 'red';

export interface ProviderCopy {
  /** Short label shown inline as a badge/strip (e.g. below spotlight input). */
  badge: string | null;
  /** Persistent banner shown at the top of the chat. `null` means no banner. */
  bannerTitle: string | null;
  bannerBody: string | null;
  /** Chat-inline micro-notice shown at the moment of transition. */
  noticeText: string | null;
  /** Toast to fire on entering this state. */
  toastTitle: string | null;
  toastBody: string | null;
  toastVariant: 'info' | 'success' | 'error' | null;
  /** Widget primary label (e.g. replaces "Weekly" in StatusWidget). */
  widgetLabel: string;
  tone: ProviderTone;
  /** Settings nav target for click-through CTAs. Null means no action. */
  cta: { label: string; href: 'settings/byok' | 'settings/subscription' } | null;
  /** Whether typing/sending should be disabled in spotlight/chat. */
  inputDisabled: boolean;
}

function formatResetTime(iso?: string): string {
  if (!iso) return 'the weekly reset';
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / 60_000)}m`;
}

function truncateModel(model?: string): string {
  if (!model) return 'your model';
  // `openrouter/anthropic/claude-3.5-sonnet` -> `claude-3.5-sonnet`
  const parts = model.split('/');
  return parts[parts.length - 1] || model;
}

export function providerCopy(p: EffectiveProvider): ProviderCopy {
  switch (p.kind) {
    case 'platform':
      return {
        badge: null,
        bannerTitle: null,
        bannerBody: null,
        noticeText: null,
        toastTitle: null,
        toastBody: null,
        toastVariant: null,
        widgetLabel: 'Weekly',
        tone: 'neutral',
        cta: null,
        inputDisabled: false,
      };

    case 'byok-exclusive': {
      const m = truncateModel(p.model);
      return {
        badge: `Using your OpenRouter key · ${m}`,
        bannerTitle: null,
        bannerBody: null,
        noticeText: null,
        toastTitle: null,
        toastBody: null,
        toastVariant: null,
        widgetLabel: 'OpenRouter',
        tone: 'cyan-subtle',
        cta: null,
        inputDisabled: false,
      };
    }

    case 'byok-fallback': {
      const m = truncateModel(p.model);
      const reset = formatResetTime(p.weeklyResetsAt);
      return {
        badge: `Using your OpenRouter key · platform cap reached`,
        bannerTitle: 'Switched to your OpenRouter key',
        bannerBody: `Platform weekly cap reached. Now using ${m}. Platform access returns in ${reset}.`,
        noticeText: `Platform cap reached — switched to your OpenRouter key (${m}).`,
        toastTitle: 'Switched to OpenRouter',
        toastBody: `Platform cap reached. Now using ${m}.`,
        toastVariant: 'info',
        widgetLabel: 'OpenRouter',
        tone: 'cyan',
        cta: null,
        inputDisabled: false,
      };
    }

    case 'blocked-no-key': {
      const reset = formatResetTime(p.weeklyResetsAt);
      return {
        badge: 'Limit reached — add an OpenRouter key or upgrade',
        bannerTitle: 'Usage limit reached',
        bannerBody: `You've used this period's budget. Add an OpenRouter key to keep working, upgrade your plan, or wait ${reset} for the reset.`,
        noticeText: `Usage limit reached. Add an OpenRouter key or wait ${reset}.`,
        toastTitle: 'Usage limit reached',
        toastBody: `Add an OpenRouter key to keep working, or wait ${reset}.`,
        toastVariant: 'error',
        widgetLabel: 'Limit reached',
        tone: 'red',
        cta: { label: 'Add OpenRouter key', href: 'settings/byok' },
        inputDisabled: true,
      };
    }

    case 'blocked-byok-cap': {
      return {
        badge: 'OpenRouter cap reached — raise it in Settings',
        bannerTitle: 'OpenRouter weekly cap reached',
        bannerBody: 'You\'ve hit the self-imposed weekly cap on your OpenRouter key. Raise it in Settings or wait until Monday.',
        noticeText: 'Your OpenRouter weekly cap is reached. Raise it in Settings.',
        toastTitle: 'OpenRouter cap reached',
        toastBody: 'Raise your self-imposed weekly cap in Settings.',
        toastVariant: 'error',
        widgetLabel: 'BYOK cap reached',
        tone: 'red',
        cta: { label: 'Raise cap', href: 'settings/byok' },
        inputDisabled: true,
      };
    }
  }
}

/** Tailwind color helpers so every surface renders the same tone. */
export const TONE_CLASSES: Record<ProviderTone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: {
    text: 'text-white/50',
    bg: 'bg-white/5',
    border: 'border-white/10',
    dot: 'bg-white/30',
  },
  cyan: {
    text: 'text-cyan-400/80',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-400',
  },
  'cyan-subtle': {
    text: 'text-cyan-400/40',
    bg: 'bg-cyan-500/5',
    border: 'border-cyan-500/15',
    dot: 'bg-cyan-400/50',
  },
  amber: {
    text: 'text-amber-500/70',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    dot: 'bg-amber-500',
  },
  red: {
    text: 'text-red-400/80',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: 'bg-red-400',
  },
};

/** Hex colors for components that draw inline styles (widgets). */
export const TONE_HEX: Record<ProviderTone, string> = {
  neutral: '#22d3ee',
  cyan: '#22d3ee',
  'cyan-subtle': '#22d3ee',
  amber: '#fbbf24',
  red: '#f87171',
};
