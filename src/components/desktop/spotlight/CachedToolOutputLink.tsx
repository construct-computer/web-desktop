import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getToolResultOutput } from '@/services/api';
import { isCachedToolResultPlaceholder } from '@/lib/agentOutput';

export function CachedToolOutputLink({
  toolCallId,
  content,
  cached,
}: {
  toolCallId?: string;
  content: string;
  /** Set from the tool_result outputCached flag — activity content is a
   * presentation label, so the placeholder-text match alone never fires. */
  cached?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!toolCallId || (!cached && !isCachedToolResultPlaceholder(content))) return null;

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (output != null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getToolResultOutput(toolCallId);
      if (!res.success) {
        setError(res.error || 'Could not load cached output.');
        return;
      }
      setOutput(res.data.output);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1 w-full">
      <button
        type="button"
        onClick={() => { void handleToggle(); }}
        className="text-[10px] font-medium text-[var(--color-accent)]/80 hover:text-[var(--color-accent)]"
      >
        {expanded ? 'Hide full output' : 'View full output'}
      </button>
      {expanded && (
        <div className="mt-1 max-h-48 overflow-auto rounded-md border border-white/[0.08] bg-black/20 p-2">
          {loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading cached output…
            </div>
          )}
          {error && <p className="text-[11px] text-red-200/90">{error}</p>}
          {output && (
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-snug text-white/80 font-mono">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
