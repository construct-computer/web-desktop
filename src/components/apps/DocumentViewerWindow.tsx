import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { retainAgentOpenedWindow, useComputerStore } from '@/stores/agentStore';
import { convertContainerFilePreview, downloadContainerFile, downloadDriveFile, getFileMeta, previewContainerFile, writeFile, type FileMetaResponse } from '@/services/api';
import { getDocumentType, isTextFile, isTextEntryFocused } from '@/lib/utils';
import { log } from '@/lib/logger';
import { fileNameFromWorkspacePath } from '@/lib/workspacePaths';
import {
  getLanguageLabel,
  getFileIconKind,
  getMonacoLanguage,
  hasRawToggle as fileHasRawToggle,
  type ViewerDocType,
} from '@/lib/fileTypes';
import { useEditorStore } from '@/stores/editorStore';
import { useDocViewerSignalStore } from '@/stores/documentViewerStore';
import { useWindowStore } from '@/stores/windowStore';
import { openSpotlightSession } from '@/lib/spotlightNav';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { JsonFileViewer } from '@/components/ui/StructuredDataViewer';
import type { WindowConfig } from '@/types';
import { FileText, Table, Presentation, Image, File, Download, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Code, Eye, Save, Volume2, Film, Archive, Maximize2, Braces, Search, ArrowUpDown } from 'lucide-react';

import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import Papa from 'papaparse';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

// ── Types ────────────────────────────────────────────────────────────────

const logger = log('DocumentViewer');

type DocType = ViewerDocType;

interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

interface TableRow {
  cells: string[];
  rowNumber: number;
}

interface ConversionFrame {
  previewPath: string;
  contentType?: string;
  label?: string;
  pageIndex?: number;
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
  const [fit, setFit] = useState<'contain' | 'actual'>('contain');
  const [checkerboard, setCheckerboard] = useState(false);
  const background = checkerboard
    ? 'repeating-conic-gradient(rgba(255,255,255,.12) 0% 25%, rgba(255,255,255,.04) 0% 50%) 50% / 20px 20px'
    : undefined;
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border)] surface-toolbar">
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} className="p-1 rounded hover:bg-white/10" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-[var(--color-text-muted)] min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-1 rounded hover:bg-white/10" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom(1)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2">Reset</button>
        <button onClick={() => setFit(f => f === 'contain' ? 'actual' : 'contain')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2">
          {fit === 'contain' ? 'Fit' : 'Actual'}
        </button>
        <button onClick={() => setCheckerboard(v => !v)} className={`text-xs px-2 ${checkerboard ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
          Transparency
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black/30 p-4" style={{ background }}>
        <img
          src={blobUrl}
          alt={fileName}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center',
            maxWidth: fit === 'contain' && zoom <= 1 ? '100%' : 'none',
            maxHeight: fit === 'contain' && zoom <= 1 ? '100%' : 'none',
          }}
          className="transition-transform duration-150"
          draggable={false}
        />
      </div>
    </div>
  );
}

function spreadsheetColumnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function openSpotlightPrompt(draft?: string) {
  void openSpotlightSession();
  window.setTimeout(() => {
    if (draft) {
      window.dispatchEvent(new CustomEvent('spotlight-set-draft', { detail: { text: draft } }));
    }
    window.dispatchEvent(new CustomEvent('spotlight-focus-input'));
  }, 0);
}

function serializeDelimitedRows(sheet: SheetData, delimiter: ',' | '\t'): string {
  return Papa.unparse([sheet.headers, ...sheet.rows], { delimiter, newline: '\n' });
}

function DataTableViewer({
  sheet,
  editable = false,
  onSheetChange,
}: {
  sheet: SheetData;
  editable?: boolean;
  onSheetChange?: (sheet: SheetData) => void;
}) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const data = useMemo<TableRow[]>(
    () => sheet.rows.map((cells, index) => ({ cells, rowNumber: index + 1 })),
    [sheet.rows],
  );

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () => [
      {
        id: '__row',
        header: '#',
        accessorFn: row => row.rowNumber,
        enableSorting: false,
        cell: info => info.row.original.rowNumber,
      },
      ...sheet.headers.map<ColumnDef<TableRow>>((header, index) => ({
        id: `col_${index}`,
        header: header || spreadsheetColumnName(index),
        accessorFn: (row: TableRow) => row.cells[index] ?? '',
        cell: info => String(info.getValue() ?? ''),
      })),
    ],
    [sheet.headers],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? '').trim().toLowerCase();
      if (!query) return true;
      return row.original.cells.some(cell => cell.toLowerCase().includes(query));
    },
  });

  const visibleRows = table.getRowModel().rows;

  const commitCellEdit = useCallback(() => {
    if (!editable || !onSheetChange || !editingCell) return;
    const nextRows = sheet.rows.map((cells, rowIndex) => {
      if (rowIndex !== editingCell.row) return cells;
      return cells.map((cell, colIndex) => (
        colIndex === editingCell.col ? editValue : cell
      ));
    });
    onSheetChange({ ...sheet, rows: nextRows });
    setEditingCell(null);
  }, [editable, editValue, editingCell, onSheetChange, sheet]);

  const startCellEdit = useCallback((row: number, col: number, value: string) => {
    if (!editable) return;
    setEditingCell({ row, col });
    setEditValue(value);
  }, [editable]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] surface-toolbar">
        <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        <input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Search table"
          className="w-full max-w-xs bg-transparent text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
          {visibleRows.length} of {sheet.rows.length} rows
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const sorted = header.column.getIsSorted();
                  const isRowColumn = header.column.id === '__row';
                  return (
                    <th
                      key={header.id}
                      className={`${isRowColumn ? 'sticky left-0 z-20 w-10 text-center' : 'text-left'} bg-[var(--color-surface-raised)] border border-white/10 px-2 py-1 font-medium text-[var(--color-text-muted)] whitespace-nowrap`}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                          className={`${isRowColumn ? 'justify-center' : 'justify-between'} flex w-full items-center gap-2 text-left disabled:cursor-default`}
                          title={header.column.getCanSort() ? 'Sort column' : undefined}
                        >
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {header.column.getCanSort() && (
                            <span className="shrink-0 text-[9px] uppercase text-[var(--color-text-muted)]">
                              {sorted === 'asc' ? 'Asc' : sorted === 'desc' ? 'Desc' : <ArrowUpDown className="w-3 h-3" />}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr key={row.id} className="hover:bg-white/5">
                {row.getVisibleCells().map(cell => {
                  const isRowColumn = cell.column.id === '__row';
                  const value = String(cell.getValue() ?? '');
                  const dataColIndex = cell.column.id.startsWith('col_')
                    ? Number(cell.column.id.slice(4))
                    : -1;
                  const isEditing = editable
                    && editingCell?.row === row.index
                    && editingCell?.col === dataColIndex;
                  return (
                    <td
                      key={cell.id}
                      className={`${isRowColumn ? 'sticky left-0 bg-[var(--color-surface-raised)] text-center text-[var(--color-text-muted)] font-mono' : 'text-[var(--color-text)]'} border border-white/10 px-2 py-0.5 whitespace-nowrap max-w-[320px] ${isEditing ? '' : 'truncate'} ${editable && !isRowColumn ? 'cursor-text hover:bg-white/5' : ''}`}
                      title={isRowColumn || isEditing ? undefined : value}
                      onClick={() => {
                        if (!isRowColumn && editable && dataColIndex >= 0) {
                          startCellEdit(row.index, dataColIndex, value);
                        }
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={commitCellEdit}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitCellEdit();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingCell(null);
                            }
                          }}
                          className="w-full min-w-[120px] bg-transparent text-[var(--color-text)] outline-none"
                        />
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, sheet.headers.length + 1)} className="px-3 py-8 text-center text-[var(--color-text-muted)]">
                  No matching rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function XlsxViewer({
  sheets,
  editable = false,
  onSheetChange,
}: {
  sheets: SheetData[];
  editable?: boolean;
  onSheetChange?: (sheet: SheetData, sheetIndex: number) => void;
}) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  if (!sheet) return <div className="p-4 text-[var(--color-text-muted)]">No data</div>;
  return (
    <div className="w-full h-full flex flex-col">
      {sheets.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--color-border)] surface-toolbar overflow-x-auto">
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setActiveSheet(i)} className={`px-3 py-1 text-xs rounded-t transition-colors ${i === activeSheet ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5'}`}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <DataTableViewer
          sheet={sheet}
          editable={editable}
          onSheetChange={onSheetChange ? (nextSheet) => onSheetChange(nextSheet, activeSheet) : undefined}
        />
      </div>
      <div className="flex items-center gap-4 px-3 py-1 border-t border-[var(--color-border)] surface-toolbar text-[10px] text-[var(--color-text-muted)]">
        <span>{sheet.rows.length} rows</span>
        <span>{sheet.headers.length} columns</span>
        <span>{sheets.length} sheet{sheets.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function MediaViewer({ blobUrl, type, fileName }: { blobUrl: string; type: 'audio' | 'video'; fileName: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-black/40 p-8">
      <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-black/30 p-5">
        <div className="flex items-center gap-3 mb-4 text-[var(--color-text)]">
          {type === 'audio' ? <Volume2 className="w-5 h-5 text-[var(--color-accent)]" /> : <Film className="w-5 h-5 text-[var(--color-accent)]" />}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{fileName}</div>
            <div className="text-xs text-[var(--color-text-muted)]">{type === 'audio' ? 'Audio preview' : 'Video preview'}</div>
          </div>
        </div>
        {type === 'audio' ? (
          <audio src={blobUrl} controls className="w-full" />
        ) : (
          <video src={blobUrl} controls className="w-full max-h-[70vh] bg-black rounded" />
        )}
      </div>
    </div>
  );
}

function DiagramViewer({ text, fileName }: { text: string; fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const isMermaid = ext === 'mmd' || ext === 'mermaid';
  const isGraphviz = ext === 'dot' || ext === 'gv';
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(!isMermaid);

  useEffect(() => {
    if (!isMermaid || showSource || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, text);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        setRenderError(null);
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Failed to render Mermaid diagram');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [text, isMermaid, showSource]);

  return (
    <div className="w-full h-full grid grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] text-xs text-[var(--color-text-muted)]">
        <span className="flex-1">
          {isGraphviz
            ? 'Graphviz source. If Construct generated SVG/PNG/PDF output next to this file, open that artifact for the rendered diagram.'
            : isMermaid
              ? 'Mermaid diagram rendered in the viewer.'
              : 'Diagram source.'}
        </span>
        {isMermaid && (
          <button
            type="button"
            onClick={() => setShowSource(v => !v)}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text)]"
          >
            {showSource ? 'Show diagram' : 'Show source'}
          </button>
        )}
      </div>
      {isMermaid && !showSource ? (
        renderError ? (
          <div className="overflow-auto p-4 space-y-3">
            <div className="text-xs text-red-300">{renderError}</div>
            <pre className="text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{text}</pre>
          </div>
        ) : (
          <div ref={containerRef} className="overflow-auto p-4 flex items-start justify-center [&_svg]:max-w-full [&_svg]:h-auto" />
        )
      ) : (
        <pre className="overflow-auto p-4 text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{text}</pre>
      )}
    </div>
  );
}

function ExcalidrawViewer({ text }: { text: string }) {
  const scene = useMemo(() => {
    try {
      return JSON.parse(text) as { elements?: Array<Record<string, unknown>>; appState?: { viewBackgroundColor?: string } };
    } catch {
      return null;
    }
  }, [text]);

  const elements: Array<Record<string, unknown>> = scene?.elements?.filter(el => !el.isDeleted) || [];
  if (!scene) return <JsonFileViewer text={text} />;
  if (elements.length === 0) return <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">Empty Excalidraw scene</div>;

  const bounds = elements.reduce<{ minX: number; minY: number; maxX: number; maxY: number }>((acc, el) => {
    const x = Number(el.x || 0);
    const y = Number(el.y || 0);
    const w = Number(el.width || 0);
    const h = Number(el.height || 0);
    return {
      minX: Math.min(acc.minX, x),
      minY: Math.min(acc.minY, y),
      maxX: Math.max(acc.maxX, x + w),
      maxY: Math.max(acc.maxY, y + h),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const pad = 80;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${Math.max(100, bounds.maxX - bounds.minX + pad * 2)} ${Math.max(100, bounds.maxY - bounds.minY + pad * 2)}`;

  return (
    <div className="w-full h-full overflow-auto bg-black/30 p-4">
      <svg viewBox={viewBox} className="w-full h-full bg-white rounded">
        {elements.map((el, index) => {
          const type = String(el.type || '');
          const x = Number(el.x || 0);
          const y = Number(el.y || 0);
          const width = Number(el.width || 0);
          const height = Number(el.height || 0);
          const stroke = String(el.strokeColor || '#1e1e1e');
          const fill = String(el.backgroundColor || 'transparent');
          const strokeWidth = Number(el.strokeWidth || 2);
          if (type === 'rectangle') return <rect key={index} x={x} y={y} width={width} height={height} rx={8} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
          if (type === 'ellipse') return <ellipse key={index} cx={x + width / 2} cy={y + height / 2} rx={Math.abs(width / 2)} ry={Math.abs(height / 2)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
          if (type === 'diamond') return <polygon key={index} points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
          if (type === 'text') return <text key={index} x={x} y={y + Number(el.fontSize || 20)} fill={stroke} fontSize={Number(el.fontSize || 20)} fontFamily="Arial">{String(el.text || '')}</text>;
          if (type === 'line' || type === 'arrow') {
            const points = Array.isArray(el.points) ? el.points as number[][] : [[0, 0], [width, height]];
            const d = points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${x + Number(point[0] || 0)} ${y + Number(point[1] || 0)}`).join(' ');
            return <path key={index} d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} />;
          }
          return null;
        })}
      </svg>
    </div>
  );
}

function ArchiveViewer({ fileName, fileSize, fileModified, onDownload }: { fileName: string; fileSize?: number; fileModified?: string; onDownload: () => void }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] surface-card overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Archive className="w-7 h-7 text-[var(--color-accent)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-text)] break-all leading-tight">{fileName}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Archive inspection is planned; download the original bundle for now.</p>
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)] text-xs">
          {fileSize != null && <div className="flex justify-between px-5 py-2"><span className="text-[var(--color-text-muted)]">Size</span><span>{formatFileSize(fileSize)}</span></div>}
          {fileModified && <div className="flex justify-between px-5 py-2"><span className="text-[var(--color-text-muted)]">Modified</span><span>{new Date(fileModified).toLocaleString()}</span></div>}
        </div>
        <div className="p-4 border-t border-[var(--color-border)]">
          <button onClick={onDownload} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity">
            <Download className="w-3.5 h-3.5" />
            Download archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ConversionPreviewViewer({ frames, fileName }: { frames: ConversionFrame[]; fileName: string }) {
  const [active, setActive] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const frame = frames[active];

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (!frame?.previewPath) return;
    setFrameError(null);
    setBlobUrl(null);
    previewContainerFile('', frame.previewPath)
      .then(async (response) => {
        if (!response.ok) throw new Error('Preview frame unavailable');
        const blob = await response.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setBlobUrl(null);
          setFrameError(err instanceof Error ? err.message : 'Failed to load preview frame');
        }
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [frame?.previewPath, retryToken]);

  if (frames.length === 0) return null;
  return (
    <div className="w-full h-full grid grid-cols-[140px_minmax(0,1fr)]">
      <div className="border-r border-white/[0.06] overflow-y-auto p-2 space-y-2">
        {frames.map((item, index) => (
          <button
            key={item.previewPath}
            onClick={() => setActive(index)}
            className={`w-full rounded border p-1.5 text-left ${index === active ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
          >
            <div className="aspect-video bg-black/30 rounded flex items-center justify-center mb-1">
              <FileText className="w-5 h-5 text-white/30" />
            </div>
            <div className="text-[11px] text-[var(--color-text)] truncate">{item.label || `Page ${index + 1}`}</div>
          </button>
        ))}
      </div>
      <div className="min-w-0 min-h-0 flex flex-col">
        <div className="px-3 py-1.5 border-b border-white/[0.06] text-xs text-[var(--color-text-muted)]">
          Conversion preview for {fileName}
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-black/40 flex items-center justify-center p-5">
          {blobUrl ? (
            <img src={blobUrl} alt={frame?.label || fileName} className="max-w-full max-h-full bg-white rounded" />
          ) : frameError ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-xs text-[var(--color-text-muted)]">{frameError}</div>
              <button
                onClick={() => setRetryToken((t) => t + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/15 text-[var(--color-text)] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          ) : (
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
          )}
        </div>
      </div>
    </div>
  );
}

function DocTypeIcon({ type, fileName, className = 'w-4 h-4' }: { type: DocType; fileName: string; className?: string }) {
  const iconKind = getFileIconKind(fileName);
  if (iconKind === 'json') return <Braces className={`${className} text-cyan-400`} />;
  if (iconKind === 'spreadsheet') return <Table className={`${className} text-green-400`} />;
  if (iconKind === 'slides') return <Presentation className={`${className} text-orange-400`} />;
  if (iconKind === 'image') return <Image className={`${className} text-purple-400`} />;
  if (iconKind === 'audio') return <Volume2 className={`${className} text-purple-400`} />;
  if (iconKind === 'video') return <Film className={`${className} text-purple-400`} />;
  if (iconKind === 'archive') return <Archive className={`${className} text-yellow-400`} />;
  if (iconKind === 'html' || iconKind === 'code') return <Code className={`${className} text-orange-400`} />;
  if (iconKind === 'markdown') return <FileText className={`${className} text-[var(--color-accent)]`} />;
  switch (type) {
    case 'pdf': return <FileText className={`${className} text-red-400`} />;
    case 'docx': case 'convertible': return <FileText className={`${className} text-blue-400`} />;
    case 'xlsx': case 'csv': case 'tsv': return <Table className={`${className} text-green-400`} />;
    case 'json': return <Braces className={`${className} text-cyan-400`} />;
    case 'pptx': return <Presentation className={`${className} text-orange-400`} />;
    case 'image': return <Image className={`${className} text-purple-400`} />;
    case 'audio': return <Volume2 className={`${className} text-purple-400`} />;
    case 'video': return <Film className={`${className} text-purple-400`} />;
    case 'archive': return <Archive className={`${className} text-yellow-400`} />;
    case 'diagram': case 'excalidraw': return <Maximize2 className={`${className} text-cyan-400`} />;
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

function parseDelimitedRows(text: string, delimiter: ',' | '\t'): SheetData[] {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
  });
  const parsed = result.data.map(row => row.map(cell => cell == null ? '' : String(cell)));
  const columnCount = parsed.reduce((max, row) => Math.max(max, row.length), 0);
  const firstRow = parsed[0] || [];
  const headers = Array.from({ length: columnCount }, (_, index) => firstRow[index] || spreadsheetColumnName(index));
  return [{
    name: delimiter === '\t' ? 'TSV' : 'CSV',
    headers,
    rows: parsed.slice(1).map(row => Array.from({ length: columnCount }, (_, index) => row[index] || '')),
  }];
}

// ── Detect effective doc type ────────────────────────────────────────────
// Check extension-based document type first (markdown, csv, pdf, etc.)
// Fall back to 'text' for text-editable files, 'unknown' for binaries.
function resolveDocType(filePath: string | undefined): DocType {
  if (!filePath) return 'unknown';
  const docType = getDocumentType(filePath);
  if (docType !== 'unknown') return docType;
  if (isTextFile(filePath)) return 'text';
  return 'unknown';
}

function fingerprintFromMeta(meta: FileMetaResponse): string {
  return meta.revision || `${meta.size}:${meta.modified}`;
}

function fingerprintFromResponse(response: Response, blob: Blob): string {
  const etag = response.headers.get('etag');
  if (etag) return etag;
  const lastModified = response.headers.get('last-modified');
  if (lastModified) return `${blob.size}:${lastModified}`;
  return `${blob.size}`;
}

// ── Main component ───────────────────────────────────────────────────────

export function DocumentViewerWindow({ config }: { config: WindowConfig }) {
  const windowId = config.id;
  const instanceId = useComputerStore(s => s.instanceId);
  const filePath = config.metadata?.filePath as string | undefined;
  const driveFileId = config.metadata?.driveFileId as string | undefined;
  const fileSize = config.metadata?.fileSize as number | undefined;
  const fileModified = config.metadata?.fileModified as string | undefined;
  const fileName = filePath ? fileNameFromWorkspacePath(filePath) : 'Document';
  const docType = useMemo(() => resolveDocType(filePath), [filePath]);

  // ── Text/code editing via editorStore ──
  const isTextMode = docType === 'text';
  const editorFile = useEditorStore(s => isTextMode ? s.files[windowId] : undefined);
  const updateContent = useEditorStore(s => s.updateContent);
  const saveEditorFile = useEditorStore(s => s.saveFile);

  const monacoLang = useMemo(() => fileName ? getMonacoLanguage(fileName) : 'plaintext', [fileName]);
  const languageLabel = getLanguageLabel(monacoLang);

  // ── Document viewing state ──
  const [loading, setLoading] = useState(!isTextMode);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<SheetData[] | null>(null);
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [editedSheets, setEditedSheets] = useState<SheetData[] | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conversionFrames, setConversionFrames] = useState<ConversionFrame[] | null>(null);

  const hasDocumentContent = Boolean(
    blobUrl || xlsxSheets || markdownText || htmlContent || rawText || conversionFrames,
  );
  const showBlockingLoader = loading && !hasDocumentContent;
  const hasRawToggle = fileHasRawToggle(fileName);
  const canEdit = (hasRawToggle || isTextMode) && !driveFileId && !!instanceId && !!filePath;
  const isTableEditable = (docType === 'csv' || docType === 'tsv') && !driveFileId && !!instanceId && !!filePath;
  // Agent-editable formats: everything the backend document tool can revise
  // (extension-based — the registry routes docx/pptx to the conversion
  // renderer, so docType never equals 'docx'/'pptx').
  const canEditWithAgent = !driveFileId && !!filePath && /\.(docx|xlsx|pptx|pdf|csv)$/i.test(filePath);
  const isDirtyDoc = editedText !== null && editedText !== rawText;
  const activeSheets = editedSheets ?? xlsxSheets;
  const isDirtyTable = editedSheets !== null && xlsxSheets !== null
    && JSON.stringify(editedSheets) !== JSON.stringify(xlsxSheets);
  const isDirtyText = isTextMode && editorFile ? editorFile.content !== editorFile.savedContent : false;

  // Editor cursor/selection tracking
  const [cursorInfo, setCursorInfo] = useState({ ln: 1, col: 1, selected: 0, selectedLines: 0 });
  const [wordWrap, setWordWrap] = useState(false);

  const blobUrlRef = useRef<string | null>(null);
  const loadedRevisionRef = useRef<string | null>(null);
  const hasContentRef = useRef(false);
  const loadFileRef = useRef<(opts?: { silent?: boolean; force?: boolean }) => Promise<void>>(async () => {});
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const saveRef = useRef(() => { if (isTextMode) saveEditorFile(windowId); });
  saveRef.current = () => { if (isTextMode) saveEditorFile(windowId); };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

  // User interaction keeps agent-opened viewers from auto-closing.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const retain = () => retainAgentOpenedWindow(windowId, 'document-viewer');
    el.addEventListener('pointerdown', retain, { capture: true });
    el.addEventListener('keydown', retain, { capture: true });
    el.addEventListener('wheel', retain, { passive: true, capture: true });
    return () => {
      el.removeEventListener('pointerdown', retain, { capture: true });
      el.removeEventListener('keydown', retain, { capture: true });
      el.removeEventListener('wheel', retain, { capture: true });
    };
  }, [windowId, isTextMode]);

  // ── Monaco mount handler ──
  const handleEditorMount: OnMount = useCallback((_editor, monaco) => {
    editorRef.current = _editor;
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      trailingCommas: 'error',
      enableSchemaRequest: true,
    });

    // Save
    _editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current(),
    });

    _editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: (ed) => ed.getAction('editor.action.formatDocument')?.run(),
    });

    _editor.addAction({
      id: 'toggle-word-wrap',
      label: 'Toggle Word Wrap',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: (ed) => ed.updateOptions({ wordWrap: ed.getOption(monaco.editor.EditorOption.wordWrap) === 'on' ? 'off' : 'on' }),
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

    // Never steal keyboard focus from something the user is typing in —
    // agent file writes mount/refresh this editor mid-conversation.
    if (!isTextEntryFocused()) _editor.focus();
  }, []);

  // Focus editor when text file finishes loading
  useEffect(() => {
    if (editorRef.current && isTextMode && editorFile && !editorFile.loading && !isTextEntryFocused()) {
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [isTextMode, editorFile?.loading]);

  // Reset viewer state when the target file changes within the same window.
  useEffect(() => {
    loadedRevisionRef.current = null;
    hasContentRef.current = false;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobUrl(null);
    setXlsxSheets(null);
    setMarkdownText(null);
    setHtmlContent(null);
    setRawText(null);
    setEditedSheets(null);
    setConversionFrames(null);
    setError(null);
    setLoading(!isTextMode);
  }, [filePath, driveFileId, isTextMode]);

  // ── Document loading (non-text files) ──
  const loadFile = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (isTextMode) return; // text files use editorStore
    if (!driveFileId && (!instanceId || !filePath)) {
      setError('No file path specified');
      setLoading(false);
      return;
    }

    const force = Boolean(opts?.force);
    const silent = Boolean(opts?.silent) || hasContentRef.current;

    // Lightweight revision check before downloading workspace files.
    if (!force && !driveFileId && instanceId && filePath && loadedRevisionRef.current) {
      try {
        const meta = await getFileMeta(instanceId, filePath);
        if (meta.success && fingerprintFromMeta(meta.data) === loadedRevisionRef.current) {
          return;
        }
      } catch { /* fall through to full load */ }
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const response = driveFileId
        ? await downloadDriveFile(driveFileId)
        : await downloadContainerFile(instanceId!, filePath!);
      if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

      const blob = await response.blob();
      const fingerprint = fingerprintFromResponse(response, blob);
      if (!force && loadedRevisionRef.current === fingerprint) {
        return;
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      switch (docType) {
        case 'convertible': {
          setConversionFrames(null);
          if (driveFileId) {
            setError('Conversion previews are not available for Drive files yet. Download the original to view externally.');
            break;
          }
          const result = await convertContainerFilePreview(instanceId!, filePath!, 12);
          if (!result.success) throw new Error(result.error || 'Failed to create conversion preview');
          setConversionFrames(result.data.frames);
          break;
        }
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
        case 'audio':
        case 'video': {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
        case 'xlsx': {
          const arrayBuffer = await blob.arrayBuffer();
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
        case 'csv': {
          const text = await blob.text();
          setRawText(text);
          setXlsxSheets(parseDelimitedRows(text, ','));
          break;
        }
        case 'tsv': {
          const text = await blob.text();
          setRawText(text);
          setXlsxSheets(parseDelimitedRows(text, '\t'));
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
        case 'json':
        case 'diagram':
        case 'excalidraw': {
          const text = await blob.text();
          setRawText(text);
          break;
        }
        case 'archive': {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
        default: {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          break;
        }
      }

      loadedRevisionRef.current = fingerprint;
      hasContentRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isTextMode, instanceId, filePath, driveFileId, docType]);

  loadFileRef.current = loadFile;

  // Load document when file identity changes.
  useEffect(() => {
    if (!isTextMode) void loadFile({ force: true });
  }, [isTextMode, instanceId, filePath, driveFileId, docType, loadFile]);

  // Auto-reload documents when file changes (poll metadata every 5s).
  useEffect(() => {
    if (isTextMode || driveFileId || !instanceId || !filePath) return;
    const interval = setInterval(async () => {
      try {
        const meta = await getFileMeta(instanceId, filePath);
        if (!meta.success) return;
        const fingerprint = fingerprintFromMeta(meta.data);
        if (fingerprint !== loadedRevisionRef.current) {
          void loadFileRef.current({ silent: true });
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [isTextMode, instanceId, filePath, driveFileId]);

  // Instant reload when agent writes to this file (via signal store).
  const reloadSignal = useDocViewerSignalStore(s => filePath ? s.reloadSignals[filePath] : 0);
  useEffect(() => {
    if (!isTextMode && reloadSignal && reloadSignal > 0) {
      void loadFile({ silent: hasContentRef.current });
    }
  }, [reloadSignal, isTextMode, loadFile]);

  // ── Save handler for markdown/CSV raw editing ──
  const handleSaveDoc = useCallback(async () => {
    if (!canEdit || editedText === null || !isDirtyDoc) return;
    setSaving(true);
    try {
      const result = await writeFile(instanceId!, filePath!, editedText);
      if (result.success) {
        setError(null);
        setRawText(editedText);
        if (docType === 'markdown') setMarkdownText(editedText);
        else if (docType === 'html') setHtmlContent(editedText);
        else if (docType === 'tsv') setXlsxSheets(parseDelimitedRows(editedText, '\t'));
        else if (docType === 'csv') setXlsxSheets(parseDelimitedRows(editedText, ','));
        else if (docType === 'json' || docType === 'diagram' || docType === 'excalidraw') setRawText(editedText);
        setEditedText(null);
      } else {
        setError(result.status === 409 ? 'File changed on the server. Reload before saving again.' : result.error || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit, editedText, isDirtyDoc, instanceId, filePath, docType]);

  const handleSaveTable = useCallback(async () => {
    if (!isTableEditable || !editedSheets || !isDirtyTable || !instanceId || !filePath) return;
    const delimiter = docType === 'tsv' ? '\t' : ',';
    const nextText = serializeDelimitedRows(editedSheets[0] || { name: '', headers: [], rows: [] }, delimiter);
    setSaving(true);
    try {
      const result = await writeFile(instanceId, filePath, nextText);
      if (result.success) {
        setError(null);
        setRawText(nextText);
        setXlsxSheets(editedSheets);
        setEditedSheets(null);
      } else {
        setError(result.status === 409 ? 'File changed on the server. Reload before saving again.' : result.error || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }, [isTableEditable, editedSheets, isDirtyTable, instanceId, filePath, docType]);

  const handleEditWithAgent = useCallback(() => {
    if (!filePath) return;
    const kind = docType === 'docx' ? 'Word document' : docType === 'xlsx' ? 'spreadsheet' : 'presentation';
    openSpotlightPrompt(
      `Edit the ${kind} at ${filePath}. Open it, make the requested changes, and save the updated file back to the same path.`,
    );
  }, [docType, filePath]);

  // Cmd/Ctrl+S for raw document editing
  useEffect(() => {
    if (isTextMode) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (canEdit && isDirtyDoc) {
          e.preventDefault();
          handleSaveDoc();
        } else if (isTableEditable && isDirtyTable) {
          e.preventDefault();
          void handleSaveTable();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTextMode, canEdit, isDirtyDoc, handleSaveDoc, isTableEditable, isDirtyTable, handleSaveTable]);

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
      <div ref={rootRef} className="flex flex-col h-full">
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
            {file?.conflict && <span className="px-1.5 text-red-300">Conflict: reload before saving</span>}
            {file?.error && !file.loading && <span className="px-1.5 text-red-300 truncate max-w-[260px]" title={file.error}>{file.error}</span>}
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
    <div ref={rootRef} className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06]">
        <DocTypeIcon type={docType} fileName={fileName} />
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
        {isTableEditable && isDirtyTable && (
          <button onClick={() => void handleSaveTable()} disabled={saving} className="p-1 rounded hover:bg-white/10 text-[var(--color-accent)]" title="Save table (⌘S)">
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
          </button>
        )}
        {canEditWithAgent && (
          <button
            type="button"
            onClick={handleEditWithAgent}
            className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-text)] whitespace-nowrap"
            title="Ask Construct to edit this file"
          >
            Edit with agent
          </button>
        )}
        <button onClick={() => void loadFile({ silent: hasDocumentContent, force: true })} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Reload">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Download">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showBlockingLoader && (
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
            <button onClick={() => void loadFile({ force: true })} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-[var(--color-text)]">Retry</button>
          </div>
        )}

        {!showBlockingLoader && !error && (<>
          {/* Raw/source mode with Monaco editor */}
          {rawMode && rawText !== null ? (
            <div className="w-full h-full relative">
              {canEdit ? (
                <MonacoEditor
                  height="100%"
                  language={getMonacoLanguage(fileName)}
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
            {docType === 'convertible' && conversionFrames && <ConversionPreviewViewer frames={conversionFrames} fileName={fileName} />}
            {docType === 'image' && blobUrl && <ImageViewer blobUrl={blobUrl} fileName={fileName} />}
            {(docType === 'audio' || docType === 'video') && blobUrl && <MediaViewer blobUrl={blobUrl} type={docType} fileName={fileName} />}
            {(docType === 'xlsx' || docType === 'csv' || docType === 'tsv') && activeSheets !== null && (
              <XlsxViewer
                sheets={activeSheets}
                editable={isTableEditable}
                onSheetChange={(nextSheet, sheetIndex) => {
                  setEditedSheets((current) => {
                    const base = current ?? xlsxSheets ?? [];
                    return base.map((sheet, index) => (index === sheetIndex ? nextSheet : sheet));
                  });
                }}
              />
            )}
            {docType === 'markdown' && markdownText !== null && (
              <div className="w-full h-full overflow-auto px-6 py-3">
                <div className="max-w-3xl mx-auto markdown-rendered [&>*:first-child]:mt-0">
                  <MarkdownRenderer content={markdownText} />
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
            {docType === 'json' && rawText !== null && <JsonFileViewer text={rawText} />}
            {docType === 'diagram' && rawText !== null && <DiagramViewer text={rawText} fileName={fileName} />}
            {docType === 'excalidraw' && rawText !== null && <ExcalidrawViewer text={rawText} />}
            {docType === 'archive' && <ArchiveViewer fileName={fileName} fileSize={fileSize} fileModified={fileModified} onDownload={handleDownload} />}
            {docType === 'unknown' && (
              <div className="w-full h-full flex items-center justify-center p-6">
                <div className="w-full max-w-xs rounded-xl border border-[var(--color-border)] surface-card shadow-lg overflow-hidden">
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
