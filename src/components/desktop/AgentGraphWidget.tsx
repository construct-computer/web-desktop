/* eslint-disable react-hooks/refs -- Canvas physics state intentionally lives in refs for RAF updates. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network } from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { useAgentTrackerStore, type TrackedOperation } from '@/stores/agentTrackerStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import { MENUBAR_HEIGHT, Z_INDEX } from '@/lib/constants';
import { AutopilotPanel } from './AutopilotWidget';
import {
  AGENT_STATUS_COLORS,
  OP_TYPE_COLORS,
  buildAgentGraph,
  nodeRadius,
  type AgentGraphNodeSpec,
} from '@/lib/agentGraphModel';
import {
  ALPHA_COOLING,
  ALPHA_MIN,
  agentGraphEdgeColor,
  agentGraphFlowDashStyle,
  drawHaloText,
  hitTestPoint,
  isDarkMode,
  resizeCanvasToContainer,
  tickAgentSimulation,
  type AgentPhysicsEdge,
  type AgentPhysicsNode,
} from '@/lib/forceGraph';

// ── Gravity position (cluster anchor) ───────────────────────────────

const POS_KEY = 'construct:agent-widget-pos';
const DEFAULT_POS = { rx: 0.5, ry: 0.1 };
const DEPTH_FONT = ['600 10px system-ui, sans-serif', '9px system-ui, sans-serif', '8.5px system-ui, sans-serif'];
const DEPTH_TRUNC = [14, 18, 12];
const TOOLTIP_DELAY_MS = 200;

function loadPos(): { rx: number; ry: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) { const p = JSON.parse(raw); return { rx: +p.rx || 0.5, ry: +p.ry || 0.1 }; }
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function savePos(rx: number, ry: number) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ rx, ry })); } catch { /* ignore */ }
}

function posToPixel(rx: number, ry: number, w: number, h: number) {
  return { x: rx * w, y: ry * h };
}

function trunc(s: string, n = 14): string {
  return s.length > n ? s.slice(0, n) + '\u2026' : s;
}

function seededJitter(id: string, salt: number): number {
  let hash = salt;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash / 0xffffffff) - 0.5;
}

function statusFill(status: string, isDark: boolean): string {
  const c = AGENT_STATUS_COLORS[status] ?? AGENT_STATUS_COLORS.idle;
  return isDark ? c.dark : c.light;
}

function resolveGraphNodeTooltip(
  node: AgentGraphNodeSpec,
  operations: Record<string, TrackedOperation>,
): { label: string; sub?: string } {
  const meta: string[] = [];
  if (node.depth === 1 && node.opType) meta.push(`Type: ${node.opType}`);
  if (node.currentTool) meta.push(String(node.currentTool));
  if (node.status && !['running', 'aggregating', 'pending'].includes(node.status)) {
    meta.push(node.status);
  }

  if (node.depth === 2 && node.operationId && node.subAgentId) {
    const sub = operations[node.operationId]?.subAgents.find((s) => s.id === node.subAgentId);
    return {
      label: sub?.goal || sub?.label || node.label,
      sub: meta.length ? meta.join(' · ') : sub?.currentActivity,
    };
  }
  if (node.depth === 1 && node.operationId) {
    return {
      label: operations[node.operationId]?.goal || node.label,
      sub: meta.length ? meta.join(' · ') : undefined,
    };
  }
  return { label: node.label, sub: meta.length ? meta.join(' · ') : undefined };
}

// ── Component ────────────────────────────────────────────────────────

interface AgentGraphWidgetProps {
  showAutopilot?: boolean;
}

type AgentNode = AgentPhysicsNode & AgentGraphNodeSpec;

interface AgentEdge extends AgentPhysicsEdge {
  active: boolean;
  alpha: number;
  label?: string;
}

export function AgentGraphWidget({ showAutopilot = true }: AgentGraphWidgetProps = {}) {
  const running = useComputerStore((s) => s.agentRunning);
  const operations = useAgentTrackerStore((s) => s.operations);
  const platformAgents = useComputerStore((s) => s.platformAgents);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physicsRef = useRef<AgentNode[]>([]);
  const edgesRef = useRef<AgentEdge[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const dragNodeRef = useRef<AgentNode | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const prevIdsRef = useRef('');
  const clusterSpreadRef = useRef(180);
  const gravityPosRef = useRef(loadPos());
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [graphTip, setGraphTip] = useState<null | { x: number; y: number; label: string; sub?: string }>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const graphBuild = useMemo(
    () => buildAgentGraph({ running, operations, platformAgents, now }),
    [running, operations, platformAgents, now],
  );

  const { visible, clusterSpread } = graphBuild;
  clusterSpreadRef.current = clusterSpread;

  // Sync specs → physics nodes
  useEffect(() => {
    const allSpecs = graphBuild.nodes;

    const curIds = allSpecs.map((s) => s.id).sort().join(',');
    const topologyChanged = curIds !== prevIdsRef.current;
    prevIdsRef.current = curIds;

    const oldById = new Map(physicsRef.current.map((n) => [n.id, n]));
    physicsRef.current = allSpecs.map((spec) => {
      const old = oldById.get(spec.id);
      if (old) {
        Object.assign(old, spec);
        return old;
      }
      const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
      const vh = typeof window !== 'undefined' ? window.innerHeight - MENUBAR_HEIGHT : 600;
      const gc = posToPixel(gravityPosRef.current.rx, gravityPosRef.current.ry, vw, vh);
      return {
        ...spec,
        x: gc.x + seededJitter(spec.id, 17) * 80,
        y: gc.y + seededJitter(spec.id, 29) * 60,
        vx: 0,
        vy: 0,
      } as AgentNode;
    });

    edgesRef.current = graphBuild.edges.map((e) => ({
      source: e.source,
      target: e.target,
      springLen: e.springLen,
      active: e.active,
      alpha: e.alpha,
      label: e.label,
    }));

    if (topologyChanged) alphaRef.current = Math.max(alphaRef.current, 0.5);
  }, [graphBuild]);

  // Canvas loop
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;

    function frame() {
      if (!active || !ctx || !canvas) return;

      const w = window.innerWidth;
      const h = window.innerHeight - MENUBAR_HEIGHT;
      resizeCanvasToContainer(canvas, w, h);
      ctx.clearRect(0, 0, w, h);

      const nodes = physicsRef.current;
      const curEdges = edgesRef.current;
      const isDark = isDarkMode();

      if (alphaRef.current > ALPHA_MIN) {
        const gc = posToPixel(gravityPosRef.current.rx, gravityPosRef.current.ry, w, h);
        tickAgentSimulation(nodes, curEdges, w, h, alphaRef.current, gc, {
          clusterSpread: clusterSpreadRef.current,
        });
        alphaRef.current *= ALPHA_COOLING;
      }

      const t = Date.now();
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      // Edges
      for (const edge of curEdges) {
        const a = nodeById.get(edge.source);
        const b = nodeById.get(edge.target);
        if (!a || !b) continue;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = agentGraphEdgeColor(edge.active, isDark);
        ctx.lineWidth = edge.active ? 1.5 : 1.25;
        ctx.globalAlpha = edge.alpha;
        ctx.stroke();

        if (edge.active) {
          const flow = agentGraphFlowDashStyle(isDark);
          const dashOffset = (t / 55) % (flow.pattern[0] + flow.pattern[1]);

          ctx.setLineDash(flow.pattern);
          ctx.lineCap = 'round';

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = flow.halo;
          ctx.lineWidth = flow.haloWidth;
          ctx.globalAlpha = edge.alpha * 0.9;
          ctx.lineDashOffset = dashOffset;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = flow.dash;
          ctx.lineWidth = flow.dashWidth;
          ctx.globalAlpha = edge.alpha;
          ctx.lineDashOffset = dashOffset;
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.lineCap = 'butt';
        }
      }

      ctx.globalAlpha = 1;

      const sorted = [...nodes].sort((a, b) => {
        if (hoveredRef.current === a.id) return 1;
        if (hoveredRef.current === b.id) return -1;
        return a.depth - b.depth;
      });

      for (const node of sorted) {
        const isHovered = hoveredRef.current === node.id;
        const isPlatform = node.depth === 0;
        const fill = statusFill(node.status, isDark);
        const isActive = node.status === 'running' || node.status === 'aggregating';
        const r = nodeRadius(node.depth, { hovered: isHovered && !isPlatform });
        const showPulse = isActive && !isPlatform && isHovered;

        ctx.globalAlpha = node.alpha;

        if (showPulse) {
          const pulse = Math.sin(t / 400) * 0.15 + 0.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = fill;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = node.alpha * pulse;
          ctx.stroke();
        }

        if (isActive && !isPlatform) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = fill + '30';
          ctx.globalAlpha = node.alpha;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.globalAlpha = node.alpha;
        ctx.fill();

        if (isHovered && !isPlatform) {
          ctx.strokeStyle = isDark ? '#fff' : '#000';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (node.depth === 1 && node.opType) {
          const accent = OP_TYPE_COLORS[node.opType];
          if (accent) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r - 2, 0, Math.PI * 2);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = node.alpha * 0.7;
            ctx.stroke();
          }
        }

        const maxLen = DEPTH_TRUNC[node.depth] ?? 0;
        if (maxLen > 0) {
          const displayLabel = trunc(node.label, maxLen);
          if (displayLabel) {
            drawHaloText(ctx, displayLabel, node.x, node.y + r + 4,
              DEPTH_FONT[node.depth] ?? '9px system-ui, sans-serif',
              'rgba(255,255,255,0.9)', node.alpha, 2.5);
          }
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [visible]);

  const hitTestAt = useCallback((clientX: number, clientY: number): AgentNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const hoveredId = hoveredRef.current;
    return hitTestPoint(physicsRef.current, mx, my, (node) => {
      const isHovered = hoveredId === node.id;
      const isPlatform = (node as AgentNode).depth === 0;
      return nodeRadius((node as AgentNode).depth, { hovered: isHovered && !isPlatform }) + 10;
    }) as AgentNode | null;
  }, []);

  const scheduleTooltip = useCallback((node: AgentNode, x: number, y: number) => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => {
      const { label, sub } = resolveGraphNodeTooltip(node, operations);
      setGraphTip({ x, y, label, sub });
    }, TOOLTIP_DELAY_MS);
  }, [operations]);

  const clearTooltip = useCallback(() => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    setGraphTip(null);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const onMouseDown = (e: MouseEvent) => {
      const node = hitTestAt(e.clientX, e.clientY);
      if (!node) return;

      e.preventDefault();
      dragNodeRef.current = node;
      node.pinned = true;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragNodeRef.current;
      if (drag) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        if (drag.depth === 0) {
          const w = window.innerWidth;
          const h = window.innerHeight - MENUBAR_HEIGHT;
          const nx = e.clientX - rect.left;
          const ny = e.clientY - rect.top;
          drag.x = nx;
          drag.y = ny;
          const rx = Math.max(0.05, Math.min(0.95, nx / w));
          const ry = Math.max(0.05, Math.min(0.95, ny / h));
          gravityPosRef.current = { rx, ry };
          savePos(rx, ry);
          alphaRef.current = Math.max(alphaRef.current, 0.5);
        } else {
          drag.x = e.clientX - rect.left;
          drag.y = e.clientY - rect.top;
        }
        alphaRef.current = Math.max(alphaRef.current, 0.1);
        clearTooltip();
      } else {
        const node = hitTestAt(e.clientX, e.clientY);
        const prevHover = hoveredRef.current;
        hoveredRef.current = node?.id ?? null;
        document.body.style.cursor = node ? 'pointer' : '';
        if (node) {
          if (prevHover !== node.id) scheduleTooltip(node, e.clientX, e.clientY);
          else setGraphTip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : t);
        } else {
          clearTooltip();
        }
      }
    };

    const onMouseUp = () => {
      const drag = dragNodeRef.current;
      if (drag) {
        drag.pinned = false;
        dragNodeRef.current = null;
        document.body.style.cursor = '';
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    };
  }, [visible, hitTestAt, scheduleTooltip, clearTooltip]);

  if (!visible && !showAutopilot) return null;

  const showIdleHint = !visible && (running || Object.values(platformAgents).some((p) => p.running));

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={{ top: MENUBAR_HEIGHT, zIndex: Z_INDEX.desktopWidget }}
    >
      {visible && <canvas ref={canvasRef} className="w-full h-full" />}

      {showIdleHint && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 pointer-events-none">
          <Network className="w-8 h-8 opacity-30 mb-2" />
          <p className="text-sm opacity-60">Agents will appear here during parallel work</p>
        </div>
      )}

      {visible && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-3 px-3 py-1.5 rounded-full border border-white/10 bg-black/40 backdrop-blur-sm pointer-events-none"
        >
          {Object.entries(AGENT_STATUS_COLORS).filter(([k]) => ['running', 'complete', 'failed', 'pending'].includes(k)).map(([key, c]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.dark }} />
              <span className="text-[10px] text-white/60 capitalize">{key}</span>
            </div>
          ))}
          {Object.entries(OP_TYPE_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full ring-1 ring-white/20" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-white/60">{key}</span>
            </div>
          ))}
        </div>
      )}

      {graphTip && (
        <div
          className="fixed max-w-sm rounded-lg border border-white/10 glass-tooltip px-3 py-2 text-left shadow-lg pointer-events-none"
          style={{
            left: graphTip.x + 12,
            top: graphTip.y + 14,
            zIndex: Z_INDEX.desktopWidget + 2,
          }}
        >
          <p className="text-[12px] font-medium leading-snug text-white/95 break-words">{graphTip.label}</p>
          {graphTip.sub && (
            <p className="mt-1 text-[10px] font-mono text-sky-300/90 break-words">{graphTip.sub}</p>
          )}
        </div>
      )}

      {showAutopilot && <AgentOpsPanel />}
    </div>
  );
}

function AgentOpsPanel() {
  const { containerStyle, containerProps } = useDraggableWidget('agent-dashboard', 'tr');
  const { className: dragClassName, ...dragProps } = containerProps;

  return (
    <div style={containerStyle} {...dragProps} className={`flex flex-col items-center ${dragClassName || ''}`}>
      <AutopilotPanel />
    </div>
  );
}
