/**
 * Display-time cleanup for Jina Reader markdown before Browser Reader view.
 * Agent tool output keeps the raw markdown; browserTabStore applies this on tab_update.
 */

export interface NormalizeReaderMarkdownOptions {
  pageTitle?: string;
  url?: string;
}

export interface NormalizeReaderMarkdownResult {
  content: string;
  strippedLineCount: number;
  /** True when the first heading in content duplicates pageTitle (hide in shell). */
  dedupeTitle: boolean;
}

const CHROME_LINE_PATTERNS: RegExp[] = [
  /^\[skip to content\]/i,
  /^advertisement$/i,
  /^\[watch live\]/i,
  /^site search$/i,
  /^\[?subscribe\]?$/i,
  /^\[sign in\]/i,
  /^share$/i,
  /^save$/i,
  /^toggle navigation$/i,
  /^appearance settings$/i,
  /^navigation menu$/i,
  /^## navigation menu$/i,
  /^\[\]\([^)]+\)\s*$/,
  /^\[add as preferred on google\]/i,
];

function normalizeTitleKey(text: string): string {
  return text
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titlesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ka = normalizeTitleKey(a);
  const kb = normalizeTitleKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function stripLineLevelChrome(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return '';
  for (const pattern of CHROME_LINE_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  if (/^\[[^\]]*\]\([^)]+\)\s*$/.test(trimmed) && trimmed.length < 80) {
    const inner = trimmed.match(/^\[([^\]]*)\]/)?.[1] ?? '';
    if (!inner.trim()) return null;
  }
  return line;
}

function linkDensity(line: string): number {
  const stripped = line.replace(/\s+/g, '');
  if (!stripped) return 0;
  const links = line.match(/\[[^\]]*\]\([^)]+\)/g) ?? [];
  const linkChars = links.join('').length;
  return linkChars / stripped.length;
}

function isShortLinkLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 72) return false;
  if (/^\*?\s*\[[^\]]+\]\([^)]+\)\s*$/.test(trimmed)) return true;
  if (/^\[[^\]]+\]\([^)]+\)\s*$/.test(trimmed)) return linkDensity(trimmed) > 0.55;
  return false;
}

function isBulletItem(line: string): boolean {
  return /^\s*[\*\-]\s+/.test(line);
}

function isBareLinkOrLabel(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (isShortLinkLine(trimmed)) return true;
  if (/^#{1,6}\s+\S/.test(trimmed) && trimmed.length < 48) return false;
  // Single word section labels (News, Sport) common in BBC chrome
  if (/^[A-Z][a-zA-Z0-9 &]+$/.test(trimmed) && trimmed.length < 24 && !trimmed.includes('.')) {
    return true;
  }
  return false;
}

function isSubstantialParagraph(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 80) return false;
  if (linkDensity(trimmed) >= 0.5) return false;
  if (/^#{1,6}\s/.test(trimmed)) return false;
  return true;
}

function isDuplicateH1(line: string, pageTitle?: string): boolean {
  if (!pageTitle) return false;
  const m = line.trim().match(/^#\s+(.+)$/);
  if (!m) return false;
  return titlesMatch(m[1], pageTitle);
}

function isLinkOnlyBulletBlock(lines: string[]): boolean {
  const items = lines.filter((l) => isBulletItem(l));
  if (items.length < 5) return false;
  return items.every((l) => {
    const t = l.trim();
    return t.length < 60 && (linkDensity(t) > 0.4 || /\]\(https?:\/\//.test(t));
  });
}

function isMetadataLine(line: string): boolean {
  const t = line.trim();
  return /^\d+\s+(hours?|mins?|minutes?|days?)\s+ago$/i.test(t)
    || /^(share|save|news)$/i.test(t)
    || /^vitaly shevchenko/i.test(t)
    || /^toby mann$/i.test(t);
}

function stripLeadingChromeLines(lines: string[], pageTitle?: string): { lines: string[]; stripped: number } {
  let stripped = 0;
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      stripped++;
      i++;
      continue;
    }

    if (stripLineLevelChrome(lines[i]) === null || isDuplicateH1(trimmed, pageTitle) || isMetadataLine(trimmed)) {
      stripped++;
      i++;
      continue;
    }

    if (isBulletItem(trimmed)) {
      let j = i;
      const block: string[] = [];
      while (j < lines.length && (isBulletItem(lines[j]) || !lines[j].trim())) {
        if (lines[j].trim()) block.push(lines[j]);
        j++;
      }
      const linkHeavy = block.length >= 3 && block.every((l) => linkDensity(l) > 0.3 || /\]\(https?:\/\//.test(l));
      if (isLinkOnlyBulletBlock(block) || linkHeavy) {
        stripped += j - i;
        i = j;
        continue;
      }
      break;
    }

    if (isBareLinkOrLabel(trimmed) || (trimmed.length < 72 && linkDensity(trimmed) > 0.42)) {
      stripped++;
      i++;
      continue;
    }

    if (isSubstantialParagraph(trimmed)) break;

    if (/^#{1,6}\s/.test(trimmed)) {
      const hasBody = lines.slice(i + 1, i + 12).some((l) => isSubstantialParagraph(l.trim()));
      if (hasBody) break;
      stripped++;
      i++;
      continue;
    }

    if (trimmed.length < 64) {
      stripped++;
      i++;
      continue;
    }

    break;
  }

  return { lines: lines.slice(i), stripped };
}

function stripTrailingChromeLines(lines: string[]): string[] {
  const cutMarkers = [
    /^##\s+related\b/i,
    /^more from the bbc$/i,
    /^\*\s+\*\s+\*$/,
    /^related$/i,
  ];
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) {
      end = i;
      continue;
    }
    if (cutMarkers.some((re) => re.test(t))) {
      end = i;
      continue;
    }
    if (end < lines.length) {
      // Trailing block was chrome — keep cutting while link-heavy
      if (isShortLinkLine(t) || isBulletItem(t) || linkDensity(t) > 0.45) {
        end = i;
        continue;
      }
    }
    break;
  }
  return lines.slice(0, end);
}

function findFallbackArticleStart(lines: string[], pageTitle?: string): number {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (isSubstantialParagraph(t)) return i;
    if (/^#{1,6}\s/.test(t) && !isDuplicateH1(t, pageTitle)) {
      const hasBody = lines.slice(i + 1, i + 15).some((l) => isSubstantialParagraph(l.trim()));
      if (hasBody) return i;
    }
  }
  // GitHub / repo pages: first repo heading
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#\s+[\w.-]+\/[\w.-]+/.test(t) || /^##\s+folders and files/i.test(t)) return i;
  }
  return 0;
}

function cleanHeadingLine(line: string): string {
  return line.replace(/\s+\[\]\([^)]*(?:\s+"[^"]*")?\)\s*$/g, '').trimEnd();
}

/** `![Image 1: alt](url)Caption` → figure-friendly markdown */
function repairImageLines(text: string): string {
  return text.replace(
    /^!\[Image\s+\d+:\s*([^\]]*)\]\(([^)]+)\)\s*([^\n]+)?$/gm,
    (_match, alt: string, url: string, caption?: string) => {
      const cleanAlt = (alt || 'Image').trim();
      if (caption?.trim()) {
        return `![${cleanAlt}](${url})\n\n*${caption.trim()}*`;
      }
      return `![${cleanAlt}](${url})`;
    },
  );
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

const TRUNCATION_FOOTER_RE = /\n\n\[(?:content truncated(?: for preview)?|…truncated)[^\]]*\]\s*$/i;

function stripTruncationFooter(text: string): string {
  return text.replace(TRUNCATION_FOOTER_RE, '').trimEnd();
}

export function normalizeReaderMarkdown(
  raw: string,
  opts: NormalizeReaderMarkdownOptions = {},
): NormalizeReaderMarkdownResult {
  if (!raw?.trim()) {
    return { content: raw || '', strippedLineCount: 0, dedupeTitle: false };
  }

  raw = stripTruncationFooter(raw);

  const originalLineCount = raw.split('\n').length;
  const { pageTitle } = opts;

  let lines = raw.split('\n').map((line) => {
    const cleaned = stripLineLevelChrome(line);
    return cleaned === null ? null : cleaned;
  }).filter((line): line is string => line !== null);

  const fallbackStart = findFallbackArticleStart(lines, pageTitle);
  if (fallbackStart > 0) {
    lines = lines.slice(fallbackStart);
  }

  const leading = stripLeadingChromeLines(lines, pageTitle);
  lines = leading.lines;
  let strippedLineCount = leading.stripped + fallbackStart;

  lines = stripTrailingChromeLines(lines);

  let content = lines.map(cleanHeadingLine).join('\n');
  content = repairImageLines(content);
  content = collapseBlankLines(content);

  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1];
  const rawHadMatchingH1 = pageTitle
    ? raw.split('\n').some((l) => isDuplicateH1(l.trim(), pageTitle))
    : false;
  const dedupeTitle = titlesMatch(firstHeading, pageTitle)
    || (rawHadMatchingH1 && !titlesMatch(firstHeading, pageTitle));

  if (originalLineCount - content.split('\n').length > strippedLineCount) {
    strippedLineCount = originalLineCount - content.split('\n').length;
  }

  return {
    content,
    strippedLineCount: Math.max(0, strippedLineCount),
    dedupeTitle,
  };
}

export const READER_PREVIEW_CHAR_BUDGET = 10_000;

export interface ReaderPreviewSplitResult {
  preview: string;
  full: string;
  hasMore: boolean;
  remainingSectionCount: number;
}

/** Split markdown at section boundaries for Read more (never mid-paragraph). */
export function splitReaderPreviewAtSections(
  fullContent: string,
  charBudget = READER_PREVIEW_CHAR_BUDGET,
): ReaderPreviewSplitResult {
  const full = fullContent.trim();
  if (!full) {
    return { preview: '', full: '', hasMore: false, remainingSectionCount: 0 };
  }
  if (full.length <= charBudget) {
    return { preview: full, full, hasMore: false, remainingSectionCount: 0 };
  }

  const blocks = splitMarkdownBlocks(full);
  if (blocks.length <= 1) {
    if (full.length <= charBudget) {
      return { preview: full, full, hasMore: false, remainingSectionCount: 0 };
    }
    const paras = full.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (paras.length > 1) {
      let preview = '';
      let used = 0;
      let paraCount = 0;
      for (const para of paras) {
        const sep = preview ? '\n\n' : '';
        const nextLen = used + sep.length + para.length;
        if (paraCount > 0 && nextLen > charBudget) break;
        preview += sep + para;
        used = preview.length;
        paraCount += 1;
      }
      const hasMore = paraCount < paras.length;
      return {
        preview: (preview || paras[0]).trim(),
        full,
        hasMore,
        remainingSectionCount: hasMore ? paras.length - paraCount : 0,
      };
    }
    const cutAt = full.lastIndexOf('\n', charBudget);
    const preview = (cutAt > charBudget * 0.5 ? full.slice(0, cutAt) : full.slice(0, charBudget)).trim();
    const hasMore = preview.length < full.length;
    return {
      preview,
      full,
      hasMore,
      remainingSectionCount: hasMore ? 1 : 0,
    };
  }

  let preview = '';
  let used = 0;
  let blockCount = 0;

  for (const block of blocks) {
    const sep = preview ? '\n\n' : '';
    const nextLen = used + sep.length + block.length;
    if (blockCount > 0 && nextLen > charBudget) break;
    preview += sep + block;
    used = preview.length;
    blockCount += 1;
  }

  if (!preview.trim()) {
    preview = blocks[0];
    blockCount = 1;
  }

  const hasMore = blockCount < blocks.length;
  return {
    preview: preview.trim(),
    full,
    hasMore,
    remainingSectionCount: hasMore ? blocks.length - blockCount : 0,
  };
}

function splitMarkdownBlocks(content: string): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = current.join('\n').trim();
    if (text) blocks.push(text);
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s/.test(line);
    const isHr = /^---+$/.test(line.trim());

    if ((isHeading || isHr) && current.length > 0) {
      flush();
    }

    current.push(line);

    if (isHr) {
      flush();
    }
  }
  flush();

  if (blocks.length <= 1 && content.includes('\n\n')) {
    return content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  }

  return blocks.length > 0 ? blocks : [content];
}

/** Snippet helper for chat preview cards */
export function readerMarkdownSnippet(
  raw: string,
  opts: NormalizeReaderMarkdownOptions = {},
  maxLen = 220,
): string {
  const { content } = normalizeReaderMarkdown(raw, opts);
  const paragraph = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => {
      if (l.length < 60) return false;
      if (/^#{1,6}\s/.test(l)) return false;
      if (/^!\[/.test(l)) return false;
      if (/^\*[^*].*\*$/.test(l)) return false;
      if (linkDensity(l) >= 0.45) return false;
      return true;
    });
  const base = paragraph || content.replace(/^#+\s+/gm, '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  return base.length <= maxLen ? base : `${base.slice(0, maxLen - 1)}…`;
}
