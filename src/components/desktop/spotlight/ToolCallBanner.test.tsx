import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolCallBanner } from './ToolCallBanner';
import type { ChatMessage } from '@/stores/agentStore';
import iconMemory from '@/icons/memory.png';

describe('ToolCallBanner memory icon', () => {
  it('renders memory.png for memory activities inside the banner', () => {
    const activities: ChatMessage[] = [
      { role: 'activity', content: 'Reading file', timestamp: new Date(1), activityType: 'file', tool: 'read_file' },
      { role: 'activity', content: 'Running command', timestamp: new Date(2), activityType: 'terminal', tool: 'terminal' },
      {
        role: 'activity',
        content: 'Memory recalled',
        timestamp: new Date(3),
        tool: 'memory',
        activityType: 'tool',
        memoryActivity: {
          provider: 'Construct Memory',
          action: 'recalled',
          items: [{ id: 'mem_1', event: 'RECALL', memory: 'User prefers compact status updates.' }],
        },
      },
    ];

    const html = renderToStaticMarkup(
      <ToolCallBanner activities={activities} isActive />,
    );

    expect(html).toContain(iconMemory);
    expect(html).not.toContain('lucide-brain');
    expect(html).toContain('Memory recalled');
  });
});
