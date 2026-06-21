/**
 * User-facing formatting for web_search errors shown in Browser tabs.
 */

export type SearchErrorKind = 'no_results' | 'rate_limit' | 'service' | 'cancelled' | 'unknown';

export interface FormattedSearchError {
  kind: SearchErrorKind;
  title: string;
  body: string;
  hints: string[];
}

function tryParseEmbeddedJson(raw: string): Record<string, unknown> | null {
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMessage(raw: string): string {
  const embedded = tryParseEmbeddedJson(raw);
  if (embedded) {
    const msg = embedded.message ?? embedded.readableMessage;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const stripped = raw
    .replace(/^web_search failed \(\d+\):\s*/i, '')
    .replace(/^web_search error:\s*/i, '')
    .trim();
  if (stripped.startsWith('{')) {
    const parsed = tryParseEmbeddedJson(stripped);
    const msg = parsed?.message ?? parsed?.readableMessage;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return stripped || 'Search could not be completed.';
}

export function formatSearchError(raw?: string): FormattedSearchError {
  if (!raw?.trim()) {
    return {
      kind: 'unknown',
      title: 'Search failed',
      body: 'Something went wrong while searching.',
      hints: ['Try again in a moment', 'Use simpler keywords'],
    };
  }

  const lower = raw.toLowerCase();
  const message = extractMessage(raw);

  if (/cancelled/i.test(lower)) {
    return {
      kind: 'cancelled',
      title: 'Search cancelled',
      body: 'This search was stopped before it finished.',
      hints: ['Retry to run the search again'],
    };
  }

  if (/rate limit/i.test(lower) || /too many search retries/i.test(lower)) {
    return {
      kind: 'rate_limit',
      title: 'Search rate limit',
      body: message,
      hints: ['Wait a minute and tap Retry', 'Try fewer searches in quick succession'],
    };
  }

  if (/no search results available/i.test(message) || /no results/i.test(lower)) {
    return {
      kind: 'no_results',
      title: 'No results found',
      body: message,
      hints: [
        'Try different or more general keywords',
        'Remove quotes and boolean operators (OR, AND)',
        'Ask Construct to use the interactive browser for hard-to-find topics',
      ],
    };
  }

  if (/timed out|timeout|unavailable|provider/i.test(lower)) {
    return {
      kind: 'service',
      title: 'Search unavailable',
      body: message,
      hints: ['Tap Retry in a few seconds', 'Try a shorter, simpler query'],
    };
  }

  return {
    kind: 'service',
    title: 'Search failed',
    body: message.length > 280 ? `${message.slice(0, 277)}…` : message,
    hints: [
      'Tap Retry to try again',
      'Simplify your query or try the interactive browser',
    ],
  };
}

export function queryHasBooleanSyntax(query: string): boolean {
  return /\b(OR|AND|NOT)\b/i.test(query) || /"[^"]+"/.test(query);
}
