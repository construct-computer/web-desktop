export type StructuredFormat = 'json';

export interface StructuredContentResult {
  format: StructuredFormat | null;
  parsed: unknown;
  raw: string;
  summary: string;
}

const JINA_MARKDOWN_CONTENT = /Markdown Content:\s*\n([\s\S]*)$/i;
const MARKDOWN_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i;

export function extractJsonCandidate(text: string): string {
  let candidate = text.trim();
  if (!candidate) return '';

  const fence = candidate.match(MARKDOWN_FENCE);
  if (fence) candidate = fence[1].trim();

  const jina = candidate.match(JINA_MARKDOWN_CONTENT);
  if (jina) candidate = jina[1].trim();

  return candidate;
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return { ok: false };

  try {
    const parsed = JSON.parse(candidate);
    return { ok: true, value: parsed };
  } catch {
    // NDJSON: every non-empty line must parse
    if (!candidate.includes('\n')) return { ok: false };
    const lines = candidate.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return { ok: false };
    try {
      const values = lines.map((line) => JSON.parse(line));
      return { ok: true, value: values.length === 1 ? values[0] : values };
    } catch {
      return { ok: false };
    }
  }
}

function linkDensity(text: string): number {
  const stripped = text.replace(/\s+/g, '');
  if (!stripped) return 0;
  const links = text.match(/\[[^\]]*\]\([^)]+\)/g) ?? [];
  return links.join('').length / stripped.length;
}

/** Reject article-like markdown that happens to contain JSON samples. */
export function isArticleLike(text: string): boolean {
  const lines = text.split('\n');
  const headingCount = lines.filter((l) => /^#{1,6}\s/.test(l.trim())).length;
  if (headingCount > 1) return true;

  const linkMatches = (text.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  if (linkMatches >= 3 || linkDensity(text) > 0.25) return true;

  const longProse = lines.some((line) => {
    const trimmed = line.trim();
    if (trimmed.length <= 120) return false;
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) return false;
    if (/^#{1,6}\s/.test(trimmed)) return false;
    if (/^```/.test(trimmed)) return false;
    return true;
  });
  if (longProse) return true;

  return false;
}

function isMarkdownWrappedJsonOnly(text: string, candidate: string): boolean {
  const trimmed = text.trim();
  if (trimmed === candidate) return true;

  const withoutJina = trimmed
    .replace(/^Title:\s*[\s\S]*?Markdown Content:\s*\n/i, '')
    .trim();
  if (withoutJina === candidate) return true;

  const fence = trimmed.match(MARKDOWN_FENCE);
  if (fence && fence[1].trim() === candidate) return true;

  return false;
}

function parsedValueIsArticleString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (/^#{1,6}\s/m.test(s)) return true;
  if (/<[a-z][\s\S]*>/i.test(s) && s.length > 200) return true;
  return false;
}

export function isWholeBodyJson(originalText: string, candidate: string, parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') {
    if (typeof parsed === 'string' && parsedValueIsArticleString(parsed)) return false;
    if (typeof parsed !== 'object') return false;
  }

  if (isArticleLike(originalText)) return false;
  if (!isMarkdownWrappedJsonOnly(originalText, candidate)) return false;

  return true;
}

export function summarizeStructuredValue(value: unknown): string {
  if (value === null) return 'Empty JSON';
  if (Array.isArray(value)) {
    return `Array with ${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `Object with ${keys.length} key${keys.length === 1 ? '' : 's'}`;
  }
  return `${typeof value} value`;
}

export function prettyPrintJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function detectStructuredContent(text: string, _url?: string): StructuredContentResult {
  const empty: StructuredContentResult = { format: null, parsed: undefined, raw: '', summary: '' };
  if (!text?.trim()) return empty;

  const candidate = extractJsonCandidate(text);
  const parsed = tryParseJson(text);
  if (!parsed.ok) return { ...empty, raw: candidate };

  if (!isWholeBodyJson(text, candidate, parsed.value)) {
    return { ...empty, raw: candidate };
  }

  const raw = prettyPrintJson(parsed.value);
  return {
    format: 'json',
    parsed: parsed.value,
    raw,
    summary: summarizeStructuredValue(parsed.value),
  };
}

/** Primary positive fixture: signups.construct.computer via Jina markdown wrapper. */
export const SIGNUPS_JINA_FIXTURE = `Title: 

URL Source: https://signups.construct.computer/

Markdown Content:
{"ok":true,"service":"construct-computer demo signups","next_id":1,"start":"/signups?since=0","endpoints":{"/signups":"GET — random batch of new signups (0–10). Use ?limit=N to force size.","/signups?since=ID&last_ts=ISO":"GET — cursor-based polling, timestamps spread between last_ts and now","/reset":"GET — reset the ID counter to 1"}}`;
