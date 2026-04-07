/**
 * FilesScreen -- Mobile file browser for the Telegram Mini App.
 * Browse, upload, download, delete, rename, create folders, preview files.
 * Uses shared UI components and includes file preview + storage usage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, FileText, Image, Film, Music, Archive, Code,
  ChevronRight, Upload, Download, Trash2, FolderPlus, Pencil, Search,
  MoreHorizontal, X, Eye, HardDrive, RefreshCw, EyeOff,
} from 'lucide-react';
import {
  MiniHeader, Card, IconBtn, Spinner, SkeletonList, EmptyState,
  ConfirmDialog, useToast, haptic,
  api, apiJSON, accent, textColor, bg, bg2,
} from '../ui';

// -- File type helpers --

const FILE_ICONS: Record<string, typeof FileText> = {
  image: Image, video: Film, audio: Music, archive: Archive, code: Code,
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'csv', 'xml', 'html', 'css',
  'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh',
  'env', 'log', 'ini', 'cfg', 'conf',
]);

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function getFileIcon(name: string) {
  const ext = getExt(name);
  if (IMAGE_EXTS.has(ext)) return FILE_ICONS.image;
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return FILE_ICONS.video;
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return FILE_ICONS.audio;
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FILE_ICONS.archive;
  if (TEXT_EXTS.has(ext)) return FILE_ICONS.code;
  return FileText;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isImageFile(name: string) { return IMAGE_EXTS.has(getExt(name)); }
function isTextFile(name: string) { return TEXT_EXTS.has(getExt(name)); }

function formatModified(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function getDownloadUrl(filePath: string): string {
  const token = localStorage.getItem('construct:token');
  return `/api/files/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`;
}

// -- Types --

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface StorageUsage {
  used: number;
  total: number;
}

// -- Main Component --

export function FilesScreen() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextEntry, setContextEntry] = useState<FileEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null);
  const [preview, setPreview] = useState<{ name: string; type: 'image' | 'text'; content?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [showDotfiles, setShowDotfiles] = useState(false);

  const toast = useToast();

  // -- Data fetching --

  const fetchFiles = useCallback(async (p: string) => {
    setLoading(true);
    const data = await apiJSON<any>(`/files?path=${encodeURIComponent(p)}`);
    setEntries(data?.entries || []);
    setLoading(false);
  }, []);

  const fetchUsage = useCallback(async () => {
    const data = await apiJSON<StorageUsage>('/files/usage');
    if (data) setUsage(data);
  }, []);

  useEffect(() => { fetchFiles(path); }, [path, fetchFiles]);
  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // -- Navigation --

  const navigateTo = (name: string) => {
    setPath(prev => prev ? `${prev}/${name}` : name);
    setContextEntry(null);
  };

  const navigateUp = () => {
    setPath(prev => {
      const parts = prev.split('/').filter(Boolean);
      parts.pop();
      return parts.join('/');
    });
  };

  // -- File actions --

  const resolvePath = (name: string) => path ? `${path}/${name}` : name;

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      haptic();
      const res = await api(`/files/upload?path=${encodeURIComponent(resolvePath(file.name))}`, {
        method: 'POST',
        body: await file.arrayBuffer(),
      });
      if (res.ok) {
        toast.show('File uploaded', 'success');
        haptic('success');
        fetchFiles(path);
        fetchUsage();
      } else {
        toast.show('Upload failed', 'error');
        haptic('error');
      }
      setUploading(false);
    };
    input.click();
  };

  const handleDownload = (name: string) => {
    window.open(getDownloadUrl(resolvePath(name)), '_blank');
  };

  const handleDelete = async (entry: FileEntry) => {
    const res = await api('/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: resolvePath(entry.name) }),
    });
    if (res.ok) {
      haptic('success');
      toast.show(`${entry.name} deleted`, 'success');
      fetchFiles(path);
      fetchUsage();
    } else {
      haptic('error');
      toast.show('Delete failed', 'error');
    }
    setConfirmDelete(null);
    setContextEntry(null);
  };

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue === oldName) { setRenaming(null); return; }
    const res = await api('/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: resolvePath(oldName), newPath: resolvePath(renameValue.trim()) }),
    });
    if (res.ok) {
      haptic('success');
      toast.show('Renamed', 'success');
      fetchFiles(path);
    } else {
      haptic('error');
      toast.show('Rename failed', 'error');
    }
    setRenaming(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) { setShowNewFolder(false); return; }
    const res = await api('/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: resolvePath(newFolderName.trim()) }),
    });
    if (res.ok) {
      haptic('success');
      toast.show('Folder created', 'success');
      fetchFiles(path);
    } else {
      haptic('error');
      toast.show('Failed to create folder', 'error');
    }
    setShowNewFolder(false);
    setNewFolderName('');
  };

  // -- Preview --

  const openPreview = async (entry: FileEntry) => {
    if (isImageFile(entry.name)) {
      const url = getDownloadUrl(resolvePath(entry.name));
      setPreview({ name: entry.name, type: 'image', content: url });
    } else if (isTextFile(entry.name)) {
      setPreviewLoading(true);
      setPreview({ name: entry.name, type: 'text', content: '' });
      const data = await apiJSON<any>(`/files/read?path=${encodeURIComponent(resolvePath(entry.name))}`);
      setPreview({ name: entry.name, type: 'text', content: data?.content ?? 'Unable to read file' });
      setPreviewLoading(false);
    } else {
      handleDownload(entry.name);
    }
  };

  const handleFileTap = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      navigateTo(entry.name);
    } else if (isImageFile(entry.name) || isTextFile(entry.name)) {
      openPreview(entry);
    } else {
      handleDownload(entry.name);
    }
  };

  // -- Filtering and sorting --

  const visible = showDotfiles ? entries : entries.filter(e => !e.name.startsWith('.'));
  const dirs = visible.filter(e => e.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));
  const files = visible.filter(e => e.type === 'file').sort((a, b) => a.name.localeCompare(b.name));
  let sorted = [...dirs, ...files];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    sorted = sorted.filter(e => e.name.toLowerCase().includes(q));
  }

  const breadcrumbs = ['Home', ...path.split('/').filter(Boolean)];

  // -- Render --

  return (
    <div className="flex flex-col h-full" onClick={() => setContextEntry(null)}>
      {/* Header */}
      <MiniHeader
        title="Files"
        onBack={path ? navigateUp : undefined}
        actions={
          <>
            <IconBtn onClick={() => { fetchFiles(path); fetchUsage(); haptic(); }}>
              <RefreshCw size={15} className="opacity-40" />
            </IconBtn>
            <IconBtn onClick={() => { setShowDotfiles(d => !d); haptic(); }}>
              {showDotfiles ? <Eye size={15} className="opacity-50" /> : <EyeOff size={15} className="opacity-30" />}
            </IconBtn>
            <IconBtn onClick={() => { setShowSearch(!showSearch); haptic(); }}>
              <Search size={16} className="opacity-50" />
            </IconBtn>
            <IconBtn onClick={() => { setShowNewFolder(true); setNewFolderName(''); haptic(); }}>
              <FolderPlus size={16} className="opacity-50" />
            </IconBtn>
            <IconBtn onClick={handleUpload} disabled={uploading}>
              {uploading ? <Spinner size={16} /> : <Upload size={16} className="opacity-50" />}
            </IconBtn>
          </>
        }
      />

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 px-4 py-1.5 overflow-x-auto shrink-0 no-scrollbar" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight size={10} className="opacity-20" />}
            <button
              onClick={() => {
                if (i === 0) setPath('');
                else setPath(path.split('/').filter(Boolean).slice(0, i).join('/'));
              }}
              className={`text-[12px] ${i === breadcrumbs.length - 1 ? 'font-medium opacity-70' : 'opacity-30'}`}
              style={{ color: textColor() }}
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter files..."
            className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
            style={{ backgroundColor: bg2(), color: textColor() }}
          />
        </div>
      )}

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <FolderOpen size={16} className="text-blue-400 shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            placeholder="Folder name"
            className="flex-1 text-[13px] px-2 py-1.5 rounded-lg outline-none"
            style={{ backgroundColor: bg2(), color: textColor() }}
          />
          <button
            onClick={handleCreateFolder}
            className="text-[12px] font-medium px-2 py-1 rounded-lg"
            style={{ backgroundColor: accent(), color: '#fff' }}
          >
            Create
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList count={6} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={FolderOpen} message={searchQuery ? 'No matches' : 'Empty folder'} />
        ) : (
          sorted.map(entry => {
            const isDir = entry.type === 'directory';
            const Icon = isDir ? FolderOpen : getFileIcon(entry.name);
            const isContext = contextEntry?.name === entry.name;
            const canPreview = !isDir && (isImageFile(entry.name) || isTextFile(entry.name));

            return (
              <div key={entry.name} className="relative">
                <button
                  onClick={() => handleFileTap(entry)}
                  className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5 transition-colors text-left"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  {/* Icon / inline image thumbnail */}
                  {!isDir && isImageFile(entry.name) ? (
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                      <img
                        src={getDownloadUrl(resolvePath(entry.name))}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <Icon size={20} className={isDir ? 'text-blue-400' : 'opacity-40'} />
                  )}

                  <div className="flex-1 min-w-0">
                    {renaming === entry.name ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(entry.name); if (e.key === 'Escape') setRenaming(null); }}
                        onBlur={() => handleRename(entry.name)}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-[14px] bg-transparent outline-none border-b"
                        style={{ color: textColor(), borderColor: accent() }}
                      />
                    ) : (
                      <p className="text-[14px] truncate" style={{ color: textColor() }}>{entry.name}</p>
                    )}
                    {!isDir && (
                      <p className="text-[11px] opacity-30">
                        {formatSize(entry.size)}
                        {entry.modified && <> · {formatModified(entry.modified)}</>}
                      </p>
                    )}
                    {isDir && entry.modified && (
                      <p className="text-[11px] opacity-20">{formatModified(entry.modified)}</p>
                    )}
                  </div>

                  {/* Preview indicator */}
                  {canPreview && (
                    <Eye size={13} className="opacity-15 shrink-0" />
                  )}

                  {/* Context menu toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); haptic(); setContextEntry(isContext ? null : entry); }}
                    className="p-1 rounded-lg opacity-20 active:opacity-60 shrink-0"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </button>

                {/* Inline context actions */}
                {isContext && (
                  <div
                    className="absolute right-3 top-1 z-20 rounded-xl overflow-hidden border border-white/10 min-w-[130px]"
                    style={{ backgroundColor: bg(), boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {!isDir && (
                      <button
                        onClick={() => { handleDownload(entry.name); setContextEntry(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] active:bg-white/5"
                        style={{ color: textColor() }}
                      >
                        <Download size={14} className="opacity-50" /> Download
                      </button>
                    )}
                    {canPreview && (
                      <button
                        onClick={() => { openPreview(entry); setContextEntry(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] active:bg-white/5"
                        style={{ color: textColor() }}
                      >
                        <Eye size={14} className="opacity-50" /> Preview
                      </button>
                    )}
                    <button
                      onClick={() => { setRenaming(entry.name); setRenameValue(entry.name); setContextEntry(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] active:bg-white/5"
                      style={{ color: textColor() }}
                    >
                      <Pencil size={14} className="opacity-50" /> Rename
                    </button>
                    <button
                      onClick={() => { haptic(); setConfirmDelete(entry); setContextEntry(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-red-400 active:bg-red-500/10"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Storage usage bar */}
      {usage && (
        <div className="px-4 py-2.5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <HardDrive size={13} className="opacity-30 shrink-0" />
            <div className="flex-1">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(1, Math.min(100, (usage.used / usage.total) * 100))}%`,
                    backgroundColor: (usage.used / usage.total) > 0.85 ? '#f87171' : accent(),
                  }}
                />
              </div>
            </div>
            <span className="text-[11px] opacity-30 shrink-0">
              {formatSize(usage.used)} / {formatSize(usage.total)}
            </span>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          message={confirmDelete.type === 'directory' ? 'This will delete the folder and all its contents.' : 'This file will be permanently deleted.'}
          confirmLabel="Delete"
          destructive
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* File preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
          {/* Preview header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: bg() }}>
            <p className="text-[14px] font-medium truncate flex-1" style={{ color: textColor() }}>{preview.name}</p>
            <div className="flex items-center gap-1 shrink-0">
              <IconBtn onClick={() => handleDownload(preview.name)}>
                <Download size={16} className="opacity-50" />
              </IconBtn>
              <IconBtn onClick={() => setPreview(null)}>
                <X size={16} className="opacity-50" />
              </IconBtn>
            </div>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Spinner size={24} />
              </div>
            ) : preview.type === 'image' ? (
              <div className="flex items-center justify-center h-full p-4">
                <img
                  src={preview.content}
                  alt={preview.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <pre
                className="text-[12px] leading-relaxed p-4 overflow-auto whitespace-pre-wrap break-words"
                style={{ color: textColor(), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace' }}
              >
                {preview.content}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
