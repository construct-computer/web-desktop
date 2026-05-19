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

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderPlainText(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(
      <p key={`p-${nodes.length}`} className="mb-3 last:mb-0 whitespace-pre-wrap">
        {paragraph.join('\n')}
      </p>,
    );
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';
    if (line.includes('|') && isMarkdownTableSeparator(next)) {
      flushParagraph();
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
        <div key={`table-${nodes.length}`} className="my-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-white/[0.06] text-[var(--color-text)]/80">
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={cellIndex} className="px-3 py-2 font-semibold uppercase tracking-[0.04em] text-[10px]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-[var(--color-border)]">
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 text-[var(--color-text)]/90">
                      {row[cellIndex] || ''}
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

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      nodes.push(
        <h4 key={`h-${nodes.length}`} className="mb-2 mt-5 first:mt-0 text-[13px] font-semibold text-[var(--color-text)]">
          {heading[1]}
        </h4>,
      );
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return nodes.length ? nodes : '(no body)';
}

export function EmailHtmlBody({
  html,
  text,
  className = '',
}: {
  html?: string;
  text?: string;
  className?: string;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const plainText = useMemo(() => stripQuotedPlainText(text?.trim() || ''), [text]);

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

  if (sanitized.body) {
    return (
      <div className={`break-words text-xs leading-relaxed [&_a]:text-sky-400 [&_blockquote]:border-l [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-white/70 [&_img]:max-w-full [&_pre]:whitespace-pre-wrap ${className}`}>
        <div dangerouslySetInnerHTML={{ __html: sanitized.body }} />
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

  if (plainText.body) {
    return (
      <div className={`break-words text-xs leading-relaxed ${className}`}>
        {renderPlainText(plainText.body)}
        {plainText.quoted && (
          <button
            type="button"
            onClick={() => setShowQuoted((value) => !value)}
            className="mt-3 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          </button>
        )}
        {showQuoted && plainText.quoted && (
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
