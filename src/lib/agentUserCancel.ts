/** Matches worker abort/cancel messages caused by a deliberate session stop. */
export function isAgentUserCancelErrorMessage(message: string): boolean {
  const text = String(message || '').trim().toLowerCase();
  return (
    /^[^:]+:(?:stop|interrupt)$/.test(text) ||
    text === 'cancelled' ||
    text === 'canceled' ||
    text === 'operation aborted' ||
    text === 'request aborted' ||
    text === 'request aborted.' ||
    text.includes('operation aborted while waiting for a concurrency slot') ||
    text.includes('cancelled while waiting') ||
    text.includes('canceled while waiting') ||
    text.includes('agent loop cancelled') ||
    text.includes('agent loop canceled') ||
    text.includes('request aborted') ||
    text.includes('tool call aborted') ||
    text.includes('session creation cancelled') ||
    text.includes('search cancelled') ||
    text.includes('fetch cancelled')
  );
}
