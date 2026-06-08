import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  Search,
  StopCircle,
  Unlock,
  X,
} from 'lucide-react';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { stopAllBrowserForUser } from '@/services/api';
import type { BrowserTab } from '@/stores/browserTabStore';
import { formatBytes } from '@/lib/format';
import { decodeDisplayName } from '@/lib/workspacePaths';
import { BrowserRunHistory } from '../BrowserRunHistory';
import { BrowserScreenshotGallery } from '../BrowserScreenshotGallery';

type DetailsSection = 'page' | 'activity' | 'captures' | 'files';
type CaptureScope = 'auto' | 'page' | 'run' | 'all';

export function BrowserDetailsPanel({
  sessions,
  activeSessionId,
  activeTab,
  liveInteractive = false,
  onClose,
}: {
  sessions: BrowserSessionRecord[];
  activeSessionId: string | null;
  activeTab?: BrowserTab | null;
  liveInteractive?: boolean;
  onClose?: () => void;
}) {
  const [section, setSection] = useState<DetailsSection>('page');
  const [captureScope, setCaptureScope] = useState<CaptureScope>('auto');
  const [filesScope, setFilesScope] = useState<'active' | 'all'>('active');
  const [stopping, setStopping] = useState(false);
  const hydrateBrowserSessions = useComputerStore((s) => s.hydrateBrowserSessions);

  const visibleSessions = useMemo(() => sessions.filter(isVisibleSession), [sessions]);
  const tabSession = activeTab?.runId
    ? visibleSessions.find((s) => s.runId === activeTab.runId || s.id === activeTab.runId)
    : null;
  const activeSession = tabSession || visibleSessions.find((s) => s.id === activeSessionId) || visibleSessions[0];
  const pageUrl = activeTab ? (activeTab.pageUrl || activeTab.url || '') : '';

  const files = useMemo(() => {
    const source = filesScope === 'active' && activeSession ? [activeSession] : visibleSessions;
    return source.flatMap((s) => (s.files || []).map((f) => ({ ...f, sessionId: s.id })));
  }, [activeSession, filesScope, visibleSessions]);

  const stoppableCount = visibleSessions.filter((s) => s.status !== 'complete' && s.status !== 'error' && s.status !== 'expired').length;

  const onStopAll = async () => {
    if (stopping || stoppableCount === 0) return;
    setStopping(true);
    try {
      const res = await stopAllBrowserForUser();
      if (res.success) hydrateBrowserSessions([], { replace: true });
    } finally {
      setStopping(false);
    }
  };

  const resolvedCaptureScope = captureScope === 'auto' ? defaultCaptureScope(activeTab) : captureScope;
  const captureRunId = resolvedCaptureScope === 'run' ? activeTab?.runId || activeSession?.runId : null;
  const captureUrl = resolvedCaptureScope === 'page' ? pageUrl : null;

  return (
    <div className="w-[380px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-sidebar)] flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out]">
      <div className="px-4 py-3 border-b border-[var(--color-border)] surface-toolbar select-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">Browser details</p>
            <div className="mt-1.5 flex items-center gap-2 min-w-0">
              <TabIcon tab={activeTab ?? null} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)] truncate">{activeTab?.pageTitle || activeTab?.title || 'Construct browser'}</p>
                <p className="text-[10px] text-[var(--color-text-subtle)] truncate">{detailsSubtitle(activeTab ?? null, activeSession, liveInteractive)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {stoppableCount > 0 && (
              <button
                type="button"
                onClick={() => { void onStopAll(); }}
                disabled={stopping}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-500/30 bg-red-500/[0.08] text-[10px] font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-40"
                title="Stop all live browser sessions"
              >
                <StopCircle className="w-3 h-3" />
                {stopping ? 'Stopping' : 'Stop'}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                title="Close details panel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 p-1 border-b border-[var(--color-border)] surface-toolbar text-[11px] select-none">
        {([
          ['page', 'Page'],
          ['activity', 'Activity'],
          ['captures', 'Captures'],
          ['files', 'Files'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`py-1.5 rounded-md transition-all duration-150 ${
              section === key
                ? 'text-[var(--color-text)] bg-white/10 shadow-sm font-medium'
                : 'text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.03]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {section === 'page' && (
          <PageSection tab={activeTab ?? null} session={activeSession} liveInteractive={liveInteractive} />
        )}
        {section === 'activity' && (
          <ActivitySection sessions={visibleSessions} activeSessionId={activeSession?.id || null} />
        )}
        {section === 'captures' && (
          <CapturesSection
            scope={captureScope}
            resolvedScope={resolvedCaptureScope}
            onScopeChange={setCaptureScope}
            runId={captureRunId}
            url={captureUrl}
            captureUrl={pageUrl || null}
          />
        )}
        {section === 'files' && (
          <FilesSection
            files={files}
            activeOnly={filesScope === 'active'}
            hasActiveSession={!!activeSession}
            onToggleScope={() => setFilesScope((scope) => scope === 'active' ? 'all' : 'active')}
          />
        )}
      </div>
    </div>
  );
}

function TabIcon({ tab }: { tab: BrowserTab | null }) {
  const cls = 'w-4 h-4';
  if (tab?.mode === 'live') return <Globe className={`${cls} text-amber-400`} />;
  if (tab?.mode === 'search') return <Search className={`${cls} text-sky-400`} />;
  if (tab?.mode === 'fetch') return <FileText className={`${cls} text-emerald-400`} />;
  return <Globe className={`${cls} text-[var(--color-text-subtle)]`} />;
}

function detailsSubtitle(tab: BrowserTab | null, session: BrowserSessionRecord | undefined, interactive: boolean): string {
  if (!tab) return session?.task || 'Agent-owned browser shell';
  if (tab.mode === 'live') {
    const state = interactive ? 'Unlocked' : 'View only';
    return `${modeName(tab.mode)} · ${state} · ${tab.runPhase || session?.status || 'live'}`;
  }
  return `${modeName(tab.mode)} · ${tab.status}`;
}

function defaultCaptureScope(tab?: BrowserTab | null): Exclude<CaptureScope, 'auto'> {
  if (!tab) return 'all';
  if (tab.mode === 'live' && tab.runId) return 'run';
  if ((tab.mode === 'fetch' || tab.url || tab.pageUrl) && (tab.url || tab.pageUrl)) return 'page';
  return 'all';
}

function modeName(mode?: BrowserTab['mode']): string {
  switch (mode) {
    case 'search': return 'Search';
    case 'fetch': return 'Page';
    case 'live': return 'Live browser';
    case 'arxiv': return 'arXiv';
    case 'domain': return 'Domain';
    default: return 'Tab';
  }
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="py-2.5 border-b border-white/[0.04] last:border-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">{label}</p>
      <div className={`mt-0.5 text-xs text-[var(--color-text)] leading-relaxed break-words ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function PageSection({
  tab,
  session,
  liveInteractive,
}: {
  tab: BrowserTab | null;
  session?: BrowserSessionRecord;
  liveInteractive: boolean;
}) {
  if (!tab) {
    return <EmptyState>Tabs and agent browser output will appear here when Construct uses web tools.</EmptyState>;
  }
  const link = tab.pageUrl || tab.url || '';
  const topResult = tab.results?.[0];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <Row label="Mode" value={modeName(tab.mode)} />
        <Row label="Title" value={tab.pageTitle || tab.title} />
        {tab.mode === 'fetch' && (
          <>
            <Row label="Description" value={tab.pageDescription} />
            <Row label="Published" value={tab.publishedTime} />
            <Row label="View" value={tab.contentFormat === 'json' ? `JSON · ${tab.dataView || 'visual'}` : `${tab.fetchView || 'reader'} view`} />
            <Row label="Reader" value={tab.readerTruncated ? `Truncated${tab.readerRemainingSections ? ` · ${tab.readerRemainingSections} sections left` : ''}` : (tab.readerContent ? 'Full reader text available' : null)} />
          </>
        )}
        {tab.mode === 'search' && (
          <>
            <Row label="Query" value={tab.query} />
            <Row label="Results" value={typeof tab.searchResultCount === 'number' ? tab.searchResultCount : tab.results?.length} />
            <Row label="Country" value={tab.searchCountry} />
            <Row label="Top result" value={topResult ? `${topResult.title} · ${topResult.url}` : null} />
          </>
        )}
        {tab.mode === 'live' && (
          <>
            <Row label="Goal" value={tab.goal || session?.task} />
            <Row label="Status" value={tab.runPhase || session?.status || 'live'} />
            <Row label="Interaction" value={liveInteractive ? <span className="inline-flex items-center gap-1 text-amber-300"><Unlock className="w-3 h-3" /> Unlocked for user input</span> : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> View only, agent controls the browser</span>} />
            <Row label="Steps" value={typeof tab.stepCount === 'number' ? tab.stepCount : session?.stepCount} />
            <Row label="Run ID" value={tab.runId || session?.runId} mono />
          </>
        )}
        {tab.mode === 'arxiv' && (
          <>
            <Row label="Query" value={tab.query} />
            <Row label="Papers" value={tab.papers?.length} />
          </>
        )}
        {tab.mode === 'domain' && (
          <>
            <Row label="Domain" value={tab.domain} mono />
            <Row label="Action" value={tab.domainAction} />
          </>
        )}
        <Row label="URL" value={link} mono />
        {tab.error && (
          <div className="my-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5 leading-relaxed">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{tab.error}</span>
          </div>
        )}
      </div>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.05] transition-all duration-150"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open source URL
        </a>
      )}
    </div>
  );
}

function ActivitySection({ sessions, activeSessionId }: { sessions: BrowserSessionRecord[]; activeSessionId: string | null }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      {sessions.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)] space-y-2">
          {sessions.slice(0, 3).map((session) => (
            <SessionCard key={session.id} session={session} active={session.id === activeSessionId} />
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <BrowserRunHistory embedded />
      </div>
    </div>
  );
}

function SessionCard({ session, active }: { session: BrowserSessionRecord; active: boolean }) {
  const setActiveBrowserSession = useComputerStore((s) => s.setActiveBrowserSession);
  const running = session.status === 'running' || session.status === 'starting';
  return (
    <button
      type="button"
      onClick={() => setActiveBrowserSession(session.id)}
      className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
        active ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-muted)]/15' : 'border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {session.status}
        </span>
        {typeof session.stepCount === 'number' && (
          <span className="text-[10px] font-mono text-[var(--color-text-subtle)]">{session.stepCount} steps</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)] line-clamp-2">{session.task || session.streamUrl || session.id}</p>
    </button>
  );
}

function CapturesSection({
  scope,
  resolvedScope,
  onScopeChange,
  runId,
  url,
  captureUrl,
}: {
  scope: CaptureScope;
  resolvedScope: Exclude<CaptureScope, 'auto'>;
  onScopeChange: (scope: CaptureScope) => void;
  runId?: string | null;
  url?: string | null;
  captureUrl?: string | null;
}) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] surface-toolbar flex items-center justify-between gap-2 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
          {resolvedScope === 'run' ? 'This run' : resolvedScope === 'page' ? 'This page' : 'All captures'}
        </span>
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as CaptureScope)}
          className="text-[10px] rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] px-2 py-1 outline-none"
        >
          <option value="auto">Auto</option>
          <option value="page">This page</option>
          <option value="run">This run</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="flex-1 min-h-0">
        <BrowserScreenshotGallery
          runId={resolvedScope === 'run' ? runId : null}
          url={resolvedScope === 'page' ? url : null}
          captureUrl={captureUrl}
          title={resolvedScope === 'run' ? 'Run captures' : resolvedScope === 'page' ? 'Page captures' : 'Recent captures'}
        />
      </div>
    </div>
  );
}

function FilesSection({
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
  const openFiles = () => useWindowStore.getState().ensureWindowOpen('files');
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] surface-toolbar flex items-center justify-between gap-2 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
          {activeOnly ? 'Active files' : 'All files'}
        </span>
        <button
          type="button"
          onClick={onToggleScope}
          disabled={!hasActiveSession}
          className="text-[10px] px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
        >
          {activeOnly ? 'Show All' : 'Active'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {files.length === 0 ? (
          <EmptyState>Synced files and downloads from browser tasks will appear here.</EmptyState>
        ) : files.map((file) => (
          <div key={`${file.sessionId}:${file.workspacePath}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-[var(--color-text-subtle)]">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--color-text)] truncate">{decodeDisplayName(file.name || file.workspacePath)}</p>
                <p className="text-[10px] text-[var(--color-text-subtle)] font-mono truncate mt-0.5">{file.workspacePath}</p>
                {file.size != null && <p className="text-[9px] text-[var(--color-text-subtle)] opacity-70 font-mono mt-0.5">{formatBytes(file.size)}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={openFiles}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.05]"
            >
              <ExternalLink className="w-3 h-3" />
              Open Files
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center p-6 text-center text-xs text-[var(--color-text-subtle)] leading-relaxed">
      {children}
    </div>
  );
}

function isVisibleSession(session: BrowserSessionRecord): boolean {
  const now = Date.now();
  if (session.status === 'expired') return false;
  const expired = typeof session.expiresAt === 'number' && session.expiresAt <= now;
  if ((session.status === 'running' || session.status === 'starting') && !expired) return true;
  if (session.status === 'complete' || session.status === 'error' || session.status === 'idle') {
    return !expired && now - session.startedAt < 30 * 60_000;
  }
  return !expired;
}
