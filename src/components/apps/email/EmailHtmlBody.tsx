import { useMemo } from 'react';

export function EmailHtmlBody({
  html,
  text,
  className = '',
}: {
  html?: string;
  text?: string;
  className?: string;
}) {
  const plainText = useMemo(() => text?.trim() || '', [text]);

  const sanitizedHtml = useMemo(() => {
    if (!html || typeof window === 'undefined') return html || '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('script,style,link,meta,iframe,object,embed,form,base').forEach((node) => node.remove());

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

    return doc.body.innerHTML;
  }, [html]);

  // Prefer extracted/plain text whenever it's available; it avoids rendering
  // provider-generated wrapper HTML as dark nested boxes inside the message UI.
  if (plainText) {
    return (
      <div className={`whitespace-pre-wrap wrap-break-word text-xs leading-relaxed ${className}`}>
        {plainText}
      </div>
    );
  }

  if (sanitizedHtml) {
    return (
      <div
        className={`text-xs leading-relaxed wrap-break-word [&_a]:text-sky-400 [&_blockquote]:border-l [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-white/70 [&_img]:max-w-full [&_pre]:whitespace-pre-wrap ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <div className={`whitespace-pre-wrap wrap-break-word text-xs leading-relaxed ${className}`}>
      {(text || '').trim() || '(no body)'}
    </div>
  );
}
