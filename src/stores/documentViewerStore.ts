import { create } from 'zustand';
import { useWindowStore } from './windowStore';
import { getDocumentType, isTextFile } from '@/lib/utils';

import iconDocs from '@/icons/docs.png';
import iconSheet from '@/icons/sheet.png';
import iconText from '@/icons/text.png';
import iconPreview from '@/icons/preview.png';
import iconSlides from '@/icons/slides.png';
import iconGeneric from '@/icons/generic.png';

/** Pick a dock icon based on file extension / document type. */
export function getFileIcon(filePath: string): string {
  const docType = getDocumentType(filePath);
  switch (docType) {
    case 'pdf': return iconDocs;
    case 'docx': return iconDocs;
    case 'convertible': return iconDocs;
    case 'xlsx': case 'csv': case 'tsv': case 'json': return iconSheet;
    case 'pptx': return iconSlides;
    case 'image': case 'diagram': case 'excalidraw': return iconPreview;
    case 'audio': case 'video': return iconPreview;
    case 'archive': return iconGeneric;
    case 'html': case 'markdown': case 'text': return iconText;
    default:
      if (isTextFile(filePath)) return iconText;
      return iconGeneric;
  }
}

/** Reload signal store — document viewers subscribe to this to reload on external changes. */
interface DocViewerSignalStore {
  /** Incremented to signal a specific file should reload. Key = filePath. */
  reloadSignals: Record<string, number>;
  /** Signal a document viewer to reload its content. */
  signalReload: (filePath: string) => void;
}

export const useDocViewerSignalStore = create<DocViewerSignalStore>((set, get) => ({
  reloadSignals: {},
  signalReload: (filePath: string) => {
    const signals = get().reloadSignals;
    set({ reloadSignals: { ...signals, [filePath]: (signals[filePath] || 0) + 1 } });
  },
}));

/**
 * Open or focus a document viewer window for the given file path.
 * If already open, focus it and signal a reload (for live agent edits).
 */
export function openDocumentViewer(filePath: string, workspaceId?: string, extra?: { fileSize?: number; fileModified?: string }): string {
  const store = useWindowStore.getState();
  const fileName = filePath.split('/').pop() ?? 'Document';
  const wsId = workspaceId || store.activeWorkspaceId;

  // Check if a viewer for this file already exists
  const existing = store.windows.find(
    w => w.type === 'document-viewer' && w.metadata?.filePath === filePath
  );
  if (existing) {
    store.focusWindow(existing.id);
    // Signal reload so the viewer picks up external changes immediately
    useDocViewerSignalStore.getState().signalReload(filePath);
    return existing.id;
  }

  const windowId = store.openWindow('document-viewer', {
    title: fileName,
    icon: getFileIcon(filePath),
    metadata: { filePath, ...extra },
    workspaceId: wsId,
  });

  return windowId;
}

/**
 * Open a document viewer for a Google Drive file.
 * Uses driveFileId to download content directly from Drive.
 */
export function openCloudDocumentViewer(driveFileId: string, fileName: string, workspaceId?: string, extra?: { fileSize?: number; fileModified?: string }): string {
  const store = useWindowStore.getState();
  const wsId = workspaceId || store.activeWorkspaceId;

  // Check if a viewer for this Drive file already exists
  const existing = store.windows.find(
    w => w.type === 'document-viewer' && w.metadata?.driveFileId === driveFileId
  );
  if (existing) {
    store.focusWindow(existing.id);
    return existing.id;
  }

  const windowId = store.openWindow('document-viewer', {
    title: fileName,
    icon: getFileIcon(fileName),
    metadata: { driveFileId, filePath: fileName, ...extra },
    workspaceId: wsId,
  });

  return windowId;
}
