import { useEffect } from 'react';
import { Window } from '@/components/window';
import { MENUBAR_HEIGHT, Z_INDEX } from '@/lib/constants';
import { computeChatDockBounds, getDesktopWorkArea } from '@/lib/windowBounds';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWindowStore } from '@/stores/windowStore';
import { AgentWindow } from './AgentWindow';

export function ChatWindowOverlay() {
  const isMobile = useIsMobile();
  const agentWindowOpen = useWindowStore((s) => s.agentWindowOpen);
  const stageManagerActive = useWindowStore((s) => s.stageManagerActive);
  const minimizeAnimatingWindowIds = useWindowStore((s) => s.minimizeAnimatingWindowIds);
  const hasOtherVisibleWindows = useWindowStore((s) => {
    const visibleWorkspaceIds = new Set([s.activeWorkspaceId]);
    if (s.workspaceTransition) {
      visibleWorkspaceIds.add(s.workspaceTransition.fromId);
      visibleWorkspaceIds.add(s.workspaceTransition.toId);
    }
    return s.windows.some(
      (w) => w.type !== 'chat'
        && (w.state !== 'minimized' || !!s.minimizeAnimatingWindowIds[w.id])
        && visibleWorkspaceIds.has(w.workspaceId),
    );
  });
  const chatWindow = useWindowStore((s) => s.windows.find((w) => w.type === 'chat'));
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const shouldRender = !isMobile
    && agentWindowOpen
    && !!chatWindow
    && (chatWindow.state !== 'minimized' || !!minimizeAnimatingWindowIds[chatWindow.id]);

  useEffect(() => {
    if (!shouldRender || !chatWindow || chatWindow.state === 'minimized') return;
    const workArea = getDesktopWorkArea({ stageManagerActive, mobile: false });
    const dockMode = hasOtherVisibleWindows ? 'side' : 'center';
    const target = computeChatDockBounds(
      workArea,
      { width: chatWindow.width, height: chatWindow.height },
      dockMode,
    );

    if (chatWindow.x !== target.x || chatWindow.y !== target.y) {
      moveWindow(chatWindow.id, target.x, target.y);
    }
  }, [shouldRender, chatWindow?.id, chatWindow?.width, chatWindow?.height, chatWindow?.state, hasOtherVisibleWindows, moveWindow, stageManagerActive]);

  if (!shouldRender || !chatWindow) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pointer-events-none"
      style={{ top: MENUBAR_HEIGHT, zIndex: Z_INDEX.clippyWidget + 1 }}
    >
      <Window config={chatWindow} missionControlTarget={null} missionControlIndex={0}>
        <AgentWindow config={chatWindow} />
      </Window>
    </div>
  );
}
