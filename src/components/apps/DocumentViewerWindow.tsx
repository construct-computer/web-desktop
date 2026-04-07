import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { downloadContainerFile, downloadDriveFile, writeFile } from '@/services/api';
import { getDocumentType, isTextFile } from '@/lib/utils';
import { useEditorStore } from '@/stores/editorStore';
import { useDocViewerSignalStore } from '@/stores/documentViewerStore';
import Markdown from 'react-markdown';
import type { WindowConfig } from '@/types';
import { FileText, Table, Presentation, Image, File, Download, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Code, Eye, Save } from 'lucide-react';

import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';

// ── Types ────────────────────────────────────────────────────────────────

type DocType = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'image' | 'markdown' | 'html' | 'text' | 'unknown';

interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

// ── Monaco language detection (ported from EditorWindow) ─────────────────

const MONACO_LANG_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  java: 'java', kt: 'kotlin', swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  xml: 'xml', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile', makefile: 'plaintext',
  env: 'ini', ini: 'ini', conf: 'ini', cfg: 'ini',
  svg: 'xml', prisma: 'plaintext', lock: 'plaintext',
  gitignore: 'plaintext', dockerignore: 'plaintext', editorconfig: 'ini',
};

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python',
  ruby: 'Ruby', rust: 'Rust', go: 'Go', c: 'C', cpp: 'C++',
  java: 'Java', kotlin: 'Kotlin', swift: 'Swift', shell: 'Shell',
  json: 'JSON', yaml: 'YAML', ini: 'INI', xml: 'XML',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  markdown: 'Markdown', plaintext: 'Plain Text',
  sql: 'SQL', graphql: 'GraphQL', dockerfile: 'Dockerfile',
};

function getMonacoLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  const baseName = lower.split('/').pop() ?? lower;
  if (baseName === 'dockerfile') return 'dockerfile';
  if (baseName === 'makefile' || baseName === 'cmakelists.txt') return 'plaintext';
  if (baseName.startsWith('.')) {
    const withoutDot = baseName.slice(1);
    if (MONACO_LANG_MAP[withoutDot]) return MONACO_LANG_MAP[withoutDot];
  }
  const ext = baseName.split('.').pop() ?? '';
  return MONACO_LANG_MAP[ext] || 'plaintext';
}

const MONACO_OPTIONS: import('monaco-editor').editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
  fontLigatures: true,
  lineNumbers: 'on',
  minimap: { enabled: true, maxColumn: 80, renderCharacters: false, scale: 1 },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  tabSize: 2,
  insertSpaces: true,
  automaticLayout: true,
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  cursorBlinking: 'smooth',
  cursorStyle: 'line',
  padding: { top: 4 },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  stickyScroll: { enabled: true },
  linkedEditing: true,
  renderLineHighlight: 'all',
  renderLineHighlightOnlyWhenFocus: true,
  matchBrackets: 'always',
  folding: true,
  foldingHighlight: true,
  showFoldingControls: 'mouseover',
  suggest: { showKeywords: true, showSnippets: true, preview: true, showIcons: true },
  quickSuggestions: { other: true, strings: false, comments: false },
  parameterHints: { enabled: true },
  find: { addExtraSpaceOnTop: false, autoFindInSelection: 'multiline', seedSearchStringFromSelection: 'selection' },
  colorDecorators: true,
  definitionLinkOpensInPeek: true,
};

// ── Sub-renderers ────────────────────────────────────────────────────────

function PdfViewer({ blobUrl }: { blobUrl: string }) {
  return <iframe src={blobUrl} className="w-full h-full border-0" title="PDF Viewer" />;
}

function ImageViewer({ blobUrl, fileName }: { blobUrl: string; fileName: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} className="p-1 rounded hover:bg-white/10" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-[var(--color-text-muted)] min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-1 rounded hover:bg-white/10" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom(1)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2">Reset</button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black/30 p-4">
        <img src={blobUrl} alt={fileName} style={{ transform: `scale(${zoom})`, transformOrigin: 'center', maxWidth: zoom <= 1 ? '100%' : 'none' }} className="transition-transform duration-150" draggable={false} />
      </div>
    </div>
  );
}

function DocxViewer({ htmlContent }: { htmlContent: string }) {
  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-8 max-w-[816px] mx-auto text-[var(--color-text)] text-sm leading-relaxed" style={{ fontFamily: 'Calibri, Arial, sans-serif' }} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}

function XlsxViewer({ sheets }: { sheets: SheetData[] }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  if (!sheet) return <div className="p-4 text-[var(--color-text-muted)]">No data</div>;
  return (
    <div className="w-full h-full flex flex-col">
      {sheets.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50 overflow-x-auto">
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setActiveSheet(i)} className={`px-3 py-1 text-xs rounded-t transition-colors ${i === activeSheet ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5'}`}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-white/5 border border-white/10 px-2 py-1 text-[var(--color-text-muted)] font-medium text-center w-10">#</th>
              {sheet.headers.map((h, ci) => (
                <th key={ci} className="bg-white/5 border border-white/10 px-2 py-1 text-[var(--color-text-muted)] font-medium text-left whitespace-nowrap">{h || String.fromCharCode(65 + ci)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-white/5">
                <td className="bg-white/5 border border-white/10 px-2 py-0.5 text-[var(--color-text-muted)] text-center font-mono">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-white/10 px-2 py-0.5 text-[var(--color-text)] whitespace-nowrap max-w-[300px] truncate" title={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 px-3 py-1 border-t border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[10px] text-[var(--color-text-muted)]">
        <span>{sheet.rows.length} rows</span>
        <span>{sheet.headers.length} columns</span>
        <span>{sheets.length} sheet{sheets.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function PptxViewer({ slides }: { slides: string[] }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const slideAreaRef = useRef<HTMLDivElement>(null);
  const [slideScale, setSlideScale] = useState(1);

  // Compute scale so the 960×540 slide fits the available area
  useEffect(() => {
    const el = slideAreaRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 32; // 16px padding each side
      const w = el.clientWidth - pad;
      const h = el.clientHeight - pad;
      if (w <= 0 || h <= 0) return;
      setSlideScale(Math.min(w / 960, h / 540, 1));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentSlide(s => Math.min(slides.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentSlide(s => Math.max(0, s - 1));
      }
    };
    const el = rootRef.current;
    el?.addEventListener('keydown', handler);
    return () => el?.removeEventListener('keydown', handler);
  }, [slides.length]);

  // Thumbnail scale: 116px wide sidebar thumbnail → scale = 116/960
  const thumbScale = 116 / 960;

  if (slides.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">No slides</div>;
  }

  return (
    <div className="w-full h-full flex" ref={rootRef} tabIndex={0}>
      {/* Thumbnail sidebar */}
      <div className="w-[140px] shrink-0 border-r border-white/[0.06] overflow-y-auto py-2 px-2 flex flex-col gap-2">
        {slides.map((html, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={`relative rounded overflow-hidden border-2 transition-colors ${
              i === currentSlide ? 'border-[var(--color-accent)]' : 'border-transparent hover:border-white/20'
            }`}
          >
            <div className="bg-white rounded-sm overflow-hidden" style={{ aspectRatio: '16/9', width: '116px' }}>
              <div
                className="pointer-events-none origin-top-left"
                style={{ width: 960, height: 540, transform: `scale(${thumbScale})` }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white/70 text-center py-0.5">
              {i + 1}
            </div>
          </button>
        ))}
      </div>

      {/* Main slide + bottom bar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Slide area */}
        <div ref={slideAreaRef} className="flex-1 overflow-hidden flex items-center justify-center">
          <div
            className="bg-white rounded shadow-2xl overflow-hidden"
            style={{ width: 960 * slideScale, height: 540 * slideScale }}
          >
            <div
              className="origin-top-left"
              style={{ width: 960, height: 540, transform: `scale(${slideScale})` }}
              dangerouslySetInnerHTML={{ __html: slides[currentSlide] }}
            />
          </div>
        </div>

        {/* Bottom navigation bar */}
        <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-white/[0.06]">
          <button onClick={() => setCurrentSlide(s => Math.max(0, s - 1))} disabled={currentSlide === 0} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-[var(--color-text-muted)] min-w-[5rem] text-center">
            Slide {currentSlide + 1} of {slides.length}
          </span>
          <button onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))} disabled={currentSlide === slides.length - 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── File type icon helper ────────────────────────────────────────────────

function DocTypeIcon({ type, className = 'w-4 h-4' }: { type: DocType; className?: string }) {
  switch (type) {
    case 'pdf': return <FileText className={`${className} text-red-400`} />;
    case 'docx': return <FileText className={`${className} text-blue-400`} />;
    case 'xlsx': case 'csv': return <Table className={`${className} text-green-400`} />;
    case 'pptx': return <Presentation className={`${className} text-orange-400`} />;
    case 'image': return <Image className={`${className} text-purple-400`} />;
    case 'html': return <Code className={`${className} text-orange-400`} />;
    case 'text': return <Code className={`${className} text-[var(--color-accent)]`} />;
    case 'markdown': return <FileText className={`${className} text-[var(--color-accent)]`} />;
    default: return <File className={`${className} text-[var(--color-text-muted)]`} />;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : '—';
}

function getMimeLabel(ext: string): string {
  const map: Record<string, string> = {
    ZIP: 'ZIP Archive', GZ: 'Gzip Archive', TAR: 'Tar Archive', '7Z': '7-Zip Archive', RAR: 'RAR Archive',
    EXE: 'Windows Executable', DMG: 'macOS Disk Image', ISO: 'Disk Image', BIN: 'Binary',
    TTF: 'TrueType Font', OTF: 'OpenType Font', WOFF: 'Web Font', WOFF2: 'Web Font 2',
    DB: 'Database', SQLITE: 'SQLite Database', SQLITE3: 'SQLite Database',
    WAV: 'WAV Audio', MP3: 'MP3 Audio', FLAC: 'FLAC Audio', AAC: 'AAC Audio', OGG: 'Ogg Audio',
    MP4: 'MP4 Video', MKV: 'Matroska Video', AVI: 'AVI Video', MOV: 'QuickTime Video', WEBM: 'WebM Video',
    PSD: 'Photoshop Document', AI: 'Illustrator Document',
    WASM: 'WebAssembly Module', SO: 'Shared Library', DLL: 'Dynamic Library', DYLIB: 'Dynamic Library',
  };
  return map[ext] || `${ext} File`;
}

// ── Detect effective doc type ────────────────────────────────────────────
// Check extension-based document type first (markdown, csv, pdf, etc.)
// Fall back to 'text' for text-editable files, 'unknown' for binaries.
function resolveDocType(filePath: string | undefined, _windowType?: string): DocType {
  if (!filePath) return 'unknown';
  const docType = getDocumentType(filePath);
  if (docType !== 'unknown') return docType as DocType;
  if (isTextFile(filePath)) return 'text';
  return 'unknown';
}

// ── Main component ───────────────────────────────────────────────────────

export function DocumentViewerWindow({ config }: { config: WindowConfig }) {
  const windowId = config.id;
  const instanceId = useComputerStore(s => s.instanceId);
  const filePath = config.metadata?.filePath as string | undefined;
  const driveFileId = config.metadata?.driveFileId as string | undefined;
  const fileSize = config.metadata?.fileSize as number | undefined;
  const fileModified = config.metadata?.fileModified as string | undefined;
  const fileName = filePath?.split('/').pop() ?? 'Document';
  const docType = useMemo(() => resolveDocType(filePath, config.type), [filePath, config.type]);

  // ── Text/code editing via editorStore ──
  const isTextMode = docType === 'text';
  const editorFile = useEditorStore(s => isTextMode ? s.files[windowId] : undefined);
  const updateContent = useEditorStore(s => s.updateContent);
  const saveEditorFile = useEditorStore(s => s.saveFile);

  const monacoLang = useMemo(() => fileName ? getMonacoLanguage(fileName) : 'plaintext', [fileName]);
  const languageLabel = LANGUAGE_LABELS[monacoLang] || monacoLang;

  // ── Document viewing state ──
  const [loading, setLoading] = useState(!isTextMode);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<SheetData[] | null>(null);
  const [pptxSlides, setPptxSlides] = useState<string[] | null>(null);
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasRawToggle = docType === 'markdown' || docType === 'csv' || docType === 'html';
  const canEdit = (hasRawToggle || isTextMode) && !driveFileId && !!instanceId && !!filePath;
  const isDirtyDoc = editedText !== null && editedText !== rawText;
  const isDirtyText = isTextMode && editorFile ? editorFile.content !== editorFile.savedContent : false;
  const isDirty = isTextMode ? isDirtyText : isDirtyDoc;

  // Editor cursor/selection tracking
  const [cursorInfo, setCursorInfo] = useState({ ln: 1, col: 1, selected: 0, selectedLines: 0 });
  const [wordWrap, setWordWrap] = useState(false);

  const blobUrlRef = useRef<string | null>(null);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const saveRef = useRef(() => { if (isTextMode) saveEditorFile(windowId); });
  saveRef.current = () => { if (isTextMode) saveEditorFile(windowId); };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

  // ── Monaco mount handler ──
  const handleEditorMount: OnMount = useCallback((_editor, monaco) => {
    editorRef.current = _editor;

    // Save
    _editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current(),
    });

    // Track cursor position and selection
    const updateCursor = () => {
      const pos = _editor.getPosition();
      const sel = _editor.getSelection();
      let selected = 0;
      let selectedLines = 0;
      if (sel && !sel.isEmpty()) {
        const model = _editor.getModel();
        if (model) {
          selected = model.getValueInRange(sel).length;
          selectedLines = sel.endLineNumber - sel.startLineNumber + 1;
        }
      }
      setCursorInfo({ ln: pos?.lineNumber ?? 1, col: pos?.column ?? 1, selected, selectedLines });
    };
    _editor.onDidChangeCursorPosition(updateCursor);
    _editor.onDidChangeCursorSelection(updateCursor);
    updateCursor();

    _editor.focus();
  }, []);

  // Focus editor when text file finishes loading
  useEffect(() => {
    if (editorRef.current && isTextMode && editorFile && !editorFile.loading) {
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [isTextMode, editorFile?.loading]);

  // ── Document loading (non-text files) ──
  const loadFile = useCallback(async () => {
    if (isTextMode) return; // text files use editorStore
    if (!driveFileId && (!instanceId || !filePath)) {
      setError('No file path specified');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = driveFileId
        ? await downloadDriveFile(driveFileId)
        : await downloadContainerFile(instanceId!, filePath!);
      if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

      const blob = await response.blob();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

      switch (docType) {
        case 'pdf': {
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
        case 'image': {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
        case 'docx': {
          const mammoth = await import('mammoth');
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocxHtml(result.value);
          break;
        }
        case 'xlsx':
        case 'csv': {
          const arrayBuffer = await blob.arrayBuffer();
          if (docType === 'csv') setRawText(new TextDecoder().decode(arrayBuffer));
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheets: SheetData[] = workbook.SheetNames.map(name => {
            const ws = workbook.Sheets[name];
            const jsonData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
            const headers = (jsonData[0] || []).map(String);
            const rows = jsonData.slice(1).map(row => Array.isArray(row) ? row.map(cell => cell != null ? String(cell) : '') : []);
            return { name, headers, rows };
          });
          setXlsxSheets(sheets);
          break;
        }
        case 'pptx': {
          try {
            const { pptxToHtml } = await import('@jvmr/pptx-to-html');
            const arrayBuffer = await blob.arrayBuffer();
            const slidesHtml = await pptxToHtml(arrayBuffer, {
              width: 960,
              height: 540,
              scaleToFit: true,
            });
            setPptxSlides(slidesHtml.length > 0 ? slidesHtml : ['<p style="color:#888;text-align:center;padding:40px;">No slides found in presentation.</p>']);
          } catch (err) {
            console.error('PPTX parse error:', err);
            setPptxSlides(['<p style="color:#888;text-align:center;padding:40px;">Could not parse PowerPoint file. Use the download button to open externally.</p>']);
          }
          break;
        }
        case 'markdown': {
          const text = await blob.text();
          setMarkdownText(text);
          setRawText(text);
          break;
        }
        case 'html': {
          const text = await blob.text();
          setHtmlContent(text);
          setRawText(text);
          break;
        }
        default: {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [isTextMode, instanceId, filePath, driveFileId, docType]);

  // Load document on mount
  useEffect(() => { if (!isTextMode) loadFile(); }, [loadFile, isTextMode]);

  // Auto-reload documents when file changes (poll every 5s)
  const lastModRef = useRef<number>(0);
  useEffect(() => {
    if (isTextMode || driveFileId || !instanceId || !filePath) return;
    const interval = setInterval(async () => {
      try {
        const response = await downloadContainerFile(instanceId, filePath);
        if (!response.ok) return;
        const blob = await response.blob();
        if (blob.size !== lastModRef.current) {
          lastModRef.current = blob.size;
          loadFile();
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [isTextMode, instanceId, filePath, loadFile]);

  // Instant reload when agent writes to this file (via signal store)
  const reloadSignal = useDocViewerSignalStore(s => filePath ? s.reloadSignals[filePath] : 0);
  useEffect(() => {
    if (!isTextMode && reloadSignal && reloadSignal > 0) {
      loadFile();
    }
  }, [reloadSignal, isTextMode, loadFile]);

  // ── Save handler for markdown/CSV raw editing ──
  const handleSaveDoc = useCallback(async () => {
    if (!canEdit || editedText === null || !isDirtyDoc) return;
    setSaving(true);
    try {
      const result = await writeFile(instanceId!, filePath!, editedText);
      if (result.success) {
        setRawText(editedText);
        if (docType === 'markdown') setMarkdownText(editedText);
        else if (docType === 'html') setHtmlContent(editedText);
        else if (docType === 'csv') {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(editedText, { type: 'string' });
          const sheets: SheetData[] = workbook.SheetNames.map(name => {
            const ws = workbook.Sheets[name];
            const jsonData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
            const headers = (jsonData[0] || []).map(String);
            const rows = jsonData.slice(1).map(row => Array.isArray(row) ? row.map(cell => cell != null ? String(cell) : '') : []);
            return { name, headers, rows };
          });
          setXlsxSheets(sheets);
        }
        setEditedText(null);
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit, editedText, isDirtyDoc, instanceId, filePath, docType]);

  // Cmd/Ctrl+S for markdown/CSV raw editing
  useEffect(() => {
    if (isTextMode) return; // text mode uses Monaco's built-in keybinding
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && canEdit && isDirtyDoc) {
        e.preventDefault();
        handleSaveDoc();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTextMode, canEdit, isDirtyDoc, handleSaveDoc]);

  // ── Download handler ──
  const handleDownload = useCallback(() => {
    const downloadFn = driveFileId
      ? () => downloadDriveFile(driveFileId)
      : instanceId && filePath
        ? () => downloadContainerFile(instanceId, filePath)
        : null;
    if (downloadFn) {
      downloadFn().then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }, [instanceId, filePath, driveFileId, fileName]);

  // ── Render ──

  if (!filePath) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
        <File className="w-8 h-8 mr-3 opacity-40" />
        No file selected
      </div>
    );
  }

  // ── Text/code mode (Monaco editor via editorStore) ──
  if (isTextMode) {
    const file = editorFile;
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          {(!file || file.loading) ? (
            <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              <span className="text-xs">Loading {fileName}...</span>
            </div>
          ) : file.error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div className="text-red-400 text-xs">{file.error}</div>
            </div>
          ) : (
            <MonacoEditor
              height="100%"
              path={file.filePath}
              language={monacoLang}
              value={file.content}
              onChange={(v) => updateContent(windowId, v ?? '')}
              onMount={handleEditorMount}
              theme="vs-dark"
              loading={
                <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-xs">Loading editor...</span>
                </div>
              }
              options={MONACO_OPTIONS}
            />
          )}
        </div>
        {/* Status bar */}
        <div className="flex items-center justify-between px-2 py-0.5 text-[11px] border-t border-white/[0.06] text-[var(--color-text-muted)] select-none">
          <div className="flex items-center">
            {/* Cursor position — click to go to line */}
            <button
              onClick={() => editorRef.current?.getAction('editor.action.gotoLine')?.run()}
              className="px-1.5 py-0.5 rounded hover:bg-white/10 hover:text-[var(--color-text)] transition-colors"
              title="Go to Line (Ctrl+G)"
            >
              Ln {cursorInfo.ln}, Col {cursorInfo.col}
            </button>
            {cursorInfo.selected > 0 && (
              <span className="px-1.5 text-[var(--color-accent)]">
                ({cursorInfo.selected} selected{cursorInfo.selectedLines > 1 ? `, ${cursorInfo.selectedLines} lines` : ''})
              </span>
            )}
            {isDirtyText && <span className="px-1.5 text-yellow-400/80">Modified</span>}
            {file?.saving && <span className="px-1.5 text-[var(--color-accent)]">Saving...</span>}
          </div>
          <div className="flex items-center">
            {/* Word wrap toggle */}
            <button
              onClick={() => {
                const next = !wordWrap;
                setWordWrap(next);
                editorRef.current?.updateOptions({ wordWrap: next ? 'on' : 'off' });
              }}
              className={`px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors ${wordWrap ? 'text-[var(--color-accent)]' : 'hover:text-[var(--color-text)]'}`}
              title="Toggle Word Wrap (Alt+Z)"
            >
              Word Wrap
            </button>
            <span className="px-1.5">Spaces: 2</span>
            <span className="px-1.5">{languageLabel}</span>
            {file && !file.loading && !file.error && (
              <span className="px-1.5">{file.content.split('\n').length} lines</span>
            )}
            <span className="px-1.5">UTF-8</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Document/viewer mode ──
  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06]">
        <DocTypeIcon type={docType} />
        <span className="text-xs font-medium text-[var(--color-text)] truncate flex-1" title={filePath}>{fileName}</span>
        {hasRawToggle && (
          <button
            onClick={() => setRawMode(v => !v)}
            className={`p-1 rounded hover:bg-white/10 transition-colors ${rawMode ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            title={rawMode ? 'Show rendered view' : 'Show source'}
          >
            {rawMode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
          </button>
        )}
        {canEdit && isDirtyDoc && (
          <button onClick={handleSaveDoc} disabled={saving} className="p-1 rounded hover:bg-white/10 text-[var(--color-accent)]" title="Save (⌘S)">
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
          </button>
        )}
        <button onClick={loadFile} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Reload">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Download">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading {fileName}...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="text-red-400 text-sm">{error}</div>
            <button onClick={loadFile} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-[var(--color-text)]">Retry</button>
          </div>
        )}

        {!loading && !error && (<>
          {/* Raw/source mode with Monaco editor */}
          {rawMode && rawText !== null ? (
            <div className="w-full h-full relative">
              {canEdit ? (
                <MonacoEditor
                  height="100%"
                  language={docType === 'markdown' ? 'markdown' : 'plaintext'}
                  value={editedText ?? rawText}
                  onChange={(v) => setEditedText(v ?? '')}
                  onMount={handleEditorMount}
                  theme="vs-dark"
                  options={MONACO_OPTIONS}
                />
              ) : (
                <pre className="w-full h-full overflow-auto p-4 text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap break-words leading-relaxed">{rawText}</pre>
              )}
              {isDirtyDoc && (
                <div className="absolute top-2 right-3 text-[10px] text-[var(--color-text-muted)] bg-black/50 px-1.5 py-0.5 rounded">unsaved</div>
              )}
            </div>
          ) : (<>
            {docType === 'pdf' && blobUrl && <PdfViewer blobUrl={blobUrl} />}
            {docType === 'image' && blobUrl && <ImageViewer blobUrl={blobUrl} fileName={fileName} />}
            {docType === 'docx' && docxHtml !== null && <DocxViewer htmlContent={docxHtml} />}
            {(docType === 'xlsx' || docType === 'csv') && xlsxSheets !== null && <XlsxViewer sheets={xlsxSheets} />}
            {docType === 'pptx' && pptxSlides !== null && <PptxViewer slides={pptxSlides} />}
            {docType === 'markdown' && markdownText !== null && (
              <div className="w-full h-full overflow-auto px-6 py-3">
                <div className="max-w-3xl mx-auto markdown-rendered [&>*:first-child]:mt-0">
                  <Markdown>{markdownText}</Markdown>
                </div>
              </div>
            )}
            {docType === 'html' && htmlContent !== null && (
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-same-origin"
                className="w-full h-full border-0 bg-white"
                title={fileName}
              />
            )}
            {docType === 'unknown' && (
              <div className="w-full h-full flex items-center justify-center p-6">
                <div className="w-full max-w-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden">
                  <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4">
                    <div className="w-14 h-14 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center">
                      <File className="w-7 h-7 text-[var(--color-accent)]" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-[var(--color-text)] break-all leading-tight">{fileName}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{getMimeLabel(getExtension(fileName))}</p>
                    </div>
                  </div>
                  <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)] text-xs">
                    <div className="flex justify-between px-5 py-2">
                      <span className="text-[var(--color-text-muted)]">Extension</span>
                      <span className="text-[var(--color-text)] font-mono">.{getExtension(fileName).toLowerCase()}</span>
                    </div>
                    {fileSize != null && (
                      <div className="flex justify-between px-5 py-2">
                        <span className="text-[var(--color-text-muted)]">Size</span>
                        <span className="text-[var(--color-text)]">{formatFileSize(fileSize)}</span>
                      </div>
                    )}
                    {fileModified && (
                      <div className="flex justify-between px-5 py-2">
                        <span className="text-[var(--color-text-muted)]">Modified</span>
                        <span className="text-[var(--color-text)]">{new Date(fileModified).toLocaleString()}</span>
                      </div>
                    )}
                    {filePath && !driveFileId && (
                      <div className="flex justify-between px-5 py-2">
                        <span className="text-[var(--color-text-muted)]">Path</span>
                        <span className="text-[var(--color-text)] font-mono truncate ml-3 max-w-[160px]" title={filePath}>{filePath}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-[var(--color-border)]">
                    <button onClick={handleDownload} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity">
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>)}
        </>)}
      </div>
    </div>
  );
}
