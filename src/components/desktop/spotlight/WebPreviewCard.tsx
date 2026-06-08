import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import type { ChatMessage, WebPreviewData } from '@/stores/agentStore';
import { useComputerStore, getOrCreateBrowserAppWindow } from '@/stores/agentStore';
import { fetchBrowserScreenshot } from '@/services/api';

function CaptureThumb({ shotKey }: { shotKey: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    fetchBrowserScreenshot(shotKey)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shotKey]);
  if (!src) return <div className="w-10 h-10 rounded bg-white/[0.04]" />;
  return <img src={src} alt="" className="w-10 h-10 rounded object-cover border border-white/[0.06]" />;
}

export function WebPreviewCard({
  preview,
  message,
  onOpen,
}: {
  preview: WebPreviewData;
  message: ChatMessage;
  /** Opens the matching static browser tab (web_search / web_fetch). */
  onOpen?: () => void;
}) {
  const runId = message.browserRunId;
  const shots = useComputerStore((s) => s.browserScreenshots);
  const runShots = useMemo(
    () => (runId ? shots.filter((s) => s.run_id === runId).slice(0, 3) : []),
    [shots, runId],
  );

  const onOpenBrowser = () => {
    getOrCreateBrowserAppWindow({
      title: 'Browser',
      metadata: {
        browserAppWindow: true,
        ...(runId ? { browserRunId: runId } : {}),
      },
    });
  };

  if (preview.kind === 'search') {
    return (
      <div className="mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[var(--color-text-muted)]/70 mb-1">{preview.resultCount ?? 0} results{preview.query ? ` for "${preview.query}"` : ''}</p>
            <ul className="space-y-1">
              {(preview.results || []).map((r) => (
                <li key={r.url} className="truncate text-[var(--color-text-subtle)]">{r.title || r.url}</li>
              ))}
            </ul>
          </div>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-white/[0.08] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <ExternalLink className="w-3 h-3" />
              View
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="flex items-start gap-2">
        <Globe className="w-3.5 h-3.5 text-[var(--color-text-subtle)] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-[var(--color-text-muted)] truncate">{preview.pageTitle || preview.url || 'Page'}</p>
          {preview.snippet && (
            <p className="text-[10px] text-[var(--color-text-subtle)] mt-0.5 leading-relaxed">{preview.snippet}</p>
          )}
        </div>
        {message.tool === 'browser' ? (
          <button
            type="button"
            onClick={onOpenBrowser}
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-white/[0.08] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ExternalLink className="w-3 h-3" />
            Open Browser
          </button>
        ) : onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-white/[0.08] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ExternalLink className="w-3 h-3" />
            View
          </button>
        ) : null}
      </div>
      {runShots.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          {runShots.map((s) => <CaptureThumb key={s.key} shotKey={s.key} />)}
          <span className="text-[10px] text-[var(--color-text-subtle)]">{runShots.length} capture{runShots.length === 1 ? '' : 's'} saved</span>
        </div>
      )}
    </div>
  );
}
