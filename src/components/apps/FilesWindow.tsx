import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileEdit,
  FilePlus,
  FolderPlus,
  FileAudio,
  FileVideo,
  Pencil,
  Trash2,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  HardDrive,
  Loader2,
  Link,
  Eye,
  EyeOff,
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  Upload,
  X,
  Check,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useEditorStore } from '@/stores/editorStore';
import { useAppStore } from '@/stores/appStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as api from '@/services/api';
import type { FileEntry, DriveFileEntry } from '@/services/api';
import { useDriveSync } from '@/hooks/useDriveSync';
import { useDriveFiles } from '@/hooks/useDriveFiles';
import { log } from '@/lib/logger';

const logger = log('Files');

interface FilesWindowProps {
  config: WindowConfig;
}

/** Root path for the R2-backed workspace. All files live here. */
const WORKSPACE_PATH = '/';

function formatSize(bytes: number): string {
  if (bytes === 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === 'directory') return Folder;
  if (entry.type === 'symlink') return Link;

  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) return FileImage;
  if (AUDIO_EXTENSIONS.has(ext)) return FileAudio;
  if (VIDEO_EXTENSIONS.has(ext)) return FileVideo;
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return FileArchive;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'rb', 'sh', 'bash', 'yaml', 'yml', 'toml', 'json', 'xml', 'html', 'css', 'scss'].includes(ext)) return FileCode;
  if (['txt', 'md', 'log', 'csv', 'env', 'cfg', 'ini', 'conf'].includes(ext)) return FileText;
  return File;
}

import { isTextFile, isDocumentFile } from '../../lib/utils';
import { openDocumentViewer, openCloudDocumentViewer } from '../../stores/documentViewerStore';

// ─── Media file detection ──────────────────────────────────────────────────

type FileCategory = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'binary';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv']);

function getFileCategory(name: string): FileCategory {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (isTextFile(name)) return 'text';
  return 'binary';
}

function isPreviewable(name: string): boolean {
  const cat = getFileCategory(name);
  return cat === 'image' || cat === 'audio' || cat === 'video' || cat === 'pdf';
}

const HTML_EXTENSIONS = new Set(['html', 'htm']);

function isHtmlFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return HTML_EXTENSIONS.has(ext);
}

function joinPath(base: string, name: string): string {
  if (base === '/') return `/${name}`;
  return `${base}/${name}`;
}

// ─── Context menu types ────────────────────────────────────────────────────

type ContextMenuType =
  | { kind: 'background'; x: number; y: number }
  | { kind: 'local-item'; x: number; y: number; entry: FileEntry }
  | { kind: 'cloud-item'; x: number; y: number; file: DriveFileEntry };

// ─── Transfer tracking ─────────────────────────────────────────────────────

interface Transfer {
  id: string;
  name: string;
  direction: 'upload' | 'download';
  status: 'active' | 'done' | 'error';
}

let nextTransferId = 0;

// ─── Context menu (rendered via portal) ────────────────────────────────────

function ContextMenu({
  menu,
  onClose,
  onEditFile,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onUploadToCloud,
  onDownloadLocalFile,
  onDownloadToWorkspace,
  onDownloadCloudFile,
  onDeleteCloudFile,
  driveConnected,
  readOnly,
}: {
  menu: ContextMenuType;
  onClose: () => void;
  onEditFile: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onUploadToCloud?: (entry: FileEntry) => void;
  onDownloadLocalFile?: (entry: FileEntry) => void;
  onDownloadToWorkspace?: (file: DriveFileEntry) => void;
  onDownloadCloudFile?: (file: DriveFileEntry) => void;
  onDeleteCloudFile?: (file: DriveFileEntry) => void;
  driveConnected?: boolean;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const itemClass =
    'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-accent)] hover:text-white transition-colors';
  const separatorClass = 'my-1 border-t border-[var(--color-border)]';

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[170px] py-1 bg-[var(--color-surface-raised)]/80 backdrop-blur-xl border border-[var(--color-border)] rounded-md shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.kind === 'background' ? (
        readOnly ? (
          <div className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">Read-only location</div>
        ) : (
          <>
            <button className={itemClass} onClick={onNewFile}>
              <FilePlus className="w-3.5 h-3.5" />
              New File
            </button>
            <button className={itemClass} onClick={onNewFolder}>
              <FolderPlus className="w-3.5 h-3.5" />
              New Folder
            </button>
          </>
        )
      ) : menu.kind === 'local-item' ? (
        <>
          {menu.entry.type === 'file' && (
            <>
              <button className={itemClass} onClick={() => onEditFile(menu.entry)}>
                <FileEdit className="w-3.5 h-3.5" />
                {readOnly ? 'View File' : 'Edit File'}
              </button>
              {onDownloadLocalFile && (
                <button className={itemClass} onClick={() => onDownloadLocalFile(menu.entry)}>
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              )}
              {!readOnly && <div className={separatorClass} />}
            </>
          )}
          {!readOnly && (
            <>
              <button className={itemClass} onClick={() => onRename(menu.entry)}>
                <Pencil className="w-3.5 h-3.5" />
                Rename
              </button>
              {driveConnected && onUploadToCloud && (
                <>
                  <div className={separatorClass} />
                  <button className={itemClass} onClick={() => onUploadToCloud(menu.entry)}>
                    <CloudUpload className="w-3.5 h-3.5" />
                    Upload to Cloud
                  </button>
                </>
              )}
              <div className={separatorClass} />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => onDelete(menu.entry)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </>
      ) : (
        /* cloud-item */
        <>
          {onDownloadToWorkspace && (
            <button className={itemClass} onClick={() => onDownloadToWorkspace(menu.file)}>
              <CloudDownload className="w-3.5 h-3.5" />
              Download to Workspace
            </button>
          )}
          {onDownloadCloudFile && (
            <button className={itemClass} onClick={() => onDownloadCloudFile(menu.file)}>
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
          {onDeleteCloudFile && (
            <>
              <div className={separatorClass} />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => onDeleteCloudFile(menu.file)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

// ─── Inline name input (for rename and new file/folder) ────────────────────

function InlineNameInput({
  defaultValue,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Delay to ensure DOM is settled and no competing focus events
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      // Select name without extension for files
      const dotIdx = defaultValue.lastIndexOf('.');
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    });
  }, [defaultValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== defaultValue) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="bg-[#1a1a2e] border border-[var(--color-accent)] text-[var(--color-text)] text-xs px-1 py-0.5 rounded outline-none w-full min-w-[60px] shadow-sm"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={submit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function FilesWindow({ config: _config }: FilesWindowProps) {
  const instanceId = useComputerStore((s) => s.instanceId);
  const navigateBrowser = useComputerStore((s) => s.navigateTo);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [currentPath, setCurrentPath] = useState(WORKSPACE_PATH);
  const localApps = useAppStore((s) => s.localApps);
  const localAppIcons = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of localApps) {
      if (app.icon_url) map.set(app.id, app.icon_url);
    }
    return map;
  }, [localApps]);
  const isReadOnly = false; // R2 workspace is always writable
  const [rawEntries, setRawEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHidden, setShowHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuType | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);

  // Storage usage
  const [storageUsage, setStorageUsage] = useState<{ bytesUsed: number; maxBytes: number } | null>(null);

  // Drive hooks (must be before any callbacks that reference them)
  const driveSync = useDriveSync(instanceId);
  const driveFiles = useDriveFiles(activeTab === 'cloud');

  // Transfer tracking state
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const runTransfer = useCallback(async <T,>(
    name: string,
    direction: 'upload' | 'download',
    fn: () => Promise<T>,
  ): Promise<T | undefined> => {
    const id = `transfer-${nextTransferId++}`;
    setTransfers((prev) => [...prev, { id, name, direction, status: 'active' }]);
    try {
      const result = await fn();
      setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done' as const } : t)));
      setTimeout(() => setTransfers((prev) => prev.filter((t) => t.id !== id)), 2500);
      return result;
    } catch {
      setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'error' as const } : t)));
      setTimeout(() => setTransfers((prev) => prev.filter((t) => t.id !== id)), 4000);
      return undefined;
    }
  }, []);

  // Preview state
  const [previewFile, setPreviewFile] = useState<{ name: string; path: string; category: FileCategory } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewBlobRef = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewBlobUrl(null);
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    };
  }, []);

  const openPreviewWith = useCallback(async (name: string, label: string, fetchFn: () => Promise<Response>): Promise<boolean> => {
    const category = getFileCategory(name);
    if (category !== 'image' && category !== 'audio' && category !== 'video' && category !== 'pdf') return false;

    // Close previous
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }

    setPreviewFile({ name, path: label, category });
    setPreviewBlobUrl(null);
    setPreviewLoading(true);

    try {
      const res = await fetchFn();
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        previewBlobRef.current = url;
        setPreviewBlobUrl(url);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  /** Preview a local container file. */
  const openPreview = useCallback((name: string, fullPath: string) => {
    if (!instanceId) return;
    openPreviewWith(name, fullPath, () => api.downloadContainerFile(instanceId, fullPath));
  }, [instanceId, openPreviewWith]);

  /** Preview a cloud Drive file (tracked as a download transfer). */
  const openCloudPreview = useCallback(async (name: string, fileId: string) => {
    const id = `transfer-${nextTransferId++}`;
    setTransfers((prev) => [...prev, { id, name, direction: 'download', status: 'active' }]);
    const ok = await openPreviewWith(name, name, () => api.downloadDriveFile(fileId));
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: ok ? 'done' as const : 'error' as const } : t)));
    setTimeout(() => setTransfers((prev) => prev.filter((t) => t.id !== id)), ok ? 2500 : 4000);
  }, [openPreviewWith]);

  const entries = useMemo(() => {
    return rawEntries
      .filter((e) => showHidden || !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === 'directory') return -1;
          if (b.type === 'directory') return 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [rawEntries, showHidden]);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!instanceId) return;
      setLoading(true);
      setError(null);
      setSelectedName(null);
      setRenamingName(null);
      setCreatingType(null);
      closePreview();

      const result = await api.listFiles(instanceId, path);

      if (result.success) {
        setRawEntries(result.data.entries);
        setCurrentPath(result.data.path);
      } else {
        setError(result.error);
      }
      setLoading(false);
    },
    [instanceId],
  );

  const refreshStorageUsage = useCallback(() => {
    api.getStorageUsage().then(r => { if (r.success && r.data) setStorageUsage(r.data); });
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
    setHistory([currentPath]);
    setHistoryIndex(0);
    refreshStorageUsage();
    const iv = setInterval(refreshStorageUsage, 15_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => { loadDirectory(currentPath); refreshStorageUsage(); }, [loadDirectory, currentPath, refreshStorageUsage]);

  const navigateTo = useCallback(
    (path: string) => {
      const newHistory = [...history.slice(0, historyIndex + 1), path];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCurrentPath(path);
      loadDirectory(path);
    },
    [history, historyIndex, loadDirectory],
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(prev);
      loadDirectory(prev);
    }
  }, [history, historyIndex, loadDirectory]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(next);
      loadDirectory(next);
    }
  }, [history, historyIndex, loadDirectory]);

  const goUp = useCallback(() => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  const handleItemClick = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedName(entry.name);
    },
    [],
  );

  const ensureWindowOpen = useWindowStore((s) => s.ensureWindowOpen);
  const openFile = useEditorStore((s) => s.openFile);

  const handleItemDoubleClick = useCallback(
    (entry: FileEntry) => {
      if (renamingName) return;
      if (entry.type === 'directory' || entry.type === 'symlink') {
        navigateTo(joinPath(currentPath, entry.name));
        return;
      }
      if (entry.type === 'file') {
        const fullPath = joinPath(currentPath, entry.name);
        if (isHtmlFile(entry.name)) {
          navigateBrowser(`file://${fullPath}`);
          ensureWindowOpen('browser');
        } else if (isDocumentFile(entry.name)) {
          openDocumentViewer(fullPath);
        } else if (isPreviewable(entry.name)) {
          openPreview(entry.name, fullPath);
        } else if (isTextFile(entry.name)) {
          openFile(fullPath);
        } else {
          // Unsupported binary — open file details window
          openDocumentViewer(fullPath, undefined, { fileSize: entry.size, fileModified: entry.modified });
        }
      }
    },
    [currentPath, navigateTo, navigateBrowser, openFile, renamingName, openPreview],
  );

  // ─── Context menu handlers ──────────────────────────────────────────────

  const handleItemContextMenu = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedName(entry.name);
      setContextMenu({ kind: 'local-item', x: e.clientX, y: e.clientY, entry });
    },
    [],
  );

  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking on background, not on an item
      if ((e.target as HTMLElement).closest('[data-file-entry]')) return;
      e.preventDefault();
      setContextMenu({ kind: 'background', x: e.clientX, y: e.clientY });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleEditFile = useCallback(
    (entry: FileEntry) => {
      const fullPath = joinPath(currentPath, entry.name);
      if (!isTextFile(entry.name)) return; // Don't open binary files in editor
      openFile(fullPath);
      setContextMenu(null);
    },
    [currentPath, openFile],
  );

  const handleStartRename = useCallback(
    (entry: FileEntry) => {
      setRenamingName(entry.name);
      setSelectedName(entry.name);
      setContextMenu(null);
    },
    [],
  );

  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (!instanceId || !renamingName) return;
      const oldPath = joinPath(currentPath, renamingName);
      const newPath = joinPath(currentPath, newName);
      const result = await api.renameItem(instanceId, oldPath, newPath);
      setRenamingName(null);
      if (result.success) {
        setSelectedName(newName);
        refresh();
      }
    },
    [instanceId, currentPath, renamingName, refresh],
  );

  const handleDelete = useCallback(
    async (entry: FileEntry) => {
      if (!instanceId) return;
      setContextMenu(null);
      const fullPath = joinPath(currentPath, entry.name);
      const result = await api.deleteItem(instanceId, fullPath);
      if (result.success) {
        refresh();
      }
    },
    [instanceId, currentPath, refresh],
  );

  const handleNewFile = useCallback(() => {
    setContextMenu(null);
    setCreatingType('file');
  }, []);

  const handleNewFolder = useCallback(() => {
    setContextMenu(null);
    setCreatingType('folder');
  }, []);

  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!instanceId || !creatingType) return;
      const fullPath = joinPath(currentPath, name);
      const result =
        creatingType === 'folder'
          ? await api.createDirectory(instanceId, fullPath)
          : await api.createFile(instanceId, fullPath);
      setCreatingType(null);
      if (result.success) {
        setSelectedName(name);
        refresh();
      }
    },
    [instanceId, currentPath, creatingType, refresh],
  );

  // ─── Cloud context menu + cross-copy handlers ────────────────────────────

  const handleCloudItemContextMenu = useCallback(
    (file: DriveFileEntry, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ kind: 'cloud-item', x: e.clientX, y: e.clientY, file });
    },
    [],
  );

  const handleUploadToCloud = useCallback(
    async (entry: FileEntry) => {
      if (!instanceId) return;
      setContextMenu(null);
      const fullPath = joinPath(currentPath, entry.name);
      await runTransfer(entry.name, 'upload', () => api.copyToDrive(instanceId, fullPath));
    },
    [instanceId, currentPath, runTransfer],
  );

  const handleDownloadToWorkspace = useCallback(
    async (file: DriveFileEntry) => {
      if (!instanceId) return;
      setContextMenu(null);
      const destPath = `/home/sandbox/workspace/${file.name}`;
      await runTransfer(file.name, 'download', () => api.copyToLocal(instanceId, file.id, destPath));
    },
    [instanceId, runTransfer],
  );

  const handleDeleteCloudFile = useCallback(
    async (file: DriveFileEntry) => {
      setContextMenu(null);
      await driveFiles.deleteFile(file.id);
    },
    [driveFiles],
  );

  // ─── Download to user's computer (browser save-as) ──────────────────────

  /** Helper: fetch a Response as a blob and trigger a browser download. */
  const triggerBrowserDownload = useCallback(async (fetchFn: () => Promise<Response>, fileName: string) => {
    try {
      const response = await fetchFn();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      // Clean up after a short delay so the browser has time to start the download
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);
    } catch (err) {
      logger.error('Download failed:', err);
    }
  }, []);

  /** Download a local (container) file to the user's computer. */
  const handleDownloadLocalFile = useCallback(
    async (entry: FileEntry) => {
      if (!instanceId) return;
      setContextMenu(null);
      const fullPath = joinPath(currentPath, entry.name);
      await triggerBrowserDownload(
        () => api.downloadContainerFile(instanceId, fullPath),
        entry.name,
      );
    },
    [instanceId, currentPath, triggerBrowserDownload],
  );

  /** Download a Google Drive file to the user's computer. */
  const handleDownloadCloudFile = useCallback(
    async (file: DriveFileEntry) => {
      setContextMenu(null);
      await triggerBrowserDownload(
        () => api.downloadDriveFile(file.id),
        file.name,
      );
    },
    [triggerBrowserDownload],
  );

  // ─── Drag-and-drop file upload ────────────────────────────────────────────

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only react to external file drags (not internal element drags)
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Set cursor to "copy" for local tab, "none" for cloud tab
    e.dataTransfer.dropEffect = activeTab === 'local' ? 'copy' : 'none';
  }, [activeTab]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    // Only allow drops on the local tab, and only in writable locations
    if (activeTab !== 'local' || !instanceId) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Upload each file sequentially via the transfer tracker
    for (const file of files) {
      const destPath = joinPath(currentPath, file.name);
      await runTransfer(file.name, 'upload', () =>
        api.uploadContainerFile(instanceId, destPath, file),
      );
    }
    // Refresh directory listing to show new files
    refresh();
  }, [activeTab, instanceId, currentPath, runTransfer, refresh]);

  // ─── Keyboard navigation ────────────────────────────────────────────────

  const filesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (renamingName || creatingType) return;
      if (!entries.length) return;

      // Only handle keyboard events when the Files window is focused —
      // ignore if the user is typing in an input, textarea, or a
      // contentEditable element (e.g. chat input, terminal, editor).
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      // Also check that the event target is inside this Files window
      if (filesContainerRef.current && !filesContainerRef.current.contains(target)) return;

      if (e.key === 'Enter' && selectedName) {
        const entry = entries.find((en) => en.name === selectedName);
        if (entry && (entry.type === 'directory' || entry.type === 'symlink')) {
          navigateTo(joinPath(currentPath, entry.name));
        }
        return;
      }
      if (e.key === 'Backspace') {
        goUp();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = entries.findIndex((en) => en.name === selectedName);
        let next: number;
        if (e.key === 'ArrowDown') {
          next = idx < entries.length - 1 ? idx + 1 : 0;
        } else {
          next = idx > 0 ? idx - 1 : entries.length - 1;
        }
        setSelectedName(entries[next].name);
      }
      if (e.key === 'F2' && selectedName && !isReadOnly) {
        const entry = entries.find((en) => en.name === selectedName);
        if (entry) setRenamingName(entry.name);
      }
      if (e.key === 'Delete' && selectedName && !isReadOnly) {
        const entry = entries.find((en) => en.name === selectedName);
        if (entry) handleDelete(entry);
      }
      if (e.key === 'Escape' && previewFile) {
        closePreview();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [entries, selectedName, currentPath, navigateTo, goUp, renamingName, creatingType, handleDelete, previewFile, closePreview]);

  const pathParts = currentPath.split('/').filter(Boolean);

  const sidebarLocations = [
    { label: 'Workspace', path: WORKSPACE_PATH, icon: HardDrive },
  ];

  return (
    <div ref={filesContainerRef} tabIndex={-1} className="relative flex flex-col h-full bg-[var(--color-surface)] text-sm select-none outline-none">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-toolbar)] backdrop-blur-md">
        {/* Mobile sidebar toggle */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-[var(--color-border)]"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        )}
        {activeTab === 'local' ? (
          <>
            <button
              onClick={goBack}
              className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30"
              disabled={historyIndex <= 0}
              title="Back"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <button
              onClick={goForward}
              className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30"
              disabled={historyIndex >= history.length - 1}
              title="Forward"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={goBack}
            className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30"
            disabled={historyIndex <= 0}
            title="Back"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
        )}
        <button
          onClick={activeTab === 'local' ? goUp : driveFiles.goUp}
          className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30"
          disabled={activeTab === 'local' ? currentPath === '/' : driveFiles.folderStack.length <= 1}
          title="Go up"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          onClick={activeTab === 'local' ? refresh : driveFiles.refresh}
          className="p-1 rounded hover:bg-[var(--color-border)]"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Path bar */}
        {activeTab === 'local' ? (
          <div className="flex-1 flex items-center gap-0.5 ml-2 px-2 py-1 bg-[var(--color-surface)] rounded border border-[var(--color-border)] overflow-x-auto text-xs">
            <span
              className="cursor-pointer hover:text-[var(--color-accent)] flex-shrink-0 font-medium"
              onClick={() => navigateTo('/')}
            >
              Workspace
            </span>
            {pathParts.map((part, i) => {
              const fullPath = '/' + pathParts.slice(0, i + 1).join('/');
              return (
                <span key={fullPath} className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
                  <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />
                  <span
                    className="cursor-pointer hover:text-[var(--color-accent)]"
                    onClick={() => navigateTo(fullPath)}
                  >
                    {part}
                  </span>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-0.5 ml-2 px-2 py-1 bg-[var(--color-surface)] rounded border border-[var(--color-border)] overflow-x-auto text-xs text-[var(--color-text-muted)]">
            {driveFiles.folderStack.map((folder, i) => (
              <span key={folder.id} className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />}
                <span className="cursor-default">{folder.name}</span>
              </span>
            ))}
            {driveFiles.folderStack.length === 0 && <span>Cloud</span>}
          </div>
        )}

        {activeTab === 'cloud' && driveSync.status.connected && instanceId && (
          <button
            onClick={driveSync.sync}
            disabled={driveSync.isSyncing}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-[var(--color-border)] disabled:opacity-50"
            title="Sync workspace with Drive"
          >
            <RefreshCw className={`w-3 h-3 ${driveSync.isSyncing ? 'animate-spin' : ''}`} />
            Sync
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — always visible on desktop, togglable drawer on mobile */}
        {(!isMobile || sidebarOpen) && (
        <div className={`border-r border-[var(--color-border)] p-2 bg-[var(--color-sidebar)] flex-shrink-0 overflow-y-auto ${
          isMobile ? 'absolute inset-y-0 left-0 z-20 w-56 shadow-lg' : 'w-48'
        }`}>
          <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Local Storage
          </div>
          {storageUsage && (
            <div className="mb-2 px-1">
              <div className="h-1 rounded-full bg-black/10 dark:bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    storageUsage.bytesUsed / storageUsage.maxBytes >= 0.9 ? 'bg-red-500' : 'bg-[var(--color-accent)]'
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, (storageUsage.bytesUsed / storageUsage.maxBytes) * 100))}%` }}
                />
              </div>
              <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                {formatSize(storageUsage.bytesUsed)} / {formatSize(storageUsage.maxBytes)}
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            {sidebarLocations.map(({ label, path, icon: Icon }) => (
              <div
                key={path}
                className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                  activeTab === 'local' && currentPath === path
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'hover:bg-[var(--color-accent-muted)]'
                }`}
                onClick={() => { closePreview(); setActiveTab('local'); navigateTo(path); }}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mt-4 mb-2">
            Cloud Storage
          </div>
          <div className="space-y-0.5">
            {driveSync.status.connected ? (
              <div
                className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                  activeTab === 'cloud'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'hover:bg-[var(--color-accent-muted)]'
                }`}
                onClick={() => {
                  closePreview();
                  setActiveTab('cloud');
                  driveFiles.resetToRoot();
                }}
              >
                <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">Google Drive</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer hover:bg-[var(--color-accent-muted)] text-[var(--color-text-muted)]"
                onClick={driveSync.isConnecting ? undefined : driveSync.connect}
                title="Connect Google Drive"
                style={driveSync.isConnecting ? { opacity: 0.7, cursor: 'wait' } : undefined}
              >
                {driveSync.isConnecting ? (
                  <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className="truncate">{driveSync.isConnecting ? 'Connecting...' : 'Connect Drive'}</span>
              </div>
            )}
          </div>
        </div>
        )}
        {/* Mobile sidebar backdrop */}
        {isMobile && sidebarOpen && (
          <div className="absolute inset-0 z-10 bg-black/20" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main file list */}
        <div
          className="flex-1 flex flex-col min-w-0 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Column headers (shared) */}
          <div className="flex items-center px-3 py-1 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)] font-medium">
            <div className="flex-1 min-w-0">Name</div>
            <div className="w-20 text-right flex-shrink-0">Size</div>
            <div className="w-32 text-right flex-shrink-0">Modified</div>
          </div>

          {/* File list + preview split area */}
          <div className={`flex-1 flex min-h-0 ${previewFile ? '' : 'flex-col'}`}>
            {/* File list panel */}
            {activeTab === 'local' ? (
              <div
                className={`${previewFile ? 'w-1/2 border-r border-[var(--color-border)]' : 'flex-1'} overflow-y-auto`}
                onClick={() => {
                  setSelectedName(null);
                  setContextMenu(null);
                }}
                onContextMenu={handleBackgroundContextMenu}
              >
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-[var(--color-text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs">Loading...</span>
                  </div>
                ) : error ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-red-400 mb-2">{error}</p>
                    <button
                      className="text-xs text-[var(--color-accent)] hover:underline"
                      onClick={refresh}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {entries.length === 0 && !creatingType && (
                      <div className="p-8 text-center text-[var(--color-text-muted)] text-xs">
                        This folder is empty
                      </div>
                    )}
                    {entries.map((entry) => {
                      const isSelected = selectedName === entry.name;
                      const isRenaming = renamingName === entry.name;
                      const Icon = getFileIcon(entry);

                      // Check if this directory is a local app with a custom icon
                      const isAppFolder = entry.type === 'directory' && (currentPath === '/apps/' || currentPath === '/apps');
                      const appIconUrl = isAppFolder
                        ? localAppIcons.get(entry.name)
                        : undefined;

                      return (
                        <div
                          key={entry.name}
                          data-file-entry
                          className={`flex items-center px-3 py-[3px] cursor-default ${
                            isSelected
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'hover:bg-[var(--color-accent-muted)]'
                          }`}
                          onClick={(e) => handleItemClick(entry, e)}
                          onDoubleClick={() => handleItemDoubleClick(entry)}
                          onContextMenu={(e) => handleItemContextMenu(entry, e)}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {appIconUrl ? (
                              <img src={appIconUrl} alt="" className="w-4 h-4 flex-shrink-0 rounded-[2px]" />
                            ) : (
                            <Icon
                              className={`w-4 h-4 flex-shrink-0 ${
                                isSelected
                                  ? 'text-white/80'
                                  : entry.type === 'directory'
                                    ? 'text-[var(--color-accent)]'
                                    : 'text-[var(--color-text-muted)]'
                              }`}
                            />
                            )}
                            {isRenaming ? (
                              <InlineNameInput
                                defaultValue={entry.name}
                                onSubmit={handleRenameSubmit}
                                onCancel={() => setRenamingName(null)}
                              />
                            ) : (
                              <span className="truncate text-xs">{entry.name}</span>
                            )}
                          </div>
                          <div
                            className={`w-20 text-right text-[11px] flex-shrink-0 ${
                              isSelected ? 'text-white/70' : 'text-[var(--color-text-muted)]'
                            }`}
                          >
                            {entry.size > 0 ? formatSize(entry.size) : '--'}
                          </div>
                          <div
                            className={`w-32 text-right text-[11px] flex-shrink-0 ${
                              isSelected ? 'text-white/70' : 'text-[var(--color-text-muted)]'
                            }`}
                          >
                            {formatDate(entry.modified)}
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline new file/folder input */}
                    {creatingType && (
                      <div className="flex items-center px-3 py-[3px] bg-[var(--color-accent-muted)]">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {creatingType === 'folder' ? (
                            <Folder className="w-4 h-4 flex-shrink-0 text-[var(--color-accent)]" />
                          ) : (
                            <File className="w-4 h-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                          )}
                          <InlineNameInput
                            defaultValue={creatingType === 'folder' ? 'new-folder' : 'new-file.txt'}
                            onSubmit={handleCreateSubmit}
                            onCancel={() => setCreatingType(null)}
                          />
                        </div>
                        <div className="w-20 flex-shrink-0" />
                        <div className="w-32 flex-shrink-0" />
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              /* ── Cloud (Google Drive) file list ── */
              <div
                className={`${previewFile ? 'w-1/2 border-r border-[var(--color-border)]' : 'flex-1'} overflow-y-auto`}
                onClick={() => driveFiles.clearSelection()}
              >
                {driveFiles.isLoading ? (
                  <div className="flex items-center justify-center h-32 text-[var(--color-text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-xs">Loading Drive files...</span>
                  </div>
                ) : driveFiles.error ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-red-400 mb-2">{driveFiles.error}</p>
                    <button
                      className="text-xs text-[var(--color-accent)] hover:underline"
                      onClick={driveFiles.refresh}
                    >
                      Retry
                    </button>
                  </div>
                ) : driveFiles.files.length === 0 ? (
                  <div className="p-8 text-center text-[var(--color-text-muted)] text-xs">
                    No files in this folder
                  </div>
                ) : (
                  driveFiles.files.map((file) => {
                    const isSelected = driveFiles.selectedFile?.id === file.id;
                    const Icon = file.type === 'directory' ? Folder
                      : getFileIcon({ name: file.name, type: 'file', size: file.size, modified: file.modified || '' });
                    return (
                      <div
                        key={file.id}
                        className={`flex items-center px-3 py-[3px] cursor-default ${
                          isSelected
                            ? 'bg-[var(--color-accent)] text-white'
                            : 'hover:bg-[var(--color-accent-muted)]'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          driveFiles.navigateInto(file);
                        }}
                        onDoubleClick={async () => {
                          if (file.type === 'directory') {
                            driveFiles.navigateInto(file);
                          } else if (isDocumentFile(file.name)) {
                            openCloudDocumentViewer(file.id, file.name);
                          } else if (isPreviewable(file.name)) {
                            openCloudPreview(file.name, file.id);
                          } else {
                            // Unsupported — open file details window
                            openCloudDocumentViewer(file.id, file.name, undefined, { fileSize: file.size, fileModified: file.modified });
                          }
                        }}
                        onContextMenu={(e) => handleCloudItemContextMenu(file, e)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 ${
                              isSelected
                                ? 'text-white/80'
                                : file.type === 'directory'
                                  ? 'text-[var(--color-accent)]'
                                  : 'text-[var(--color-text-muted)]'
                            }`}
                          />
                          <span className="truncate text-xs">{file.name}</span>
                        </div>
                        <div
                          className={`w-20 text-right text-[11px] flex-shrink-0 ${
                            isSelected ? 'text-white/70' : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {file.size > 0 ? driveFiles.formatSize(file.size) : '--'}
                        </div>
                        <div
                          className={`w-32 text-right text-[11px] flex-shrink-0 ${
                            isSelected ? 'text-white/70' : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {file.modified ? formatDate(file.modified) : '--'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Preview panel (shared — renders for both local and cloud tabs) */}
            {previewFile && (
              <div className="w-1/2 flex flex-col bg-[var(--color-surface)] overflow-hidden">
                {/* Preview header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                  <span className="text-xs truncate text-[var(--color-text-muted)]">{previewFile.name}</span>
                  <button
                    onClick={closePreview}
                    className="p-0.5 rounded hover:bg-[var(--color-border)] flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Preview content */}
                <div className="flex-1 flex items-center justify-center overflow-auto p-4">
                  {previewLoading ? (
                    <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs">Loading preview...</span>
                    </div>
                  ) : previewBlobUrl ? (
                    <>
                      {previewFile.category === 'image' && (
                        <img
                          src={previewBlobUrl}
                          alt={previewFile.name}
                          className="max-w-full max-h-full object-contain rounded"
                          draggable={false}
                        />
                      )}
                      {previewFile.category === 'audio' && (
                        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                          <FileAudio className="w-16 h-16 text-[var(--color-text-muted)]" />
                          <span className="text-xs text-[var(--color-text-muted)] truncate max-w-full">{previewFile.name}</span>
                          <audio
                            src={previewBlobUrl}
                            controls
                            className="w-full"
                            controlsList="nodownload"
                          />
                        </div>
                      )}
                      {previewFile.category === 'video' && (
                        <video
                          src={previewBlobUrl}
                          controls
                          className="max-w-full max-h-full rounded"
                          controlsList="nodownload"
                        />
                      )}
                      {previewFile.category === 'pdf' && (
                        <iframe
                          src={previewBlobUrl}
                          title={previewFile.name}
                          className="w-full h-full border-0 rounded"
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">Failed to load preview</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Transfer progress bar */}
          {transfers.length > 0 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-1">
                  {t.status === 'active' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)] flex-shrink-0" />
                  ) : t.status === 'done' ? (
                    <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                  )}
                  {t.direction === 'upload' ? (
                    <CloudUpload className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
                  ) : (
                    <CloudDownload className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
                  )}
                  <span className="text-[11px] truncate flex-1 text-[var(--color-text-muted)]">
                    {t.status === 'active'
                      ? `${t.direction === 'upload' ? 'Uploading' : 'Downloading'} ${t.name}...`
                      : t.status === 'done'
                        ? `${t.name} — ${t.direction === 'upload' ? 'uploaded' : 'downloaded'}`
                        : `${t.name} — failed`}
                  </span>
                  {t.status === 'active' && (
                    <div className="w-24 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-[var(--color-accent)] rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Status bar (tab-specific) */}
          {activeTab === 'local' ? (
            <div className="flex items-center px-3 py-1 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)]">
              <span>
                {entries.length} item{entries.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowHidden((v) => !v)}
                className="flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded hover:bg-[var(--color-border)] transition-colors"
                title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
              >
                {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{showHidden ? 'Hide dotfiles' : 'Show dotfiles'}</span>
              </button>
              {selectedName && <span className="ml-auto">{selectedName}</span>}
            </div>
          ) : (
            <div className="flex items-center px-3 py-1 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)]">
              <Cloud className="w-3 h-3 mr-1" />
              <span>
                {driveFiles.files.length} item{driveFiles.files.length !== 1 ? 's' : ''}
              </span>
              {driveFiles.isSilentRefreshing && (
                <Loader2 className="w-3 h-3 ml-2 animate-spin" />
              )}
              {driveSync.status.connected && (
                <span className="ml-2 text-[var(--color-text-muted)]">Connected</span>
              )}
              {driveSync.lastReport && (
                <span className="ml-auto">
                  Last sync: {driveSync.lastReport.downloaded.length} down, {driveSync.lastReport.uploaded.length} up
                </span>
              )}
            </div>
          )}

          {/* Drag-and-drop overlay (scoped to the file list area) */}
          {isDraggingOver && (
            activeTab === 'local' && !isReadOnly ? (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-accent)]/10 backdrop-blur-[2px] border-2 border-dashed border-[var(--color-accent)] rounded-lg pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-[var(--color-accent)]">
                  <Upload className="w-10 h-10" />
                  <span className="text-sm font-medium">Drop files to upload</span>
                  <span className="text-xs text-[var(--color-text-muted)]">Files will be uploaded to {currentPath.split('/').pop() || '/'}</span>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-500/10 backdrop-blur-[2px] border-2 border-dashed border-red-400 rounded-lg pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-red-400">
                  <AlertCircle className="w-10 h-10" />
                  <span className="text-sm font-medium">Cannot upload here</span>
                  <span className="text-xs text-red-400/70">Drop files in the local file system instead</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Context menu (portal — shared by local and cloud tabs) */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={closeContextMenu}
          onEditFile={handleEditFile}
          onRename={handleStartRename}
          onDelete={handleDelete}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onUploadToCloud={handleUploadToCloud}
          onDownloadLocalFile={handleDownloadLocalFile}
          onDownloadToWorkspace={handleDownloadToWorkspace}
          onDownloadCloudFile={handleDownloadCloudFile}
          onDeleteCloudFile={handleDeleteCloudFile}
          driveConnected={driveSync.status.connected}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}
