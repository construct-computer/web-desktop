import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Blocks,
  ChevronDown,
  ChevronRight,
  Circle,
  CopyPlus,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  MoveDown,
  MoveUp,
  PanelLeft,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import type { ConstructAppSpec, ConstructComponentNode, LocalApp } from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useComputerStore, type ComponentMention } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useWindowStore } from '@/stores/windowStore';

type FlatComponent = {
  node: ConstructComponentNode;
  depth: number;
  path: string;
  parentId?: string;
  index: number;
};

const COMPONENT_TYPES = [
  'AppShell',
  'Panel',
  'Toolbar',
  'MetricCard',
  'MetricStrip',
  'Table',
  'Chart',
  'Timeline',
  'RunLog',
  'Form',
  'Field',
  'Button',
  'SegmentedControl',
  'StatusBanner',
  'EmptyState',
  'DetailList',
  'SourceBadge',
] as const;

const CONTAINER_TYPES = new Set(['AppShell', 'Panel', 'Toolbar', 'Form']);

function componentTitle(node: ConstructComponentNode): string {
  const props = node.props || {};
  return node.label
    || (typeof props.title === 'string' ? props.title : undefined)
    || (typeof props.text === 'string' ? props.text : undefined)
    || node.componentId;
}

function cloneSpec(spec: ConstructAppSpec): ConstructAppSpec {
  return JSON.parse(JSON.stringify(spec)) as ConstructAppSpec;
}

function flatten(nodes: ConstructComponentNode[], depth = 0, parentId?: string, base = 'layout'): FlatComponent[] {
  return nodes.flatMap((node, index) => {
    const path = `${base}.${index}`;
    return [
      { node, depth, parentId, index, path },
      ...flatten(node.children || [], depth + 1, node.componentId, `${path}.children`),
    ];
  });
}

function flattenVisible(
  nodes: ConstructComponentNode[],
  expanded: Set<string>,
  depth = 0,
  parentId?: string,
  base = 'layout',
): FlatComponent[] {
  return nodes.flatMap((node, index) => {
    const path = `${base}.${index}`;
    const item = { node, depth, parentId, index, path };
    if (!node.children?.length || !expanded.has(node.componentId)) return [item];
    return [item, ...flattenVisible(node.children, expanded, depth + 1, node.componentId, `${path}.children`)];
  });
}

function ancestorIds(nodes: ConstructComponentNode[], componentId: string, parents: string[] = []): string[] {
  for (const node of nodes) {
    if (node.componentId === componentId) return parents;
    const found = node.children ? ancestorIds(node.children, componentId, [...parents, node.componentId]) : [];
    if (found.length > 0) return found;
  }
  return [];
}

function updateNode(
  nodes: ConstructComponentNode[],
  componentId: string,
  updater: (node: ConstructComponentNode) => ConstructComponentNode,
): ConstructComponentNode[] {
  return nodes.map((node) => {
    if (node.componentId === componentId) return updater(node);
    return node.children
      ? { ...node, children: updateNode(node.children, componentId, updater) }
      : node;
  });
}

function removeNode(nodes: ConstructComponentNode[], componentId: string): ConstructComponentNode[] {
  return nodes
    .filter((node) => node.componentId !== componentId)
    .map((node) => node.children ? { ...node, children: removeNode(node.children, componentId) } : node);
}

function insertChild(nodes: ConstructComponentNode[], parentId: string, child: ConstructComponentNode): ConstructComponentNode[] {
  return nodes.map((node) => {
    if (node.componentId === parentId) {
      return { ...node, children: [...(node.children || []), child] };
    }
    return node.children ? { ...node, children: insertChild(node.children, parentId, child) } : node;
  });
}

function insertSibling(nodes: ConstructComponentNode[], componentId: string, sibling: ConstructComponentNode): ConstructComponentNode[] {
  const index = nodes.findIndex((node) => node.componentId === componentId);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, sibling);
    return next;
  }
  return nodes.map((node) => (
    node.children ? { ...node, children: insertSibling(node.children, componentId, sibling) } : node
  ));
}

function moveNode(nodes: ConstructComponentNode[], componentId: string, direction: -1 | 1): ConstructComponentNode[] {
  const currentIndex = nodes.findIndex((node) => node.componentId === componentId);
  if (currentIndex >= 0) {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= nodes.length) return nodes;
    const next = [...nodes];
    const [item] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, item);
    return next;
  }
  return nodes.map((node) => (
    node.children ? { ...node, children: moveNode(node.children, componentId, direction) } : node
  ));
}

function makeComponent(type: string): ConstructComponentNode {
  const suffix = Math.random().toString(36).slice(2, 8);
  const id = `${type.toLowerCase()}-${suffix}`;
  const baseProps: Record<string, unknown> = { title: type };
  if (type === 'Button') baseProps.text = 'New action';
  if (type === 'IconButton') { baseProps.text = 'Action'; baseProps.icon = '+'; }
  if (type === 'Field') { baseProps.label = 'Field'; baseProps.placeholder = 'Value'; }
  if (type === 'StatusBanner') { baseProps.text = 'Ready'; baseProps.tone = 'info'; }
  if (type === 'MetricCard') { baseProps.label = 'Metric'; baseProps.value = '-'; baseProps.meta = 'No data'; }
  if (type === 'MetricStrip') baseProps.items = [{ label: 'Metric', value: '-', meta: 'No data' }];
  if (type === 'Table') baseProps.columns = [{ key: 'name', label: 'Name' }];
  if (type === 'Chart') baseProps.points = [{ label: 'Now', value: 1 }];
  if (type === 'Timeline') baseProps.items = [{ title: 'Created', time: 'Now', status: 'ready' }];
  if (type === 'RunLog') baseProps.lines = [{ time: 'Now', message: 'Ready' }];
  if (type === 'SegmentedControl') { baseProps.items = ['overview', 'details']; baseProps.value = 'overview'; }
  if (type === 'DetailList') baseProps.items = [{ label: 'Status', value: 'Ready' }];
  if (type === 'SourceBadge') { baseProps.label = 'Source'; baseProps.value = 'Local state'; }
  return {
    componentId: id,
    type,
    label: type,
    props: baseProps,
    children: CONTAINER_TYPES.has(type) ? [] : undefined,
  };
}

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function JsonObjectEditor({
  label,
  value,
  minHeight = 'h-24',
  onValidChange,
  onError,
}: {
  label: string;
  value: Record<string, unknown> | undefined;
  minHeight?: string;
  onValidChange: (value: Record<string, unknown>) => void;
  onError: (message: string | null) => void;
}) {
  const serialized = useMemo(() => JSON.stringify(value || {}, null, 2), [value]);
  const [draft, setDraft] = useState(serialized);

  useEffect(() => {
    setDraft(serialized);
  }, [serialized]);

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">{label}</span>
      <textarea
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          try {
            const parsed = parseJsonRecord(next, label);
            onValidChange(parsed);
            onError(null);
          } catch (err) {
            onError(err instanceof Error ? err.message : `${label} JSON is invalid.`);
          }
        }}
        spellCheck={false}
        className={`${minHeight} w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-[var(--color-accent)]/50`}
      />
    </label>
  );
}

export function AppBuilderWindow({ config }: { config: WindowConfig }) {
  const localApps = useAppStore((s) => s.localApps);
  const fetched = useAppStore((s) => s.fetched);
  const fetchApps = useAppStore((s) => s.fetchApps);
  const addComponentMention = useComputerStore((s) => s.addComponentMention);
  const sendChatMessage = useComputerStore((s) => s.sendChatMessage);
  const [selectedAppId, setSelectedAppId] = useState(
    typeof config.metadata?.appId === 'string' ? config.metadata.appId : '',
  );
  const [spec, setSpec] = useState<ConstructAppSpec | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [savedSpecJson, setSavedSpecJson] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!fetched) void fetchApps();
  }, [fetchApps, fetched]);

  useEffect(() => {
    if (!selectedAppId && localApps.length > 0) setSelectedAppId(localApps[0].id);
  }, [localApps, selectedAppId]);

  const selectedApp = useMemo<LocalApp | undefined>(
    () => localApps.find((app) => app.id === selectedAppId),
    [localApps, selectedAppId],
  );

  const flat = useMemo(() => spec ? flatten(spec.layout) : [], [spec]);
  const visibleFlat = useMemo(() => spec ? flattenVisible(spec.layout, expanded) : [], [expanded, spec]);
  const dirty = useMemo(() => Boolean(spec && JSON.stringify(spec) !== savedSpecJson), [savedSpecJson, spec]);
  const selected = flat.find((item) => item.node.componentId === selectedId)?.node || flat[0]?.node;

  const loadSpec = useCallback(async () => {
    if (!selectedAppId) return;
    setLoading(true);
    setError(null);
    try {
      const [specRes, tokenRes] = await Promise.all([
        api.getLocalAppSpec(selectedAppId),
        api.mintLocalAppToken(selectedAppId),
      ]);
      if (!specRes.success) throw new Error(specRes.error || 'App has no editable Construct spec.');
      if (!specRes.data?.spec) throw new Error('App has no editable Construct spec.');
      setSpec(specRes.data.spec);
      setSavedSpecJson(JSON.stringify(specRes.data.spec));
      const nextFlat = flatten(specRes.data.spec.layout);
      setSelectedId((prev) => nextFlat.some((item) => item.node.componentId === prev)
        ? prev
        : nextFlat[0]?.node.componentId || '');
      setExpanded(new Set(nextFlat.filter((item) => (item.node.children || []).length > 0).map((item) => item.node.componentId)));
      if (tokenRes.success && tokenRes.data?.token) setToken(tokenRes.data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedAppId]);

  useEffect(() => {
    void loadSpec();
  }, [loadSpec]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'construct:component_selected') return;
      const component = event.data.component as Record<string, unknown> | undefined;
      const componentId = typeof component?.id === 'string'
        ? component.id
        : typeof component?.componentId === 'string'
          ? component.componentId
          : '';
      if (componentId) {
        setSelectedId(componentId);
        if (spec) {
          const parents = ancestorIds(spec.layout, componentId);
          if (parents.length > 0) setExpanded((prev) => new Set([...prev, ...parents]));
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [spec]);

  const persistSpec = useCallback(async (nextSpec: ConstructAppSpec): Promise<boolean> => {
    if (!selectedAppId) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await api.putLocalAppSpec(selectedAppId, nextSpec);
      if (!res.success) throw new Error(res.error || 'Save failed');
      if (!res.data?.spec) throw new Error('Save failed');
      setSpec(res.data.spec);
      setSavedSpecJson(JSON.stringify(res.data.spec));
      setPreviewKey((key) => key + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedAppId]);

  const patchSelected = useCallback((patch: Partial<ConstructComponentNode>) => {
    if (!spec || !selected) return;
    const next = cloneSpec(spec);
    next.layout = updateNode(next.layout, selected.componentId, (node) => ({
      ...node,
      ...patch,
      props: patch.props ? { ...(node.props || {}), ...patch.props } : node.props,
    }));
    setSpec(next);
  }, [selected, spec]);

  const replaceSelectedProps = useCallback((props: Record<string, unknown>) => {
    if (!spec || !selected) return;
    const next = cloneSpec(spec);
    next.layout = updateNode(next.layout, selected.componentId, (node) => ({ ...node, props }));
    setSpec(next);
  }, [selected, spec]);

  const replaceSelectedBindings = useCallback((bindings: Record<string, unknown>) => {
    if (!spec || !selected) return;
    const stringBindings = Object.fromEntries(
      Object.entries(bindings).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;
    const next = cloneSpec(spec);
    next.layout = updateNode(next.layout, selected.componentId, (node) => ({
      ...node,
      bindings: Object.keys(stringBindings).length > 0 ? stringBindings : undefined,
    }));
    setSpec(next);
  }, [selected, spec]);

  const replaceSelectedActions = useCallback((actions: Record<string, unknown>) => {
    if (!spec || !selected) return;
    const next = cloneSpec(spec);
    next.layout = updateNode(next.layout, selected.componentId, (node) => ({
      ...node,
      actions: Object.keys(actions).length > 0 ? actions as ConstructComponentNode['actions'] : undefined,
    }));
    setSpec(next);
  }, [selected, spec]);

  const saveCurrentSpec = useCallback(async () => {
    if (!spec) return;
    await persistSpec(spec);
  }, [persistSpec, spec]);

  const addChild = useCallback((type: string) => {
    if (!spec || !selected) return;
    const child = makeComponent(type);
    const next = cloneSpec(spec);
    next.layout = insertChild(next.layout, selected.componentId, child);
    setSpec(next);
    setExpanded((prev) => new Set(prev).add(selected.componentId));
    setSelectedId(child.componentId);
  }, [selected, spec]);

  const addSibling = useCallback((type: string) => {
    if (!spec || !selected) return;
    const sibling = makeComponent(type);
    const next = cloneSpec(spec);
    next.layout = insertSibling(next.layout, selected.componentId, sibling);
    setSpec(next);
    setSelectedId(sibling.componentId);
  }, [selected, spec]);

  const selectedMention = useCallback((): ComponentMention | null => {
    if (!selectedAppId || !selected) return null;
    const item = flat.find((entry) => entry.node.componentId === selected.componentId);
    return {
      appId: selectedAppId,
      componentId: selected.componentId,
      componentType: selected.type,
      label: selected.label || componentTitle(selected),
      path: item?.path,
      props: selected.props,
      bindings: selected.bindings,
      actions: selected.actions,
    };
  }, [flat, selected, selectedAppId]);

  const removeSelected = useCallback(() => {
    if (!spec || !selected || selected.type === 'AppShell') return;
    const next = cloneSpec(spec);
    next.layout = removeNode(next.layout, selected.componentId);
    const nextFlat = flatten(next.layout);
    setSelectedId(nextFlat[0]?.node.componentId || '');
    setSpec(next);
  }, [selected, spec]);

  const moveSelected = useCallback((direction: -1 | 1) => {
    if (!spec || !selected) return;
    const next = cloneSpec(spec);
    next.layout = moveNode(next.layout, selected.componentId, direction);
    setSpec(next);
  }, [selected, spec]);

  const mentionSelected = useCallback(() => {
    const mention = selectedMention();
    if (!mention) return;
    addComponentMention(mention);
    useNotificationStore.getState().addNotification(
      { title: 'Component mentioned', body: `${mention.label || mention.componentId} is ready in Spotlight.`, variant: 'success' },
      3500,
    );
  }, [addComponentMention, selectedMention]);

  const sendSelectedToAgent = useCallback(async () => {
    const prompt = agentPrompt.trim();
    const mention = selectedMention();
    if (!prompt || !mention) return;
    if (dirty && spec) {
      const saved = await persistSpec(spec);
      if (!saved) return;
    }
    sendChatMessage(prompt, undefined, { componentMentions: [mention] });
    setAgentPrompt('');
    useNotificationStore.getState().addNotification(
      { title: 'Sent to Construct', body: `${mention.label || mention.componentId} attached to the prompt.`, variant: 'success' },
      3500,
    );
  }, [agentPrompt, dirty, persistSpec, selectedMention, sendChatMessage, spec]);

  const openApp = useCallback(() => {
    if (!selectedApp) return;
    useWindowStore.getState().openWindow('app', {
      title: selectedApp.manifest.name,
      icon: selectedApp.icon_url || selectedApp.manifest.icon,
      metadata: { appId: selectedApp.id },
    });
  }, [selectedApp]);

  const previewUrl = selectedAppId
    ? `/api/apps/local/${encodeURIComponent(selectedAppId)}?builder=1${token ? `&app_token=${encodeURIComponent(token)}` : ''}`
    : '';

  return (
    <div className="flex h-full min-h-0 flex-col surface-app bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.08] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Blocks className="h-4 w-4 text-[var(--color-accent)]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              App Builder
              {dirty && <Circle className="h-2 w-2 fill-[var(--color-accent)] text-[var(--color-accent)]" />}
            </div>
            <div className="truncate text-[11px] text-[var(--color-text-muted)]">{selectedApp?.manifest.description || 'Spec-first Construct UI editor'}</div>
          </div>
        </div>
        <select
          value={selectedAppId}
          onChange={(event) => setSelectedAppId(event.target.value)}
          className="ml-auto h-8 min-w-[220px] rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
        >
          {localApps.map((app) => (
            <option key={app.id} value={app.id}>{app.manifest.name}</option>
          ))}
        </select>
        <button onClick={() => void loadSpec()} className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button onClick={openApp} disabled={!selectedApp} className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)] disabled:opacity-30" title="Open app">
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(320px,1fr)_320px] max-[900px]:grid-cols-[220px_minmax(260px,1fr)]">
        <aside className="min-h-0 border-r border-white/[0.08] bg-black/[0.08]">
          <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <PanelLeft className="h-3.5 w-3.5" />
            Components
          </div>
          <div className="h-[calc(100%-40px)] overflow-auto p-2">
            {loading ? (
              <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading spec...
              </div>
            ) : visibleFlat.length === 0 ? (
              <div className="p-3 text-[12px] text-[var(--color-text-muted)]">No editable components.</div>
            ) : visibleFlat.map((item) => {
              const hasChildren = (item.node.children || []).length > 0;
              const isOpen = expanded.has(item.node.componentId);
              return (
                <div key={item.node.componentId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.node.componentId)}
                    className={[
                      'flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[12px] transition-colors',
                      selected?.componentId === item.node.componentId
                        ? 'bg-[var(--color-accent)]/16 text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]',
                    ].join(' ')}
                    style={{ paddingLeft: 8 + item.depth * 14 }}
                  >
                    {hasChildren ? (
                      <span
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.node.componentId)) next.delete(item.node.componentId);
                            else next.add(item.node.componentId);
                            return next;
                          });
                        }}
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>
                    ) : (
                      <span className="h-3 w-3" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{componentTitle(item.node)}</span>
                    <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]/55">{item.node.type}</span>
                  </button>
                  {hasChildren && !isOpen && null}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="relative min-h-0 bg-black/[0.18]">
          {previewUrl ? (
            <iframe
              key={`${selectedAppId}:${previewKey}:${token}`}
              ref={iframeRef}
              src={previewUrl}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              className="h-full w-full border-0 bg-transparent"
              title={selectedApp?.manifest.name || 'App preview'}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">
              Select a local app to edit.
            </div>
          )}
        </main>

        <aside className="min-h-0 border-l border-white/[0.08] bg-black/[0.08] max-[900px]:col-span-2 max-[900px]:h-[280px] max-[900px]:border-l-0 max-[900px]:border-t">
          <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Inspector</span>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" />}
          </div>
          <div className="h-[calc(100%-40px)] overflow-auto p-3">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Component</label>
                  <input
                    value={selected.componentId}
                    readOnly
                    className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[12px] text-[var(--color-text-muted)] outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Type</span>
                    <select
                      value={selected.type}
                      onChange={(event) => {
                        const type = event.target.value;
                        patchSelected({
                          type,
                          children: CONTAINER_TYPES.has(type) ? selected.children || [] : undefined,
                        });
                      }}
                      className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none focus:border-[var(--color-accent)]/50"
                    >
                      {COMPONENT_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Label</span>
                    <input
                      value={selected.label || ''}
                      onChange={(event) => patchSelected({ label: event.target.value })}
                      className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none focus:border-[var(--color-accent)]/50"
                    />
                  </label>
                </div>
                {['title', 'subtitle', 'text', 'description', 'emptyText', 'loadingText', 'errorText', 'successText'].map((key) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] font-medium capitalize text-[var(--color-text-muted)]">{key}</span>
                    <input
                      value={typeof selected.props?.[key] === 'string' ? selected.props[key] as string : ''}
                      onChange={(event) => patchSelected({ props: { [key]: event.target.value } })}
                      className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none focus:border-[var(--color-accent)]/50"
                    />
                  </label>
                ))}
                <JsonObjectEditor
                  label="Props JSON"
                  value={selected.props}
                  minHeight="h-28"
                  onValidChange={replaceSelectedProps}
                  onError={setError}
                />
                <JsonObjectEditor
                  label="Bindings JSON"
                  value={selected.bindings}
                  onValidChange={replaceSelectedBindings}
                  onError={setError}
                />
                <JsonObjectEditor
                  label="Actions JSON"
                  value={selected.actions}
                  onValidChange={replaceSelectedActions}
                  onError={setError}
                />
                <div className="border-t border-white/[0.08] pt-3">
                  <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Ask agent about selected component</label>
                  <textarea
                    value={agentPrompt}
                    onChange={(event) => setAgentPrompt(event.target.value)}
                    placeholder="Add behavior, wire this to a tool, change the data binding..."
                    className="h-20 w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 text-[12px] leading-relaxed outline-none placeholder:text-[var(--color-text-muted)]/45 focus:border-[var(--color-accent)]/50"
                  />
                  <button
                    onClick={() => void sendSelectedToAgent()}
                    disabled={!agentPrompt.trim() || saving}
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2 text-[12px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send with component
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void saveCurrentSpec()} disabled={!dirty || saving} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2 text-[12px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button onClick={mentionSelected} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08]">
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Mention
                  </button>
                  <button onClick={() => moveSelected(-1)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08]">
                    <MoveUp className="h-3.5 w-3.5" />
                    Up
                  </button>
                  <button onClick={() => moveSelected(1)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08]">
                    <MoveDown className="h-3.5 w-3.5" />
                    Down
                  </button>
                </div>
                <div className="border-t border-white/[0.08] pt-3">
                  <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Add component</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COMPONENT_TYPES.filter((type) => type !== 'AppShell').map((type) => (
                      <div key={type} className="grid grid-cols-[1fr_auto] overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.03]">
                        <button
                          onClick={() => addSibling(type)}
                          className="h-7 truncate px-1.5 text-[11px] hover:bg-white/[0.08]"
                          title={`Add ${type} after selected component`}
                        >
                          {type}
                        </button>
                        <button
                          onClick={() => addChild(type)}
                          disabled={!CONTAINER_TYPES.has(selected.type)}
                          className="inline-flex h-7 w-7 items-center justify-center border-l border-white/[0.08] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                          title={`Add ${type} inside selected component`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3">
                  <button onClick={() => void saveCurrentSpec()} disabled={!dirty || saving} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 text-[12px] text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45">
                    <CopyPlus className="h-3.5 w-3.5" />
                    Save all
                  </button>
                  <button onClick={removeSelected} disabled={selected.type === 'AppShell'} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-400/20 bg-red-400/10 px-2 text-[12px] text-red-100 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--color-text-muted)]">Select a component from the tree or preview.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
