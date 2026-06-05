import { describe, expect, it } from 'vitest';
import { isTerminalLogJsonl, parseTerminalLogJsonl } from './terminalLog';

describe('terminalLog', () => {
  it('detects terminal log jsonl schema', () => {
    const jsonl = [
      '{"type":"command","command":"echo hi","timestamp":"2026-01-01T00:00:00.000Z"}',
      '{"type":"output","stream":"stdout","data":"hi\\n","timestamp":"2026-01-01T00:00:01.000Z"}',
      '{"type":"exit","exitCode":0,"timestamp":"2026-01-01T00:00:02.000Z"}',
    ].join('\n');
    expect(isTerminalLogJsonl(jsonl)).toBe(true);
  });

  it('parses output chunks with stream metadata', () => {
    const jsonl = [
      '{"type":"command","command":"node -e","timestamp":"2026-01-01T00:00:00.000Z"}',
      '{"type":"output","stream":"stderr","data":"warn\\n","timestamp":"2026-01-01T00:00:01.000Z"}',
      '{"type":"output","stream":"stdout","data":"{\\"ok\\":true}\\n","timestamp":"2026-01-01T00:00:02.000Z"}',
    ].join('\n');
    const chunks = parseTerminalLogJsonl(jsonl, 'call-1', 1000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].stream).toBe('stderr');
    expect(chunks[1].stream).toBe('stdout');
    expect(chunks[1].data).toBe('{"ok":true}\n');
  });

  it('rejects arbitrary jsonl stdout', () => {
    const jsonl = '{"a":1}\n{"b":2}\n';
    expect(isTerminalLogJsonl(jsonl)).toBe(false);
  });
});
