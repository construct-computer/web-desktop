import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface ReasoningBlockProps {
  /** Captured model reasoning / chain-of-thought text. */
  reasoning: string;
  /** True while the reasoning is still streaming in for the current turn. */
  live?: boolean;
}

/**
 * Collapsible, dimmed "Thinking" disclosure rendered above an assistant
 * answer. Surfaces the model's internal reasoning (Anthropic thinking,
 * OpenAI/Grok reasoning, Gemini thoughts, GPT-OSS harmony channel) without
 * conflating it with the visible response. Collapsed by default.
 */
export function ReasoningBlock({ reasoning, live = false }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false);
  const text = reasoning.trim();
  if (!text) return null;

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className={live ? 'shimmer-text' : ''}>{live ? 'Thinking…' : 'Thinking'}</span>
      </button>
      {open && (
        <div className="mt-1 pl-2 border-l-2 border-[var(--color-border)] text-[11px] leading-[1.4em] text-[var(--color-text-muted)]/70 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto scrollbar-none">
          {text}
        </div>
      )}
    </div>
  );
}
