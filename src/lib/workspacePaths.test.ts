import { describe, expect, it } from 'vitest';
import {
  decodeDisplayName,
  decodeDisplaySegment,
  fileNameFromWorkspacePath,
  workspaceDisplayPath,
} from './workspacePaths';

describe('workspacePaths display decoding', () => {
  it('decodes percent-encoded spaces in folder names', () => {
    expect(decodeDisplaySegment('Scheduled%20Tasks')).toBe('Scheduled Tasks');
  });

  it('leaves normal names unchanged', () => {
    expect(decodeDisplaySegment('README.md')).toBe('README.md');
  });

  it('returns malformed encodings unchanged', () => {
    expect(decodeDisplaySegment('bad%ZZname')).toBe('bad%ZZname');
  });

  it('decodes nested mention paths', () => {
    expect(decodeDisplayName('uploads/Scheduled%20Tasks/report.json')).toBe(
      'uploads/Scheduled Tasks/report.json',
    );
  });

  it('decodes workspace display paths', () => {
    expect(workspaceDisplayPath('/Scheduled%20Tasks/notes.txt')).toBe('/Scheduled Tasks/notes.txt');
  });

  it('decodes file names from workspace paths', () => {
    expect(fileNameFromWorkspacePath('/Scheduled%20Tasks/data.json')).toBe('data.json');
    expect(fileNameFromWorkspacePath('Scheduled%20Tasks')).toBe('Scheduled Tasks');
  });
});
