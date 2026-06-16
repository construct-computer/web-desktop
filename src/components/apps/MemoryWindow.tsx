import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  Search,
  List,
  Network,
  Trash2,
  Repeat,
} from 'lucide-react';
import iconMemory from '@/icons/memory.png';
import { cn } from '@/lib/utils';
import { FreshnessText, RefreshButton, StatusBanner, AnimatedListItem } from '@/components/ui';
import { useFreshness } from '@/hooks/useFreshness';
import { useAnimatedList } from '@/hooks/useAnimatedList';
import { MEMORY_CHANGED_EVENT, type MemoryChangedDetail } from '@/lib/agentUiEvents';
import {
  getMemories,
  deleteMemory,
  getLearnedPolicies,
  expireLearnedPolicy,
  type MemoryRecord,
  type MemoryRelation,
  type AutopilotLearnedPolicySnapshot,
} from '@/services/api';
import { formatLearnedPolicyDisplay } from '@/lib/learnedPolicyDisplay';
import type { WindowConfig } from '@/types';
import {
  ALPHA_COOLING,
  ALPHA_MIN,
  dimmedNodeFill,
  edgeColor,
  edgeLabelColor,
  hitTestPoint,
  isDarkMode,
  isEdgeHighlighted,
  isNodeDimmed,
  nodeLabelColor,
  nodeStrokeColor,
  resizeCanvasToContainer,
  tickFlatSimulation,
  type PhysicsEdge,
  type PhysicsNode,
} from '@/lib/forceGraph';

// ── Force-directed graph types ──

interface GraphNode extends PhysicsNode {
  type: string; // entity type from relations (e.g. "person", "concept")
}

type GraphEdge = PhysicsEdge;

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

function buildGraph(relations: MemoryRelation[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
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

// ── Canvas graph renderer ──

function GraphCanvas({
  relations,
  selectedNode,
  onSelectNode,
}: {
  relations: MemoryRelation[];
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
      const w = rect.width;
      const h = rect.height;
      resizeCanvasToContainer(canvas, w, h);
      ctx.clearRect(0, 0, w, h);

      const { nodes, edges } = graphRef.current;

      if (alphaRef.current > ALPHA_MIN) {
        tickFlatSimulation(nodes, edges, w, h, alphaRef.current);
        alphaRef.current *= ALPHA_COOLING;
      }

      const nodeById = new Map(nodes.map(n => [n.id, n]));
      const isDark = isDarkMode();

      for (const edge of edges) {
        const a = nodeById.get(edge.source);
        const b = nodeById.get(edge.target);
        if (!a || !b) continue;

        const isHighlighted = isEdgeHighlighted(edge, selectedNode);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = edgeColor(isHighlighted, isDark);
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();

        if (isHighlighted && edge.label) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.font = '10px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = edgeLabelColor(isDark);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mx, my - 6);
        }
      }

      for (const node of nodes) {
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredRef.current === node.id;
        const dimmed = isNodeDimmed(node.id, selectedNode, edges);

        const color = getTypeColor(node.type);
        const radius = isSelected ? 8 : isHovered ? 7 : 6;

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = color + '25';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = dimmed ? dimmedNodeFill(isDark) : color;
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.strokeStyle = nodeStrokeColor(isDark);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.font = `${isSelected ? '600 ' : ''}11px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = nodeLabelColor(dimmed, isDark);
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
    return hitTestPoint(graphRef.current.nodes, mx, my, () => 12) as GraphNode | null;
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
          <p className="text-xs opacity-40 mt-1">Connections will appear as Construct builds knowledge</p>
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

type ViewMode = 'graph' | 'list' | 'defaults';

function formatPolicyDate(ts?: number | null): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export function MemoryWindow({ config }: { config: WindowConfig }) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [relations, setRelations] = useState<MemoryRelation[]>([]);
  const [learnedPolicies, setLearnedPolicies] = useState<AutopilotLearnedPolicySnapshot[]>([]);
  const [learnedPolicyCount, setLearnedPolicyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (config.metadata?.tab === 'defaults') return 'defaults';
    if (config.metadata?.tab === 'list') return 'list';
    return 'graph';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    const raw = config.metadata?.highlightMemoryId;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  });
  const [expandedPolicyId, setExpandedPolicyId] = useState<number | null>(() => {
    const raw = config.metadata?.highlightPolicyId;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forgettingPolicyId, setForgettingPolicyId] = useState<number | null>(null);

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
        if (rels.length === 0 && view !== 'defaults') setView('list');
      } else {
        setError(result.error || 'Failed to load memories');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    }
  }, [view]);

  const fetchDefaults = useCallback(async () => {
    try {
      setError(null);
      const result = await getLearnedPolicies();
      if (result.success) {
        setLearnedPolicies(result.data.policies || []);
        setLearnedPolicyCount(result.data.count ?? result.data.policies?.length ?? 0);
      } else {
        setError(result.error || 'Failed to load learned defaults');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load learned defaults');
    }
  }, []);

  const handleForgetPolicy = useCallback(async (policyId: number) => {
    setForgettingPolicyId(policyId);
    try {
      const result = await expireLearnedPolicy(policyId);
      if (result.success) {
        setLearnedPolicies((prev) => prev.filter((item) => item.id !== policyId));
        setLearnedPolicyCount((count) => Math.max(0, count - 1));
        if (expandedPolicyId === policyId) setExpandedPolicyId(null);
      } else {
        setError(result.error || 'Failed to forget default');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to forget default');
    } finally {
      setForgettingPolicyId(null);
    }
  }, [expandedPolicyId]);

  const freshness = useFreshness(fetchData, {
    intervalMs: 60_000,
    staleMs: 150_000,
    refreshOnFocus: true,
    refreshOnOnline: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await freshness.refreshNow();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMemoryChanged = (event: Event) => {
      const detail = (event as CustomEvent<MemoryChangedDetail>).detail;
      const items = Array.isArray(detail?.items) ? detail.items : [];
      if (items.length === 0) return;
      const now = new Date().toISOString();
      setMemories(prev => {
        const next = new Map(prev.map(memory => [memory.id, memory]));
        for (const item of items) {
          next.set(item.id, {
            ...(next.get(item.id) || { id: item.id, created_at: now }),
            id: item.id,
            memory: item.memory,
            updated_at: now,
          });
        }
        return [...next.values()].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
      });
      void freshness.refreshNow();
    };
    window.addEventListener(MEMORY_CHANGED_EVENT, onMemoryChanged);
    return () => window.removeEventListener(MEMORY_CHANGED_EVENT, onMemoryChanged);
  }, [freshness.refreshNow]);

  const handleRefresh = async () => {
    if (view === 'defaults') {
      setDefaultsLoading(true);
      await fetchDefaults();
      setDefaultsLoading(false);
      return;
    }
    const silent = memories.length > 0;
    if (!silent) setLoading(true);
    await freshness.refreshNow();
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    if (view !== 'defaults') return;
    let cancelled = false;
    (async () => {
      setDefaultsLoading(true);
      await fetchDefaults();
      if (!cancelled) setDefaultsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [view, fetchDefaults]);

  useEffect(() => {
    if (config.metadata?.tab === 'defaults') setView('defaults');
    else if (config.metadata?.tab === 'list') setView('list');
    const policyRaw = config.metadata?.highlightPolicyId;
    if (typeof policyRaw === 'number' && Number.isFinite(policyRaw)) {
      setExpandedPolicyId(policyRaw);
    }
    const memoryRaw = config.metadata?.highlightMemoryId;
    if (typeof memoryRaw === 'string' && memoryRaw.trim()) {
      setExpandedId(memoryRaw);
    }
  }, [config.metadata?.tab, config.metadata?.highlightPolicyId, config.metadata?.highlightMemoryId]);

  useEffect(() => {
    if (view !== 'defaults' || expandedPolicyId == null) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`learned-policy-${expandedPolicyId}`)?.scrollIntoView({ block: 'nearest' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [view, expandedPolicyId, learnedPolicies.length]);

  useEffect(() => {
    if (view !== 'list' || !expandedId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`memory-${expandedId}`)?.scrollIntoView({ block: 'nearest' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [view, expandedId, memories.length]);

  const switchView = (nextView: ViewMode) => {
    setSelectedNode(null);
    setView(nextView);
  };

  // Filter memories by search
  const searchedMemories = searchQuery
    ? memories.filter(m => m.memory.toLowerCase().includes(searchQuery.toLowerCase()))
    : memories;

  const animatedMemories = useAnimatedList(searchedMemories, (memory) => memory.id);
  const searchedPolicies = searchQuery
    ? learnedPolicies.filter((policy) => {
      const display = formatLearnedPolicyDisplay(policy);
      const haystack = `${display.title} ${display.description} ${display.scopeLabel}`.toLowerCase();
      return haystack.includes(searchQuery.toLowerCase());
    })
    : learnedPolicies;
  const animatedPolicies = useAnimatedList(searchedPolicies, (policy) => String(policy.id));
  const showBlockingLoader = view === 'defaults'
    ? defaultsLoading && learnedPolicies.length === 0
    : loading && memories.length === 0;

  // Graph node selection is local to the Connections sidebar and never affects List view.
  const nodeMemories = selectedNode
    ? searchedMemories.filter(m => m.memory.toLowerCase().includes(selectedNode.toLowerCase()))
    : [];

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
            onClick={() => switchView('graph')}
          >
            <Network className="w-3 h-3" /> Connections
          </button>
          <button
            className={cn(
              'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
              view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]',
            )}
            onClick={() => switchView('list')}
          >
            <List className="w-3 h-3" /> Facts
          </button>
          <button
            className={cn(
              'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
              view === 'defaults' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]',
            )}
            onClick={() => switchView('defaults')}
          >
            <Repeat className="w-3 h-3" /> Defaults
          </button>
        </div>

        <div className="flex-1" />

        <span className="hidden text-[10px] text-[var(--color-text-muted)] md:inline">
          <FreshnessText
            lastUpdatedAt={freshness.lastUpdatedAt}
            now={freshness.now}
            isRefreshing={freshness.isRefreshing || loading}
            isStale={freshness.isStale}
          />
        </span>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder={view === 'defaults' ? 'Search defaults...' : 'Search knowledge...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-full max-w-[180px] min-w-0 text-xs rounded-md border border-[var(--color-border)]
                       bg-[var(--color-surface)] focus:outline-none"
          />
        </div>

        {/* Stats */}
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {view === 'defaults'
            ? `${learnedPolicyCount} default${learnedPolicyCount === 1 ? '' : 's'}`
            : <>
              {memories.length} item{memories.length !== 1 ? 's' : ''}
              {relations.length > 0 && <>, {relations.length} connection{relations.length !== 1 ? 's' : ''}</>}
            </>}
        </span>

        {/* Refresh */}
        <RefreshButton
          onClick={() => void handleRefresh()}
          refreshing={view === 'defaults' ? defaultsLoading : loading || freshness.isRefreshing}
        />
      </div>

      {/* Error */}
      {error && (
        <StatusBanner tone="error" action={<button className="text-xs underline" onClick={() => setError(null)}>dismiss</button>}>
          <span className="truncate">{error}</span>
        </StatusBanner>
      )}

      {!error && freshness.isStale && (
        <StatusBanner
          tone="warning"
          action={<button className="text-xs underline" onClick={() => void handleRefresh()}>Refresh</button>}
        >
          Knowledge may be out of date.
        </StatusBanner>
      )}

      {/* Content */}
      {showBlockingLoader ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : view === 'defaults' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          {searchedPolicies.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] h-full min-h-[200px] px-6 text-center">
              <Repeat className="w-10 h-10 opacity-40" />
              <p className="text-sm">No learned defaults yet</p>
              <p className="text-xs opacity-60 max-w-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Construct will pick up habits from successful scheduled work and reports.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/50">
              {animatedPolicies.map(({ key, item: policy, phase }) => {
                const display = formatLearnedPolicyDisplay(policy);
                const isExpanded = expandedPolicyId === policy.id;
                return (
                  <AnimatedListItem key={key} phase={phase}>
                    <div id={`learned-policy-${policy.id}`}>
                      <button
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--color-accent-muted)] transition-colors text-left"
                        onClick={() => setExpandedPolicyId(isExpanded ? null : policy.id)}
                      >
                        <Repeat className="w-4 h-4 mt-0.5 shrink-0 text-violet-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-relaxed">{display.title}</p>
                          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                            {display.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                              {display.scopeLabel}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)]">
                              {display.strengthText}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0 mt-0.5">
                          {formatPolicyDate(policy.updatedAt)}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0">
                          <div className="ml-6.5 p-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--color-border)]/50 space-y-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">What this changes</p>
                              <p className="text-[11px] leading-relaxed text-[var(--color-text)]">
                                {policy.agentInstruction || display.description}
                              </p>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)]">
                              Learned after a successful run. Forget it if you want Construct to ask again next time.
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleForgetPolicy(policy.id); }}
                              disabled={forgettingPolicyId === policy.id}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              {forgettingPolicyId === policy.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                              Forget this default
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </AnimatedListItem>
                );
              })}
            </div>
          )}
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
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Connections</p>
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
                {nodeMemories.length > 0 && (
                  <>
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mt-3 mb-1">Knowledge</p>
                    {nodeMemories.slice(0, 10).map(m => (
                      <div key={m.id} className="group px-2 py-1.5 rounded bg-black/[0.03] dark:bg-white/[0.03] text-[11px] leading-relaxed flex items-start gap-1">
                        <span className="flex-1 min-w-0">{m.memory}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteMemory(m.id); }}
                          disabled={deletingId === m.id}
                          className="touch-target shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-all"
                          title="Delete knowledge item"
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
          {searchedMemories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] h-full min-h-[200px]">
              <img src={iconMemory} alt="" className="w-10 h-10 object-contain opacity-40" />
              <p className="text-sm">No saved knowledge yet</p>
              <p className="text-xs opacity-60">
                {searchQuery ? 'Try a different search term' : 'Knowledge will appear as you work with Construct'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/50">
              {animatedMemories.map(({ key, item: memory, phase }) => {
                const isExpanded = expandedId === memory.id;
                return (
                  <AnimatedListItem key={key} phase={phase}>
                  <div id={`memory-${memory.id}`}>
                    <button
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--color-accent-muted)] transition-colors text-left"
                      onClick={() => setExpandedId(isExpanded ? null : memory.id)}
                    >
                      <img src={iconMemory} alt="" className="w-4 h-4 mt-0.5 shrink-0 object-contain" />
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
                            {memory.created_at && (
                              <span>Created: <strong className="text-[var(--color-text)]">{formatMemoryDate(memory.created_at)}</strong></span>
                            )}
                            {memory.updated_at && (
                              <span>Updated: <strong className="text-[var(--color-text)]">{formatMemoryDate(memory.updated_at)}</strong></span>
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
                            Delete item
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  </AnimatedListItem>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Graph legend — only in graph view when there are relations */}
      {view === 'graph' && relations.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-titlebar)]">
          <span className="text-[10px] text-[var(--color-text-muted)]">Connection types:</span>
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
