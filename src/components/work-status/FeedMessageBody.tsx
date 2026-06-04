import { useState } from 'react';
import { summarizeJsonContent } from '@/lib/workStatusFormat';

export function FeedMessageBody({
  content,
  className = 'text-[var(--color-text)]',
}: {
  content: string;
  className?: string;
}) {
  const { summary, isJson, raw } = summarizeJsonContent(content);
  const [showRaw, setShowRaw] = useState(false);

  if (!isJson) {
    return <span className={`break-words ${className}`}>{content}</span>;
  }

  return (
    <span className={`break-words ${className}`}>
      <span className="font-mono text-[9px] opacity-90">{summary}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowRaw((v) => !v);
        }}
        className="block text-[9px] text-[var(--color-accent)] mt-0.5 hover:underline"
      >
        {showRaw ? 'Hide details' : 'Show details'}
      </button>
      {showRaw && (
        <pre className="mt-1 text-[8px] leading-tight opacity-70 max-h-24 overflow-auto whitespace-pre-wrap break-all">
          {raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw}
        </pre>
      )}
    </span>
  );
}
