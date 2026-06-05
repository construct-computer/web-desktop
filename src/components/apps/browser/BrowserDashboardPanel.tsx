import { useEffect, useMemo, useState } from 'react';
import { Check, X, Copy, ExternalLink, FileText, StopCircle, Loader2, AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { stopAllBrowserForUser } from '@/services/api';
import { BrowserRunHistory } from '../BrowserRunHistory';
import { BrowserScreenshotGallery } from '../BrowserScreenshotGallery';
import { formatBytes } from '@/lib/format';

type BrowserDashboardTab = 'sessions' | 'runs' | 'shots' | 'files';

export function BrowserDashboardPanel({
  sessions,
  activeSessionId,
  onClose,
}: {
  sessions: BrowserSessionRecord[];
  activeSessionId: string | null;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<BrowserDashboardTab>('sessions');
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

  return (
    <div className="w-[360px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-sidebar)] flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out]">
      <div className="px-3.5 py-3 border-b border-[var(--color-border)] surface-toolbar select-none">
        <div className="flex items-center justify-between gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              title="Close console details"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">Browser Session</p>
            <p className="text-xs font-semibold text-[var(--color-text)] truncate mt-0.5">
              {active?.task || active?.streamUrl || 'No active session'}
            </p>
          </div>
          {active && (
            <span className="shrink-0 text-[9px] font-semibold rounded-md px-2 py-0.5 bg-white/[0.06] border border-white/[0.04] text-[var(--color-text-subtle)]">
              <ExpiresCountdown expiresAt={active?.expiresAt} status={active?.status} />
            </span>
          )}
          <button
            type="button"
            onClick={onStopAll}
            disabled={stopping || stoppableCount === 0}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-500/30 bg-red-500/[0.08] text-[10px] font-sans font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
            title="Stop all live browser sessions"
          >
            <StopCircle className="w-3 h-3" />
            {stopping ? 'Stopping' : 'Stop All'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-[var(--color-border)] surface-toolbar text-[11px] p-1 gap-1 bg-white/[0.01] select-none">
        {([
          ['sessions', 'Sessions'],
          ['runs', 'Runs'],
          ['shots', 'Shots'],
          ['files', 'Files'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded-md transition-all duration-150 font-sans ${
              tab === key
                ? 'text-[var(--color-text)] bg-white/10 shadow-sm font-medium'
                : 'text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.02]'
            }`}
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
            <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] surface-toolbar flex items-center justify-between gap-2 select-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                {shotsScope === 'active' ? 'Active Screenshots' : 'All Screenshots'}
              </span>
              <button
                type="button"
                onClick={() => setShotsScope((scope) => scope === 'active' ? 'all' : 'active')}
                disabled={!active}
                className="text-[10px] px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
              >
                {shotsScope === 'active' ? 'Show All' : 'Active Only'}
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
      <div className="h-full overflow-y-auto p-4 select-none">
        <EmptyState>
          Browser sessions will appear here when Construct or screenshot actions open a live browser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3.5 space-y-2.5">
      {sessions.map((s) => {
        const isRunning = s.status === 'running' || s.status === 'starting';
        const isSuccess = s.status === 'complete';
        const isErr = s.status === 'error';
        const active = s.id === activeSessionId;
        
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveBrowserSession(s.id)}
            className={`w-full text-left rounded-xl border p-3.5 text-xs transition-all duration-200 ${
              active
                ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-muted)]/15 shadow-md'
                : 'border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 select-none">
              <div className="flex items-center gap-1.5">
                {isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : isSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : isErr ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-[var(--color-text-subtle)]" />
                )}
                <span className="font-semibold text-[var(--color-text)] capitalize">
                  {sessionStatusLabel(s.status)}
                </span>
              </div>
              <span className="text-[10px] text-[var(--color-text-subtle)] font-mono">
                <ExpiresCountdown expiresAt={s.expiresAt} status={s.status} />
              </span>
            </div>
            
            <p className="mt-2 text-[var(--color-text-muted)] line-clamp-2 leading-relaxed font-sans">
              {s.task || s.streamUrl || s.id}
            </p>
            
            {s.stepCount != null && (
              <p className="mt-2 text-[10px] text-[var(--color-text-subtle)] font-mono opacity-80">
                {s.stepCount} step{s.stepCount === 1 ? '' : 's'} executed
              </p>
            )}
            
            {s.error && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5 leading-relaxed font-sans">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{s.error}</span>
              </div>
            )}
          </button>
        );
      })}
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
      <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] surface-toolbar flex items-center justify-between gap-2 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
          {activeOnly ? 'Active Session Files' : 'All Synced Files'}
        </span>
        <button
          type="button"
          onClick={onToggleScope}
          disabled={!hasActiveSession}
          className="text-[10px] px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
        >
          {activeOnly ? 'Show All' : 'Active Only'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {files.length === 0 ? (
          <EmptyState>
            Synced files will appear here after task downloads or document creations.
          </EmptyState>
        ) : files.map((file) => (
          <div key={`${file.sessionId}:${file.workspacePath}`} className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 text-[var(--color-text-subtle)] select-none">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--color-text)] truncate">{file.name || file.workspacePath}</p>
                <p className="text-[10px] text-[var(--color-text-subtle)] font-mono truncate mt-0.5">{file.workspacePath}</p>
                {file.size != null && (
                  <p className="text-[9px] text-[var(--color-text-subtle)] opacity-70 font-mono mt-0.5">{formatBytes(file.size)}</p>
                )}
              </div>
            </div>
            <div className="mt-3.5 flex items-center gap-2 select-none border-t border-white/[0.04] pt-2">
              <button
                type="button"
                onClick={openFiles}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.05] transition-all duration-150"
              >
                <ExternalLink className="w-3 h-3" />
                View Files
              </button>
              <button
                type="button"
                onClick={() => copyPath(file.workspacePath)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.05] transition-all duration-150"
              >
                {copiedPath === file.workspacePath ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedPath === file.workspacePath ? 'Copied' : 'Copy Path'}
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
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center select-none">
      <FileText className="w-8 h-8 text-[var(--color-text-subtle)] opacity-10 mb-2" />
      <p className="text-xs text-[var(--color-text-subtle)] opacity-60 leading-relaxed font-sans">
        {children}
      </p>
    </div>
  );
}

function sessionStatusLabel(status: BrowserSessionRecord['status']): string {
  if (status === 'idle') return 'stopped';
  if (status === 'complete') return 'finished';
  return status;
}

