import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FileText, StopCircle } from 'lucide-react';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { stopAllBrowserForUser } from '@/services/api';
import { BrowserRunHistory } from '../BrowserRunHistory';
import { BrowserScreenshotGallery } from '../BrowserScreenshotGallery';

type BrowserDashboardTab = 'sessions' | 'runs' | 'shots' | 'files';

export function BrowserDashboardPanel({
  sessions,
  activeSessionId,
}: {
  sessions: BrowserSessionRecord[];
  activeSessionId: string | null;
}) {
  const [tab, setTab] = useState<BrowserDashboardTab>('sessions');
  const [collapsed, setCollapsed] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [filesScope, setFilesScope] = useState<'active' | 'all'>('active');
  const [shotsScope, setShotsScope] = useState<'active' | 'all'>('active');
  const hydrateBrowserSessions = useComputerStore((s) => s.hydrateBrowserSessions);
  const visibleSessions = useMemo(() => sessions.filter(isVisibleSession), [sessions]);
  const active = visibleSessions.find((s) => s.id === activeSessionId) || visibleSessions[0];
  const files = useMemo(() => {
    const source = filesScope === 'active' && active ? [active] : visibleSessions;
    return source.flatMap((s) => (s.files || []).map((f) => ({ ...f, sessionId: s.id })));
  }, [active, filesScope, visibleSessions]);
  const runningCount = visibleSessions.filter((s) => s.status === 'running' || s.status === 'starting').length;
  const terminalCount = visibleSessions.filter((s) => s.status === 'complete' || s.status === 'error' || s.status === 'idle').length;
  const stoppableCount = visibleSessions.filter((s) => s.status !== 'complete' && s.status !== 'error' && s.status !== 'expired').length;
  const onStopAll = async () => {
    if (stopping || stoppableCount === 0) return;
    setStopping(true);
    try {
      const res = await stopAllBrowserForUser();
      if (res.success) hydrateBrowserSessions([]);
    } finally {
      setStopping(false);
    }
  };

  if (collapsed) {
    return (
      <div className="w-[44px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col items-center py-2 gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.06] flex items-center justify-center"
          title="Show browser details"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] select-none"
          style={{ writingMode: 'vertical-rl' }}
        >
          Details
        </div>
        {(runningCount > 0 || terminalCount > 0) && (
          <div className="mt-auto mb-1 flex flex-col items-center gap-1">
            {runningCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400" title={`${runningCount} running`} />}
            {terminalCount > 0 && <span className="text-[10px] text-[var(--color-text-subtle)]">{terminalCount}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-[360px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="shrink-0 w-7 h-7 rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.06] flex items-center justify-center"
            title="Collapse browser details"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-subtle)]">Browser app</p>
            <p className="text-xs text-[var(--color-text)] truncate">
              {active?.task || active?.streamUrl || 'No active browser session'}
            </p>
          </div>
          <span className="shrink-0 text-[10px] rounded-full px-2 py-0.5 bg-white/5 text-[var(--color-text-subtle)]">
            <ExpiresCountdown expiresAt={active?.expiresAt} status={active?.status} />
          </span>
          <button
            type="button"
            onClick={onStopAll}
            disabled={stopping || stoppableCount === 0}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/20 bg-red-500/[0.06] text-[10px] text-red-400/80 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Stop all Browser Use resources"
          >
            <StopCircle className="w-3 h-3" />
            {stopping ? 'Stopping' : 'Stop all'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-[var(--color-border)] text-[11px]">
        {([
          ['sessions', 'Sessions'],
          ['runs', 'Runs'],
          ['shots', 'Shots'],
          ['files', 'Files'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-2 py-1.5 ${tab === key ? 'text-[var(--color-text)] bg-white/[0.04]' : 'text-[var(--color-text-subtle)] hover:text-[var(--color-text)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'sessions' && (
          <BrowserSessionList sessions={visibleSessions} activeSessionId={active?.id || null} />
        )}
        {tab === 'runs' && <BrowserRunHistory />}
        {tab === 'shots' && (
          <div className="h-full flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--color-text-subtle)]">
                {shotsScope === 'active' ? 'Selected session screenshots' : 'All screenshots'}
              </span>
              <button
                type="button"
                onClick={() => setShotsScope((scope) => scope === 'active' ? 'all' : 'active')}
                disabled={!active}
                className="text-[10px] px-2 py-1 rounded border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
              >
                {shotsScope === 'active' ? 'Show all' : 'Active only'}
              </button>
            </div>
            <BrowserScreenshotGallery
              runId={shotsScope === 'active' ? active?.runId : null}
              subagentId={shotsScope === 'active' ? active?.subagentId : null}
            />
          </div>
        )}
        {tab === 'files' && (
          <BrowserFilesPanel
            files={files}
            activeOnly={filesScope === 'active'}
            hasActiveSession={!!active}
            onToggleScope={() => setFilesScope((scope) => scope === 'active' ? 'all' : 'active')}
          />
        )}
      </div>
    </div>
  );
}

function isVisibleSession(session: BrowserSessionRecord): boolean {
  const now = Date.now();
  if (session.status === 'expired') return false;
  const expired = typeof session.expiresAt === 'number' && session.expiresAt <= now;
  if ((session.status === 'running' || session.status === 'starting') && !expired) return true;
  if (session.status === 'complete' || session.status === 'error' || session.status === 'idle') {
    return !expired && now - session.startedAt < 5 * 60_000;
  }
  return !expired;
}

function BrowserSessionList({
  sessions,
  activeSessionId,
}: {
  sessions: BrowserSessionRecord[];
  activeSessionId: string | null;
}) {
  const setActiveBrowserSession = useComputerStore((s) => s.setActiveBrowserSession);

  if (sessions.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <EmptyState>
          Browser Use sessions will appear here when the agent or screenshot tools open a live browser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {sessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setActiveBrowserSession(s.id)}
          className={`w-full text-left rounded-md border p-2 text-xs transition-colors ${s.id === activeSessionId ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent-muted)]/20' : 'border-white/[0.08] bg-black/10 hover:bg-white/[0.04]'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[var(--color-text)] capitalize">{sessionStatusLabel(s.status)}</span>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              <ExpiresCountdown expiresAt={s.expiresAt} status={s.status} />
            </span>
          </div>
          <p className="mt-1 text-[var(--color-text-subtle)] line-clamp-2">{s.task || s.streamUrl || s.id}</p>
          {s.stepCount != null && (
            <p className="mt-1 text-[10px] text-[var(--color-text-subtle)] opacity-70">
              {s.stepCount} step{s.stepCount === 1 ? '' : 's'}
            </p>
          )}
          {s.error && <p className="mt-1 text-[10px] text-red-400">{s.error}</p>}
        </button>
      ))}
    </div>
  );
}

function BrowserFilesPanel({
  files,
  activeOnly,
  hasActiveSession,
  onToggleScope,
}: {
  files: Array<{ name?: string; workspacePath: string; size?: number; contentType?: string; sessionId: string }>;
  activeOnly: boolean;
  hasActiveSession: boolean;
  onToggleScope: () => void;
}) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const openFiles = () => {
    useWindowStore.getState().ensureWindowOpen('files');
  };
  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      setCopiedPath(null);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--color-text-subtle)]">
          {activeOnly ? 'Active session files' : 'All synced files'}
        </span>
        <button
          type="button"
          onClick={onToggleScope}
          disabled={!hasActiveSession}
          className="text-[10px] px-2 py-1 rounded border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
        >
          {activeOnly ? 'Show all' : 'Active only'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {files.length === 0 ? (
          <EmptyState>
            Synced Browser Use files will appear here after tasks create or download artifacts.
          </EmptyState>
        ) : files.map((file) => (
          <div key={`${file.sessionId}:${file.workspacePath}`} className="rounded-md border border-white/[0.08] bg-black/10 p-2">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-subtle)]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--color-text)] truncate">{file.name || file.workspacePath}</p>
                <p className="text-[10px] text-[var(--color-text-subtle)] truncate">{file.workspacePath}</p>
                {file.size != null && (
                  <p className="text-[10px] text-[var(--color-text-subtle)] opacity-60">{formatBytes(file.size)}</p>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={openFiles}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <ExternalLink className="w-3 h-3" />
                Open in Files
              </button>
              <button
                type="button"
                onClick={() => copyPath(file.workspacePath)}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                {copiedPath === file.workspacePath ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedPath === file.workspacePath ? 'Copied' : 'Copy path'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpiresCountdown({ expiresAt, status }: { expiresAt?: number; status?: BrowserSessionRecord['status'] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (status === 'idle') return <span>stopped</span>;
  if (status === 'complete') return <span>finished</span>;
  if (status === 'error') return <span>failed</span>;
  if (!expiresAt) return <span>15m max</span>;
  const remaining = Math.max(0, expiresAt - now);
  const min = Math.floor(remaining / 60_000);
  const sec = Math.floor((remaining % 60_000) / 1000);
  return <span>{remaining <= 0 ? 'expired' : `${min}:${String(sec).padStart(2, '0')} left`}</span>;
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="text-xs text-[var(--color-text-subtle)] opacity-60 leading-relaxed">
      {children}
    </p>
  );
}

function sessionStatusLabel(status: BrowserSessionRecord['status']): string {
  if (status === 'idle') return 'stopped';
  if (status === 'complete') return 'finished';
  return status;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
