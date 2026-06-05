import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { PluggableList } from 'unified';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style', 'loading'],
    code: [...(defaultSchema.attributes?.['code'] || []), 'className'],
    img: [...(defaultSchema.attributes?.['img'] || []), 'className', 'loading', 'alt', 'src'],
    a: [...(defaultSchema.attributes?.['a'] || []), 'className', 'href', 'rel', 'target'],
  },
};

function normalizeForDedupe(content: string, pageTitle?: string): string {
  if (!pageTitle) return content;
  const lines = content.split('\n');
  if (lines.length === 0) return content;
  const first = lines[0].trim();
  const m = first.match(/^#\s+(.+)$/);
  if (!m) return content;
  const heading = m[1].replace(/\s+/g, ' ').trim().toLowerCase();
  const title = pageTitle.replace(/\s+/g, ' ').trim().toLowerCase();
  if (heading === title || heading.includes(title) || title.includes(heading)) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return content;
}

const readerComponents: Components = {
  img({ src, alt, ...props }) {
    return (
      <figure className="reader-figure">
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          className="reader-figure-img"
          {...props}
        />
      </figure>
    );
  },
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="reader-link"
        {...props}
      >
        {children}
        <ExternalLink className="reader-link-icon" aria-hidden />
      </a>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
  p({ children, ...props }) {
    return <p className="reader-paragraph" {...props}>{children}</p>;
  },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [[rehypeSanitize, sanitizeSchema]] as PluggableList;

export const ReaderMarkdown = memo(function ReaderMarkdown({
  content,
  fullContent,
  truncated,
  remainingSections,
  pageTitle,
  dedupeTitle,
}: {
  content: string;
  fullContent?: string;
  truncated?: boolean;
  remainingSections?: number;
  pageTitle?: string;
  dedupeTitle?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const previewContent = useMemo(() => {
    if (!content) return '';
    if (dedupeTitle) return normalizeForDedupe(content, pageTitle);
    return content;
  }, [content, dedupeTitle, pageTitle]);

  const expandedContent = useMemo(() => {
    if (!fullContent) return previewContent;
    if (dedupeTitle) return normalizeForDedupe(fullContent, pageTitle);
    return fullContent;
  }, [fullContent, previewContent, dedupeTitle, pageTitle]);

  const displayContent = expanded ? expandedContent : previewContent;
  const canExpand = truncated && !!fullContent && expandedContent.length > previewContent.length;

  if (!previewContent.trim()) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] italic">
        No readable text content could be extracted from this page.
      </p>
    );
  }

  return (
    <div>
      <div className="markdown-rendered reader-prose">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={readerComponents}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded
            ? 'Show less'
            : remainingSections && remainingSections > 0
              ? `Read more (${remainingSections} more section${remainingSections === 1 ? '' : 's'})`
              : 'Read more'}
        </button>
      )}
    </div>
  );
});
