import { useEffect } from 'react';
import { useWindowStore } from '@/stores/windowStore';
import { useIsMobile } from './useIsMobile';

/** Helper: returns true if Ctrl or Alt is held (both act as the modifier key). */
function hasMod(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey;
}

interface KeyboardShortcutHandlers {
  onOpenTerminal?: () => void;
  onToggleStartMenu?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers = {}) {
  const isMobile = useIsMobile();
  const { onOpenTerminal, onToggleStartMenu } = handlers;
  const toggleSpotlight = useWindowStore(s => s.toggleSpotlight);
  const toggleLaunchpad = useWindowStore(s => s.toggleLaunchpad);
  const cycleWindows = useWindowStore(s => s.cycleWindows);
  const cycleWorkspaces = useWindowStore(s => s.cycleWorkspaces);
  const switchWorkspace = useWindowStore(s => s.switchWorkspace);
  const closeWindow = useWindowStore(s => s.closeWindow);
  const getFocusedWindow = useWindowStore(s => s.getFocusedWindow);
  const workspaces = useWindowStore(s => s.workspaces);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when Meta (Cmd on Mac) is held — let OS shortcuts work
      if (e.metaKey) return;

      // Mod+Space — toggle Spotlight
      if (e.code === 'Space' && hasMod(e) && !e.shiftKey) {
        e.preventDefault();
        toggleSpotlight();
        return;
      }

      // F4 — toggle Launchpad
      if (e.key === 'F4' && !hasMod(e) && !e.shiftKey) {
        e.preventDefault();
        if (!isMobile) toggleLaunchpad();
        else onToggleStartMenu?.();
        return;
      }

      // Mod+Shift+T — open Terminal. Keep this explicit because Desktop owns
      // the app-opening action, while this hook owns the keyboard listener.
      if (e.key.toLowerCase() === 't' && hasMod(e) && e.shiftKey) {
        if (!isMobile && onOpenTerminal) {
          e.preventDefault();
          onOpenTerminal();
        }
        return;
      }

      // Mod+Tab / Mod+Shift+Tab — cycle windows in active workspace
      if (e.key === 'Tab' && hasMod(e)) {
        e.preventDefault();
        cycleWindows(e.shiftKey); // Shift = reverse
        return;
      }

      // Mod+W — close focused window
      if (e.key === 'w' && hasMod(e) && !e.shiftKey) {
        e.preventDefault();
        const focused = getFocusedWindow();
        if (focused) closeWindow(focused.id);
        return;
      }

      // Mod+` (backtick) — cycle workspaces
      if (e.key === '`' && hasMod(e) && !e.shiftKey) {
        if (isMobile) return;
        e.preventDefault();
        cycleWorkspaces();
        return;
      }

      // Mod+1-9 — switch to workspace by number
      if (hasMod(e) && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        if (isMobile) return;
        const idx = parseInt(e.key, 10) - 1;
        if (idx < workspaces.length) {
          e.preventDefault();
          switchWorkspace(workspaces[idx].id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSpotlight, toggleLaunchpad, cycleWindows, cycleWorkspaces, switchWorkspace, closeWindow, getFocusedWindow, workspaces, onOpenTerminal, onToggleStartMenu, isMobile]);
}
