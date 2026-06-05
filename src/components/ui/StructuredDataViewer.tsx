import { useCallback, useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import jsonLang from 'highlight.js/lib/languages/json';
import {
  detectStructuredContent,
  prettyPrintJson,
  summarizeStructuredValue,
  tryParseJson,
} from '@/lib/structuredData';
import {
  collectTableHeaders,
  countTableRows,
  formatFieldLabel,
  formatVisualCell,
  formatVisualScalar,
  isLikelyNavigableString,
  isPlainObject,
  isTableArray,
} from '@/lib/structuredDataVisual';

hljs.registerLanguage('json', jsonLang);

export type StructuredDataViewMode = 'visual' | 'json';

function VisualArrayTable({ rows }: { rows: Record<string, unknown>[] }) {
  const headers = useMemo(() => collectTableHeaders(rows), [rows]);

  return (
    <div className="overflow-auto">
      <table className="w-full text-[11px] border-collapse font-mono">
        <thead>
          <tr className="border-b border-black/[0.08]">
            {headers.map((header) => (
              <th
                key={header}
                className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] whitespace-nowrap"
              >
                {formatFieldLabel(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 1000).map((row, i) => (
            <tr key={i} className="border-b border-black/[0.04] hover:bg-black/[0.02]">
              {headers.map((header) => {
                const cellText = formatVisualCell(row[header]);
                return (
                  <td
                    key={header}
                    className="px-3 py-1.5 text-[var(--color-text)] whitespace-nowrap max-w-[320px] truncate"
                    title={cellText}
                  >
                    {cellText}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisualScalarRow({ label, value }: { label: string; value: unknown }) {
  const text = formatVisualScalar(value);
  const href = typeof value === 'string' && isLikelyNavigableString(value) ? value : null;

  return (
    <div className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-2">
      <span className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider w-full md:w-1/3 shrink-0 select-none">
        {formatFieldLabel(label)}
      </span>
      <div className="flex-1 min-w-0 text-[12px] text-[var(--color-text)] font-mono leading-relaxed break-words">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline underline-offset-2"
            title={text}
          >
            {text}
          </a>
        ) : typeof value === 'string' && value.includes('\n') ? (
          <pre className="whitespace-pre-wrap max-w-full overflow-x-auto">{text}</pre>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function VisualValue({ value, label }: { value: unknown; label?: string }) {
  if (value === undefined || value === null) return null;

  if (isTableArray(value)) {
    return (
      <div className={label ? 'py-3.5 first:pt-0 last:pb-0' : ''}>
        {label && (
          <div className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider mb-2 select-none">
            {formatFieldLabel(label)}
          </div>
        )}
        <VisualArrayTable rows={value} />
      </div>
    );
  }

  if (isPlainObject(value)) {
    return (
      <div className={label ? 'py-3.5 first:pt-0 last:pb-0' : ''}>
        {label && (
          <div className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider mb-2 select-none">
            {formatFieldLabel(label)}
          </div>
        )}
        <VisualObjectSection data={value} nested />
      </div>
    );
  }

  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== undefined && item !== null);
    if (items.length === 0) return null;
    const allPrimitive = items.every(
      (item) => item === null || ['string', 'number', 'boolean'].includes(typeof item),
    );
    return (
      <div className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-2">
        {label && (
          <span className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider w-full md:w-1/3 shrink-0 select-none">
            {formatFieldLabel(label)}
          </span>
        )}
        <div className={`flex-1 min-w-0 text-[12px] text-[var(--color-text)] font-mono leading-relaxed ${label ? '' : 'md:col-span-2'}`}>
          {allPrimitive ? (
            <span>{items.map((item) => formatVisualScalar(item)).join(', ')}</span>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => (
                <VisualValue key={i} value={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (label) {
    return <VisualScalarRow label={label} value={value} />;
  }

  return (
    <div className="text-[12px] text-[var(--color-text)] font-mono leading-relaxed">
      {formatVisualScalar(value)}
    </div>
  );
}

function VisualObjectSection({ data, nested = false }: { data: Record<string, unknown>; nested?: boolean }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) {
    return <p className="text-xs text-[var(--color-text-subtle)] italic select-none">No fields</p>;
  }

  return (
    <div
      className={`divide-y divide-black/[0.06] font-sans ${nested ? 'ml-3 border-l border-black/[0.08] pl-3' : ''}`}
    >
      {entries.map(([key, value]) => {
        if (typeof value !== 'object' || value === null) {
          return <VisualScalarRow key={key} label={key} value={value} />;
        }
        return <VisualValue key={key} label={key} value={value} />;
      })}
    </div>
  );
}

function JsonSourceView({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    try {
      return hljs.highlight(source, { language: 'json' }).value;
    } catch {
      return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [source]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  }, [source]);

  return (
    <div className="structured-json-source md-code-block">
      <button type="button" className="md-copy-btn" onClick={() => { void onCopy(); }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code className="hljs language-json" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

export function StructuredDataViewer({
  text,
  parsed: parsedProp,
  dataView = 'visual',
  showSummary = true,
  invalidFallback,
}: {
  text: string;
  parsed?: unknown;
  dataView?: StructuredDataViewMode;
  showSummary?: boolean;
  invalidFallback?: React.ReactNode;
}) {
  const resolved = useMemo(() => {
    if (parsedProp !== undefined) {
      return {
        parsed: parsedProp,
        raw: prettyPrintJson(parsedProp),
        summary: summarizeStructuredValue(parsedProp),
        valid: true,
      };
    }
    const detected = detectStructuredContent(text);
    if (detected.format === 'json') {
      return { parsed: detected.parsed, raw: detected.raw, summary: detected.summary, valid: true };
    }
    const attempt = tryParseJson(text);
    if (attempt.ok) {
      return {
        parsed: attempt.value,
        raw: prettyPrintJson(attempt.value),
        summary: summarizeStructuredValue(attempt.value),
        valid: true,
      };
    }
    return { parsed: undefined, raw: text, summary: '', valid: false };
  }, [text, parsedProp]);

  if (!resolved.valid) {
    if (invalidFallback) return <>{invalidFallback}</>;
    return (
      <div className="w-full h-full flex flex-col">
        <div className="shrink-0 px-3 py-1.5 border-b border-red-500/20 bg-red-500/10 text-[11px] text-red-300">
          Invalid JSON. Switch to source to edit the raw content.
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap break-words leading-relaxed">
          {text}
        </pre>
      </div>
    );
  }

  const { parsed, raw, summary } = resolved;
  const isArrayOfObjects = isTableArray(parsed);
  const tableRowCount = countTableRows(parsed);

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {showSummary && summary && (
        <div className="shrink-0 px-3 py-1.5 border-b border-black/[0.06] text-[11px] text-[var(--color-text-muted)]">
          {summary}
          {tableRowCount > 0 && dataView === 'visual' && (
            <span className="ml-2 opacity-70">
              · Showing {Math.min(tableRowCount, 1000)} rows
            </span>
          )}
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-auto text-xs ${dataView === 'visual' ? 'p-4' : 'p-4'}`}>
        {dataView === 'visual' ? (
          isArrayOfObjects ? (
            <VisualArrayTable rows={parsed as Record<string, unknown>[]} />
          ) : isPlainObject(parsed) ? (
            <VisualObjectSection data={parsed} />
          ) : (
            <pre className="font-mono text-[var(--color-text)] whitespace-pre-wrap break-words leading-relaxed">{raw}</pre>
          )
        ) : (
          <JsonSourceView source={raw} />
        )}
      </div>
    </div>
  );
}

/** Thin wrapper preserving DocumentViewerWindow JSON file behavior. */
export function JsonFileViewer({ text }: { text: string }) {
  return (
    <StructuredDataViewer
      text={text}
      dataView="json"
    />
  );
}
