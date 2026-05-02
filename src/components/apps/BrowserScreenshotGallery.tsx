/**
 * BrowserScreenshotGallery — thumbnails of every browser-use screenshot the
 * agent has captured for this user, with on-demand "Save to workspace".
 * Bytes are auth-protected, so we fetch them through fetchBrowserScreenshot()
 * and turn the response into a blob URL.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Download, ExternalLink, Check } from 'lucide-react';
import {
  listBrowserScreenshots,
  fetchBrowserScreenshot,
  saveBrowserScreenshotToWorkspace,
  type BrowserScreenshotSummary,
} from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';

const GALLERY_LIMIT = 50;

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function hostFromUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { return new URL(u).host || null; } catch { return null; }
}

function Thumb({ shot }: { shot: BrowserScreenshotSummary }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    fetchBrowserScreenshot(shot.key)
      .then(async (res) => {
        if (!res.ok) { setFailed(true); return; }
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot.key]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--color-text-subtle)] opacity-50">
        unavailable
      </div>
    );
  }
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-3 h-3 animate-spin text-[var(--color-text-subtle)] opacity-40" />
      </div>
    );
  }
  return <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />;
}

export function BrowserScreenshotGallery({
  runId,
  subagentId,
}: {
  runId?: string | null;
  subagentId?: string | null;
} = {}) {
  const items = useComputerStore((s) => s.browserScreenshots);
  const hydrated = useComputerStore((s) => s.browserScreenshotsHydrated);
  const hydrate = useComputerStore((s) => s.hydrateBrowserScreenshots);
  const [loading, setLoading] = useState(!hydrated);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>({}); // key -> dest path
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listBrowserScreenshots({ limit: GALLERY_LIMIT });
    if (res.success && res.data) hydrate(res.data.screenshots);
    else setError((!res.success && res.error) || 'Failed to load screenshots');
    setLoading(false);
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) refresh();
  }, [hydrated, refresh]);

  const onSave = useCallback(async (shot: BrowserScreenshotSummary) => {
    if (savingKey) return;
    setSavingKey(shot.key);
    const res = await saveBrowserScreenshotToWorkspace(shot.key);
    setSavingKey(null);
    if (res.success && res.data) {
      setSavedKeys((prev) => ({ ...prev, [shot.key]: res.data!.path }));
    } else {
      setError((!res.success && res.error) || 'Save failed');
    }
  }, [savingKey]);

  const filteredItems = runId || subagentId
    ? items.filter((shot) => (runId && shot.run_id === runId) || (subagentId && shot.subagent_id === subagentId))
    : items;

  return (
    <div ref={scrollRef} className="w-full h-full overflow-y-auto px-6 py-4 text-left">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-subtle)] opacity-60">
          {runId || subagentId ? 'Matching screenshots' : 'Recent screenshots'}
        </p>
        <button
          onClick={refresh}
          className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {!loading && filteredItems.length === 0 && !error && (
        <p className="text-xs text-[var(--color-text-subtle)] opacity-50">
          {runId || subagentId
            ? 'No screenshots are linked to the selected session yet.'
            : 'No browser screenshots yet. The agent saves a snapshot on every browser-use run completion.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {filteredItems.map((s) => {
          const host = hostFromUrl(s.url);
          const savedPath = savedKeys[s.key];
          return (
            <div key={s.key} className="rounded overflow-hidden border border-white/[0.06] bg-black/20 group">
              <div className="aspect-video bg-black/40 relative">
                <Thumb shot={s} />
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title={s.url}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="px-1.5 py-1.5">
                <p className="text-[10px] text-[var(--color-text)] truncate">
                  {host || 'screenshot'}
                </p>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="text-[9px] text-[var(--color-text-subtle)] opacity-60">
                    {relTime(s.captured_at)}
                  </p>
                  {savedPath ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400"
                      title={`Saved to ${savedPath}`}
                    >
                      <Check className="w-2.5 h-2.5" />
                      saved
                    </span>
                  ) : (
                    <button
                      onClick={() => onSave(s)}
                      disabled={savingKey === s.key}
                      className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded
                                 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]
                                 hover:bg-white/5 disabled:opacity-40"
                      title="Copy into workspace/screenshots/"
                    >
                      {savingKey === s.key
                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        : <Download className="w-2.5 h-2.5" />}
                      save
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
