import { describe, expect, it } from 'vitest';
import {
  ansiColorizeJson,
  appendStdoutWithJsonColor,
  flushStdoutJsonColorBuffer,
} from './terminalStructuredOutput';

describe('terminalStructuredOutput', () => {
  it('colorizes compact json objects', () => {
    const input = '{"ok":true,"count":3}\n';
    const colored = ansiColorizeJson(input);
    expect(colored).toBeTruthy();
    expect(colored).toContain('\x1b[36m');
    expect(colored).toContain('true');
  });

  it('passes through non-json lines unchanged', () => {
    expect(ansiColorizeJson('npm run build\n')).toBeNull();
    expect(ansiColorizeJson('hello world\n')).toBeNull();
  });

  it('buffers partial lines across chunks', () => {
    const runId = 'run-test';
    expect(appendStdoutWithJsonColor(runId, '{"ok":')).toBe('');
    const tail = appendStdoutWithJsonColor(runId, 'true}\n');
    expect(tail).toContain('true');
    expect(flushStdoutJsonColorBuffer(runId)).toBe('');
  });

  it('leaves plain logs unchanged', () => {
    const runId = 'run-plain';
    const out = appendStdoutWithJsonColor(runId, 'Building...\nDone\n');
    expect(out).toBe('Building...\nDone\n');
  });
});
