import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format a date for display
 */
export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date for display
 */
export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString([], { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Returns true if the file at the given path/name is likely a text file.
 * Uses a blocklist of known binary extensions — anything not in the list is
 * assumed to be text.  This is the single source of truth; used by both the
 * agent store (to decide whether to open a file in the editor) and the Files
 * window (to decide double-click behaviour).
 */
const BINARY_EXTENSIONS = new Set([
  // Office / document formats
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odt', 'ods', 'odp',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tiff', 'tif',
  'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'heic', 'heif', 'avif',
  // Audio
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'mid', 'midi',
  // Video
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'ogv', 'm4v',
  // Archives
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst',
  // Executables / binaries
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'pyc', 'wasm',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Databases
  'db', 'sqlite', 'sqlite3',
  // Misc binary
  'iso', 'dmg', 'img', 'dat',
]);

export function isTextFile(filePathOrName: string): boolean {
  const name = filePathOrName.split('/').pop() ?? filePathOrName;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return !BINARY_EXTENSIONS.has(ext);
}

/** Document file extensions that should open in the document viewer. */
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'docx', 'doc', 'odt',
  'xlsx', 'xls', 'ods', 'csv',
  'pptx', 'ppt', 'odp',
  'md', 'markdown', 'mdx',
]);

/** Image extensions that should open in the document viewer. */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif', 'heic', 'heif',
]);

/** Returns true if the file should be opened in the document viewer. */
export function isDocumentFile(filePathOrName: string): boolean {
  const ext = (filePathOrName.split('/').pop() ?? filePathOrName).split('.').pop()?.toLowerCase() ?? '';
  return DOCUMENT_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
}

/** Returns the document type category for the viewer. */
export function getDocumentType(filePathOrName: string): 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'csv' | 'markdown' | 'html' | 'text' | 'unknown' {
  const ext = (filePathOrName.split('/').pop() ?? filePathOrName).split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc', 'odt'].includes(ext)) return 'docx';
  if (['xlsx', 'xls', 'ods'].includes(ext)) return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (['pptx', 'ppt', 'odp'].includes(ext)) return 'pptx';
  if (['md', 'markdown', 'mdx'].includes(ext)) return 'markdown';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'unknown';
}

/**
 * Open a URL in a centered popup window (for OAuth flows like Slack).
 * Returns the popup Window reference, or null if blocked.
 */
export function openAuthPopup(url: string, width = 520, height = 700): Window | null {
  const left = Math.max(0, Math.round((screen.width - width) / 2));
  const top = Math.max(0, Math.round((screen.height - height) / 2));
  return window.open(
    url,
    'construct_auth',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
  );
}

/**
 * Open an auth URL in a popup window (for Composio / Slack OAuth flows).
 * The OAuth callback page closes the popup automatically via window.close().
 * Falls back to same-tab redirect if popup is blocked.
 */
export function openAuthRedirect(url: string): void {
  const popup = openAuthPopup(url);
  if (!popup) {
    // Popup blocked — fall back to full-page redirect
    window.location.href = url;
  }
}


