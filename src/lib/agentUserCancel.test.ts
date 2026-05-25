import { describe, expect, it } from 'vitest';
import { isAgentUserCancelErrorMessage } from './agentUserCancel';

describe('isAgentUserCancelErrorMessage', () => {
  it('matches direct stop and interrupt reasons', () => {
    expect(isAgentUserCancelErrorMessage('user:stop')).toBe(true);
    expect(isAgentUserCancelErrorMessage('overseer:interrupt')).toBe(true);
  });

  it('matches abort-shaped downstream failures after stop', () => {
    expect(isAgentUserCancelErrorMessage('Operation aborted while waiting for a concurrency slot')).toBe(true);
    expect(isAgentUserCancelErrorMessage('fetch cancelled')).toBe(true);
    expect(isAgentUserCancelErrorMessage('session creation cancelled')).toBe(true);
  });

  it('does not match ordinary failures', () => {
    expect(isAgentUserCancelErrorMessage('The model provider returned 500')).toBe(false);
  });
});
