/**
 * Upload attachment with SHA-256 dedup.
 *
 * Files are stored at /home/sandbox/workspace/uploads/<hash12>_<filename>.
 * Before uploading, we hash the file client-side and check if it already
 * exists in the container to avoid duplicate uploads.
 */

import { checkFileExists, uploadContainerFile, createDirectory } from '@/services/api';

const UPLOADS_DIR = '/home/sandbox/workspace/uploads';

/** Ensure the uploads directory exists (idempotent). */
let ensuredDir = false;
async function ensureUploadsDir(instanceId: string) {
  if (ensuredDir) return;
  await createDirectory(instanceId, UPLOADS_DIR);
  ensuredDir = true;
}

/** Reset the cached "dir exists" flag (e.g. on instance change). */
export function resetUploadsDirCache() {
  ensuredDir = false;
}

/** Compute SHA-256 of a File using Web Crypto API. Returns hex string. */
async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Sanitize filename — replace spaces and special chars. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export interface UploadResult {
  /** Full path inside the container */
  path: string;
  /** Original filename */
  name: string;
  /** True if the file already existed (dedup hit) */
  deduplicated: boolean;
}

/**
 * Upload a file to the container's workspace/uploads/ directory.
 * Deduplicates by SHA-256 hash prefix + filename.
 */
export async function uploadAttachment(
  instanceId: string,
  file: File,
): Promise<UploadResult> {
  await ensureUploadsDir(instanceId);

  const hash = await computeSHA256(file);
  const hashPrefix = hash.slice(0, 12);
  const safeName = sanitizeName(file.name);
  const targetPath = `${UPLOADS_DIR}/${hashPrefix}_${safeName}`;

  // Check if file already exists (dedup)
  const existsResult = await checkFileExists(instanceId, targetPath);
  if (existsResult.success && existsResult.data?.exists) {
    return { path: targetPath, name: file.name, deduplicated: true };
  }

  // Upload the file
  const uploadResult = await uploadContainerFile(instanceId, targetPath, file);
  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Upload failed');
  }

  return { path: targetPath, name: file.name, deduplicated: false };
}
