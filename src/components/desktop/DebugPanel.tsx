/**
 * Debug panel — shows recent errors with full detail, copyable stack traces.
 * Accessible from MenuBar (bug icon) or keyboard shortcut.
 */

import { useErrorStore, type CapturedError } from '@/stores/errorStore';
import { X, Copy, Trash2, ChevronDown, ChevronRight, Bug } from 'lucide-react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';

function ErrorRow({ error }: { error: CapturedError }) {
  const [expanded, setExpanded] = useState(false);
  const copyError = useErrorStore((s) => s.copyError);

  const sourceColors: Record<string, string> = {
    ws: 'text-yellow-500',
    api: 'text-blue-400',
    react: 'text-red-400',
    uncaught: 'text-red-500',
    manual: 'text-gray-400',
  };

  const time = error.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div className="border-b border-white/5 last:border-0">
      <div
        className="flex items-start gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer text-[11px]"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-white/40" />
        ) : (
          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-white/40" />
        )}
        <span className="text-white/30 tabular-nums shrink-0">{time}</span>
        <span className={`shrink-0 font-mono uppercase text-[9px] ${sourceColors[error.source] || 'text-white/50'}`}>
          {error.source}
        </span>
        <span className="text-white/80 truncate flex-1 font-mono">{error.message}</span>
        <button
          onClick={(e) => { e.stopPropagation(); copyError(error.id); }}
          className="shrink-0 p-0.5 hover:bg-white/10 rounded"
          title="Copy error"
        >
          <Copy className="w-3 h-3 text-white/30" />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pl-8 space-y-1">
          {error.errorId && (
            <div className="text-[10px] font-mono text-white/40">
              Server ID: <span className="text-white/60 select-all">{error.errorId}</span>
            </div>
          )}
          {error.context && (
            <pre className="text-[10px] font-mono text-white/50 whitespace-pre-wrap break-all select-all bg-black/30 rounded p-2 max-h-32 overflow-auto">
              {JSON.stringify(error.context, null, 2)}
            </pre>
          )}
          {error.stack && (
            <pre className="text-[10px] font-mono text-red-400/70 whitespace-pre-wrap break-all select-all bg-black/30 rounded p-2 max-h-48 overflow-auto">
              {error.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function DebugPanel() {
  const errors = useErrorStore((s) => s.errors);
  const panelOpen = useErrorStore((s) => s.panelOpen);
  const togglePanel = useErrorStore((s) => s.togglePanel);
  const clearAll = useErrorStore((s) => s.clearAll);
  const copyAll = useErrorStore((s) => s.copyAll);
  const isMobile = useIsMobile();

  if (!panelOpen || isMobile) return null;

  return (
    <div
      className="fixed bottom-0 right-0 w-[min(520px,calc(100vw-16px))] max-h-[50dvh] flex flex-col
                 glass-tooltip border border-white/10 rounded-tl-xl
                 shadow-2xl z-[9998] font-mono text-[11px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="w-3.5 h-3.5 text-red-400" />
          <span className="text-white/70 font-semibold text-[11px]">Debug Console</span>
          <span className="text-white/30 text-[10px]">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyAll}
            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70"
            title="Copy all errors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearAll}
            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70"
            title="Clear all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={togglePanel}
            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {errors.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-white/20 text-[11px]">
            No errors captured
          </div>
        ) : (
          errors.map((error) => <ErrorRow key={error.id} error={error} />)
        )}
      </div>
    </div>
  );
}

/** Small button for the MenuBar to toggle the debug panel. */
export function DebugPanelToggle() {
  const togglePanel = useErrorStore((s) => s.togglePanel);
  const unreadCount = useErrorStore((s) => s.unreadCount);
  const panelOpen = useErrorStore((s) => s.panelOpen);

  return (
    <button
      onClick={togglePanel}
      className={`relative p-1.5 rounded-md transition-colors ${
        panelOpen ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/10'
      }`}
      title="Debug console"
    >
      <Bug className="w-3.5 h-3.5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
