import { useEffect, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Loader2, AlertCircle } from 'lucide-react';
import type { WindowConfig } from '@/types';
import { useEditorStore } from '@/stores/editorStore';
import { useIsMobile } from '@/hooks/useIsMobile';

interface EditorWindowProps {
  config: WindowConfig;
}

// Maps file extensions to Monaco language IDs
const MONACO_LANG_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  txt: 'plaintext',
  log: 'plaintext',
  csv: 'plaintext',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  env: 'ini',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  svg: 'xml',
  prisma: 'plaintext',
  lock: 'plaintext',
  gitignore: 'plaintext',
  dockerignore: 'plaintext',
  editorconfig: 'ini',
};

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  go: 'Go',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  shell: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  ini: 'INI',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  markdown: 'Markdown',
  plaintext: 'Plain Text',
  sql: 'SQL',
  graphql: 'GraphQL',
  dockerfile: 'Dockerfile',
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

// ─── Main component ─────────────────────────────────────────────────────────

export function EditorWindow({ config }: EditorWindowProps) {
  const isMobile = useIsMobile();
  const windowId = config.id;
  const file = useEditorStore((s) => s.files[windowId]);
  const updateContent = useEditorStore((s) => s.updateContent);
  const saveFile = useEditorStore((s) => s.saveFile);

  const monacoLang = file ? getMonacoLanguage(file.filePath) : 'plaintext';
  const languageLabel = LANGUAGE_LABELS[monacoLang] || monacoLang;

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveRef = useRef(() => saveFile(windowId));
  saveRef.current = () => saveFile(windowId);

  // Monaco mount: register Ctrl+S keybinding
  const handleEditorMount: OnMount = useCallback((_editorInstance, monaco) => {
    editorRef.current = _editorInstance;

    _editorInstance.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        saveRef.current();
      },
    });

    _editorInstance.focus();
  }, []);

  // Focus editor when file finishes loading
  useEffect(() => {
    if (editorRef.current && file && !file.loading) {
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [file?.loading]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      updateContent(windowId, value ?? '');
    },
    [windowId, updateContent],
  );

  // ─── No file state yet (window just created, store not populated) ─────

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full bg-transparent text-[var(--color-text-muted)] font-medium text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  // ─── File states ──────────────────────────────────────────────────────

  let editorContent: React.ReactNode;

  if (file.loading) {
    editorContent = (
      <div className="flex items-center justify-center h-full text-[#888]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-xs">Loading {file.fileName}...</span>
      </div>
    );
  } else if (file.error) {
    editorContent = (
      <div className="flex flex-col items-center justify-center h-full text-sm gap-2">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p className="text-red-400 text-xs">{file.error}</p>
      </div>
    );
  } else {
    editorContent = (
      <Editor
        height="100%"
        path={file.filePath}
        language={monacoLang}
        value={file.content}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full text-[#888]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs">Loading editor...</span>
          </div>
        }
        options={{
          fontSize: 13,
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: isMobile ? 'on' : 'off',
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 4 },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    );
  }

  const isDirty = file.content !== file.savedContent;

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] select-none">
      {/* Editor area */}
      <div className="flex-1 min-h-0">{editorContent}</div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 text-[11px] border-t border-[#333] bg-[#007acc] text-white">
        <div className="flex items-center gap-3">
          <span>{languageLabel}</span>
          {isDirty && <span className="text-yellow-200">Modified</span>}
          {file.saving && <span className="text-blue-200">Saving...</span>}
        </div>
        <div className="flex items-center gap-3">
          {!file.loading && !file.error && (
            <span>{file.content.split('\n').length} lines</span>
          )}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
