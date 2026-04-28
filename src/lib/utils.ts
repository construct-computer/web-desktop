import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  getFileType,
  getViewerDocType,
  isTextLikeFile,
  isViewerFile,
  type ViewerDocType,
} from './fileTypes';

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

export function isTextFile(filePathOrName: string): boolean {
  return isTextLikeFile(filePathOrName);
}

/** Returns true if the file should be opened in the document viewer. */
export function isDocumentFile(filePathOrName: string): boolean {
  return isViewerFile(filePathOrName);
}

/** Returns the document type category for the viewer. */
export function getDocumentType(filePathOrName: string): ViewerDocType {
  return getViewerDocType(filePathOrName);
}

export { getFileType };

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


