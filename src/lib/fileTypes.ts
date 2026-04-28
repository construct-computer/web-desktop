export type ViewerDocType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'tsv'
  | 'image'
  | 'markdown'
  | 'html'
  | 'json'
  | 'diagram'
  | 'excalidraw'
  | 'audio'
  | 'video'
  | 'archive'
  | 'convertible'
  | 'text'
  | 'unknown';

export type FileOpenMode = 'viewer' | 'editor' | 'browser' | 'details';

export type FileRenderer =
  | ViewerDocType
  | 'monaco'
  | 'details';

export interface FileTypeDefinition {
  id: string;
  label: string;
  extensions: string[];
  category:
    | 'document'
    | 'spreadsheet'
    | 'presentation'
    | 'image'
    | 'diagram'
    | 'data'
    | 'media'
    | 'archive'
    | 'code'
    | 'unknown';
  openMode: FileOpenMode;
  renderer: FileRenderer;
  editable?: boolean;
  conversionTarget?: 'pdf-pages' | 'image';
  binary?: boolean;
}

export const FILE_TYPE_REGISTRY: FileTypeDefinition[] = [
  { id: 'pdf', label: 'PDF', extensions: ['pdf'], category: 'document', openMode: 'viewer', renderer: 'pdf', binary: true },
  { id: 'docx', label: 'Word Document', extensions: ['docx'], category: 'document', openMode: 'viewer', renderer: 'docx', binary: true },
  { id: 'office-doc-convertible', label: 'Word/OpenDocument/RTF', extensions: ['doc', 'odt', 'rtf'], category: 'document', openMode: 'viewer', renderer: 'convertible', conversionTarget: 'pdf-pages', binary: true },
  { id: 'xlsx', label: 'Spreadsheet', extensions: ['xlsx', 'xls', 'ods'], category: 'spreadsheet', openMode: 'viewer', renderer: 'xlsx', binary: true },
  { id: 'csv', label: 'CSV', extensions: ['csv'], category: 'data', openMode: 'viewer', renderer: 'csv', editable: true },
  { id: 'tsv', label: 'TSV', extensions: ['tsv'], category: 'data', openMode: 'viewer', renderer: 'tsv', editable: true },
  { id: 'pptx', label: 'PowerPoint', extensions: ['pptx'], category: 'presentation', openMode: 'viewer', renderer: 'pptx', binary: true },
  { id: 'slides-convertible', label: 'Legacy/OpenDocument Slides', extensions: ['ppt', 'odp'], category: 'presentation', openMode: 'viewer', renderer: 'convertible', conversionTarget: 'pdf-pages', binary: true },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown', 'mdx'], category: 'document', openMode: 'viewer', renderer: 'markdown', editable: true },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], category: 'document', openMode: 'viewer', renderer: 'html', editable: true },
  { id: 'json', label: 'Structured Data', extensions: ['json', 'jsonl', 'ndjson'], category: 'data', openMode: 'viewer', renderer: 'json', editable: true },
  { id: 'image', label: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'], category: 'image', openMode: 'viewer', renderer: 'image', binary: true },
  { id: 'image-convertible', label: 'Convertible Image', extensions: ['tif', 'tiff', 'heic', 'heif', 'eps', 'ps', 'psd', 'ai'], category: 'image', openMode: 'viewer', renderer: 'convertible', conversionTarget: 'image', binary: true },
  { id: 'diagram', label: 'Diagram Source', extensions: ['dot', 'gv', 'mmd', 'mermaid'], category: 'diagram', openMode: 'viewer', renderer: 'diagram', editable: true },
  { id: 'excalidraw', label: 'Excalidraw', extensions: ['excalidraw'], category: 'diagram', openMode: 'viewer', renderer: 'excalidraw', editable: true },
  { id: 'audio', label: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'], category: 'media', openMode: 'viewer', renderer: 'audio', binary: true },
  { id: 'video', label: 'Video', extensions: ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv'], category: 'media', openMode: 'viewer', renderer: 'video', binary: true },
  { id: 'archive', label: 'Archive', extensions: ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'], category: 'archive', openMode: 'viewer', renderer: 'archive', binary: true },
];

const BY_EXTENSION = new Map<string, FileTypeDefinition>();
for (const definition of FILE_TYPE_REGISTRY) {
  for (const ext of definition.extensions) BY_EXTENSION.set(ext, definition);
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'env', 'ini', 'conf', 'cfg', 'yaml', 'yml', 'toml', 'xml', 'css', 'scss', 'less',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'rs', 'go', 'c', 'cpp', 'h', 'hpp', 'java',
  'kt', 'swift', 'sh', 'bash', 'zsh', 'fish', 'sql', 'graphql', 'gql', 'dockerfile', 'makefile',
  'prisma', 'gitignore', 'dockerignore', 'editorconfig',
]);

export function getFileExtension(filePathOrName: string): string {
  const name = filePathOrName.split('/').pop() ?? filePathOrName;
  const lower = name.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile') return lower;
  const dot = lower.lastIndexOf('.');
  return dot > -1 ? lower.slice(dot + 1) : '';
}

export function getFileType(filePathOrName: string): FileTypeDefinition | undefined {
  return BY_EXTENSION.get(getFileExtension(filePathOrName));
}

export function getViewerDocType(filePathOrName: string): ViewerDocType {
  const definition = getFileType(filePathOrName);
  if (definition?.renderer && definition.renderer !== 'monaco' && definition.renderer !== 'details') {
    return definition.renderer as ViewerDocType;
  }
  if (isTextLikeFile(filePathOrName)) return 'text';
  return 'unknown';
}

export function isViewerFile(filePathOrName: string): boolean {
  return getFileType(filePathOrName)?.openMode === 'viewer';
}

export function isTextLikeFile(filePathOrName: string): boolean {
  const ext = getFileExtension(filePathOrName);
  if (!ext) return true;
  const definition = getFileType(filePathOrName);
  if (definition?.binary) return false;
  if (definition?.editable) return true;
  return TEXT_EXTENSIONS.has(ext) || !definition;
}

export function isMediaFile(filePathOrName: string): boolean {
  const renderer = getFileType(filePathOrName)?.renderer;
  return renderer === 'audio' || renderer === 'video';
}

export function isHtmlFile(filePathOrName: string): boolean {
  return getFileType(filePathOrName)?.id === 'html';
}
