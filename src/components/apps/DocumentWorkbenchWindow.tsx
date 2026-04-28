import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, ImageIcon, Loader2, RefreshCw, Terminal, XCircle } from 'lucide-react';
import type { WindowConfig } from '@/types';
import { downloadContainerFile, previewContainerFile } from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';
import { useDocumentPreviewStore, type DocumentPreviewFrame } from '@/stores/documentPreviewStore';
import { openDocumentViewer } from '@/stores/documentViewerStore';
import { useWindowStore } from '@/stores/windowStore';

function formatBytes(size?: number): string {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusCopy(status: string) {
  if (status === 'completed') return { text: 'Completed', icon: CheckCircle2, color: 'text-emerald-400' };
  if (status === 'failed') return { text: 'Failed', icon: XCircle, color: 'text-red-400' };
  return { text: 'Live', icon: Loader2, color: 'text-[var(--color-accent)]' };
}

function usePreviewBlob(frame?: DocumentPreviewFrame) {
  const instanceId = useComputerStore(s => s.instanceId);
  const [state, setState] = useState<{ key?: string; url: string | null; error: string | null }>({ url: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!instanceId || !frame?.previewPath) return;
    const key = frame.previewPath;
    previewContainerFile(instanceId, frame.previewPath)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview unavailable (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, url: objectUrl, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, url: null, error: err instanceof Error ? err.message : 'Preview failed' });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [instanceId, frame?.previewPath, frame?.id]);

  if (!frame?.previewPath || state.key !== frame.previewPath) return { url: null, error: null };
  return { url: state.url, error: state.error };
}

export function DocumentWorkbenchWindow({ config }: { config: WindowConfig }) {
  const sessionId = config.metadata?.documentSessionId as string | undefined;
  const sessionOrder = useDocumentPreviewStore(s => s.sessionOrder);
  const sessions = useDocumentPreviewStore(s => s.sessions);
  const resolvedSessionId = sessionId || sessionOrder[sessionOrder.length - 1];
  const session = resolvedSessionId ? sessions[resolvedSessionId] : undefined;
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const instanceId = useComputerStore(s => s.instanceId);

  const selectedFrame = useMemo(() => {
    if (!session) return undefined;
    return session.frames.find(f => f.id === selectedFrameId)
      || session.frames.find(f => f.id === session.currentFrameId)
      || session.frames[session.frames.length - 1];
  }, [session, selectedFrameId]);

  const { url: previewUrl, error: previewError } = usePreviewBlob(selectedFrame);
  const status = statusCopy(session?.status || 'running');
  const StatusIcon = status.icon;

  const artifactPath = session?.artifactPath || session?.outputPath;

  const openFinal = useCallback(() => {
    if (artifactPath) openDocumentViewer(artifactPath);
  }, [artifactPath]);

  const revealFiles = useCallback(() => {
    useWindowStore.getState().ensureWindowOpen('files', 'main');
  }, []);

  const downloadFinal = useCallback(async () => {
    if (!instanceId || !artifactPath) return;
    const res = await downloadContainerFile(instanceId, artifactPath);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifactPath.split('/').pop() || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [artifactPath, instanceId]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No live document session yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text)] overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.06] surface-toolbar">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 ${status.color} ${session.status === 'running' ? 'animate-spin' : ''}`} />
            <h2 className="text-sm font-semibold truncate">
              {session.title || session.goal || session.outputPath || 'Document build'}
            </h2>
            {session.format && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                {session.format}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
            {status.text}{artifactPath ? ` -> ${artifactPath}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={openFinal} disabled={!artifactPath} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/8 hover:bg-white/12 disabled:opacity-40">
            <Eye className="w-3.5 h-3.5" />
            Open
          </button>
          <button onClick={downloadFinal} disabled={!artifactPath} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/8 hover:bg-white/12 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          <button onClick={revealFiles} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/8 hover:bg-white/12">
            Files
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[140px_minmax(0,1fr)_280px]">
        <aside className="border-r border-white/[0.06] overflow-y-auto p-2 space-y-2">
          {session.frames.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-[11px] text-[var(--color-text-muted)] px-2">
              Preview frames will appear here.
            </div>
          ) : session.frames.map((frame, index) => (
            <button
              key={frame.id}
              onClick={() => setSelectedFrameId(frame.id)}
              className={`w-full text-left rounded-lg border p-1.5 transition-colors ${
                selectedFrame?.id === frame.id ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <div className="aspect-video rounded bg-black/30 flex items-center justify-center mb-1">
                <ImageIcon className="w-5 h-5 text-white/30" />
              </div>
              <div className="text-[11px] truncate">{frame.label || `Frame ${index + 1}`}</div>
              <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                {frame.slideIndex !== undefined ? `Slide ${frame.slideIndex + 1}` : frame.pageIndex !== undefined ? `Page ${frame.pageIndex + 1}` : frame.kind || 'Preview'}
              </div>
            </button>
          ))}
        </aside>

        <main className="min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black/40 overflow-auto p-5">
            {!selectedFrame ? (
              <div className="text-center text-[var(--color-text-muted)]">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-40 animate-spin" />
                <p className="text-sm">Waiting for the first visual preview...</p>
              </div>
            ) : previewError ? (
              <div className="text-center text-red-300 text-sm">{previewError}</div>
            ) : previewUrl ? (
              selectedFrame.contentType?.includes('svg') || selectedFrame.contentType?.startsWith('image/') ? (
                <img src={previewUrl} alt={selectedFrame.label || 'Document preview'} className="max-w-full max-h-full object-contain rounded shadow-2xl bg-white" />
              ) : (
                <iframe src={previewUrl} className="w-full h-full border-0 bg-white rounded" title={selectedFrame.label || 'Document preview'} />
              )
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
            )}
          </div>
          <div className="shrink-0 px-3 py-1.5 border-t border-white/[0.06] text-[11px] text-[var(--color-text-muted)] flex items-center justify-between">
            <span>{selectedFrame?.label || artifactPath || 'Live preview'}</span>
            <span>{formatBytes(selectedFrame?.size || session.artifactSize)}</span>
          </div>
        </main>

        <aside className="border-l border-white/[0.06] min-w-0 flex flex-col">
          <div className="p-3 border-b border-white/[0.06]">
            <h3 className="text-xs font-semibold mb-2">Steps</h3>
            <div className="space-y-2 max-h-[260px] overflow-y-auto">
              {session.steps.length === 0 ? (
                <p className="text-[11px] text-[var(--color-text-muted)]">Waiting for milestones...</p>
              ) : session.steps.map(step => (
                <div key={step.id} className="flex gap-2">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12px] leading-snug">{step.message}</div>
                    {step.progress !== undefined && (
                      <div className="mt-1 h-1 rounded bg-white/10 overflow-hidden">
                        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${Math.max(0, Math.min(100, step.progress * 100))}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 flex flex-col">
            <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-white/[0.06]">
              <Terminal className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <h3 className="text-xs font-semibold">Terminal</h3>
            </div>
            <pre className="flex-1 min-h-0 overflow-auto p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap text-white/70 bg-black/30">
              {session.terminalOutput.length > 0
                ? session.terminalOutput.map(entry => entry.data).join('')
                : 'Command output will appear here when tied to this document session.'}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
