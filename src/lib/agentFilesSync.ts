import { dispatchAgentFilesNavigate } from '@/lib/agentUiEvents';
import { getFileType } from '@/lib/fileTypes';
import { isSavedWorkspacePath, normalizeWorkspacePath, parentWorkspaceFolder } from '@/lib/workspacePaths';
import { useWindowStore } from '@/stores/windowStore';

/** Media files that should open the Files inline preview panel (not Document Viewer). */
export function isAgentFilesInlinePreviewPath(path: string): boolean {
  const renderer = getFileType(path)?.renderer;
  return renderer === 'image' || renderer === 'audio' || renderer === 'video';
}

export function syncAgentFilesLocation(
  rawPath: string,
  workspaceId: string,
  opts?: { openPreview?: boolean },
): void {
  if (!isSavedWorkspacePath(rawPath)) return;

  const filePath = normalizeWorkspacePath(rawPath.replace(/^\/mnt\/saved\/?/, ''));
  if (!filePath) return;

  const folderPath = parentWorkspaceFolder(filePath);
  useWindowStore.getState().ensureWindowOpen('files', workspaceId);
  dispatchAgentFilesNavigate({
    folderPath,
    filePath,
    openPreview: opts?.openPreview,
    highlight: true,
  });
}

export function syncAgentFilesFromToolArgs(
  args: Record<string, unknown> | undefined,
  workspaceId: string,
): void {
  const rawPath = (args?.path ?? args?.save_path) as string | undefined;
  if (!rawPath) return;
  syncAgentFilesLocation(rawPath, workspaceId, {
    openPreview: isAgentFilesInlinePreviewPath(rawPath),
  });
}
