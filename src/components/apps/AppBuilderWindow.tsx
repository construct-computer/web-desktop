import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Badge,
  BarChart3,
  Bolt,
  Blocks,
  ChevronDown,
  ChevronRight,
  Circle,
  CopyPlus,
  Database,
  ExternalLink,
  FormInput,
  CheckCircle2,
  GripVertical,
  LayoutDashboard,
  Loader2,
  MessageSquarePlus,
  MoveDown,
  MoveUp,
  MousePointer2,
  PanelLeft,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Table2,
  Trash2,
  Type,
  Redo2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import type { ConstructAppSpec, ConstructComponentAction, ConstructComponentNode, LocalApp } from '@/services/api';
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
  'IconButton',
  'SegmentedControl',
  'StatusBanner',
  'EmptyState',
  'DetailList',
  'SourceBadge',
] as const;

type ComponentTypeName = typeof COMPONENT_TYPES[number];
type PaletteGroup = 'all' | 'layout' | 'data' | 'input' | 'status';
type InspectorTab = 'app' | 'props' | 'data' | 'actions' | 'agent';
type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const CONTAINER_TYPES = new Set(['AppShell', 'Panel', 'Toolbar', 'Form']);

const COMPONENT_GROUPS: Array<{ id: PaletteGroup; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'layout', label: 'Layout' },
  { id: 'data', label: 'Data' },
  { id: 'input', label: 'Input' },
  { id: 'status', label: 'Status' },
];

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string; icon: LucideIcon }> = [
  { id: 'app', label: 'App', icon: LayoutDashboard },
  { id: 'props', label: 'Props', icon: SlidersHorizontal },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'actions', label: 'Actions', icon: Bolt },
  { id: 'agent', label: 'Agent', icon: MessageSquarePlus },
];

const DENSITY_OPTIONS: Array<{ value: '' | 'compact' | 'comfortable'; label: string }> = [
  { value: '', label: 'Default' },
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
];

const LAYOUT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'stack', label: 'Stack' },
  { value: 'grid', label: 'Grid' },
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'inline', label: 'Inline' },
];

const GAP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Default' },
  { value: 'tight', label: 'Tight' },
  { value: 'loose', label: 'Loose' },
];

const COMPONENT_META: Record<ComponentTypeName, {
  group: Exclude<PaletteGroup, 'all'>;
  title: string;
  description: string;
  icon: LucideIcon;
}> = {
  AppShell: { group: 'layout', title: 'App shell', description: 'Root window frame with app title and content area.', icon: LayoutDashboard },
  Panel: { group: 'layout', title: 'Panel', description: 'Section container with header and body.', icon: PanelLeft },
  Toolbar: { group: 'layout', title: 'Toolbar', description: 'Compact row for actions and filters.', icon: Blocks },
  MetricCard: { group: 'data', title: 'Metric card', description: 'Single KPI with label, value, and supporting meta.', icon: BarChart3 },
  MetricStrip: { group: 'data', title: 'Metric strip', description: 'Responsive row of KPI cards.', icon: LayoutDashboard },
  Table: { group: 'data', title: 'Table', description: 'Structured rows and columns from state.', icon: Table2 },
  Chart: { group: 'data', title: 'Chart', description: 'Lightweight bar chart for trends and comparisons.', icon: BarChart3 },
  Timeline: { group: 'data', title: 'Timeline', description: 'Ordered event feed with status markers.', icon: Blocks },
  RunLog: { group: 'data', title: 'Run log', description: 'Monospace operational activity log.', icon: Type },
  Form: { group: 'input', title: 'Form', description: 'Container for fields and submit actions.', icon: FormInput },
  Field: { group: 'input', title: 'Field', description: 'Read-only data field with label and value.', icon: Type },
  Button: { group: 'input', title: 'Button', description: 'Primary or secondary action trigger.', icon: MousePointer2 },
  IconButton: { group: 'input', title: 'Icon button', description: 'Compact icon-only action with an accessible label.', icon: MousePointer2 },
  SegmentedControl: { group: 'input', title: 'Segmented control', description: 'Small option switcher for modes or filters.', icon: SlidersHorizontal },
  StatusBanner: { group: 'status', title: 'Status banner', description: 'Inline state, warning, success, or error message.', icon: Badge },
  EmptyState: { group: 'status', title: 'Empty state', description: 'Placeholder surface for missing data.', icon: Blocks },
  DetailList: { group: 'data', title: 'Detail list', description: 'Dense key-value facts and metadata.', icon: Table2 },
  SourceBadge: { group: 'status', title: 'Source badge', description: 'Small badge for provenance or sync source.', icon: Badge },
};

type QuickPropControl = {
  key: string;
  label: string;
  kind?: 'input' | 'textarea' | 'select';
  options?: Array<{ label: string; value: string }>;
};

type CollectionFieldControl = {
  key: string;
  label: string;
  kind?: 'input' | 'number' | 'select';
  options?: Array<{ label: string; value: string }>;
};

type CollectionPropControl = {
  key: string;
  label: string;
  addLabel: string;
  defaultItem: Record<string, unknown>;
  fields: CollectionFieldControl[];
};

const TEXTUAL_PROP_KEYS = ['title', 'subtitle', 'text', 'description', 'emptyText', 'loadingText', 'errorText', 'successText'];

const BINDING_PROP_SUGGESTIONS: Partial<Record<ComponentTypeName, string[]>> = {
  AppShell: ['title', 'subtitle'],
  Panel: ['title', 'subtitle'],
  Form: ['title', 'subtitle'],
  MetricCard: ['label', 'value', 'meta'],
  MetricStrip: ['items'],
  Table: ['rows'],
  Chart: ['points', 'items', 'title', 'subtitle'],
  Timeline: ['items'],
  RunLog: ['lines'],
  Field: ['label', 'value'],
  Button: ['label'],
  IconButton: ['label', 'icon'],
  SegmentedControl: ['items', 'value'],
  StatusBanner: ['text', 'tone'],
  EmptyState: ['title', 'text'],
  DetailList: ['items'],
  SourceBadge: ['label', 'value'],
};

const QUICK_PROP_CONTROLS: Partial<Record<ComponentTypeName, QuickPropControl[]>> = {
  AppShell: [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
  ],
  Panel: [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
  ],
  Form: [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
  ],
  Chart: [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
  ],
  MetricCard: [
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Value' },
    { key: 'meta', label: 'Meta' },
  ],
  Button: [
    { key: 'label', label: 'Text' },
    { key: 'variant', label: 'Variant', kind: 'select', options: [{ label: 'Secondary', value: '' }, { label: 'Primary', value: 'primary' }] },
  ],
  IconButton: [
    { key: 'icon', label: 'Icon' },
    { key: 'label', label: 'Accessible label' },
    { key: 'variant', label: 'Variant', kind: 'select', options: [{ label: 'Secondary', value: '' }, { label: 'Primary', value: 'primary' }] },
  ],
  Field: [
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Value' },
    { key: 'placeholder', label: 'Placeholder' },
  ],
  StatusBanner: [
    { key: 'text', label: 'Message', kind: 'textarea' },
    { key: 'tone', label: 'Tone', kind: 'select', options: [
      { label: 'Info', value: 'info' },
      { label: 'Success', value: 'success' },
      { label: 'Warning', value: 'warning' },
      { label: 'Danger', value: 'danger' },
    ] },
  ],
  EmptyState: [
    { key: 'title', label: 'Title' },
    { key: 'text', label: 'Message', kind: 'textarea' },
  ],
  SourceBadge: [
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Value' },
  ],
};

const COLLECTION_PROP_CONTROLS: Partial<Record<ComponentTypeName, CollectionPropControl[]>> = {
  MetricStrip: [{
    key: 'items',
    label: 'Metrics',
    addLabel: 'Add metric',
    defaultItem: { label: 'Metric', value: '0', meta: 'Updated now' },
    fields: [
      { key: 'label', label: 'Label' },
      { key: 'value', label: 'Value' },
      { key: 'meta', label: 'Meta' },
    ],
  }],
  Chart: [{
    key: 'points',
    label: 'Chart points',
    addLabel: 'Add point',
    defaultItem: { label: 'New', value: 10 },
    fields: [
      { key: 'label', label: 'Label' },
      { key: 'value', label: 'Value', kind: 'number' },
    ],
  }],
  Timeline: [{
    key: 'items',
    label: 'Timeline items',
    addLabel: 'Add event',
    defaultItem: { title: 'New event', time: 'Now', status: 'ready' },
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'time', label: 'Time' },
      { key: 'status', label: 'Status', kind: 'select', options: [
        { label: 'Ready', value: 'ready' },
        { label: 'Success', value: 'success' },
        { label: 'Pending', value: 'pending' },
        { label: 'Warning', value: 'warning' },
        { label: 'Error', value: 'error' },
      ] },
    ],
  }],
  RunLog: [{
    key: 'lines',
    label: 'Log lines',
    addLabel: 'Add line',
    defaultItem: { time: 'Now', message: 'New log line' },
    fields: [
      { key: 'time', label: 'Time' },
      { key: 'message', label: 'Message' },
    ],
  }],
  DetailList: [{
    key: 'items',
    label: 'Details',
    addLabel: 'Add detail',
    defaultItem: { label: 'Field', value: 'Value' },
    fields: [
      { key: 'label', label: 'Label' },
      { key: 'value', label: 'Value' },
    ],
  }],
};

function quickPropKeysFor(type: string): Set<string> {
  return new Set((QUICK_PROP_CONTROLS[type as ComponentTypeName] || []).map((control) => control.key));
}

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

function propDisplayValue(props: Record<string, unknown> | undefined, key: string): string {
  const value = props?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function bindingPropOptionsFor(node: ConstructComponentNode): string[] {
  return [...new Set([
    ...(BINDING_PROP_SUGGESTIONS[node.type as ComponentTypeName] || []),
    ...(QUICK_PROP_CONTROLS[node.type as ComponentTypeName] || []).map((control) => control.key),
    ...TEXTUAL_PROP_KEYS,
    ...Object.keys(node.bindings || {}),
  ])].filter(Boolean);
}

function collectStatePaths(value: unknown, prefix = '', depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 4) return prefix ? [prefix] : [];
  if (Array.isArray(value)) return prefix ? [prefix] : [];
  const entries = Object.entries(value as Record<string, unknown>);
  return [
    ...(prefix ? [prefix] : []),
    ...entries.flatMap(([key, nested]) => collectStatePaths(nested, prefix ? `${prefix}.${key}` : key, depth + 1)),
  ];
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function openSpotlightPrompt(draft?: string) {
  const windowStore = useWindowStore.getState();
  if (!windowStore.spotlightOpen) windowStore.toggleSpotlight();
  window.setTimeout(() => {
    if (draft) {
      window.dispatchEvent(new CustomEvent('spotlight-set-draft', { detail: { text: draft } }));
    }
    window.dispatchEvent(new CustomEvent('spotlight-focus-input'));
  }, 0);
}

function constructThemeTokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg: cs.getPropertyValue('--color-bg').trim(),
    surface: cs.getPropertyValue('--color-surface').trim(),
    surfaceRaised: cs.getPropertyValue('--color-surface-raised').trim(),
    text: cs.getPropertyValue('--color-text').trim(),
    textMuted: cs.getPropertyValue('--color-text-muted').trim(),
    textSubtle: cs.getPropertyValue('--color-text-subtle').trim(),
    border: cs.getPropertyValue('--color-border').trim(),
    borderStrong: cs.getPropertyValue('--color-border-strong').trim(),
    accent: cs.getPropertyValue('--color-accent').trim(),
    success: cs.getPropertyValue('--color-success').trim(),
    error: cs.getPropertyValue('--color-error').trim(),
    warning: cs.getPropertyValue('--color-warning').trim(),
  };
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

function componentSearchText(node: ConstructComponentNode): string {
  const props = node.props || {};
  return [
    node.componentId,
    node.type,
    node.label,
    componentTitle(node),
    typeof props.title === 'string' ? props.title : '',
    typeof props.label === 'string' ? props.label : '',
    typeof props.text === 'string' ? props.text : '',
    typeof props.value === 'string' || typeof props.value === 'number' ? String(props.value) : '',
  ].filter(Boolean).join(' ').toLowerCase();
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

function componentIdFor(type: string, seed?: string): string {
  const base = (seed || type)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64) || type.toLowerCase();
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
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

function reorderSiblingNode(
  nodes: ConstructComponentNode[],
  draggedId: string,
  targetId: string,
): { nodes: ConstructComponentNode[]; changed: boolean } {
  if (draggedId === targetId) return { nodes, changed: false };
  const from = nodes.findIndex((node) => node.componentId === draggedId);
  const to = nodes.findIndex((node) => node.componentId === targetId);
  if (from >= 0 && to >= 0) {
    const next = [...nodes];
    const [item] = next.splice(from, 1);
    if (!item) return { nodes, changed: false };
    next.splice(to, 0, item);
    return { nodes: next, changed: true };
  }
  let changed = false;
  const next = nodes.map((node) => {
    if (!node.children) return node;
    const result = reorderSiblingNode(node.children, draggedId, targetId);
    if (!result.changed) return node;
    changed = true;
    return { ...node, children: result.nodes };
  });
  return { nodes: changed ? next : nodes, changed };
}

function makeComponent(type: string): ConstructComponentNode {
  const id = componentIdFor(type);
  const baseProps: Record<string, unknown> = { title: COMPONENT_META[type as ComponentTypeName]?.title || type };
  let children: ConstructComponentNode[] | undefined = CONTAINER_TYPES.has(type) ? [] : undefined;
  if (type === 'AppShell') {
    baseProps.title = 'Operations Console';
    baseProps.subtitle = 'Live workspace controls';
  }
  if (type === 'Panel') {
    baseProps.title = 'Workspace overview';
    baseProps.subtitle = 'Track the current queue and next action.';
  }
  if (type === 'Toolbar') {
    children = [
      makeComponent('SegmentedControl'),
      { ...makeComponent('Button'), props: { label: 'Refresh', variant: 'primary' } },
      { ...makeComponent('IconButton'), props: { label: 'More actions', icon: '•••' } },
    ];
  }
  if (type === 'Form') {
    baseProps.title = 'Update record';
    baseProps.subtitle = 'Edit the selected state-backed fields.';
    children = [
      { ...makeComponent('Field'), props: { label: 'Owner', value: 'Design Ops', placeholder: 'Owner' } },
      { ...makeComponent('Button'), props: { label: 'Apply changes', variant: 'primary' } },
    ];
  }
  if (type === 'Button') { baseProps.label = 'Run action'; baseProps.variant = 'primary'; delete baseProps.title; }
  if (type === 'IconButton') { baseProps.label = 'More actions'; baseProps.icon = '•••'; delete baseProps.title; }
  if (type === 'Field') { baseProps.label = 'Status'; baseProps.value = 'Ready'; baseProps.placeholder = 'Value'; delete baseProps.title; }
  if (type === 'StatusBanner') { baseProps.text = 'Ready for review'; baseProps.tone = 'success'; delete baseProps.title; }
  if (type === 'MetricCard') { baseProps.label = 'Open items'; baseProps.value = '18'; baseProps.meta = '+4 today'; delete baseProps.title; }
  if (type === 'MetricStrip') {
    baseProps.items = [
      { label: 'Open', value: '18', meta: '+4 today' },
      { label: 'Running', value: '7', meta: '2 need review' },
      { label: 'Blocked', value: '2', meta: 'Needs owner' },
    ];
    delete baseProps.title;
  }
  if (type === 'Table') {
    baseProps.columns = [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
    ];
    baseProps.rows = [
      { name: 'Sync dashboard', status: 'Ready', owner: 'Construct' },
      { name: 'Review queue', status: 'Running', owner: 'Agent' },
    ];
    delete baseProps.title;
  }
  if (type === 'Chart') {
    baseProps.title = 'Weekly activity';
    baseProps.subtitle = 'Completed work by day';
    baseProps.points = [
      { label: 'Mon', value: 8 },
      { label: 'Tue', value: 14 },
      { label: 'Wed', value: 11 },
      { label: 'Thu', value: 18 },
    ];
  }
  if (type === 'Timeline') {
    baseProps.items = [
      { title: 'Queued update', time: '09:12', status: 'ready' },
      { title: 'Agent generated spec', time: '09:16', status: 'success' },
      { title: 'Awaiting review', time: 'Now', status: 'pending' },
    ];
    delete baseProps.title;
  }
  if (type === 'RunLog') {
    baseProps.lines = [
      { time: '09:16', message: 'Loaded component state' },
      { time: '09:17', message: 'Preview ready' },
    ];
    delete baseProps.title;
  }
  if (type === 'SegmentedControl') { baseProps.items = ['overview', 'activity', 'settings']; baseProps.value = 'overview'; delete baseProps.title; }
  if (type === 'DetailList') {
    baseProps.items = [
      { label: 'Status', value: 'Ready' },
      { label: 'Owner', value: 'Construct' },
      { label: 'Source', value: 'Local state' },
    ];
    delete baseProps.title;
  }
  if (type === 'SourceBadge') { baseProps.label = 'Source'; baseProps.value = 'Local state'; delete baseProps.title; }
  if (type === 'EmptyState') {
    baseProps.title = 'No records yet';
    baseProps.text = 'Run an action or connect state to populate this section.';
  }
  return {
    componentId: id,
    type,
    label: COMPONENT_META[type as ComponentTypeName]?.title || type,
    props: baseProps,
    children,
  };
}

function duplicateComponentTree(node: ConstructComponentNode): ConstructComponentNode {
  const copy = JSON.parse(JSON.stringify(node)) as ConstructComponentNode;
  const withFreshIds = (current: ConstructComponentNode): ConstructComponentNode => ({
    ...current,
    componentId: componentIdFor(current.type, `${current.componentId}-copy`),
    label: current.label ? `${current.label} copy` : current.label,
    children: current.children?.map(withFreshIds),
  });
  return withFreshIds(copy);
}

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '')).filter((item) => item.trim())
    : [];
}

function fieldValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function nextFieldValue(raw: string, kind: CollectionFieldControl['kind']): unknown {
  if (kind !== 'number') return raw;
  if (!raw.trim()) return '';
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : raw;
}

function LayoutControls({
  node,
  onChange,
}: {
  node: ConstructComponentNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  if (node.type !== 'AppShell' && node.type !== 'Panel') return null;
  const props = node.props || {};
  const layout = typeof props.layout === 'string' ? props.layout : 'stack';
  const columns = typeof props.columns === 'number' ? props.columns : 2;
  const gap = typeof props.gap === 'string' ? props.gap : '';

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          Child layout
        </span>
        <span className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
          {node.children?.length || 0} item{(node.children?.length || 0) === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Mode</span>
          <div className="grid grid-cols-4 gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] p-1">
            {LAYOUT_OPTIONS.map((option) => {
              const active = layout === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    const next: Record<string, unknown> = { layout: option.value };
                    if (option.value === 'grid') next.columns = columns;
                    onChange(next);
                  }}
                  className={[
                    'h-7 rounded px-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--color-accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                      : 'text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Columns</span>
            <select
              value={String(columns)}
              onChange={(event) => onChange({ layout: 'grid', columns: Number(event.target.value) })}
              disabled={layout !== 'grid'}
              className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none disabled:cursor-not-allowed disabled:opacity-45"
            >
              {[2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Gap</span>
            <select
              value={gap}
              onChange={(event) => onChange({ gap: event.target.value })}
              className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
            >
              {GAP_OPTIONS.map((option) => <option key={option.value || 'default'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
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
        className={`${minHeight} w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 font-mono text-[11px] leading-relaxed outline-none`}
      />
    </label>
  );
}

function CollectionPropControls({
  node,
  onChange,
}: {
  node: ConstructComponentNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  const controls = COLLECTION_PROP_CONTROLS[node.type as ComponentTypeName] || [];
  if (controls.length === 0) return null;

  return (
    <div className="space-y-2">
      {controls.map((control) => {
        const items = recordArray(node.props?.[control.key]);
        const updateItems = (nextItems: Record<string, unknown>[]) => onChange({ [control.key]: nextItems });
        return (
          <div key={control.key} className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{control.label}</span>
              <button
                type="button"
                onClick={() => updateItems([...items, { ...control.defaultItem }])}
                className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
              >
                <Plus className="h-3 w-3" />
                {control.addLabel}
              </button>
            </div>
            <div className="grid gap-2">
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/[0.08] bg-black/10 px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
                  No items.
                </div>
              ) : items.map((item, index) => (
                <div key={index} className="rounded-md border border-white/[0.07] bg-black/15 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]/70">
                      {control.key}[{index}]
                    </span>
                    <button
                      type="button"
                      onClick={() => updateItems(items.filter((_, itemIndex) => itemIndex !== index))}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-red-400/10 hover:text-red-100"
                      title="Remove item"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid gap-1.5">
                    {control.fields.map((field) => {
                      const value = fieldValue(item, field.key);
                      if (field.kind === 'select') {
                        return (
                          <label key={field.key} className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2">
                            <span className="truncate text-[11px] text-[var(--color-text-muted)]">{field.label}</span>
                            <select
                              value={value}
                              onChange={(event) => updateItems(items.map((entry, itemIndex) => (
                                itemIndex === index ? { ...entry, [field.key]: event.target.value } : entry
                              )))}
                              className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                            >
                              {(field.options || []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        );
                      }
                      return (
                        <label key={field.key} className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2">
                          <span className="truncate text-[11px] text-[var(--color-text-muted)]">{field.label}</span>
                          <input
                            value={value}
                            type={field.kind === 'number' ? 'number' : 'text'}
                            onChange={(event) => updateItems(items.map((entry, itemIndex) => (
                              itemIndex === index
                                ? { ...entry, [field.key]: nextFieldValue(event.target.value, field.kind) }
                                : entry
                            )))}
                            className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SegmentedControlEditor({
  node,
  onChange,
}: {
  node: ConstructComponentNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  if (node.type !== 'SegmentedControl') return null;
  const items = stringArray(node.props?.items);
  const active = typeof node.props?.value === 'string' ? node.props.value : items[0] || '';
  const update = (nextItems: string[], value = active) => onChange({ items: nextItems, value: value || nextItems[0] || '' });

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Options</span>
        <button
          type="button"
          onClick={() => update([...items, `option-${items.length + 1}`])}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
        >
          <Plus className="h-3 w-3" />
          Add option
        </button>
      </div>
      <div className="grid gap-1.5">
        {items.map((item, index) => (
          <div key={`${item}:${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
            <input
              type="radio"
              checked={active === item}
              onChange={() => update(items, item)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              title="Set active option"
            />
            <input
              value={item}
              onChange={(event) => {
                const nextItems = items.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry);
                update(nextItems, active === item ? event.target.value : active);
              }}
              className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
                update(nextItems, active === item ? nextItems[0] || '' : active);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-red-400/10 hover:text-red-100"
              title="Remove option"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-md border border-dashed border-white/[0.08] bg-black/10 px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
            No options.
          </div>
        )}
      </div>
    </div>
  );
}

function TableDataEditor({
  node,
  onChange,
}: {
  node: ConstructComponentNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  if (node.type !== 'Table') return null;
  const columns = recordArray(node.props?.columns);
  const rows = recordArray(node.props?.rows);
  const columnKeys = columns
    .map((column) => typeof column.key === 'string' ? column.key : '')
    .filter(Boolean);
  const updateColumns = (nextColumns: Record<string, unknown>[]) => onChange({ columns: nextColumns });
  const updateRows = (nextRows: Record<string, unknown>[]) => onChange({ rows: nextRows });

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Columns</span>
          <button
            type="button"
            onClick={() => updateColumns([...columns, { key: `column${columns.length + 1}`, label: `Column ${columns.length + 1}` }])}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
          >
            <Plus className="h-3 w-3" />
            Add column
          </button>
        </div>
        <div className="grid gap-1.5">
          {columns.map((column, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1fr)_auto] gap-1.5">
              <input
                value={fieldValue(column, 'key')}
                onChange={(event) => updateColumns(columns.map((entry, columnIndex) => (
                  columnIndex === index ? { ...entry, key: event.target.value } : entry
                )))}
                placeholder="key"
                className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
              />
              <input
                value={fieldValue(column, 'label')}
                onChange={(event) => updateColumns(columns.map((entry, columnIndex) => (
                  columnIndex === index ? { ...entry, label: event.target.value } : entry
                )))}
                placeholder="Label"
                className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
              />
              <button
                type="button"
                onClick={() => updateColumns(columns.filter((_, columnIndex) => columnIndex !== index))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-red-400/10 hover:text-red-100"
                title="Remove column"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {columns.length === 0 && (
            <div className="rounded-md border border-dashed border-white/[0.08] bg-black/10 px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
              No columns.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Rows</span>
          <button
            type="button"
            onClick={() => updateRows([...rows, Object.fromEntries(columnKeys.map((key) => [key, '']))])}
            disabled={columnKeys.length === 0}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add row
          </button>
        </div>
        <div className="grid gap-2">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="rounded-md border border-white/[0.07] bg-black/15 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]/70">rows[{rowIndex}]</span>
                <button
                  type="button"
                  onClick={() => updateRows(rows.filter((_, itemIndex) => itemIndex !== rowIndex))}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-red-400/10 hover:text-red-100"
                  title="Remove row"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="grid gap-1.5">
                {columnKeys.map((key) => (
                  <label key={key} className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2">
                    <span className="truncate text-[11px] text-[var(--color-text-muted)]">{key}</span>
                    <input
                      value={fieldValue(row, key)}
                      onChange={(event) => updateRows(rows.map((entry, itemIndex) => (
                        itemIndex === rowIndex ? { ...entry, [key]: event.target.value } : entry
                      )))}
                      className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="rounded-md border border-dashed border-white/[0.08] bg-black/10 px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
              {columnKeys.length === 0 ? 'Add columns before adding rows.' : 'No rows.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickPropControls({
  node,
  onChange,
}: {
  node: ConstructComponentNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  const controls = QUICK_PROP_CONTROLS[node.type as ComponentTypeName] || [];
  if (controls.length === 0) return null;
  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
        Quick props
      </div>
      <div className="grid gap-2">
        {controls.map((control) => {
          const value = propDisplayValue(node.props, control.key);
          if (control.kind === 'select') {
            return (
              <label key={control.key} className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">{control.label}</span>
                <select
                  value={value}
                  onChange={(event) => onChange({ [control.key]: event.target.value })}
                  className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                >
                  {(control.options || []).map((option) => (
                    <option key={option.value || 'default'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            );
          }
          if (control.kind === 'textarea') {
            return (
              <label key={control.key} className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">{control.label}</span>
                <textarea
                  value={value}
                  onChange={(event) => onChange({ [control.key]: event.target.value })}
                  className="h-16 w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 text-[12px] leading-relaxed outline-none"
                />
              </label>
            );
          }
          return (
            <label key={control.key} className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">{control.label}</span>
              <input
                value={value}
                onChange={(event) => onChange({ [control.key]: event.target.value })}
                className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function BindingControls({
  node,
  statePathSuggestions,
  onChange,
}: {
  node: ConstructComponentNode;
  statePathSuggestions: string[];
  onChange: (bindings: Record<string, string>) => void;
}) {
  const options = bindingPropOptionsFor(node);
  const entries = Object.entries(node.bindings || {});
  const [newProp, setNewProp] = useState(options[0] || 'value');
  const [newPath, setNewPath] = useState(statePathSuggestions[0] || '');
  const pathListId = `builder-state-paths-${node.componentId}`;

  useEffect(() => {
    if (!options.includes(newProp)) setNewProp(options[0] || 'value');
  }, [newProp, options]);

  useEffect(() => {
    if (!newPath && statePathSuggestions[0]) setNewPath(statePathSuggestions[0]);
  }, [newPath, statePathSuggestions]);

  const setBinding = (oldKey: string, key: string, path: string) => {
    const next = { ...(node.bindings || {}) };
    if (oldKey && oldKey !== key) delete next[oldKey];
    if (key && path) next[key] = path;
    onChange(next);
  };

  const removeBinding = (key: string) => {
    const next = { ...(node.bindings || {}) };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Bindings</span>
        <span className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
          {entries.length}
        </span>
      </div>
      <datalist id={pathListId}>
        {statePathSuggestions.map((path) => <option key={path} value={path} />)}
      </datalist>
      <div className="grid gap-2">
        {entries.map(([key, path]) => (
          <div key={key} className="grid grid-cols-[minmax(0,.75fr)_minmax(0,1fr)_auto] gap-1.5">
            <select
              value={key}
              onChange={(event) => setBinding(key, event.target.value, path)}
              className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
            >
              {[...new Set([key, ...options])].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <input
              value={path}
              list={pathListId}
              onChange={(event) => setBinding(key, key, event.target.value)}
              placeholder="state.path"
              className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
            />
            <button
              type="button"
              onClick={() => removeBinding(key)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-red-400/10 hover:text-red-200"
              title="Remove binding"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,.75fr)_minmax(0,1fr)_auto] gap-1.5 border-t border-white/[0.06] pt-2">
          <select
            value={newProp}
            onChange={(event) => setNewProp(event.target.value)}
            className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
          >
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input
            value={newPath}
            list={pathListId}
            onChange={(event) => setNewPath(event.target.value)}
            placeholder="state.path"
            className="h-8 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
          />
          <button
            type="button"
            onClick={() => {
              if (!newProp || !newPath) return;
              setBinding('', newProp, newPath);
              const nextUnused = options.find((option) => option !== newProp && !(node.bindings || {})[option]);
              if (nextUnused) setNewProp(nextUnused);
            }}
            disabled={!newProp || !newPath}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
            title="Add binding"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickActionControls({
  componentId,
  action,
  toolNames,
  onChange,
  onError,
}: {
  componentId: string;
  action: ConstructComponentAction | undefined;
  toolNames: string[];
  onChange: (action: ConstructComponentAction | null) => void;
  onError: (message: string | null) => void;
}) {
  const mode = action?.type || 'none';
  const toolListId = `builder-tools-${componentId}`;

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Click action</span>
        {mode !== 'none' && (
          <span className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
            {mode}
          </span>
        )}
      </div>
      <div className="grid gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Behavior</span>
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'none') onChange(null);
              if (next === 'state.patch') onChange({ type: 'state.patch', patch: action?.type === 'state.patch' ? action.patch || {} : { status: 'updated' } });
              if (next === 'tool.call') onChange({ type: 'tool.call', tool: action?.type === 'tool.call' ? action.tool || toolNames[0] || '' : toolNames[0] || '', args: action?.type === 'tool.call' ? action.args || {} : {} });
            }}
            className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
          >
            <option value="none">None</option>
            <option value="state.patch">Patch state</option>
            <option value="tool.call">Call tool</option>
          </select>
        </label>

        {mode === 'tool.call' && (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Tool</span>
              <input
                value={action?.type === 'tool.call' ? action.tool || '' : ''}
                list={toolListId}
                onChange={(event) => onChange({ type: 'tool.call', tool: event.target.value, args: action?.type === 'tool.call' ? action.args || {} : {} })}
                className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[12px] outline-none"
              />
              <datalist id={toolListId}>
                {toolNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </label>
            <JsonObjectEditor
              label="Args JSON"
              value={action?.type === 'tool.call' ? action.args : undefined}
              minHeight="h-24"
              onValidChange={(args) => onChange({ type: 'tool.call', tool: action?.type === 'tool.call' ? action.tool || '' : '', args })}
              onError={onError}
            />
          </>
        )}

        {mode === 'state.patch' && (
          <JsonObjectEditor
            label="State patch JSON"
            value={action?.type === 'state.patch' ? action.patch : undefined}
            minHeight="h-24"
            onValidChange={(patch) => onChange({ type: 'state.patch', patch })}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

export function AppBuilderWindow({ config }: { config: WindowConfig }) {
  const localApps = useAppStore((s) => s.localApps);
  const appsLoading = useAppStore((s) => s.loading);
  const appsError = useAppStore((s) => s.error);
  const fetched = useAppStore((s) => s.fetched);
  const fetchApps = useAppStore((s) => s.fetchApps);
  const addComponentMention = useComputerStore((s) => s.addComponentMention);
  const sendChatMessage = useComputerStore((s) => s.sendChatMessage);
  const metadataAppId = typeof config.metadata?.appId === 'string' ? config.metadata.appId : '';
  const metadataComponentId = typeof config.metadata?.componentId === 'string' ? config.metadata.componentId : '';
  const [selectedAppId, setSelectedAppId] = useState(
    metadataAppId,
  );
  const [spec, setSpec] = useState<ConstructAppSpec | null>(null);
  const [appState, setAppState] = useState<Record<string, unknown>>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [savedSpecJson, setSavedSpecJson] = useState('');
  const [savedStateJson, setSavedStateJson] = useState('{}');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('app');
  const [paletteGroup, setPaletteGroup] = useState<PaletteGroup>('all');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [componentQuery, setComponentQuery] = useState('');
  const [draggedComponentId, setDraggedComponentId] = useState('');
  const [dragOverComponentId, setDragOverComponentId] = useState('');
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveGenerationRef = useRef(0);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastHistoryRef = useRef('');
  const suppressHistoryRef = useRef(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  useEffect(() => {
    if (!fetched) void fetchApps();
  }, [fetchApps, fetched]);

  useEffect(() => {
    if (!selectedAppId && localApps.length > 0) setSelectedAppId(localApps[0].id);
  }, [localApps, selectedAppId]);

  useEffect(() => {
    if (metadataAppId && metadataAppId !== selectedAppId) setSelectedAppId(metadataAppId);
  }, [metadataAppId, selectedAppId]);

  const selectedApp = useMemo<LocalApp | undefined>(
    () => localApps.find((app) => app.id === selectedAppId),
    [localApps, selectedAppId],
  );
  const hasLocalApps = localApps.length > 0;

  const flat = useMemo(() => spec ? flatten(spec.layout) : [], [spec]);
  const visibleFlat = useMemo(() => spec ? flattenVisible(spec.layout, expanded) : [], [expanded, spec]);
  const componentTreeItems = useMemo(() => {
    const query = componentQuery.trim().toLowerCase();
    if (!query || !spec) return visibleFlat;
    const matches = flat.filter((item) => componentSearchText(item.node).includes(query));
    const included = new Set<string>();
    for (const item of matches) {
      included.add(item.node.componentId);
      for (const ancestorId of ancestorIds(spec.layout, item.node.componentId)) included.add(ancestorId);
    }
    return flat.filter((item) => included.has(item.node.componentId));
  }, [componentQuery, flat, spec, visibleFlat]);
  const componentMatchCount = useMemo(() => {
    const query = componentQuery.trim().toLowerCase();
    return query ? flat.filter((item) => componentSearchText(item.node).includes(query)).length : flat.length;
  }, [componentQuery, flat]);
  const statePathSuggestions = useMemo(() => [...new Set([
    ...collectStatePaths(appState),
    ...collectStatePaths(spec?.data),
  ])].filter(Boolean), [appState, spec?.data]);
  const specDirty = useMemo(() => Boolean(spec && JSON.stringify(spec) !== savedSpecJson), [savedSpecJson, spec]);
  const stateDirty = useMemo(() => JSON.stringify(appState) !== savedStateJson, [appState, savedStateJson]);
  const dirty = specDirty || stateDirty;
  const saveStatus = useMemo(() => {
    if (saving || autoSaveState === 'saving') return { label: 'Saving', tone: 'accent' as const, icon: Loader2 };
    if (autoSaveState === 'pending' || dirty) return { label: 'Unsaved', tone: 'warn' as const, icon: Circle };
    if (autoSaveState === 'error') return { label: 'Save failed', tone: 'error' as const, icon: Circle };
    if (spec) return { label: 'Saved', tone: 'muted' as const, icon: CheckCircle2 };
    return null;
  }, [autoSaveState, dirty, saving, spec]);
  const selected = flat.find((item) => item.node.componentId === selectedId)?.node || flat[0]?.node;
  const selectedFlat = selected ? flat.find((item) => item.node.componentId === selected.componentId) : undefined;
  const selectedSiblings = useMemo(() => {
    if (!spec || !selectedFlat) return [];
    if (!selectedFlat.parentId) return spec.layout;
    return flat.find((item) => item.node.componentId === selectedFlat.parentId)?.node.children || [];
  }, [flat, selectedFlat, spec]);
  const selectedSiblingIndex = selected ? selectedSiblings.findIndex((node) => node.componentId === selected.componentId) : -1;
  const canMoveUp = selectedSiblingIndex > 0;
  const canMoveDown = selectedSiblingIndex >= 0 && selectedSiblingIndex < selectedSiblings.length - 1;
  const localToolNames = useMemo(() => selectedApp?.manifest.tools?.map((tool) => tool.name).filter(Boolean) || [], [selectedApp]);
  const filteredComponentTypes = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return COMPONENT_TYPES
      .filter((type) => type !== 'AppShell')
      .filter((type) => paletteGroup === 'all' || COMPONENT_META[type].group === paletteGroup)
      .filter((type) => {
        if (!query) return true;
        const meta = COMPONENT_META[type];
        return type.toLowerCase().includes(query)
          || meta.title.toLowerCase().includes(query)
          || meta.description.toLowerCase().includes(query);
      });
  }, [paletteGroup, paletteQuery]);
  const selectedMeta = selected ? COMPONENT_META[selected.type as ComponentTypeName] : undefined;
  const SelectedIcon = selectedMeta?.icon || Blocks;
  const selectedCanContainChildren = Boolean(selected && CONTAINER_TYPES.has(selected.type));
  const selectedChildCount = selected?.children?.length || 0;
  const expandAllComponents = useCallback(() => {
    setExpanded(new Set(flat.filter((item) => (item.node.children || []).length > 0).map((item) => item.node.componentId)));
  }, [flat]);
  const collapseAllComponents = useCallback(() => {
    setExpanded(new Set());
  }, []);

  useEffect(() => {
    if (!spec) return;
    // History tracks both the spec and the app state so undo/redo restore the
    // full editable surface, not just the layout.
    const snapshot = JSON.stringify({ s: spec, st: appState });
    if (!lastHistoryRef.current) {
      lastHistoryRef.current = snapshot;
      return;
    }
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      lastHistoryRef.current = snapshot;
      return;
    }
    if (snapshot === lastHistoryRef.current) return;
    const previous = lastHistoryRef.current;
    lastHistoryRef.current = snapshot;
    setUndoStack((stack) => [...stack.slice(-49), previous]);
    setRedoStack([]);
  }, [spec, appState]);

  const loadSpec = useCallback(async () => {
    if (!selectedAppId) return;
    setLoading(true);
    setError(null);
    setToken('');
    try {
      const [specRes, tokenRes, stateRes] = await Promise.all([
        api.getLocalAppSpec(selectedAppId),
        api.mintLocalAppToken(selectedAppId),
        api.getLocalAppState(selectedAppId),
      ]);
      if (tokenRes.success && tokenRes.data?.token) setToken(tokenRes.data.token);
      if (!specRes.success) throw new Error(specRes.error || 'App has no editable Construct spec.');
      if (!specRes.data?.spec) throw new Error('App has no editable Construct spec.');
      setUndoStack([]);
      setRedoStack([]);
      setSpec(specRes.data.spec);
      setSavedSpecJson(JSON.stringify(specRes.data.spec));
      const nextState = stateRes.success && stateRes.data && typeof stateRes.data === 'object'
        ? stateRes.data
        : {};
      setAppState(nextState);
      setSavedStateJson(JSON.stringify(nextState));
      lastHistoryRef.current = JSON.stringify({ s: specRes.data.spec, st: nextState });
      const nextFlat = flatten(specRes.data.spec.layout);
      const targetComponentId = metadataComponentId && nextFlat.some((item) => item.node.componentId === metadataComponentId)
        ? metadataComponentId
        : '';
      setSelectedId((prev) => nextFlat.some((item) => item.node.componentId === prev)
        ? targetComponentId || prev
        : targetComponentId || nextFlat[0]?.node.componentId || '');
      setExpanded(new Set(nextFlat.filter((item) => (item.node.children || []).length > 0).map((item) => item.node.componentId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [metadataComponentId, selectedAppId]);

  useEffect(() => {
    if (!metadataComponentId || !spec) return;
    if (!flat.some((item) => item.node.componentId === metadataComponentId)) return;
    setSelectedId(metadataComponentId);
    const parents = ancestorIds(spec.layout, metadataComponentId);
    if (parents.length > 0) setExpanded((prev) => new Set([...prev, ...parents]));
  }, [flat, metadataComponentId, spec]);

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
      setSavedSpecJson(JSON.stringify(res.data.spec));
      setSpec((current) => JSON.stringify(current) === JSON.stringify(nextSpec) ? res.data!.spec : current);
      setPreviewKey((key) => key + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedAppId]);

  const persistState = useCallback(async (nextState: Record<string, unknown>): Promise<boolean> => {
    if (!selectedAppId) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await api.setLocalAppState(selectedAppId, nextState);
      if (!res.success) throw new Error(res.error || 'State save failed');
      const saved = res.data?.state && typeof res.data.state === 'object'
        ? res.data.state
        : nextState;
      setSavedStateJson(JSON.stringify(saved));
      setAppState((current) => JSON.stringify(current) === JSON.stringify(nextState) ? saved : current);
      setPreviewKey((key) => key + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedAppId]);

  const persistAll = useCallback(async (): Promise<boolean> => {
    if (!spec) return false;
    // Collapse overlapping save requests (manual Save + autosave) into a single
    // in-flight operation. Any edits made while a save runs stay dirty and are
    // picked up by the next autosave pass, so we never run two saves at once.
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const run = (async (): Promise<boolean> => {
      if (specDirty) {
        const saved = await persistSpec(spec);
        if (!saved) return false;
      }
      if (stateDirty) {
        const saved = await persistState(appState);
        if (!saved) return false;
      }
      return true;
    })();
    saveInFlightRef.current = run;
    try {
      return await run;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [appState, persistSpec, persistState, spec, specDirty, stateDirty]);

  const applyHistorySnapshot = useCallback((snapshot: string) => {
    const parsed = JSON.parse(snapshot) as { s: ConstructAppSpec; st?: Record<string, unknown> };
    suppressHistoryRef.current = true;
    lastHistoryRef.current = snapshot;
    setSpec(parsed.s);
    setAppState(parsed.st && typeof parsed.st === 'object' ? parsed.st : {});
  }, []);

  const undoSpecEdit = useCallback(() => {
    if (!spec || undoStack.length === 0) return;
    const current = JSON.stringify({ s: spec, st: appState });
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-49), current]);
    applyHistorySnapshot(previous);
  }, [appState, applyHistorySnapshot, spec, undoStack]);

  const redoSpecEdit = useCallback(() => {
    if (!spec || redoStack.length === 0) return;
    const current = JSON.stringify({ s: spec, st: appState });
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-49), current]);
    applyHistorySnapshot(next);
  }, [appState, applyHistorySnapshot, redoStack, spec]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!spec || loading) {
      setAutoSaveState('idle');
      return;
    }
    if (!dirty) {
      setAutoSaveState('saved');
      return;
    }
    if (saving) return;
    if (error) {
      setAutoSaveState('error');
      return;
    }

    setAutoSaveState('pending');
    const generation = autoSaveGenerationRef.current + 1;
    autoSaveGenerationRef.current = generation;
    const timer = setTimeout(() => {
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
      void (async () => {
        if (autoSaveGenerationRef.current !== generation) return;
        setAutoSaveState('saving');
        const saved = await persistAll();
        if (autoSaveGenerationRef.current === generation) {
          setAutoSaveState(saved ? 'saved' : 'error');
        }
      })();
    }, 800);
    autoSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
    };
  }, [dirty, error, loading, persistAll, saving, spec]);

  const patchSpecRoot = useCallback((patch: Partial<ConstructAppSpec>) => {
    if (!spec) return;
    setSpec({ ...spec, ...patch });
  }, [spec]);

  const setAppDensity = useCallback((density: '' | 'compact' | 'comfortable') => {
    if (!spec) return;
    const nextTheme = { ...(spec.theme || {}) };
    if (density) nextTheme.density = density;
    else delete nextTheme.density;
    patchSpecRoot({ theme: Object.keys(nextTheme).length > 0 ? nextTheme : undefined });
  }, [patchSpecRoot, spec]);

  const replaceSpecData = useCallback((data: Record<string, unknown>) => {
    if (!spec) return;
    setSpec({ ...spec, data: Object.keys(data).length > 0 ? data : undefined });
  }, [spec]);

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

  const replaceSelectedClickAction = useCallback((action: ConstructComponentAction | null) => {
    if (!spec || !selected) return;
    const next = cloneSpec(spec);
    next.layout = updateNode(next.layout, selected.componentId, (node) => {
      const actions = { ...(node.actions || {}) };
      if (action) actions.click = action;
      else delete actions.click;
      return {
        ...node,
        actions: Object.keys(actions).length > 0 ? actions : undefined,
      };
    });
    setSpec(next);
  }, [selected, spec]);

  const saveCurrentSpec = useCallback(async () => {
    await persistAll();
  }, [persistAll]);

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
    if (!spec) return;
    const node = makeComponent(type);
    const next = cloneSpec(spec);
    if (selected) {
      next.layout = insertSibling(next.layout, selected.componentId, node);
    } else {
      // No selection (e.g. empty tree): append at the root layout.
      next.layout = [...next.layout, node];
    }
    setSpec(next);
    setSelectedId(node.componentId);
  }, [selected, spec]);

  const duplicateSelected = useCallback(() => {
    if (!spec || !selected || selected.type === 'AppShell') return;
    const duplicate = duplicateComponentTree(selected);
    const next = cloneSpec(spec);
    next.layout = insertSibling(next.layout, selected.componentId, duplicate);
    setSpec(next);
    if (duplicate.children?.length) setExpanded((prev) => new Set(prev).add(duplicate.componentId));
    setSelectedId(duplicate.componentId);
  }, [selected, spec]);

  const selectedMention = useCallback((): ComponentMention | null => {
    if (!selectedAppId || !selected) return null;
    const item = flat.find((entry) => entry.node.componentId === selected.componentId);
    return {
      appId: selectedAppId,
      appName: selectedApp?.manifest.name,
      componentId: selected.componentId,
      componentType: selected.type,
      label: selected.label || componentTitle(selected),
      path: item?.path,
      props: selected.props,
      bindings: selected.bindings,
      actions: selected.actions,
    };
  }, [flat, selected, selectedApp?.manifest.name, selectedAppId]);

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

  const reorderComponent = useCallback((draggedId: string, targetId: string) => {
    if (!spec || draggedId === targetId) return;
    const dragged = flat.find((item) => item.node.componentId === draggedId);
    const target = flat.find((item) => item.node.componentId === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;
    const next = cloneSpec(spec);
    const result = reorderSiblingNode(next.layout, draggedId, targetId);
    if (!result.changed) return;
    next.layout = result.nodes;
    setSpec(next);
    setSelectedId(draggedId);
  }, [flat, spec]);

  const attachSelectedToSpotlight = useCallback((): ComponentMention | null => {
    const mention = selectedMention();
    if (!mention) return null;
    addComponentMention(mention);
    openSpotlightPrompt();
    useNotificationStore.getState().addNotification(
      { title: 'Component attached', body: `${mention.label || mention.componentId} is ready in the Spotlight prompt.`, variant: 'success' },
      3500,
    );
    return mention;
  }, [addComponentMention, selectedMention]);

  const mentionSelected = useCallback(() => {
    attachSelectedToSpotlight();
  }, [attachSelectedToSpotlight]);

  const sendSelectedToAgent = useCallback(async () => {
    const prompt = agentPrompt.trim();
    const mention = selectedMention();
    if (!mention) return;
    if (!prompt) {
      attachSelectedToSpotlight();
      return;
    }
    if (dirty) {
      const saved = await persistAll();
      if (!saved) return;
    }
    sendChatMessage(prompt, undefined, { componentMentions: [mention] });
    openSpotlightPrompt();
    setAgentPrompt('');
    useNotificationStore.getState().addNotification(
      { title: 'Sent to Construct', body: `${mention.label || mention.componentId} attached to the prompt.`, variant: 'success' },
      3500,
    );
  }, [agentPrompt, attachSelectedToSpotlight, dirty, persistAll, selectedMention, sendChatMessage]);

  const handleBuilderKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    const command = event.metaKey || event.ctrlKey;
    if (command && key === 's') {
      event.preventDefault();
      void persistAll();
      return;
    }
    if (isTextEntryTarget(event.target)) return;
    if (command && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoSpecEdit();
      else undoSpecEdit();
      return;
    }
    if (command && key === 'y') {
      event.preventDefault();
      redoSpecEdit();
      return;
    }
    if (command && key === 'd') {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelected(-1);
      return;
    }
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelected(1);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected?.type !== 'AppShell') {
      event.preventDefault();
      removeSelected();
    }
  }, [duplicateSelected, moveSelected, persistAll, redoSpecEdit, removeSelected, selected?.type, undoSpecEdit]);

  const openApp = useCallback(() => {
    if (!selectedApp) return;
    useWindowStore.getState().openWindow('app', {
      title: selectedApp.manifest.name,
      icon: selectedApp.icon_url || selectedApp.manifest.icon,
      metadata: { appId: selectedApp.id },
    });
  }, [selectedApp]);

  const askAgentForNewApp = useCallback(() => {
    openSpotlightPrompt(
      'Create a new declarative local app using the Construct v2 app builder. Use manifest.ui.renderer="construct-hosted", manifest.ui.kit="construct-v2", and app.construct.json. Start with a polished desktop-style app shell, editable components, useful sample state, and tool/state bindings I can refine in Builder.',
    );
  }, []);

  const askAgentToFixApp = useCallback(() => {
    const name = selectedApp?.manifest.name || selectedAppId;
    openSpotlightPrompt(
      `Rebuild the local app "${name}" as an editable Construct v2 declarative app so I can edit it in Builder. Use manifest.ui.renderer="construct-hosted", manifest.ui.kit="construct-v2", and a valid app.construct.json layout that preserves the app's current behavior and tools.`,
    );
  }, [selectedApp, selectedAppId]);

  const postSelectedToPreview = useCallback(() => {
    if (!selectedId) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'construct:select_component', componentId: selectedId },
      '*',
    );
  }, [selectedId]);

  const postThemeToPreview = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'construct:set_theme', tokens: constructThemeTokens() },
      '*',
    );
  }, []);

  useEffect(() => {
    postThemeToPreview();
    postSelectedToPreview();
  }, [postSelectedToPreview, postThemeToPreview, previewKey, token]);

  const previewUrl = selectedAppId && token
    ? `/api/apps/local/${encodeURIComponent(selectedAppId)}?builder=1&app_token=${encodeURIComponent(token)}`
    : '';
  const previewPlaceholder = selectedAppId
    ? loading || !token
      ? 'Preparing authenticated preview...'
      : 'Preview unavailable.'
    : 'Select a local app to edit.';

  return (
    <div
      className="flex h-full min-h-0 flex-col surface-app bg-[var(--color-bg)] text-[var(--color-text)]"
      onKeyDown={handleBuilderKeyDown}
      tabIndex={-1}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.08] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Blocks className="h-4 w-4 text-[var(--color-accent)]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              App Builder
              {dirty && <Circle className="h-2 w-2 fill-[var(--color-accent)] text-[var(--color-accent)]" />}
              {saveStatus && (
                <span
                  className={[
                    'ml-1 inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium',
                    saveStatus.tone === 'accent' && 'border-sky-300/20 bg-sky-300/10 text-sky-100',
                    saveStatus.tone === 'warn' && 'border-amber-300/20 bg-amber-300/10 text-amber-100',
                    saveStatus.tone === 'error' && 'border-red-300/20 bg-red-300/10 text-red-100',
                    saveStatus.tone === 'muted' && 'border-white/[0.08] bg-white/[0.035] text-[var(--color-text-muted)]',
                  ].filter(Boolean).join(' ')}
                >
                  {(() => {
                    const StatusIcon = saveStatus.icon;
                    return <StatusIcon className={`h-3 w-3 ${saveStatus.label === 'Saving' ? 'animate-spin' : ''}`} />;
                  })()}
                  {saveStatus.label}
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-[var(--color-text-muted)]">{selectedApp?.manifest.description || 'Spec-first Construct UI editor'}</div>
          </div>
        </div>
        <select
          value={selectedAppId}
          onChange={(event) => setSelectedAppId(event.target.value)}
          disabled={!hasLocalApps}
          className="ml-auto h-8 min-w-[220px] rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none disabled:cursor-not-allowed disabled:opacity-45"
        >
          {hasLocalApps
            ? localApps.map((app) => (
                <option key={app.id} value={app.id}>{app.manifest.name}</option>
              ))
            : <option value="">No local apps</option>}
        </select>
        <div className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] p-0.5">
          <button
            type="button"
            onClick={undoSpecEdit}
            disabled={undoStack.length === 0}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={redoSpecEdit}
            disabled={redoStack.length === 0}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <button onClick={() => void loadSpec()} className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button onClick={openApp} disabled={!selectedApp} className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)] disabled:opacity-30" title="Open app">
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {error && spec && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {!hasLocalApps && !appsLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/[0.14] p-6">
          <div className="w-full max-w-[520px] rounded-lg border border-white/[0.08] bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.22)]">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-sky-300/20 bg-sky-300/10 text-sky-100">
                <Blocks className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[var(--color-text)]">
                  No editable local apps yet
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                  Builder edits Construct v2 local apps after the agent creates the initial declarative app shell. Once an app exists, this window becomes the component tree, preview, inspector, and agent handoff surface.
                </p>
                {appsError && (
                  <p className="mt-2 rounded-md border border-red-400/15 bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100">
                    {appsError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={askAgentForNewApp}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-semibold text-white hover:brightness-110"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Draft agent request
              </button>
              <button
                type="button"
                onClick={() => void fetchApps()}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh apps
              </button>
            </div>
          </div>
        </div>
      ) : (selectedApp && !spec && !loading && error) ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/[0.14] p-6">
          <div className="w-full max-w-[520px] rounded-lg border border-white/[0.08] bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.22)]">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-100">
                <Blocks className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[var(--color-text)]">
                  {selectedApp.manifest.name || selectedAppId} isn&apos;t editable here yet
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                  Builder edits Construct v2 declarative apps (manifest.ui.renderer=&quot;construct-hosted&quot; with an app.construct.json layout). This app couldn&apos;t be loaded as a declarative spec.
                </p>
                <p className="mt-2 rounded-md border border-red-400/15 bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100">
                  {error}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={askAgentToFixApp}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-semibold text-white hover:brightness-110"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Ask agent to rebuild
              </button>
              <button
                type="button"
                onClick={() => void loadSpec()}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={openApp}
                disabled={!selectedApp}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open app
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(360px,1fr)_340px] overflow-x-auto max-[1040px]:grid-cols-[240px_minmax(300px,1fr)_320px] max-[860px]:grid-cols-[200px_minmax(260px,1fr)_300px]">
        <aside className="flex min-h-0 flex-col border-r border-white/[0.08] bg-black/[0.06]">
          <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <PanelLeft className="h-3.5 w-3.5" />
            Components
            <span className="ml-auto rounded border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 text-[10px] font-medium tracking-normal tabular-nums">
              {componentMatchCount}
            </span>
            <button
              type="button"
              onClick={expandAllComponents}
              className="rounded p-0.5 text-[var(--color-text-muted)]/70 hover:bg-white/[0.06] hover:text-[var(--color-text)]"
              title="Expand all"
              aria-label="Expand all components"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={collapseAllComponents}
              className="rounded p-0.5 text-[var(--color-text-muted)]/70 hover:bg-white/[0.06] hover:text-[var(--color-text)]"
              title="Collapse all"
              aria-label="Collapse all components"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="border-b border-white/[0.06] p-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]/65" />
              <input
                value={componentQuery}
                onChange={(event) => setComponentQuery(event.target.value)}
                placeholder="Find by label, id, type"
                className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] pl-7 pr-2 text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading spec...
              </div>
            ) : componentTreeItems.length === 0 ? (
              <div className="p-3 text-[12px] text-[var(--color-text-muted)]">
                {componentQuery.trim() ? 'No components match.' : 'No editable components.'}
              </div>
            ) : componentTreeItems.map((item) => {
              const hasChildren = (item.node.children || []).length > 0;
              const query = componentQuery.trim().toLowerCase();
              const isSearching = Boolean(query);
              const isOpen = isSearching || expanded.has(item.node.componentId);
              const directMatch = query ? componentSearchText(item.node).includes(query) : true;
              const canDrag = !isSearching && item.node.type !== 'AppShell';
              const isDragging = draggedComponentId === item.node.componentId;
              const isDropTarget = Boolean(draggedComponentId)
                && dragOverComponentId === item.node.componentId
                && draggedComponentId !== item.node.componentId;
              return (
                <div key={item.node.componentId}>
                  <button
                    type="button"
                    draggable={canDrag}
                    onDragStart={(event) => {
                      if (!canDrag) {
                        event.preventDefault();
                        return;
                      }
                      setDraggedComponentId(item.node.componentId);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.node.componentId);
                    }}
                    onDragOver={(event) => {
                      if (!draggedComponentId || draggedComponentId === item.node.componentId || isSearching) return;
                      const dragged = flat.find((entry) => entry.node.componentId === draggedComponentId);
                      if (!dragged || dragged.parentId !== item.parentId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverComponentId(item.node.componentId);
                    }}
                    onDragLeave={() => {
                      if (dragOverComponentId === item.node.componentId) setDragOverComponentId('');
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedId = draggedComponentId || event.dataTransfer.getData('text/plain');
                      setDraggedComponentId('');
                      setDragOverComponentId('');
                      reorderComponent(draggedId, item.node.componentId);
                    }}
                    onDragEnd={() => {
                      setDraggedComponentId('');
                      setDragOverComponentId('');
                    }}
                    onClick={() => setSelectedId(item.node.componentId)}
                    className={[
                      'group relative flex h-9 w-full items-center gap-1.5 rounded-md px-2 text-left text-[12px] transition-colors',
                      selected?.componentId === item.node.componentId
                        ? 'bg-white/[0.075] text-[var(--color-text)] shadow-[inset_2px_0_0_var(--color-accent)]'
                        : directMatch
                          ? 'text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]'
                          : 'text-[var(--color-text-muted)]/55 hover:bg-white/[0.04] hover:text-[var(--color-text-muted)]',
                      canDrag && 'cursor-grab active:cursor-grabbing',
                      isDragging && 'opacity-45',
                      isDropTarget && 'ring-1 ring-[var(--color-accent)]/45 bg-[var(--color-accent)]/10',
                    ].filter(Boolean).join(' ')}
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
                    <GripVertical
                      className={[
                        'h-3.5 w-3.5 shrink-0 transition-opacity',
                        canDrag ? 'text-[var(--color-text-muted)]/40 opacity-0 group-hover:opacity-100' : 'text-[var(--color-text-muted)]/15',
                      ].join(' ')}
                    />
                    {(() => {
                      const Icon = COMPONENT_META[item.node.type as ComponentTypeName]?.icon || Blocks;
                      return <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]/70" />;
                    })()}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{componentTitle(item.node)}</span>
                      <span className="block truncate font-mono text-[10px] leading-3 text-[var(--color-text-muted)]/55">{item.node.componentId}</span>
                    </span>
                    <span className="shrink-0 rounded border border-white/[0.07] bg-black/20 px-1 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)]/65">{item.node.type}</span>
                  </button>
                  {hasChildren && !isOpen && null}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="relative flex min-h-0 flex-col bg-black/[0.16]">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-black/[0.08] px-3">
            <MousePointer2 className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium">
                {selected ? componentTitle(selected) : selectedApp?.manifest.name || 'Preview'}
              </div>
              <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]/70">
                {selectedFlat?.path || 'Select a component from the tree or preview'}
              </div>
            </div>
            {selected && (
              <span className="shrink-0 rounded border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                {selected.type}
              </span>
            )}
            <button
              type="button"
              onClick={mentionSelected}
              disabled={!selected}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.07] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
              title="Mention selected component in Spotlight"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Mention
            </button>
          </div>
          {previewUrl ? (
            <iframe
              key={`${selectedAppId}:${previewKey}:${token}`}
              ref={iframeRef}
              src={previewUrl}
              onLoad={() => {
                postThemeToPreview();
                postSelectedToPreview();
              }}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              className="min-h-0 flex-1 border-0 bg-transparent"
              title={selectedApp?.manifest.name || 'App preview'}
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-[var(--color-text-muted)]">
              {previewPlaceholder}
            </div>
          )}
        </main>

        <aside className="min-h-0 border-l border-white/[0.08] bg-black/[0.06] max-[900px]:col-span-2 max-[900px]:h-[280px] max-[900px]:border-l-0 max-[900px]:border-t">
          <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Inspector</span>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" />}
          </div>
          <div className="h-[calc(100%-40px)] overflow-auto p-3">
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-md border border-white/[0.08] bg-white/[0.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="flex items-start gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.045]">
                      <SelectedIcon className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{componentTitle(selected)}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                        <span className="shrink-0 rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono">{selected.type}</span>
                        <span className="truncate font-mono">{selected.componentId}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-text-muted)]/75">
                        <span className="rounded border border-white/[0.07] bg-black/15 px-1.5 py-0.5">
                          {selectedCanContainChildren ? `${selectedChildCount} child${selectedChildCount === 1 ? '' : 'ren'}` : 'leaf'}
                        </span>
                        {selected.bindings && Object.keys(selected.bindings).length > 0 && (
                          <span className="rounded border border-white/[0.07] bg-black/15 px-1.5 py-0.5">
                            {Object.keys(selected.bindings).length} binding{Object.keys(selected.bindings).length === 1 ? '' : 's'}
                          </span>
                        )}
                        {selected.actions && Object.keys(selected.actions).length > 0 && (
                          <span className="rounded border border-white/[0.07] bg-black/15 px-1.5 py-0.5">
                            {Object.keys(selected.actions).length} action{Object.keys(selected.actions).length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void saveCurrentSpec()}
                      disabled={!dirty || saving}
                      className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                      title="Save changes"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-white/[0.06] pt-2">
                    <button
                      type="button"
                      onClick={() => moveSelected(-1)}
                      disabled={!canMoveUp}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
                      title="Move up"
                      aria-label="Move up"
                    >
                      <MoveUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelected(1)}
                      disabled={!canMoveDown}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
                      title="Move down"
                      aria-label="Move down"
                    >
                      <MoveDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={duplicateSelected}
                      disabled={selected.type === 'AppShell'}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
                      title="Duplicate"
                      aria-label="Duplicate"
                    >
                      <CopyPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={mentionSelected}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15"
                      title="Mention in Spotlight"
                      aria-label="Mention in Spotlight"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={removeSelected}
                      disabled={selected.type === 'AppShell'}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-red-300/20 bg-red-300/10 text-red-100 hover:bg-red-300/15 disabled:cursor-not-allowed disabled:opacity-35"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {selectedFlat?.path && (
                    <div className="mt-2 truncate border-t border-white/[0.06] pt-2 font-mono text-[10px] text-[var(--color-text-muted)]/75">
                      {selectedFlat.path}
                    </div>
                  )}
                  {dirty && (
                    <div className="mt-2 flex gap-1.5 border-t border-white/[0.06] pt-2">
                      {specDirty && <span className="rounded border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100">Spec changed</span>}
                      {stateDirty && <span className="rounded border border-sky-300/20 bg-sky-300/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-100">State changed</span>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1">
                  {INSPECTOR_TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setInspectorTab(id)}
                      className={[
                        'inline-flex h-8 items-center justify-center gap-1 rounded px-1 text-[11px] font-medium transition-colors',
                        inspectorTab === id
                          ? 'bg-white/[0.09] text-[var(--color-text)]'
                          : 'text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]',
                      ].join(' ')}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>

                {inspectorTab === 'app' && spec && (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">App name</span>
                      <input
                        value={spec.name}
                        onChange={(event) => patchSpecRoot({ name: event.target.value })}
                        className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Description</span>
                      <textarea
                        value={spec.description || ''}
                        onChange={(event) => patchSpecRoot({ description: event.target.value })}
                        className="h-16 w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 text-[12px] leading-relaxed outline-none"
                      />
                    </label>
                    <div>
                      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Density</span>
                      <div className="grid grid-cols-3 gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] p-1">
                        {DENSITY_OPTIONS.map((option) => {
                          const active = (spec.theme?.density || '') === option.value;
                          return (
                            <button
                              key={option.value || 'default'}
                              type="button"
                              onClick={() => setAppDensity(option.value)}
                              className={[
                                'h-7 rounded px-1.5 text-[11px] font-medium transition-colors',
                                active
                                  ? 'bg-[var(--color-accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                                  : 'text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]',
                              ].join(' ')}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <JsonObjectEditor
                      label="Spec data JSON"
                      value={spec.data}
                      minHeight="h-28"
                      onValidChange={replaceSpecData}
                      onError={setError}
                    />
                    <JsonObjectEditor
                      label="Live state JSON"
                      value={appState}
                      minHeight="h-36"
                      onValidChange={setAppState}
                      onError={setError}
                    />
                  </div>
                )}

                {inspectorTab === 'props' && (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Component ID</span>
                      <input
                        value={selected.componentId}
                        readOnly
                        className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 font-mono text-[12px] text-[var(--color-text-muted)] outline-none"
                      />
                    </label>
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
                          className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
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
                          className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                        />
                      </label>
                    </div>
                    <QuickPropControls
                      node={selected}
                      onChange={(props) => patchSelected({ props })}
                    />
                    <LayoutControls
                      node={selected}
                      onChange={(props) => patchSelected({ props })}
                    />
                    <CollectionPropControls
                      node={selected}
                      onChange={(props) => patchSelected({ props })}
                    />
                    <TableDataEditor
                      node={selected}
                      onChange={(props) => patchSelected({ props })}
                    />
                    <SegmentedControlEditor
                      node={selected}
                      onChange={(props) => patchSelected({ props })}
                    />
                    {TEXTUAL_PROP_KEYS.filter((key) => !quickPropKeysFor(selected.type).has(key)).map((key) => (
                      <label key={key} className="block">
                        <span className="mb-1 block text-[11px] font-medium capitalize text-[var(--color-text-muted)]">{key}</span>
                        <input
                          value={typeof selected.props?.[key] === 'string' ? selected.props[key] as string : ''}
                          onChange={(event) => patchSelected({ props: { [key]: event.target.value } })}
                          className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] outline-none"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {inspectorTab === 'data' && (
                  <div className="space-y-3">
                    <BindingControls
                      node={selected}
                      statePathSuggestions={statePathSuggestions}
                      onChange={replaceSelectedBindings}
                    />
                    <JsonObjectEditor
                      label="Props JSON"
                      value={selected.props}
                      minHeight="h-36"
                      onValidChange={replaceSelectedProps}
                      onError={setError}
                    />
                    <JsonObjectEditor
                      label="Bindings JSON"
                      value={selected.bindings}
                      minHeight="h-28"
                      onValidChange={replaceSelectedBindings}
                      onError={setError}
                    />
                  </div>
                )}

                {inspectorTab === 'actions' && (
                  <div className="space-y-3">
                    <QuickActionControls
                      componentId={selected.componentId}
                      action={selected.actions?.click}
                      toolNames={localToolNames}
                      onChange={replaceSelectedClickAction}
                      onError={setError}
                    />
                    <JsonObjectEditor
                      label="Actions JSON"
                      value={selected.actions}
                      minHeight="h-32"
                      onValidChange={replaceSelectedActions}
                      onError={setError}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => moveSelected(-1)} disabled={!canMoveUp} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                        <MoveUp className="h-3.5 w-3.5" />
                        Move up
                      </button>
                      <button onClick={() => moveSelected(1)} disabled={!canMoveDown} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                        <MoveDown className="h-3.5 w-3.5" />
                        Move down
                      </button>
                      <button onClick={duplicateSelected} disabled={selected.type === 'AppShell'} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                        <CopyPlus className="h-3.5 w-3.5" />
                        Duplicate
                      </button>
                      <button onClick={() => void saveCurrentSpec()} disabled={!dirty || saving} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 text-[12px] text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45">
                        <Save className="h-3.5 w-3.5" />
                        Save all
                      </button>
                      <button onClick={removeSelected} disabled={selected.type === 'AppShell'} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-400/20 bg-red-400/10 px-2 text-[12px] text-red-100 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {inspectorTab === 'agent' && (
                  <div className="space-y-3">
                    <button onClick={mentionSelected} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] hover:bg-white/[0.08]">
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Mention in Spotlight
                    </button>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">Ask agent</span>
                      <textarea
                        value={agentPrompt}
                        onChange={(event) => setAgentPrompt(event.target.value)}
                        placeholder="Add behavior, wire this to a tool, change the data binding..."
                        className="h-24 w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] p-2 text-[12px] leading-relaxed outline-none placeholder:text-[var(--color-text-muted)]/45"
                      />
                    </label>
                    <button
                      onClick={() => void sendSelectedToAgent()}
                      disabled={saving}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2 text-[12px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {agentPrompt.trim() ? 'Send with component' : 'Attach to Spotlight'}
                    </button>
                  </div>
                )}
                <div className="border-t border-white/[0.08] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Component library</span>
                    <span className="rounded border border-white/[0.07] bg-black/15 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]/75">
                      {selectedCanContainChildren ? 'after / inside' : 'after only'}
                    </span>
                  </div>
                  <label className="relative mb-2 block">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]/65" />
                    <input
                      value={paletteQuery}
                      onChange={(event) => setPaletteQuery(event.target.value)}
                      placeholder="Search components"
                      className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] pl-7 pr-2 text-[12px] outline-none placeholder:text-[var(--color-text-muted)]/45"
                    />
                  </label>
                  <div className="mb-2 flex gap-1 overflow-x-auto">
                    {COMPONENT_GROUPS.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setPaletteGroup(group.id)}
                        className={[
                          'h-7 shrink-0 rounded-md px-2 text-[11px] font-medium',
                          paletteGroup === group.id
                            ? 'bg-white/[0.09] text-[var(--color-text)]'
                            : 'text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]',
                        ].join(' ')}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-2">
                    {filteredComponentTypes.map((type) => {
                      const meta = COMPONENT_META[type];
                      const Icon = meta.icon;
                      return (
                        <div key={type} className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2 transition-colors hover:bg-white/[0.04]">
                          <div className="flex items-start gap-2">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-black/15">
                              <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[12px] font-semibold">{meta.title}</span>
                                <span className="shrink-0 rounded border border-white/[0.06] bg-black/15 px-1 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]/65">
                                  {meta.group}
                                </span>
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[var(--color-text-muted)]/70">
                                {meta.description}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => addSibling(type)}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)]"
                              title={`Add ${type} after selected component`}
                            >
                              <Plus className="h-3 w-3" />
                              After
                            </button>
                            <button
                              type="button"
                              onClick={() => addChild(type)}
                              disabled={!selectedCanContainChildren}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35"
                              title={`Add ${type} inside selected component`}
                            >
                              <Plus className="h-3 w-3" />
                              Inside
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {filteredComponentTypes.length === 0 && (
                      <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">
                        No components match.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--color-text-muted)]">Select a component from the tree or preview.</div>
            )}
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}
