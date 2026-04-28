import { describe, expect, it } from 'vitest';
import { getFileType, getViewerDocType, isTextLikeFile, isViewerFile } from './fileTypes';

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
    expect(getViewerDocType('legacy.doc')).toBe('convertible');
    expect(getViewerDocType('slides.odp')).toBe('convertible');
    expect(getViewerDocType('scan.tiff')).toBe('convertible');
  });

  it('keeps binary generated artifacts out of text editor routing', () => {
    expect(isTextLikeFile('clip.mp4')).toBe(false);
    expect(isTextLikeFile('bundle.zip')).toBe(false);
    expect(getFileType('result.json')?.renderer).toBe('json');
  });
});
