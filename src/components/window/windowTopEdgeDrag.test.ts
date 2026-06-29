import { describe, expect, it } from 'vitest';
import { MENUBAR_HEIGHT } from '@/lib/constants';
import { shouldEnterMissionControlOnTopEdge } from './Window';

describe('shouldEnterMissionControlOnTopEdge', () => {
  it('skips chat windows and only triggers for normal windows at the top edge', () => {
    expect(
      shouldEnterMissionControlOnTopEdge({
        isChatWindow: true,
        clientY: MENUBAR_HEIGHT - 1,
        missionControlActive: false,
      }),
    ).toBe(false);

    expect(
      shouldEnterMissionControlOnTopEdge({
        isChatWindow: false,
        clientY: MENUBAR_HEIGHT - 1,
        missionControlActive: false,
      }),
    ).toBe(true);

    expect(
      shouldEnterMissionControlOnTopEdge({
        isChatWindow: false,
        clientY: MENUBAR_HEIGHT - 1,
        missionControlActive: true,
      }),
    ).toBe(false);
  });
});
