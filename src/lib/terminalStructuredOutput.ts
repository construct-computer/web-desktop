const A = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  white: '\x1b[37m',
};

const KEY = `${A.cyan}`;
const STR = `${A.green}`;
const NUM = `${A.yellow}`;
const BOOL = `${A.bold}${A.yellow}`;
const NULL = `${A.bold}${A.yellow}`;
const PUNCT = `${A.gray}`;
const RESET = A.reset;

function colorizeJsonString(json: string): string {
  let out = '';
  let i = 0;

  while (i < json.length) {
    const ch = json[i];

    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < json.length) {
        if (json[i] === '\\') {
          i += 2;
          continue;
        }
        if (json[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      const token = json.slice(start, i);
      const after = json.slice(i).match(/^\s*:/) ;
      out += after ? `${KEY}${token}${RESET}` : `${STR}${token}${RESET}`;
      continue;
    }

    if (/[-0-9]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < json.length && /[0-9eE+.\-]/.test(json[i])) i += 1;
      out += `${NUM}${json.slice(start, i)}${RESET}`;
      continue;
    }

    if (json.startsWith('true', i) || json.startsWith('false', i)) {
      const token = json.startsWith('true', i) ? 'true' : 'false';
      out += `${BOOL}${token}${RESET}`;
      i += token.length;
      continue;
    }

    if (json.startsWith('null', i)) {
      out += `${NULL}null${RESET}`;
      i += 4;
      continue;
    }

    if ('{}[],:'.includes(ch)) {
      out += `${PUNCT}${ch}${RESET}`;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** Returns ANSI-colored pretty JSON, or null if input is not valid JSON/NDJSON. */
export function ansiColorizeJson(text: string): string | null {
  const trimmed = text.trimEnd();
  if (!trimmed.trim()) return trimmed;

  const lines = trimmed.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return trimmed;

  if (nonEmpty.length === 1) {
    try {
      const parsed = JSON.parse(nonEmpty[0].trim());
      const pretty = JSON.stringify(parsed, null, 2);
      const suffix = trimmed.endsWith('\n') ? '\n' : '';
      return `${colorizeJsonString(pretty)}${suffix}`;
    } catch {
      return null;
    }
  }

  let allParsed = true;
  const parsedLines: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      parsedLines.push(line);
      continue;
    }
    try {
      const parsed = JSON.parse(line.trim());
      parsedLines.push(colorizeJsonString(JSON.stringify(parsed)));
    } catch {
      allParsed = false;
      break;
    }
  }

  if (!allParsed) return null;
  const suffix = trimmed.endsWith('\n') ? '\n' : '';
  return `${parsedLines.join('\n')}${suffix}`;
}

function colorizeMultilineText(text: string): string {
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (endsWithNewline && lines[lines.length - 1] === '') lines.pop();

  const colored = lines.map((line) => {
    if (!line.trim()) return line;
    const single = ansiColorizeJson(line);
    return single ?? line;
  });

  return `${colored.join('\n')}${endsWithNewline ? '\n' : ''}`;
}

const buffers = new Map<string, string>();

export function appendStdoutWithJsonColor(runId: string, data: string): string {
  const pending = (buffers.get(runId) ?? '') + data;
  const lastNewline = pending.lastIndexOf('\n');

  if (lastNewline === -1) {
    buffers.set(runId, pending);
    return '';
  }

  const complete = pending.slice(0, lastNewline + 1);
  buffers.set(runId, pending.slice(lastNewline + 1));
  return colorizeMultilineText(complete);
}

export function flushStdoutJsonColorBuffer(runId: string): string {
  const remainder = buffers.get(runId) ?? '';
  buffers.delete(runId);
  if (!remainder) return '';
  return ansiColorizeJson(remainder) ?? remainder;
}

export function clearStdoutJsonColorBuffer(runId: string): void {
  buffers.delete(runId);
}
