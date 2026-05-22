import { describe, expect, it } from 'vitest';
import {
  getFileIconKind,
  getFileType,
  getMonacoLanguage,
  getPreviewStrategy,
  getViewerDocType,
  hasRawToggle,
  isEditableSourceFile,
  isTextLikeFile,
  isViewerFile,
} from './fileTypes';

describe('file type registry', () => {
  it('routes all agent document formats to the viewer', () => {
    const files = [
      'report.pdf',
      'brief.docx',
      'legacy.doc',
      'notes.odt',
      'memo.rtf',
      'model.xlsx',
      'data.csv',
      'data.tsv',
      'deck.pptx',
      'old.ppt',
      'slides.odp',
      'report.html',
      'diagram.svg',
      'flow.dot',
      'sketch.excalidraw',
      'wiki/index.md',
    ];

    for (const file of files) {
      expect(isViewerFile(file), file).toBe(true);
    }
  });

  it('marks conversion-backed formats explicitly', () => {
    expect(getViewerDocType('brief.docx')).toBe('convertible');
    expect(getViewerDocType('deck.pptx')).toBe('convertible');
    expect(getViewerDocType('legacy.doc')).toBe('convertible');
    expect(getViewerDocType('slides.odp')).toBe('convertible');
    expect(getViewerDocType('scan.tiff')).toBe('convertible');
  });

  it('keeps binary generated artifacts out of text editor routing', () => {
    expect(isTextLikeFile('clip.mp4')).toBe(false);
    expect(isTextLikeFile('bundle.zip')).toBe(false);
    expect(getFileType('result.json')?.renderer).toBe('json');
  });

  it('describes raw toggles, editability, preview strategy, and language centrally', () => {
    expect(hasRawToggle('data.jsonl')).toBe(true);
    expect(isEditableSourceFile('data.csv')).toBe(true);
    expect(getPreviewStrategy('slides.pptx')).toBe('conversion');
    expect(getPreviewStrategy('photo.png')).toBe('native');
    expect(getMonacoLanguage('src/App.tsx')).toBe('typescript');
    expect(getMonacoLanguage('.env')).toBe('ini');
  });

  it('chooses distinct icon kinds for common formats', () => {
    expect(getFileIconKind('data.json')).toBe('json');
    expect(getFileIconKind('data.csv')).toBe('spreadsheet');
    expect(getFileIconKind('notes.md')).toBe('markdown');
    expect(getFileIconKind('index.html')).toBe('html');
    expect(getFileIconKind('report.pdf')).toBe('pdf');
    expect(getFileIconKind('clip.mp4')).toBe('video');
  });
});
