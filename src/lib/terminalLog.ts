import type { TerminalChunk } from '@/stores/terminalStore';

interface TerminalLogLine {
  type?: string;
  stream?: 'stdout' | 'stderr';
  data?: string;
  command?: string;
  exitCode?: number;
  timestamp?: string;
}

export function isTerminalLogJsonl(output: string): boolean {
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  try {
    const first = JSON.parse(lines[0]) as TerminalLogLine;
    return first.type === 'command' || first.type === 'output' || first.type === 'exit';
  } catch {
    return false;
  }
}

export function parseTerminalLogJsonl(
  output: string,
  runId: string,
  startedAt: number,
): TerminalChunk[] {
  const lines = output.split('\n').filter((l) => l.trim());
  const chunks: TerminalChunk[] = [];
  let sequence = 0;

  for (const line of lines) {
    let row: TerminalLogLine;
    try {
      row = JSON.parse(line) as TerminalLogLine;
    } catch {
      continue;
    }

    if (row.type === 'output' && typeof row.data === 'string') {
      sequence += 1;
      chunks.push({
        id: `${runId}:hydrated:${sequence}`,
        runId,
        data: row.data,
        stream: row.stream === 'stderr' ? 'stderr' : 'stdout',
        timestamp: row.timestamp ? Date.parse(row.timestamp) || startedAt : startedAt,
        sequence,
      });
    }
  }

  return chunks;
}
