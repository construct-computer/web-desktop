import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Monitor, MessageCircle, Send, Mail, Calendar } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { cn } from '@/lib/utils';
import { MENUBAR_HEIGHT, Z_INDEX } from '@/lib/constants';
import type { Workspace, WorkspacePlatform } from '@/types';

/**
 * Mission Control — macOS-style window overview + workspace switcher.
 *
 * This component only renders the **scrim** (dark backdrop) and the **workspace bar**
 * at the top. The actual window transforms are handled by Window.tsx, which reads
 * `missionControlActive` from the store and applies CSS transforms to animate
 * each window from its current position into the arranged grid.
 */

// Height of the workspace bar area (below menu bar, above the window grid)
export const MC_WORKSPACE_BAR_HEIGHT = 120;

// ── Platform icon helper ──────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: WorkspacePlatform; className?: string }) {
  switch (platform) {
    case 'slack': return <MessageCircle className={className} />;
    case 'telegram': return <Send className={className} />;
    case 'email': return <Mail className={className} />;
    case 'calendar': return <Calendar className={className} />;
    default: return <Monitor className={className} />;
  }
}

// ── Workspace thumbnail in the top bar ────────────────────────────

function WorkspaceThumbnail({
  workspace,
  isActive,
  windows,
  onClick,
  onDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
  /** All windows in this workspace, for the mini-preview. */
  windows: Array<{ x: number; y: number; width: number; height: number; state: string }>;
  onClick: () => void;
  onDelete?: () => void;
}) {
  // Scale factor to map real screen coordinates into the mini preview box
  const previewW = 140;
  const previewH = 88;
  const screenW = globalThis.innerWidth || 1920;
  const screenH = (globalThis.innerHeight || 1080) - MENUBAR_HEIGHT;
  const sx = previewW / screenW;
  const sy = previewH / screenH;

  return (
    <button
      data-mc-workspace-id={workspace.id}
      className={cn(
        'group relative flex flex-col items-center gap-1.5 transition-all duration-200',
        'rounded-xl px-2 pt-2 pb-1.5',
        isActive
          ? 'ring-2 ring-white/70 bg-white/15 scale-[1.02]'
          : 'bg-white/6 hover:bg-white/10 ring-1 ring-white/10 hover:ring-white/30',
      )}
      onClick={onClick}
    >
      {/* Mini desktop preview with proportional window rectangles */}
      <div
        data-mc-workspace-preview
        className="relative rounded-[5px] bg-black/40 border border-white/10 overflow-hidden"
        style={{ width: previewW, height: previewH }}
      >
        {windows.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <PlatformIcon platform={workspace.platform} className="w-4 h-4 text-white/20" />
          </div>
        ) : (
          windows.map((win, i) => (
            <div
              key={i}
              className={cn(
                'absolute rounded-[2px] border',
                win.state === 'minimized'
                  ? 'bg-white/5 border-white/8'
                  : 'bg-white/15 border-white/20',
              )}
              style={{
                left: win.x * sx,
                top: win.y * sy,
                width: Math.max(8, win.width * sx),
                height: Math.max(5, win.height * sy),
              }}
            />
          ))
        )}
      </div>

      {/* Label */}
      <span className={cn(
        'text-[11px] font-medium truncate max-w-[130px] leading-tight',
        isActive ? 'text-white' : 'text-white/50',
      )}>
        {workspace.name}
      </span>

      {/* Active agent indicator */}
      {workspace.active && (
        <span className="absolute top-1 right-1 flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: workspace.color }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: workspace.color }}
          />
        </span>
      )}

      {/* Delete button (non-main, on hover) */}
      {workspace.id !== 'main' && onDelete && (
        <button
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full
                     bg-black/70 border border-white/20 backdrop-blur-sm
                     flex items-center justify-center
                     opacity-0 group-hover:opacity-100 transition-opacity duration-150
                     hover:bg-red-500/80 hover:border-red-400/40"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <X className="w-2.5 h-2.5 text-white" />
        </button>
      )}
    </button>
  );
}

// ── Scrim — rendered inside Desktop (same stacking context as windows) ──

export function MissionControlScrim() {
  const active = useWindowStore((s) => s.missionControlActive);
  const [animIn, setAnimIn] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimIn(true));
      });
    } else {
      setAnimIn(false);
      const t = setTimeout(() => setShouldRender(false), 500);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 transition-[background-color,backdrop-filter] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]',
        animIn ? 'bg-black/20 backdrop-blur-3xl saturate-150' : 'bg-black/0 backdrop-blur-0 saturate-100',
      )}
      style={{ zIndex: Z_INDEX.missionControlScrim, pointerEvents: 'none' }}
    />
  );
}

// ── Main MissionControl component (workspace bar — portaled to body) ──

export function MissionControl() {
  const active = useWindowStore((s) => s.missionControlActive);
  const windows = useWindowStore((s) => s.windows);
  const workspaces = useWindowStore((s) => s.workspaces);
  const activeWorkspaceId = useWindowStore((s) => s.activeWorkspaceId);
  const closeMissionControl = useWindowStore((s) => s.closeMissionControl);
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace);
  const deleteWorkspace = useWindowStore((s) => s.deleteWorkspace);
  const createWorkspace = useWindowStore((s) => s.createWorkspace);

  const [animIn, setAnimIn] = useState(false);

  // We keep rendering briefly after deactivation so the exit animation plays.
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimIn(true));
      });
    } else {
      setAnimIn(false);
      // Keep rendering during exit animation, then unmount
      const t = setTimeout(() => setShouldRender(false), 500);
      return () => clearTimeout(t);
    }
  }, [active]);

  // Close on Escape
  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMissionControl();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, closeMissionControl]);

  // Handle workspace click — close MC if clicking the already-active workspace
  const handleWorkspaceClick = useCallback((wsId: string) => {
    if (wsId === activeWorkspaceId) {
      closeMissionControl();
    } else {
      switchWorkspace(wsId);
      closeMissionControl();
    }
  }, [activeWorkspaceId, switchWorkspace, closeMissionControl]);

  // Handle add workspace
  const handleAddWorkspace = useCallback(() => {
    const id = createWorkspace({
      name: `Desktop ${workspaces.length + 1}`,
      platform: 'desktop',
    });
    switchWorkspace(id);
  }, [createWorkspace, switchWorkspace, workspaces.length]);

  if (!shouldRender) return null;

  return createPortal(
    <>
      {/* ── Workspace bar (above windows) — slides up from bottom ── */}
      <div
        className={cn(
          'fixed left-0 right-0 flex items-center justify-center gap-3 px-6',
          'transition-all duration-[400ms] ease-out',
          animIn
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-16',
        )}
        style={{
          zIndex: Z_INDEX.missionControlBar,
          top: MENUBAR_HEIGHT + 16,
          height: MC_WORKSPACE_BAR_HEIGHT,
        }}
        onClick={(e) => {
          // Close MC when clicking the empty space in the workspace bar (not a thumbnail)
          if (e.target === e.currentTarget) closeMissionControl();
        }}
      >
        {workspaces.map((ws) => {
          const wsWindows = windows
            .filter((w) => w.workspaceId === ws.id)
            .map((w) => ({ x: w.x, y: w.y, width: w.width, height: w.height, state: w.state }));

          return (
            <WorkspaceThumbnail
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              windows={wsWindows}
              onClick={() => handleWorkspaceClick(ws.id)}
              onDelete={ws.id !== 'main' ? () => deleteWorkspace(ws.id) : undefined}
            />
          );
        })}

        {/* Add workspace button — data-mc-workspace-id="__new__" lets drag-to-drop create a workspace */}
        <button
          data-mc-workspace-id="__new__"
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-2 pt-2 pb-1.5
                     transition-all duration-200
                     hover:bg-white/8 group"
          onClick={handleAddWorkspace}
          title="Add workspace"
        >
          <div
            data-mc-workspace-preview
            className="flex items-center justify-center rounded-[5px]
                       border border-dashed border-white/15 group-hover:border-white/30
                       text-white/20 group-hover:text-white/50 transition-colors"
            style={{ width: 140, height: 88 }}
          >
            <Plus className="w-6 h-6" />
          </div>
          <span className="text-[11px] text-white/30 group-hover:text-white/50 font-medium transition-colors">
            New
          </span>
        </button>
      </div>
    </>,
    document.body,
  );
}
