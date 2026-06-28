import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  updateAgentConfig: vi.fn(),
}));

import * as api from '@/services/api';
import { useComputerStore } from './agentStore';

const updateAgentConfig = vi.mocked(api.updateAgentConfig);
const originalCheckConfigStatus = useComputerStore.getState().checkConfigStatus;
const originalFetchComputer = useComputerStore.getState().fetchComputer;
const checkConfigStatus = vi.fn().mockResolvedValue(undefined);
const fetchComputer = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  updateAgentConfig.mockReset();
  checkConfigStatus.mockReset().mockResolvedValue(undefined);
  fetchComputer.mockReset().mockResolvedValue(undefined);

  useComputerStore.setState({
    instanceId: null,
    checkConfigStatus: checkConfigStatus as never,
    fetchComputer: fetchComputer as never,
  });
});

afterEach(() => {
  useComputerStore.setState({
    checkConfigStatus: originalCheckConfigStatus,
    fetchComputer: originalFetchComputer,
  });
});

describe('updateComputer', () => {
  it('saves setup before the computer store has an instanceId', async () => {
    updateAgentConfig.mockResolvedValue({
      success: true,
      data: { status: 'ok', message: 'saved' },
    } as never);

    const result = await useComputerStore.getState().updateComputer({
      ownerName: 'Ankush',
      agentName: 'Construct',
    });

    expect(result).toEqual({ success: true });
    expect(updateAgentConfig).toHaveBeenCalledWith('', {
      openrouter_api_key: undefined,
      agentmail_api_key: undefined,
      agentmail_inbox_username: undefined,
      model: undefined,
      owner_name: 'Ankush',
      agent_name: 'Construct',
    });
    expect(checkConfigStatus).toHaveBeenCalledTimes(1);
    expect(fetchComputer).toHaveBeenCalledTimes(1);
  });
});
