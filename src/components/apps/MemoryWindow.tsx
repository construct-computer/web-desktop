import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  AlertCircle,
  Brain,
  RefreshCw,
  Search,
  List,
  Network,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMemories, deleteMemory, type Mem0Memory, type Mem0Relation } from '@/services/api';
import type { WindowConfig } from '@/types';

// ── Force-directed graph types ──

interface GraphNode {
  id: string;
  label: string;
  type: string; // entity type from relations (e.g. "person", "concept")
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned?: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

// ── Color palette for entity types ──

const TYPE_COLORS: Record<string, string> = {
  person: '#6366f1',    // indigo
  concept: '#8b5cf6',   // violet
  tool: '#3b82f6',      // blue
  project: '#10b981',   // emerald
  location: '#f59e0b',  // amber
  event: '#ef4444',     // red
  organization: '#ec4899', // pink
  technology: '#06b6d4',// cyan
  file: '#84cc16',      // lime
};

function getTypeColor(type: string): string {
  const key = type.toLowerCase();
  return TYPE_COLORS[key] || '#94a3b8'; // default slate
}

// ── Force simulation ──

function buildGraph(relations: Mem0Relation[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const rel of relations) {
    if (!nodeMap.has(rel.source)) {
      nodeMap.set(rel.source, {
        id: rel.source,
        label: rel.source,
        type: rel.source_type || 'concept',
        x: Math.random() * 600 + 100,
        y: Math.random() * 400 + 100,
        vx: 0,
        vy: 0,
      });
    }
    if (!nodeMap.has(rel.target)) {
      nodeMap.set(rel.target, {
        id: rel.target,
        label: rel.target,
        type: rel.target_type || 'concept',
        x: Math.random() * 600 + 100,
        y: Math.random() * 400 + 100,
        vx: 0,
        vy: 0,
      });
    }
    edges.push({ source: rel.source, target: rel.target, label: rel.relationship });
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

function tickSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number,
) {
  const REPULSION = 3000;
  const SPRING_LENGTH = 120;
  const SPRING_K = 0.015;
  const CENTER_GRAVITY = 0.01;
  const DAMPING = 0.85;

  const cx = width / 2;
  const cy = height / 2;

  // Repulsion between all node pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < 20) dist = 20;
      const force = (REPULSION / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }
  }

  // Spring forces along edges
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const displacement = dist - SPRING_LENGTH;
    const force = SPRING_K * displacement * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  // Center gravity + integration
  for (const node of nodes) {
    if (node.pinned) continue;
    node.vx += (cx - node.x) * CENTER_GRAVITY * alpha;
    node.vy += (cy - node.y) * CENTER_GRAVITY * alpha;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    // Keep within bounds
    node.x = Math.max(30, Math.min(width - 30, node.x));
    node.y = Math.max(30, Math.min(height - 30, node.y));
  }
}

// ── Canvas graph renderer ──

function GraphCanvas({
  relations,
  selectedNode,
  onSelectNode,
}: {
  relations: Mem0Relation[];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const alphaRef = useRef(1);
  const rafRef = useRef<number>(0);
  const dragNodeRef = useRef<GraphNode | null>(null);
  const hoveredRef = useRef<string | null>(null);

  // Rebuild graph when relations change
  useEffect(() => {
    graphRef.current = buildGraph(relations);
    alphaRef.current = 1;
  }, [relations]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    function frame() {
      if (!running || !ctx || !canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { nodes, edges } = graphRef.current;

      // Tick physics
      if (alphaRef.current > 0.001) {
        tickSimulation(nodes, edges, w, h, alphaRef.current);
        alphaRef.current *= 0.995;
      }

      const nodeById = new Map(nodes.map(n => [n.id, n]));

      // Detect theme
      const isDark = document.documentElement.classList.contains('dark');

      // Draw edges
      for (const edge of edges) {
        const a = nodeById.get(edge.source);
        const b = nodeById.get(edge.target);
        if (!a || !b) continue;

        const isHighlighted = selectedNode === edge.source || selectedNode === edge.target;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = isHighlighted
          ? (isDark ? 'rgba(167,139,250,0.6)' : 'rgba(99,102,241,0.5)')
          : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();

        // Edge label
        if (isHighlighted && edge.label) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.font = '10px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mx, my - 6);
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredRef.current === node.id;
        const isConnected = selectedNode
          ? edges.some(e => (e.source === selectedNode && e.target === node.id) || (e.target === selectedNode && e.source === node.id))
          : false;
        const dimmed = selectedNode && !isSelected && !isConnected;

        const color = getTypeColor(node.type);
        const radius = isSelected ? 8 : isHovered ? 7 : 6;

        // Glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = color + '25';
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = dimmed ? (isDark ? 'rgba(100,100,120,0.3)' : 'rgba(200,200,210,0.5)') : color;
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.strokeStyle = isDark ? '#fff' : '#000';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label
        ctx.font = `${isSelected ? '600 ' : ''}11px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dimmed
          ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')
          : (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)');
        ctx.fillText(node.label, node.x, node.y + radius + 3);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [selectedNode, relations]);

  // Hit-test helper
  const hitTest = useCallback((e: React.MouseEvent): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const node of graphRef.current.nodes) {
      const dx = node.x - mx;
      const dy = node.y - my;
      if (dx * dx + dy * dy < 144) return node; // radius ~12
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = hitTest(e);
    if (node) {
      dragNodeRef.current = node;
      node.pinned = true;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      onSelectNode(node.id);
    } else {
      onSelectNode(null);
    }
  }, [hitTest, onSelectNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragNodeRef.current;
    if (drag) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      drag.x = e.clientX - rect.left;
      drag.y = e.clientY - rect.top;
      alphaRef.current = Math.max(alphaRef.current, 0.1);
    } else {
      const node = hitTest(e);
      hoveredRef.current = node?.id ?? null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = node ? 'pointer' : 'default';
    }
  }, [hitTest]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.pinned = false;
      dragNodeRef.current = null;
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {relations.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] pointer-events-none">
          <Network className="w-10 h-10 opacity-30 mb-2" />
          <p className="text-sm opacity-60">No graph relations yet</p>
          <p className="text-xs opacity-40 mt-1">Relations will appear as the agent builds knowledge</p>
        </div>
      )}
    </div>
  );
}

// ── Memory list item ──

function formatMemoryDate(ts?: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

// ── Main component ──

type ViewMode = 'graph' | 'list';

export function MemoryWindow({ config: _config }: { config: WindowConfig }) {
  const [memories, setMemories] = useState<Mem0Memory[]>([]);
  const [relations, setRelations] = useState<Mem0Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('graph');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  void _config;

  const handleDeleteMemory = useCallback(async (memoryId: string) => {
    setDeletingId(memoryId);
    try {
      const result = await deleteMemory(memoryId);
      if (result.success) {
        setMemories(prev => prev.filter(m => m.id !== memoryId));
        if (expandedId === memoryId) setExpandedId(null);
      } else {
        setError(result.error || 'Failed to delete memory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete memory');
    } finally {
      setDeletingId(null);
    }
  }, [expandedId]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await getMemories();
      if (result.success) {
        const mems = result.data.memories || [];
        const rels = result.data.relations || [];
        setMemories(mems);
        setRelations(rels);
        if (rels.length === 0) setView('list');
      } else {
        setError(result.error || 'Failed to load memories');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchData();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  // Filter memories by search
  const filtered = searchQuery
    ? memories.filter(m => m.memory.toLowerCase().includes(searchQuery.toLowerCase()))
    : memories;

  // When a graph node is selected, filter the memory list to show related memories
  const displayMemories = selectedNode
    ? filtered.filter(m => m.memory.toLowerCase().includes(selectedNode.toLowerCase()))
    : filtered;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 h-full bg-[var(--color-surface)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-[var(--color-surface)] rounded-md border border-[var(--color-border)] p-0.5">
          <button
            className={cn(
              'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
              view === 'graph' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]',
            )}
            onClick={() => setView('graph')}
          >
            <Network className="w-3 h-3" /> Graph
          </button>
          <button
            className={cn(
              'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
              view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]',
            )}
            onClick={() => setView('list')}
          >
            <List className="w-3 h-3" /> List
          </button>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-full max-w-[180px] min-w-0 text-xs rounded-md border border-[var(--color-border)]
                       bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        {/* Stats */}
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}
          {relations.length > 0 && <>, {relations.length} relation{relations.length !== 1 ? 's' : ''}</>}
        </span>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 rounded hover:bg-[var(--color-accent-muted)] transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : view === 'graph' ? (
        /* Graph view — graph fills canvas, memory list is an overlay sidebar when a node is selected */
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0">
            <GraphCanvas
              relations={relations}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          </div>

          {/* Selected node sidebar */}
          {selectedNode && (
            <div className="w-56 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getTypeColor(
                    relations.find(r => r.source === selectedNode)?.source_type ||
                    relations.find(r => r.target === selectedNode)?.target_type || 'concept'
                  ) }}
                />
                <span className="text-xs font-medium truncate">{selectedNode}</span>
                <button
                  className="ml-auto text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  onClick={() => setSelectedNode(null)}
                >
                  clear
                </button>
              </div>

              {/* Connected relations */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Relations</p>
                {relations
                  .filter(r => r.source === selectedNode || r.target === selectedNode)
                  .map((r, i) => {
                    const other = r.source === selectedNode ? r.target : r.source;
                    const direction = r.source === selectedNode ? '->' : '<-';
                    return (
                      <button
                        key={i}
                        className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-[var(--color-accent-muted)] transition-colors"
                        onClick={() => setSelectedNode(other)}
                      >
                        <span className="text-[var(--color-text-muted)]">{direction}</span>{' '}
                        <span className="font-medium">{other}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({r.relationship})</span>
                      </button>
                    );
                  })}

                {/* Related memories */}
                {displayMemories.length > 0 && (
                  <>
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mt-3 mb-1">Memories</p>
                    {displayMemories.slice(0, 10).map(m => (
                      <div key={m.id} className="group px-2 py-1.5 rounded bg-black/[0.03] dark:bg-white/[0.03] text-[11px] leading-relaxed flex items-start gap-1">
                        <span className="flex-1 min-w-0">{m.memory}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteMemory(m.id); }}
                          disabled={deletingId === m.id}
                          className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-all"
                          title="Delete memory"
                        >
                          {deletingId === m.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-y-auto min-h-0">
          {displayMemories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] h-full min-h-[200px]">
              <Brain className="w-10 h-10 opacity-40" />
              <p className="text-sm">No memories yet</p>
              <p className="text-xs opacity-60">
                {searchQuery ? 'Try a different search term' : 'Memories will appear as you interact with the agent'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/50">
              {displayMemories.map(memory => {
                const isExpanded = expandedId === memory.id;
                return (
                  <div key={memory.id}>
                    <button
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--color-accent-muted)] transition-colors text-left"
                      onClick={() => setExpandedId(isExpanded ? null : memory.id)}
                    >
                      <Brain className="w-4 h-4 mt-0.5 shrink-0 text-violet-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-relaxed">{memory.memory}</p>
                        {memory.categories && memory.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {memory.categories.map(cat => (
                              <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0 mt-0.5">
                        {formatMemoryDate(memory.updated_at || memory.created_at)}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="ml-6.5 p-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--color-border)]/50 space-y-1.5">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
                            <span>ID: <strong className="font-mono text-[var(--color-text)]">{memory.id.slice(0, 12)}...</strong></span>
                            {memory.created_at && (
                              <span>Created: <strong className="text-[var(--color-text)]">{formatMemoryDate(memory.created_at)}</strong></span>
                            )}
                            {memory.updated_at && (
                              <span>Updated: <strong className="text-[var(--color-text)]">{formatMemoryDate(memory.updated_at)}</strong></span>
                            )}
                            {memory.hash && (
                              <span>Hash: <strong className="font-mono text-[var(--color-text)]">{memory.hash.slice(0, 8)}</strong></span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteMemory(memory.id); }}
                            disabled={deletingId === memory.id}
                            className="flex items-center gap-1 px-2 py-1 mt-1 text-[10px] rounded
                                       text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            {deletingId === memory.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                            Delete memory
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Graph legend — only in graph view when there are relations */}
      {view === 'graph' && relations.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-titlebar)]">
          <span className="text-[10px] text-[var(--color-text-muted)]">Entity types:</span>
          {Array.from(new Set(
            relations.flatMap(r => [
              { type: r.source_type, color: getTypeColor(r.source_type) },
              { type: r.target_type, color: getTypeColor(r.target_type) },
            ]).map(t => JSON.stringify(t))
          )).map(s => JSON.parse(s) as { type: string; color: string }).map(t => (
            <div key={t.type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="text-[10px] text-[var(--color-text-muted)]">{t.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
