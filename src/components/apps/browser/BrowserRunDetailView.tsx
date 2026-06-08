import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { BrowserRunDetail } from '@/services/api';
import { BrowserScreenshotGallery } from '../BrowserScreenshotGallery';
import { formatBytes } from '@/lib/format';

type HarvestMeta = {
  screenshots?: Array<{ key: string; url?: string; content_type?: string }>;
  outputFiles?: Array<{ name?: string; fileId?: string; size?: number }>;
  steps?: Array<{ action?: string; url?: string; label?: string }>;
};

function parseHarvest(finalText: string | null | undefined): HarvestMeta | null {
  if (!finalText) return null;
  const match = finalText.match(/<!-- browser_harvest:(\{[\s\S]*?\}) -->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as HarvestMeta;
  } catch {
    return null;
  }
}

function visibleFinalText(finalText: string | null | undefined): string {
  if (!finalText) return '';
  return finalText.replace(/\n*<!-- browser_harvest:\{[\s\S]*?\} -->\s*$/, '').trim();
}

export function BrowserRunDetailView({ detail }: { detail: BrowserRunDetail }) {
  const run = detail.run;
  const harvest = useMemo(() => parseHarvest(run.final_text), [run.final_text]);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  const durationMs = run.ended_at && run.started_at ? run.ended_at - run.started_at : null;
  const durationLabel = durationMs != null
    ? durationMs < 60_000
      ? `${Math.round(durationMs / 1000)}s`
      : `${Math.round(durationMs / 60_000)}m`
    : null;

  const cleanText = visibleFinalText(run.final_text);

  return (
    <div className="space-y-3 text-left">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-subtle)]">
        <span className="capitalize font-medium text-[var(--color-text-muted)]">{run.status}</span>
        {durationLabel && <span>· {durationLabel}</span>}
        {run.step_count != null && <span>· {run.step_count} steps</span>}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] mb-1.5">Captures</p>
        <div className="max-h-48 overflow-hidden rounded-lg border border-white/[0.06]">
          <BrowserScreenshotGallery runId={run.run_id} />
        </div>
        {harvest?.screenshots && harvest.screenshots.length > 0 && (
          <p className="text-[10px] text-[var(--color-text-subtle)] mt-1.5 leading-relaxed">
            Run log lists {harvest.screenshots.length} capture key{harvest.screenshots.length === 1 ? '' : 's'}.
            {harvest.screenshots.every((s) => s.key)
              ? ' Use Refresh in the gallery if thumbnails are missing.'
              : ''}
          </p>
        )}
      </div>

      {harvest?.outputFiles && harvest.outputFiles.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] mb-1.5">Downloads</p>
          <div className="space-y-1.5">
            {harvest.outputFiles.map((file, i) => (
              <div key={`${file.fileId || file.name || i}`} className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <FileText className="w-3.5 h-3.5 text-[var(--color-text-subtle)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[var(--color-text)] truncate">{file.name || file.fileId || 'Download'}</p>
                  {file.size != null && (
                    <p className="text-[9px] text-[var(--color-text-subtle)]">{formatBytes(file.size)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {harvest?.steps && harvest.steps.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setStepsOpen(!stepsOpen)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
          >
            {stepsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Steps ({harvest.steps.length})
          </button>
          {stepsOpen && (
            <ol className="mt-1.5 space-y-1 max-h-32 overflow-y-auto text-[11px] text-[var(--color-text-muted)]">
              {harvest.steps.map((step, i) => (
                <li key={i} className="truncate">
                  {step.label || step.action || 'step'}
                  {step.url ? ` · ${step.url}` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {cleanText && (
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap line-clamp-4">{cleanText}</p>
      )}

      {run.final_text && (
        <button
          type="button"
          onClick={() => setRawOpen(!rawOpen)}
          className="text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
        >
          {rawOpen ? 'Hide raw log' : 'View raw log'}
        </button>
      )}
      {rawOpen && run.final_text && (
        <pre className="text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[30vh] overflow-y-auto bg-black/20 rounded p-2 font-mono">
          {run.final_text}
        </pre>
      )}
    </div>
  );
}
