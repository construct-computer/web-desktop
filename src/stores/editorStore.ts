import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useComputerStore } from './agentStore';
import { useWindowStore } from './windowStore';
import * as api from '@/services/api';
import { getFileIcon } from './documentViewerStore';

export interface EditorFileState {
  filePath: string;
  fileName: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface EditorStore {
  /** Per-window file state, keyed by window ID. */
  files: Record<string, EditorFileState>;

  /**
   * Open a file. If a window for this filePath already exists, focus it.
   * Otherwise, create a new editor window and load the file.
   * Returns the window ID.
   */
  openFile: (filePath: string, workspaceId?: string) => string;
  /** Re-fetch a file's content from the container. Always overwrites local content. */
  refreshFile: (windowId: string) => void;
  /**
   * Open a file if no window exists for it, or refresh it if already open.
   * Returns the window ID.
   */
  openOrRefreshFile: (filePath: string, workspaceId?: string) => string;
  /** Remove file state for a window (called when window closes). */
  closeFile: (windowId: string) => void;
  /** Update the content for a window's file. */
  updateContent: (windowId: string, content: string) => void;
  /** Save the file for a specific window. */
  saveFile: (windowId: string) => Promise<void>;
  /** Get file state for a window. */
  getFile: (windowId: string) => EditorFileState | undefined;
  /** Find window ID for a given filePath, or undefined if not open. */
  findWindowByPath: (filePath: string) => string | undefined;
  /** Clear all file state (used on disconnect). */
  clearAll: () => void;
}

function extractFileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector((set, get) => ({
    files: {},

    openFile: (filePath: string, workspaceId?: string) => {
      // Check if a window for this file already exists
      const existingWindowId = get().findWindowByPath(filePath);
      if (existingWindowId) {
        useWindowStore.getState().focusWindow(existingWindowId);
        return existingWindowId;
      }

      const fileName = extractFileName(filePath);

      // Create a new editor window in the correct workspace
      const windowId = useWindowStore.getState().openWindow('editor', {
        title: fileName,
        icon: getFileIcon(filePath),
        metadata: { filePath },
        ...(workspaceId && { workspaceId }),
      });

      // Add file state in loading state
      const fileState: EditorFileState = {
        filePath,
        fileName,
        content: '',
        savedContent: '',
        loading: true,
        saving: false,
        error: null,
      };

      set({ files: { ...get().files, [windowId]: fileState } });

      // Fetch file content
      const instanceId = useComputerStore.getState().instanceId;
      if (!instanceId) {
        const files = get().files;
        if (files[windowId]) {
          set({
            files: {
              ...files,
              [windowId]: { ...files[windowId], loading: false, error: 'No instance connected' },
            },
          });
        }
        return windowId;
      }

      api.readFile(instanceId, filePath).then((result) => {
        const files = get().files;
        // Window might have been closed while loading
        if (!files[windowId]) return;

        if (result.success) {
          set({
            files: {
              ...files,
              [windowId]: {
                ...files[windowId],
                content: result.data.content,
                savedContent: result.data.content,
                loading: false,
                error: null,
              },
            },
          });
        } else {
          set({
            files: {
              ...files,
              [windowId]: { ...files[windowId], loading: false, error: result.error },
            },
          });
        }
      });

      return windowId;
    },

    refreshFile: (windowId: string) => {
      const instanceId = useComputerStore.getState().instanceId;
      if (!instanceId) return;

      const file = get().files[windowId];
      if (!file) return;

      api.readFile(instanceId, file.filePath).then((result) => {
        const files = get().files;
        if (!files[windowId]) return;

        if (result.success) {
          // Only update if the server content actually changed
          if (files[windowId].savedContent === result.data.content) return;

          set({
            files: {
              ...files,
              [windowId]: {
                ...files[windowId],
                content: result.data.content,
                savedContent: result.data.content,
              },
            },
          });
        }
      });
    },

    openOrRefreshFile: (filePath: string, workspaceId?: string) => {
      const existingWindowId = get().findWindowByPath(filePath);
      if (existingWindowId) {
        useWindowStore.getState().focusWindow(existingWindowId);
        get().refreshFile(existingWindowId);
        return existingWindowId;
      }
      return get().openFile(filePath, workspaceId);
    },

    closeFile: (windowId: string) => {
      const { [windowId]: _, ...rest } = get().files;
      set({ files: rest });
    },

    updateContent: (windowId: string, content: string) => {
      const files = get().files;
      if (!files[windowId]) return;
      set({
        files: { ...files, [windowId]: { ...files[windowId], content } },
      });
    },

    saveFile: async (windowId: string) => {
      const file = get().files[windowId];
      if (!file || file.content === file.savedContent) return;

      const instanceId = useComputerStore.getState().instanceId;
      if (!instanceId) return;

      set({
        files: { ...get().files, [windowId]: { ...get().files[windowId], saving: true } },
      });

      const result = await api.writeFile(instanceId, file.filePath, file.content);

      const files = get().files;
      if (!files[windowId]) return;

      set({
        files: {
          ...files,
          [windowId]: {
            ...files[windowId],
            saving: false,
            savedContent: result.success ? file.content : files[windowId].savedContent,
          },
        },
      });
    },

    getFile: (windowId: string) => {
      return get().files[windowId];
    },

    findWindowByPath: (filePath: string) => {
      const files = get().files;
      for (const [windowId, file] of Object.entries(files)) {
        if (file.filePath === filePath) return windowId;
      }
      // Also check window metadata (for windows created but not yet loaded)
      const windows = useWindowStore.getState().windows;
      for (const win of windows) {
        if ((win.type === 'editor' || win.type === 'document-viewer') && win.metadata?.filePath === filePath) {
          return win.id;
        }
      }
      return undefined;
    },

    clearAll: () => {
      set({ files: {} });
    },
  })),
);

// When an editor/document-viewer window is closed, clean up its file state
useWindowStore.subscribe(
  (s) => s.windows,
  (windows, prevWindows) => {
    const currentIds = new Set(windows.filter((w) => w.type === 'editor' || w.type === 'document-viewer').map((w) => w.id));
    const removed = prevWindows
      .filter((w) => (w.type === 'editor' || w.type === 'document-viewer') && !currentIds.has(w.id));

    for (const win of removed) {
      useEditorStore.getState().closeFile(win.id);
    }
  },
);

// ── Live file polling ──────────────────────────────────────────────────────
// Poll all open editor files every 3 seconds for external changes.
// Only updates if the file is clean (no unsaved local edits) to avoid
// overwriting user work-in-progress.

let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    const { files, refreshFile } = useEditorStore.getState();
    for (const [windowId, file] of Object.entries(files)) {
      if (file.loading || file.saving) continue;
      // Only auto-refresh clean files to avoid overwriting user edits
      if (file.content !== file.savedContent) continue;
      refreshFile(windowId);
    }
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Start/stop polling based on whether any files are open
useEditorStore.subscribe(
  (s) => Object.keys(s.files).length,
  (count) => {
    if (count > 0) startPolling();
    else stopPolling();
  },
);
