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
export type FilePreviewStrategy = 'native' | 'text' | 'structured' | 'conversion' | 'details';
export type FileIconKind =
  | 'archive'
  | 'audio'
  | 'code'
  | 'data'
  | 'document'
  | 'generic'
  | 'html'
  | 'image'
  | 'json'
  | 'markdown'
  | 'pdf'
  | 'spreadsheet'
  | 'slides'
  | 'text'
  | 'video';

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
  rawToggle?: boolean;
  monacoLanguage?: string;
  previewStrategy?: FilePreviewStrategy;
  iconKind?: FileIconKind;
  conversionTarget?: 'pdf-pages' | 'image';
  binary?: boolean;
}

export const FILE_TYPE_REGISTRY: FileTypeDefinition[] = [
  { id: 'pdf', label: 'PDF', extensions: ['pdf'], category: 'document', openMode: 'viewer', renderer: 'pdf', previewStrategy: 'native', iconKind: 'pdf', binary: true },
  { id: 'docx', label: 'Word Document', extensions: ['docx'], category: 'document', openMode: 'viewer', renderer: 'convertible', previewStrategy: 'conversion', iconKind: 'document', conversionTarget: 'pdf-pages', binary: true },
  { id: 'office-doc-convertible', label: 'Word/OpenDocument/RTF', extensions: ['doc', 'odt', 'rtf'], category: 'document', openMode: 'viewer', renderer: 'convertible', previewStrategy: 'conversion', iconKind: 'document', conversionTarget: 'pdf-pages', binary: true },
  { id: 'xlsx', label: 'Spreadsheet', extensions: ['xlsx', 'xls', 'ods'], category: 'spreadsheet', openMode: 'viewer', renderer: 'xlsx', previewStrategy: 'structured', iconKind: 'spreadsheet', binary: true },
  { id: 'csv', label: 'CSV', extensions: ['csv'], category: 'data', openMode: 'viewer', renderer: 'csv', editable: true, rawToggle: true, monacoLanguage: 'plaintext', previewStrategy: 'structured', iconKind: 'spreadsheet' },
  { id: 'tsv', label: 'TSV', extensions: ['tsv'], category: 'data', openMode: 'viewer', renderer: 'tsv', editable: true, rawToggle: true, monacoLanguage: 'plaintext', previewStrategy: 'structured', iconKind: 'spreadsheet' },
  { id: 'pptx', label: 'PowerPoint', extensions: ['pptx'], category: 'presentation', openMode: 'viewer', renderer: 'convertible', previewStrategy: 'conversion', iconKind: 'slides', conversionTarget: 'pdf-pages', binary: true },
  { id: 'slides-convertible', label: 'Legacy/OpenDocument Slides', extensions: ['ppt', 'odp'], category: 'presentation', openMode: 'viewer', renderer: 'convertible', previewStrategy: 'conversion', iconKind: 'slides', conversionTarget: 'pdf-pages', binary: true },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown', 'mdx'], category: 'document', openMode: 'viewer', renderer: 'markdown', editable: true, rawToggle: true, monacoLanguage: 'markdown', previewStrategy: 'text', iconKind: 'markdown' },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], category: 'document', openMode: 'viewer', renderer: 'html', editable: true, rawToggle: true, monacoLanguage: 'html', previewStrategy: 'text', iconKind: 'html' },
  { id: 'json', label: 'Structured Data', extensions: ['json', 'jsonl', 'ndjson'], category: 'data', openMode: 'viewer', renderer: 'json', editable: true, rawToggle: true, monacoLanguage: 'json', previewStrategy: 'structured', iconKind: 'json' },
  { id: 'image', label: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'], category: 'image', openMode: 'viewer', renderer: 'image', previewStrategy: 'native', iconKind: 'image', binary: true },
  { id: 'image-convertible', label: 'Convertible Image', extensions: ['tif', 'tiff', 'heic', 'heif', 'eps', 'ps', 'psd', 'ai'], category: 'image', openMode: 'viewer', renderer: 'convertible', previewStrategy: 'conversion', iconKind: 'image', conversionTarget: 'image', binary: true },
  { id: 'diagram', label: 'Diagram Source', extensions: ['dot', 'gv', 'mmd', 'mermaid'], category: 'diagram', openMode: 'viewer', renderer: 'diagram', editable: true, rawToggle: true, monacoLanguage: 'plaintext', previewStrategy: 'text', iconKind: 'code' },
  { id: 'excalidraw', label: 'Excalidraw', extensions: ['excalidraw'], category: 'diagram', openMode: 'viewer', renderer: 'excalidraw', editable: true, rawToggle: true, monacoLanguage: 'json', previewStrategy: 'structured', iconKind: 'json' },
  { id: 'audio', label: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'], category: 'media', openMode: 'viewer', renderer: 'audio', previewStrategy: 'native', iconKind: 'audio', binary: true },
  { id: 'video', label: 'Video', extensions: ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv'], category: 'media', openMode: 'viewer', renderer: 'video', previewStrategy: 'native', iconKind: 'video', binary: true },
  { id: 'archive', label: 'Archive', extensions: ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'], category: 'archive', openMode: 'viewer', renderer: 'archive', previewStrategy: 'details', iconKind: 'archive', binary: true },
];

const BY_EXTENSION = new Map<string, FileTypeDefinition>();
for (const definition of FILE_TYPE_REGISTRY) {
  for (const ext of definition.extensions) BY_EXTENSION.set(ext, definition);
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'env', 'ini', 'conf', 'cfg', 'yaml', 'yml', 'toml', 'xml', 'css', 'scss', 'less',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'rs', 'go', 'c', 'cpp', 'h', 'hpp', 'java',
  'kt', 'swift', 'sh', 'bash', 'zsh', 'fish', 'sql', 'graphql', 'gql', 'dockerfile', 'makefile',
  'prisma', 'gitignore', 'dockerignore', 'editorconfig', 'lock', 'properties',
]);

export const MONACO_LANG_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp',
  java: 'java', kt: 'kotlin', swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  json: 'json', jsonl: 'json', ndjson: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'ini',
  xml: 'xml', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  txt: 'plaintext', log: 'plaintext', csv: 'plaintext', tsv: 'plaintext',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile', makefile: 'plaintext',
  env: 'ini', ini: 'ini', conf: 'ini', cfg: 'ini', properties: 'ini',
  svg: 'xml', prisma: 'plaintext', lock: 'plaintext',
  gitignore: 'plaintext', dockerignore: 'plaintext', editorconfig: 'ini',
  dot: 'plaintext', gv: 'plaintext', mmd: 'markdown', mermaid: 'markdown',
  excalidraw: 'json',
};

export const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python',
  ruby: 'Ruby', rust: 'Rust', go: 'Go', c: 'C', cpp: 'C++',
  java: 'Java', kotlin: 'Kotlin', swift: 'Swift', shell: 'Shell',
  json: 'JSON', yaml: 'YAML', ini: 'INI', xml: 'XML',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  markdown: 'Markdown', plaintext: 'Plain Text',
  sql: 'SQL', graphql: 'GraphQL', dockerfile: 'Dockerfile',
};

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

export function getMonacoLanguage(filePathOrName: string): string {
  const name = filePathOrName.split('/').pop()?.toLowerCase() ?? filePathOrName.toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile' || name === 'cmakelists.txt') return 'plaintext';
  if (name.startsWith('.')) {
    const withoutDot = name.slice(1);
    if (MONACO_LANG_MAP[withoutDot]) return MONACO_LANG_MAP[withoutDot];
  }
  const definition = getFileType(filePathOrName);
  if (definition?.monacoLanguage) return definition.monacoLanguage;
  return MONACO_LANG_MAP[getFileExtension(filePathOrName)] || 'plaintext';
}

export function getLanguageLabel(filePathOrLanguage: string): string {
  const language = filePathOrLanguage.includes('.') || filePathOrLanguage.includes('/')
    ? getMonacoLanguage(filePathOrLanguage)
    : filePathOrLanguage;
  return LANGUAGE_LABELS[language] || language;
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

export function hasRawToggle(filePathOrName: string): boolean {
  const definition = getFileType(filePathOrName);
  return Boolean(definition?.rawToggle || getViewerDocType(filePathOrName) === 'text');
}

export function isEditableSourceFile(filePathOrName: string): boolean {
  return isTextLikeFile(filePathOrName) || Boolean(getFileType(filePathOrName)?.editable);
}

export function getPreviewStrategy(filePathOrName: string): FilePreviewStrategy {
  const definition = getFileType(filePathOrName);
  if (definition?.previewStrategy) return definition.previewStrategy;
  if (isTextLikeFile(filePathOrName)) return 'text';
  return 'details';
}

export function getFileIconKind(filePathOrName: string): FileIconKind {
  const definition = getFileType(filePathOrName);
  if (definition?.iconKind) return definition.iconKind;
  const language = getMonacoLanguage(filePathOrName);
  if (language === 'json') return 'json';
  if (language === 'html' || language === 'xml') return 'html';
  if (language === 'markdown') return 'markdown';
  if (isTextLikeFile(filePathOrName)) return language === 'plaintext' || language === 'ini' ? 'text' : 'code';
  return 'generic';
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
