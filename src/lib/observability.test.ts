import { describe, expect, it } from 'vitest';
import { createCorrelationIds } from './observability';

describe('createCorrelationIds', () => {
  it('creates an x-request-id and valid W3C traceparent', () => {
    const ids = createCorrelationIds();

    expect(ids.requestId).toMatch(/^[\da-f-]{12}$/i);
    expect(ids.traceId).toMatch(/^[\da-f]{32}$/i);
    expect(ids.traceparent).toBe(`00-${ids.traceId}-0000000000000000-01`);
  });
});
