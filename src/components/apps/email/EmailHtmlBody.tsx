import { useMemo, useState, type ReactNode } from 'react';

function stripQuotedPlainText(value: string): { body: string; quoted: string } {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const cutIndex = lines.findIndex((line, index) => {
    const trimmed = line.trim();
    const next = lines[index + 1]?.trim() || '';
    return (
      trimmed.startsWith('>')
      || /^On .+ wrote:$/i.test(trimmed)
      || (/^On .+/i.test(trimmed) && /wrote:$/i.test(next))
      || /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)
      || /^From:\s.+/i.test(trimmed)
    );
  });
  if (cutIndex < 0) return { body: value.trim(), quoted: '' };
  return {
    body: lines.slice(0, cutIndex).join('\n').trim(),
    quoted: lines.slice(cutIndex).join('\n').trim(),
  };
}

function cleanConstructAgentText(value: string): string {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (/^(construct|construct agent)$/i.test(lines[0]?.trim() || '')) lines.shift();

  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    return !/^Construct Agent sent this email from Construct\.?$/i.test(trimmed)
      && !/^-{8,}$/.test(trimmed);
  });

  return cleaned.join('\n').trim();
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Markdown link, bare URL, **bold**, or *italic* — mirrors the email renderer.
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>)]+)|\*\*([^*]+)\*\*|\*(?=\S)([^*\n]+?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[4] !== undefined) {
      nodes.push(<strong key={nodes.length} className="font-semibold">{match[4]}</strong>);
    } else if (match[5] !== undefined) {
      nodes.push(<em key={nodes.length} className="italic">{match[5]}</em>);
    } else {
      const url = match[2] || match[3];
      const label = match[1] || url;
      nodes.push(
        <a key={nodes.length} href={url} target="_blank" rel="noreferrer noopener" className="text-sky-400 underline">
          {label}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderInlineLines(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) out.push(<br key={`br-${lineIndex}`} />);
    out.push(...renderInline(line));
  });
  return out;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mb-2 mt-5 first:mt-0 text-[15px] font-semibold text-[var(--color-text)]',
  2: 'mb-2 mt-5 first:mt-0 text-[14px] font-semibold text-[var(--color-text)]',
  3: 'mb-1.5 mt-4 first:mt-0 text-[13px] font-semibold text-[var(--color-text)]',
  4: 'mb-1.5 mt-4 first:mt-0 text-[12px] font-semibold text-[var(--color-text)]',
  5: 'mb-1 mt-3 first:mt-0 text-[12px] font-semibold text-[var(--color-text)]/90',
  6: 'mb-1 mt-3 first:mt-0 text-[11px] font-semibold text-[var(--color-text-muted)]',
};

function renderPlainText(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(
      <p key={`p-${nodes.length}`} className="mb-3 last:mb-0">
        {renderInlineLines(paragraph)}
      </p>,
    );
    paragraph = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="mb-3 list-disc pl-5 space-y-1">
        {bullets.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  const flushNumbers = () => {
    if (!numbers.length) return;
    nodes.push(
      <ol key={`ol-${nodes.length}`} className="mb-3 list-decimal pl-5 space-y-1">
        {numbers.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
      </ol>,
    );
    numbers = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    nodes.push(
      <blockquote key={`q-${nodes.length}`} className="my-3 border-l-2 border-white/15 pl-3 text-[var(--color-text-muted)]">
        {renderInlineLines(quote)}
      </blockquote>,
    );
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushNumbers();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';
    if (line.includes('|') && isMarkdownTableSeparator(next)) {
      flushAll();
      const headers = splitMarkdownTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const rowLine = lines[index] || '';
        if (!rowLine.includes('|') || !rowLine.trim()) {
          index -= 1;
          break;
        }
        const cells = splitMarkdownTableRow(rowLine);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] || ''));
        index += 1;
      }
      nodes.push(
        <div key={`table-${nodes.length}`} className="my-3 overflow-x-auto">
          <table className="text-left text-[12px] border-collapse">
            <thead>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={cellIndex} className="pr-4 py-1.5 font-semibold text-[var(--color-text)] border-b border-[var(--color-border)]">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="pr-4 py-1.5 align-top text-[var(--color-text)]/90 border-b border-[var(--color-border)]/50">
                      {renderInline(row[cellIndex] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      nodes.push(<hr key={`hr-${nodes.length}`} className="my-4 border-t border-[var(--color-border)]" />);
      continue;
    }

    const quoteLine = line.match(/^>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph();
      flushBullets();
      flushNumbers();
      quote.push(quoteLine[1]);
      continue;
    }
    flushQuote();

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      nodes.push(
        <Tag key={`h-${nodes.length}`} className={HEADING_CLASS[level]}>
          {renderInline(heading[2])}
        </Tag>,
      );
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1]);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[1]);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    flushBullets();
    flushNumbers();
    paragraph.push(line);
  }

  flushAll();
  return nodes.length ? nodes : '(no body)';
}

export function EmailHtmlBody({
  html,
  text,
  preferPlainText = false,
  className = '',
}: {
  html?: string;
  text?: string;
  preferPlainText?: boolean;
  className?: string;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const plainText = useMemo(() => stripQuotedPlainText(
    preferPlainText ? cleanConstructAgentText(text?.trim() || '') : text?.trim() || '',
  ), [preferPlainText, text]);

  const sanitized = useMemo(() => {
    if (!html || typeof window === 'undefined') return { body: html || '', quoted: '' };
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('script,style,link,meta,iframe,object,embed,form,base').forEach((node) => node.remove());
    const quotedNodes = Array.from(doc.body.querySelectorAll(
      'blockquote, .gmail_quote, [class*="gmail_quote"], [id*="divRplyFwdMsg"], [class*="yahoo_quoted"]',
    ));
    const quoted = quotedNodes.map((node) => node.textContent?.trim()).filter(Boolean).join('\n\n');
    quotedNodes.forEach((node) => node.remove());

    const elements = doc.body.querySelectorAll('*');
    for (const element of elements) {
      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) {
          element.removeAttribute(attr.name);
          continue;
        }
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
          element.removeAttribute(attr.name);
          continue;
        }
        if (name === 'target') {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noreferrer noopener');
        }
      }
    }

    return { body: doc.body.innerHTML.trim(), quoted };
  }, [html]);

  if ((!preferPlainText || (!plainText.body && !plainText.quoted)) && sanitized.body) {
    return (
      <div className={`break-words text-xs leading-relaxed [&_a]:text-sky-400 [&_blockquote]:border-l [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-white/70 [&_img]:max-w-full [&_pre]:whitespace-pre-wrap [&_table]:max-w-full ${className}`}>
        <div className="mx-auto max-w-[860px]" dangerouslySetInnerHTML={{ __html: sanitized.body }} />
        {sanitized.quoted && (
          <button
            type="button"
            onClick={() => setShowQuoted((value) => !value)}
            className="mt-3 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          </button>
        )}
        {showQuoted && sanitized.quoted && (
          <pre className="mt-2 whitespace-pre-wrap rounded border border-[var(--color-border)] bg-black/10 p-2 text-[10px] text-[var(--color-text-muted)]">
            {sanitized.quoted}
          </pre>
        )}
      </div>
    );
  }

  if (plainText.body || plainText.quoted) {
    const visibleText = plainText.body || plainText.quoted;
    const hasCollapsedQuote = !!plainText.body && !!plainText.quoted;
    return (
      <div className={`break-words text-[13px] leading-relaxed text-[var(--color-text)]/95 ${className}`}>
        {renderPlainText(visibleText)}
        {hasCollapsedQuote && (
          <button
            type="button"
            onClick={() => setShowQuoted((value) => !value)}
            className="mt-3 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          </button>
        )}
        {showQuoted && hasCollapsedQuote && (
          <pre className="mt-2 whitespace-pre-wrap rounded border border-[var(--color-border)] bg-black/10 p-2 text-[10px] text-[var(--color-text-muted)]">
            {plainText.quoted}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className={`break-words text-xs leading-relaxed ${className}`}>
      (no body)
    </div>
  );
}
