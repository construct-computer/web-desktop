import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentPreviewStore } from './documentPreviewStore';

function resetStore() {
  useDocumentPreviewStore.setState({
    sessions: {},
    sessionOrder: [],
    toolCallIndex: {},
  });
}

describe('documentPreviewStore', () => {
  beforeEach(() => resetStore());

  it('tracks session lifecycle and preview frames', () => {
    const store = useDocumentPreviewStore.getState();
    const id = store.startSession({
      documentSessionId: 'doc-1',
      toolCallId: 'tool-1',
      format: 'pptx',
      goal: 'Build deck',
    });

    expect(id).toBe('doc-1');
    expect(useDocumentPreviewStore.getState().toolCallIndex['tool-1']).toBe('doc-1');

    useDocumentPreviewStore.getState().addStep({
      documentSessionId: 'doc-1',
      message: 'Building slide 1',
      progress: 0.25,
    });
    useDocumentPreviewStore.getState().addFrame({
      documentSessionId: 'doc-1',
      previewPath: '.construct/previews/doc-1/page-1.png',
      contentType: 'image/png',
      slideIndex: 0,
      label: 'Slide 1',
    });
    useDocumentPreviewStore.getState().completeSession({
      documentSessionId: 'doc-1',
      outputPath: 'decks/demo.pptx',
    });

    const session = useDocumentPreviewStore.getState().sessions['doc-1'];
    expect(session.status).toBe('completed');
    expect(session.steps[0].message).toBe('Building slide 1');
    expect(session.frames[0].previewPath).toBe('.construct/previews/doc-1/page-1.png');
    expect(session.artifactPath).toBe('decks/demo.pptx');
  });

  it('attaches terminal output by tool call id', () => {
    useDocumentPreviewStore.getState().startSession({
      documentSessionId: 'doc-2',
      toolCallId: 'tool-2',
    });

    useDocumentPreviewStore.getState().appendTerminalOutput({
      toolCallId: 'tool-2',
      data: 'rendering page 1\n',
      stream: 'stdout',
    });

    expect(useDocumentPreviewStore.getState().sessions['doc-2'].terminalOutput[0].data)
      .toBe('rendering page 1\n');
  });
});
