import { describe, expect, it } from 'vitest';
import { activityFromMessage } from './useClippyActivitySummary';
import type { ChatMessage } from '@/stores/agentStore';
import iconMemory from '@/icons/memory.png';
import iconFiles from '@/icons/files.png';

describe('activityFromMessage', () => {
  it('enriches memory recall activities with memory.png', () => {
    const message: ChatMessage = {
      role: 'activity',
      content: 'Memory recalled',
      timestamp: new Date(1),
      tool: 'memory',
      activityType: 'tool',
      memoryActivity: {
        provider: 'Construct Memory',
        action: 'recalled',
        items: [{ id: 'mem_1', event: 'RECALL', memory: 'User prefers compact updates.' }],
      },
    };

    const item = activityFromMessage(message, 'Main', 'main:0');

    expect(item?.tool).toBe('memory');
    expect(item?.iconUrl).toBe(iconMemory);
  });

  it('backfills file read icons when hints are missing', () => {
    const message: ChatMessage = {
      role: 'activity',
      content: 'Reading uploads/5136a236f7e9…',
      timestamp: new Date(1),
      activityType: 'file',
      tool: 'read_file',
    };

    const item = activityFromMessage(message, 'Main', 'main:0');

    expect(item?.iconUrl).toBe(iconFiles);
    expect(item?.iconPlatform).toBe('files');
  });
});
