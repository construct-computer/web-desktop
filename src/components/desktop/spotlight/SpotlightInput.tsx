import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Blocks, Send, FileText, Folder, Loader2, Paperclip, Square, XCircle, AlertCircle, Clock } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { useComputerStore, type ComponentMention } from '@/stores/agentStore';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { useWindowStore } from '@/stores/windowStore';
import { useSound } from '@/hooks/useSound';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useVisualViewportBottomInset } from '@/hooks/useVisualViewportBottomInset';
import { hapticLight } from '@/lib/haptics';
import { uploadAttachment } from '@/lib/uploadAttachment';
import { listFiles, downloadContainerFile, getLocalAppSpec, type ConstructAppSpec, type ConstructComponentNode, type LocalApp } from '@/services/api';
import { VoiceButton } from '@/components/ui/VoiceButton';
import { useSlashCommands } from './hooks';
import { providerCopy, TONE_HEX } from '@/lib/providerCopy';
import { openSettingsToSection } from '@/lib/settingsNav';
import { EXTERNAL_PLATFORM_META, inferExternalPlatform, isExternalSessionKey } from '@/lib/externalPlatforms';
import { fileNameFromWorkspacePath, normalizeWorkspacePath, stripAttachedWorkspaceReferences, workspaceDisplayPath } from '@/lib/workspacePaths';
import { ComponentMentionToken } from './ComponentMentionToken';

const DRAFT_KEY_PREFIX = 'construct:spotlight-draft:';
const INPUT_HISTORY_PREFIX = 'construct:spotlight-input-history:';
const MAX_INPUT_HISTORY = 200;

function inputHistoryKey(sessionKey: string | undefined) {
  return `${INPUT_HISTORY_PREFIX}${sessionKey || 'default'}`;
}

function draftKey(sessionKey: string | undefined) {
  return `${DRAFT_KEY_PREFIX}${sessionKey || 'default'}`;
}

function loadInputHistory(sessionKey: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(inputHistoryKey(sessionKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function saveInputHistory(sessionKey: string | undefined, entries: string[]) {
  try {
    const trimmed = entries.slice(-MAX_INPUT_HISTORY);
    localStorage.setItem(inputHistoryKey(sessionKey), JSON.stringify(trimmed));
  } catch { /* */ }
}

function appendToInputHistory(sessionKey: string | undefined, line: string) {
  const t = line.trim();
  if (!t) return;
  const prev = loadInputHistory(sessionKey);
  if (prev[prev.length - 1] === t) return;
  saveInputHistory(sessionKey, [...prev, t]);
}

type FileSuggestion = { kind: 'file'; id: string; display: string; isDir: boolean };
type ComponentSuggestion = {
  kind: 'component';
  id: string;
  display: string;
  subtitle: string;
  mention: ComponentMention;
};
type MentionSuggestion = FileSuggestion | ComponentSuggestion;
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
type Attachment = { name: string; path: string };

function componentTitle(node: ConstructComponentNode): string {
  const props = node.props || {};
  return node.label
    || (typeof props.title === 'string' ? props.title : undefined)
    || (typeof props.label === 'string' ? props.label : undefined)
    || (typeof props.text === 'string' ? props.text : undefined)
    || node.componentId;
}

function collectComponentSuggestions(app: LocalApp, spec: ConstructAppSpec): ComponentSuggestion[] {
  const appName = app.manifest.name || spec.name || app.id;
  const walk = (nodes: ConstructComponentNode[], base = 'layout'): ComponentSuggestion[] => (
    nodes.flatMap((node, index) => {
      const path = `${base}.${index}`;
      const label = componentTitle(node);
      const item: ComponentSuggestion = {
        kind: 'component',
        id: `${app.id}:${node.componentId}`,
        display: label,
        subtitle: `${appName} / ${node.type}`,
        mention: {
          appId: app.id,
          componentId: node.componentId,
          componentType: node.type,
          label,
          path,
          props: node.props,
          bindings: node.bindings,
          actions: node.actions,
        },
      };
      return [item, ...walk(node.children || [], `${path}.children`)];
    })
  );
  return walk(spec.layout);
}

function componentSuggestionText(item: ComponentSuggestion): string {
  return [
    item.display,
    item.subtitle,
    item.mention.appId,
    item.mention.componentId,
    item.mention.componentType,
    item.mention.path,
  ].filter(Boolean).join(' ').toLowerCase();
}

/** Stable empty slice for Zustand selector — never use `|| []` in selectors (new ref each run → infinite re-renders). */
const EMPTY_PENDING_IMAGES: string[] = [];

export function SpotlightInput() {
  const sendChatMessage = useComputerStore(s => s.sendChatMessage);
  const stopChatSession = useComputerStore(s => s.stopChatSession);
  const addComponentMention = useComputerStore(s => s.addComponentMention);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const computer = useComputerStore(s => s.computer);
  const agentConnected = useComputerStore(s => s.agentConnected);
  const agentConnecting = useComputerStore(s => s.agentConnecting);
  const instanceId = useComputerStore(s => s.instanceId);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const pendingImages = useComputerStore(s => s.pendingImageDataBySession[s.activeSessionKey || 'default'] ?? EMPTY_PENDING_IMAGES);
  const pendingComponentMentions = useComputerStore(s => s.pendingComponentMentions);
  const removeComponentMention = useComputerStore(s => s.removeComponentMention);
  const localApps = useAppStore(s => s.localApps);
  const appsFetched = useAppStore(s => s.fetched);
  const fetchApps = useAppStore(s => s.fetchApps);
  const activeSessionStatus = useComputerStore(s => s.activeSessions[s.activeSessionKey]);
  const queuedCount = useComputerStore(s => {
    let n = 0;
    for (const m of s.chatMessages) if (m.role === 'user' && m.pendingInjection) n++;
    return n;
  });
  const externalPlatform = inferExternalPlatform(activeSessionKey);
  const isExternal = isExternalSessionKey(activeSessionKey);
  const externalLabel = externalPlatform ? EXTERNAL_PLATFORM_META[externalPlatform].label : 'external platform';
  const replyingTo = useComputerStore(s => s.replyingTo);
  const setReplyingTo = useComputerStore(s => s.setReplyingTo);
  /**
   * Running here means "there is a loop actively working this session". We
   * combine the legacy `agentRunning` flag (desktop-lane compat) with the
   * per-session `activeSessions` map so the Stop/Interrupt controls also show
   * up for non-desktop platform chats (Slack, Telegram, email, etc.).
   */
  const sessionRunning = agentRunning || Boolean(activeSessionStatus && activeSessionStatus.status !== 'idle');

  const voiceEnabled = useSettingsStore(s => s.voiceEnabled);
  const voiceAutoSend = useSettingsStore(s => s.voiceAutoSend);
  const sttState = useVoiceStore(s => s.sttState);
  const interimTranscript = useVoiceStore(s => s.interimTranscript);
  const finalTranscript = useVoiceStore(s => s.finalTranscript);
  const voiceReset = useVoiceStore(s => s.reset);
  const cancelRecording = useVoiceStore(s => s.cancelRecording);

  const { play } = useSound();
  const isMobile = useIsMobile();
  const visualViewportBottomInset = useVisualViewportBottomInset();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slashSelected, setSlashSelected] = useState(0);
  const sessionInputKey = activeSessionKey || 'default';
  const [attachmentsBySession, setAttachmentsBySession] = useState<Record<string, Attachment[]>>({});
  const attachments = useMemo(
    () => attachmentsBySession[sessionInputKey] || [],
    [attachmentsBySession, sessionInputKey],
  );
  const setAttachments = useCallback(
    (updater: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      setAttachmentsBySession(prev => {
        const current = prev[sessionInputKey] || [];
        const next = typeof updater === 'function'
          ? (updater as (value: Attachment[]) => Attachment[])(current)
          : updater;
        return { ...prev, [sessionInputKey]: next };
      });
    },
    [sessionInputKey],
  );
  const setSessionPendingImages = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      useComputerStore.setState(state => {
        const current = state.pendingImageDataBySession[sessionInputKey] || [];
        const next = typeof updater === 'function'
          ? (updater as (value: string[]) => string[])(current)
          : updater;
        return {
          pendingImageDataBySession: {
            ...state.pendingImageDataBySession,
            [sessionInputKey]: next,
          },
        };
      });
    },
    [sessionInputKey],
  );
  const atMentionedFilesRef = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const slashCommands = useSlashCommands();

  /** -1 = editing live draft; 0..n-1 = browsing stored history (0 = oldest, n-1 = newest) */
  const [historyNavIndex, setHistoryNavIndex] = useState(-1);
  const historyStashRef = useRef('');

  const [message, setMessageRaw] = useState(() => {
    try { return localStorage.getItem(draftKey(activeSessionKey)) || ''; } catch { return ''; }
  });
  const setMessage = useCallback((val: string) => {
    setMessageRaw(val);
    try { localStorage.setItem(draftKey(activeSessionKey), val); } catch { /* */ }
  }, [activeSessionKey]);

  const isConnected = computer?.status === 'running' && (agentConnected || agentConnecting);
  const showSlash = message.startsWith('/') && !message.includes(' ');
  const filteredCommands = useMemo(
    () => showSlash ? slashCommands.filter(c => c.name.startsWith(message.toLowerCase())) : [],
    [showSlash, slashCommands, message],
  );
  useEffect(() => { setSlashSelected(0); }, [message]);
  useEffect(() => {
    if (!appsFetched) void fetchApps();
  }, [appsFetched, fetchApps]);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    setHistoryNavIndex(-1);
    historyStashRef.current = '';
    atMentionedFilesRef.current.clear();
    try { setMessageRaw(localStorage.getItem(draftKey(activeSessionKey)) || ''); } catch { setMessageRaw(''); }
    requestAnimationFrame(autoResize);
  }, [activeSessionKey, autoResize]);

  // Focus input on mount and when typing — but never on mobile, where
  // auto-focus pops the keyboard immediately and obscures the rest of the UI.
  useEffect(() => {
    if (isMobile) { autoResize(); return; }
    const t = setTimeout(() => { inputRef.current?.focus(); autoResize(); }, 120);
    return () => clearTimeout(t);
  }, [autoResize, isMobile]);

  useEffect(() => {
    const focusInput = () => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        autoResize();
      });
    };
    window.addEventListener('spotlight-focus-input', focusInput);
    return () => window.removeEventListener('spotlight-focus-input', focusInput);
  }, [autoResize]);

  useEffect(() => {
    if (isMobile) return;
    const h = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active === inputRef.current) return;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active as HTMLElement)?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== 'Delete') return;
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isMobile]);

  // ── @ resource selector ───────────────────────────────────────────────
  const [fsOpen, setFsOpen] = useState(false);
  const [fsItems, setFsItems] = useState<FileSuggestion[]>([]);
  const [componentItems, setComponentItems] = useState<ComponentSuggestion[]>([]);
  const [fsIndex, setFsIndex] = useState(0);
  const fsAtPosRef = useRef(-1);
  const fsCacheRef = useRef<Map<string, { entries: FileSuggestion[]; ts: number }>>(new Map());
  const componentCacheRef = useRef<Map<string, { entries: ComponentSuggestion[]; ts: number }>>(new Map());
  const fsGenRef = useRef(0);
  const componentGenRef = useRef(0);
  const mentionItems = useMemo<MentionSuggestion[]>(
    () => [...componentItems, ...fsItems],
    [componentItems, fsItems],
  );

  const fetchFsSuggestions = useCallback(async (query: string) => {
    if (!instanceId) { setFsItems([]); return; }
    const gen = ++fsGenRef.current;
    const lastSlash = query.lastIndexOf('/');
    const dirSuffix = lastSlash >= 0 ? '/' + query.slice(0, lastSlash) : '';
    const searchName = lastSlash >= 0 ? query.slice(lastSlash + 1) : query;
    const dirPath = normalizeWorkspacePath(dirSuffix) || '/';

    const cached = fsCacheRef.current.get(dirPath);
    if (cached && Date.now() - cached.ts < 5000) {
      if (gen !== fsGenRef.current) return;
      const filtered = cached.entries.filter(e => !searchName || e.display.toLowerCase().includes(searchName.toLowerCase()));
      setFsItems(filtered.slice(0, 20));
      return;
    }

    try {
      const result = await listFiles(instanceId, dirPath);
      if (gen !== fsGenRef.current) return;
      if (!result.success || !result.data?.entries) { setFsItems([]); return; }

      const entries: FileSuggestion[] = result.data.entries
        .filter(e => e.name !== '.' && e.name !== '..' && !e.name.startsWith('.'))
        .map(e => {
          const isDir = e.type === 'directory';
          const baseName = dirSuffix ? `${dirSuffix.slice(1)}/${e.name}` : e.name;
          return { kind: 'file' as const, id: normalizeWorkspacePath(baseName), display: isDir ? `${baseName}/` : baseName, isDir };
        })
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.display.localeCompare(b.display);
        });

      fsCacheRef.current.set(dirPath, { entries, ts: Date.now() });
      const filtered = entries.filter(e => !searchName || e.display.toLowerCase().includes(searchName.toLowerCase()));
      setFsItems(filtered.slice(0, 20));
    } catch {
      if (gen !== fsGenRef.current) return;
      setFsItems([]);
    }
  }, [instanceId]);

  const fetchComponentSuggestions = useCallback(async (query: string) => {
    const gen = ++componentGenRef.current;
    if (localApps.length === 0) {
      setComponentItems([]);
      return;
    }

    const cacheKey = localApps.map((app) => app.id).sort().join('|');
    const cached = componentCacheRef.current.get(cacheKey);
    let entries = cached && Date.now() - cached.ts < 30_000 ? cached.entries : null;

    if (!entries) {
      const grouped = await Promise.all(localApps.map(async (app) => {
        const res = await getLocalAppSpec(app.id);
        if (!res.success || !res.data?.spec) return [];
        return collectComponentSuggestions(app, res.data.spec);
      }));
      if (gen !== componentGenRef.current) return;
      entries = grouped.flat();
      componentCacheRef.current.set(cacheKey, { entries, ts: Date.now() });
    }

    if (gen !== componentGenRef.current) return;
    const q = query.trim().toLowerCase();
    const filtered = entries
      .filter((item) => !q || componentSuggestionText(item).includes(q))
      .slice(0, 10);
    setComponentItems(filtered);
  }, [localApps]);

  const detectFileTrigger = useCallback((text: string, cursor: number) => {
    let atPos = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (text[i] === '@') { atPos = i; break; }
      if (text[i] === ' ' || text[i] === '\n') break;
    }
    if (atPos >= 0 && (atPos === 0 || /\s/.test(text[atPos - 1]))) {
      const query = text.slice(atPos + 1, cursor);
      fsAtPosRef.current = atPos;
      setFsOpen(true);
      setFsIndex(0);
      fetchFsSuggestions(query);
      void fetchComponentSuggestions(query);
    } else {
      setFsOpen(false);
      setComponentItems([]);
    }
  }, [fetchComponentSuggestions, fetchFsSuggestions]);

  const selectMentionItem = useCallback((item: MentionSuggestion | undefined) => {
    if (!item) return;
    const el = inputRef.current;
    if (!el || fsAtPosRef.current < 0) return;
    el.focus();
    const start = fsAtPosRef.current;
    const end = el.selectionStart ?? el.value.length;

    if (item.kind === 'component') {
      const before = message.slice(0, start);
      const after = message.slice(end);
      const separator = before && after && !/\s$/.test(before) && !/^\s/.test(after) ? ' ' : '';
      const nextValue = `${before}${separator}${after}`.replace(/[ \t]{2,}/g, ' ');
      const nextCursor = before.length + separator.length;
      setMessage(nextValue);
      addComponentMention(item.mention);
      setFsOpen(false);
      setComponentItems([]);
      requestAnimationFrame(() => {
        el.setSelectionRange(nextCursor, nextCursor);
        autoResize();
      });
      return;
    }

    if (item.isDir) {
      const insert = `@${item.display}`;
      const nextValue = `${message.slice(0, start)}${insert}${message.slice(end)}`;
      const nextCursor = start + insert.length;
      setMessage(nextValue);
      requestAnimationFrame(() => {
        el.setSelectionRange(nextCursor, nextCursor);
        autoResize();
        detectFileTrigger(nextValue, nextCursor);
      });
      return;
    }

    const before = message.slice(0, start);
    const after = message.slice(end);
    const separator = before && after && !/\s$/.test(before) && !/^\s/.test(after) ? ' ' : '';
    const nextValue = `${before}${separator}${after}`.replace(/[ \t]{2,}/g, ' ');
    const nextCursor = before.length + separator.length;
    setMessage(nextValue);
    requestAnimationFrame(() => {
      el.setSelectionRange(nextCursor, nextCursor);
      autoResize();
    });

    const normalizedPath = normalizeWorkspacePath(item.id);
    setAttachments(prev => {
      if (prev.some(a => normalizeWorkspacePath(a.path) === normalizedPath)) return prev;
      return [...prev, { name: fileNameFromWorkspacePath(normalizedPath), path: normalizedPath }];
    });
    setFsOpen(false);
    setComponentItems([]);

    if (IMAGE_EXTS.test(item.display) && instanceId) {
      downloadContainerFile(instanceId, item.id).then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setSessionPendingImages(prev => [...prev, dataUrl]);
        };
        reader.readAsDataURL(blob);
      }).catch(() => {});
    }
  }, [addComponentMention, instanceId, message, setMessage, autoResize, detectFileTrigger, setAttachments, setSessionPendingImages]);

  useEffect(() => {
    if (!fsOpen) return;
    if (mentionItems.length > 0 && fsIndex >= mentionItems.length) setFsIndex(mentionItems.length - 1);
    const el = document.querySelector('[data-mention-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [fsIndex, fsOpen, mentionItems.length]);

  // ── File upload ──────────────────────────────────────────────────────
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || !instanceId) return;
    setUploadError(null);
    setUploading(true);
    const skipped: string[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          skipped.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
          continue;
        }
        const result = await uploadAttachment(instanceId, file);
        const normalizedPath = normalizeWorkspacePath(result.path);
        setAttachments(prev => (
          prev.some(att => normalizeWorkspacePath(att.path) === normalizedPath)
            ? prev
            : [...prev, { name: result.name, path: normalizedPath }]
        ));
        const isImage = IMAGE_EXTS.test(file.name) || IMAGE_MIME.test(file.type);
        if (isImage) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          setSessionPendingImages(prev => [...prev, dataUrl]);
        }
      }
      if (skipped.length > 0) {
        setUploadError(`Too large (15 MB max): ${skipped.join(', ')}`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [instanceId, setAttachments, setSessionPendingImages]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFiles]);

  // Paste handler
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (!items || items.length === 0) return;
      e.preventDefault();
      processFiles(Array.from(items));
    };
    el.addEventListener('paste', onPaste);
    return () => el.removeEventListener('paste', onPaste);
  }, [processFiles]);

  // Listen for files dropped on the Spotlight shell panel
  useEffect(() => {
    const handler = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail;
      if (files?.length) processFiles(files);
    };
    window.addEventListener('spotlight-drop-files', handler);
    return () => window.removeEventListener('spotlight-drop-files', handler);
  }, [processFiles]);

  // ── Send / Commands ──────────────────────────────────────────────────
  const clearDraft = useCallback(() => {
    setMessageRaw('');
    setHistoryNavIndex(-1);
    historyStashRef.current = '';
    try { localStorage.removeItem(draftKey(activeSessionKey)); } catch { /* */ }
    requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; });
  }, [activeSessionKey]);

  const executeSlashCommand = useCallback(async (cmd: { action: () => void | Promise<void> }) => {
    play('click');
    if (isMobile) hapticLight();
    await cmd.action();
    clearDraft();
  }, [play, clearDraft, isMobile]);

  const handleSend = useCallback(() => {
    if (isExternal) return;
    const allPaths = [...new Set(attachments.map(a => normalizeWorkspacePath(a.path)).filter(Boolean))];
    const text = stripAttachedWorkspaceReferences(message, allPaths).trim();
    if (!text && allPaths.length === 0 && pendingComponentMentions.length === 0) return;
    if (filteredCommands.length > 0 && showSlash) {
      void executeSlashCommand(filteredCommands[slashSelected] || filteredCommands[0]);
      return;
    }
    if (!isConnected) return;

    // Prepend reply context if replying to a message
    let fullText = text || (pendingComponentMentions.length > 0 ? 'Update the selected app components.' : 'See attached files');
    if (replyingTo) {
      const quote = replyingTo.content.split('\n').slice(0, 3).join('\n');
      const truncated = quote.length > 200 ? quote.slice(0, 200) + '...' : quote;
      const who = replyingTo.role === 'user' ? 'my earlier message' : 'your earlier response';
      fullText = `(Replying to ${who}: "${truncated}")\n\n${fullText}`;
      setReplyingTo(null);
    }

    play('click');
    if (isMobile) hapticLight();
    if (text) appendToInputHistory(activeSessionKey, text);
    else if (allPaths.length > 0) appendToInputHistory(activeSessionKey, `📎 ${allPaths.length} attachment(s)`);
    else if (pendingComponentMentions.length > 0) appendToInputHistory(activeSessionKey, `${pendingComponentMentions.length} component mention(s)`);
    sendChatMessage(
      fullText,
      allPaths.length > 0 ? allPaths : undefined,
      { componentMentions: pendingComponentMentions },
    );
    clearDraft();
    setAttachments([]);
    atMentionedFilesRef.current.clear();
    setUploadError(null);
    setFsOpen(false);
  }, [message, isConnected, isExternal, sendChatMessage, play, isMobile, filteredCommands, showSlash, slashSelected, executeSlashCommand, clearDraft, attachments, setAttachments, replyingTo, setReplyingTo, activeSessionKey, pendingComponentMentions]);

  const removeMentionAndFocus = useCallback((appId: string, componentId: string) => {
    removeComponentMention(appId, componentId);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [removeComponentMention]);

  const openComponentMention = useCallback((mention: ComponentMention) => {
    const title = mention.label ? `Builder - ${mention.label}` : `Builder - ${mention.appId}`;
    const metadata = { appId: mention.appId, componentId: mention.componentId };
    const windowId = useWindowStore.getState().openWindow('app-builder', { title, metadata });
    useWindowStore.getState().updateWindow(windowId, { title, metadata });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const fetchUsage = useBillingStore(s => s.fetchUsage);
  const fetchByok = useBillingStore(s => s.fetchByok);
  const providerState = useBillingStore(useShallow((s) => s.getEffectiveProvider()));
  const providerCopyData = providerCopy(providerState);

  // Fetch usage + byok on mount so the provider-state strip is accurate
  useEffect(() => {
    fetchUsage();
    fetchByok();
  }, [fetchUsage, fetchByok]);

  const isVoiceActive = sttState === 'recording' || sttState === 'processing';

  // Keep textarea updated with accumulated + interim transcript during recording
  useEffect(() => {
    if (!isVoiceActive) return;
    const display = [finalTranscript, interimTranscript].filter(Boolean).join(' ');
    if (display) {
      setMessage(display);
      requestAnimationFrame(autoResize);
    }
  }, [finalTranscript, interimTranscript, isVoiceActive, setMessage, autoResize]);

  // When recording stops (idle), either auto-send or leave text in textarea
  const prevSttState = useRef(sttState);
  useEffect(() => {
    const wasActive = prevSttState.current === 'recording' || prevSttState.current === 'processing';
    prevSttState.current = sttState;

    if (!wasActive || sttState !== 'idle') return;

    const text = (finalTranscript || message).trim();
    voiceReset();

    if (voiceAutoSend && text && isConnected) {
      play('click');
      if (isMobile) hapticLight();
      appendToInputHistory(activeSessionKey, text);
      sendChatMessage(text);
      clearDraft();
    } else if (text) {
      setMessage(text);
      requestAnimationFrame(autoResize);
      inputRef.current?.focus();
    }
  }, [sttState, finalTranscript, message, voiceAutoSend, sendChatMessage, play, isMobile, setMessage, autoResize, voiceReset, clearDraft, activeSessionKey, isConnected]);

  // Cancel voice recording on Escape
  useEffect(() => {
    if (!isVoiceActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRecording();
        clearDraft();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isVoiceActive, cancelRecording, clearDraft]);

  return (
    <div
      className="shrink-0 border-t border-white/[0.08]"
      style={
        isMobile
          ? {
              paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${visualViewportBottomInset}px)`,
            }
          : undefined
      }
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
          <div className="w-0.5 h-6 rounded-full bg-[var(--color-accent)] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-[var(--color-accent)]">
              Replying to {replyingTo.role === 'user' ? 'yourself' : 'Construct'}
            </span>
            <p className="text-[12px] text-[var(--color-text-muted)]/60 truncate">
              {replyingTo.content.slice(0, 100)}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="shrink-0 p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]/40 hover:text-[var(--color-text)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {/* Slash command dropdown (above input) */}
      {showSlash && filteredCommands.length > 0 && (
        <div className="border-b border-white/[0.08]">
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                i === slashSelected ? 'bg-[var(--color-accent)]/10' : 'hover:bg-white/5'
              }`}
              onMouseEnter={() => setSlashSelected(i)}
              onClick={() => { void executeSlashCommand(cmd); }}
            >
              <span className="text-[13px] font-mono font-medium text-[var(--color-accent)]">{cmd.name}</span>
              <span className="text-[12px] text-[var(--color-text-muted)]/40">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative px-5 py-3">
        {/* @ resource dropdown — opens upward */}
        {fsOpen && mentionItems.length > 0 && (
          <div
            className="absolute left-4 right-4 z-[9999]"
            style={{
              bottom: '100%', marginBottom: 4, minWidth: 280,
              backgroundColor: 'rgba(16, 16, 20, 0.97)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
              maxHeight: 220, overflowY: 'auto',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
              padding: 4,
            }}
          >
            {mentionItems.map((item, i) => {
              const showHeader = i === 0 || mentionItems[i - 1]?.kind !== item.kind;
              return (
                <div key={item.id}>
                  {showHeader && (
                    <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                      {item.kind === 'component' ? 'Components' : 'Workspace'}
                    </div>
                  )}
                  <div
                    data-mention-focused={i === fsIndex ? 'true' : undefined}
                    onMouseDown={(e) => { e.preventDefault(); selectMentionItem(item); }}
                    onMouseEnter={() => setFsIndex(i)}
                    className={`flex items-center gap-2 px-3 py-[7px] rounded-md cursor-pointer text-[13px] whitespace-nowrap ${
                      i === fsIndex ? 'text-white/95' : 'text-white/75 hover:bg-white/5'
                    }`}
                    style={{
                      fontFamily: item.kind === 'file' ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
                      ...(i === fsIndex ? { backgroundColor: 'rgba(255,255,255,0.08)' } : {}),
                    }}
                  >
                    {item.kind === 'component' ? (
                      <>
                        <Blocks className="w-3.5 h-3.5 shrink-0 text-sky-200/70" />
                        <span className="min-w-0 flex-1 truncate">{item.display}</span>
                        <span className="shrink-0 truncate text-[11px] text-white/35">{item.subtitle}</span>
                      </>
                    ) : (
                      <>
                        {item.isDir
                          ? <Folder className="w-3.5 h-3.5 shrink-0 text-white/40" />
                          : <FileText className="w-3.5 h-3.5 shrink-0 opacity-40" />}
                        <span className="truncate">{item.display}</span>
                        {item.isDir && <span className="ml-auto text-[10px] opacity-30 shrink-0">Tab &#8614;</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Attachment pills + thumbnails */}
        {(attachments.length > 0 || pendingImages.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {pendingImages.map((dataUrl, i) => (
              <span key={`img-${i}`} className="relative group inline-flex rounded-lg overflow-hidden border border-[var(--color-accent)]/20 bg-black/10" style={{ height: 40 }}>
                <img src={dataUrl} alt={`Attachment ${i + 1}`} className="h-full w-auto object-cover" style={{ maxWidth: 80 }} />
                <button
                  onClick={() => {
                    setSessionPendingImages(prev => prev.filter((_, j) => j !== i));
                    setAttachments(prev => {
                      let imageIndex = -1;
                      return prev.filter((att) => {
                        const ext = att.name.split('.').pop()?.toLowerCase();
                        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
                        if (!isImage) return true;
                        imageIndex += 1;
                        return imageIndex !== i;
                      });
                    });
                  }}
                  className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5"
                >
                  <XCircle className="w-3 h-3 text-white" />
                </button>
              </span>
            ))}
            {attachments.filter(att => !IMAGE_EXTS.test(att.name)).map((att, i) => (
              <span
                key={`file-${i}`}
                title={workspaceDisplayPath(att.path)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[11px]"
              >
                <FileText className="w-3 h-3" />
                {fileNameFromWorkspacePath(att.path || att.name)}
                <button onClick={() => setAttachments(prev => prev.filter(a => a.path !== att.path))} className="ml-0.5 hover:text-red-400 transition-colors">
                  <XCircle className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] text-red-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="shrink-0 hover:text-red-300 transition-colors">
              <XCircle className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0 relative">
            <div className="flex min-h-9 flex-wrap items-center gap-1.5">
              {pendingComponentMentions.map((mention) => (
                <ComponentMentionToken
                  key={`${mention.appId}:${mention.componentId}`}
                  mention={mention}
                  onOpen={() => openComponentMention(mention)}
                  onRemove={() => removeMentionAndFocus(mention.appId, mention.componentId)}
                />
              ))}
            <textarea
              ref={inputRef}
              value={message}
              enterKeyHint={isMobile ? 'send' : undefined}
              onFocus={() => {
                if (!isMobile) return;
                requestAnimationFrame(() => {
                  inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                });
              }}
              onChange={(e) => {
                setHistoryNavIndex(-1);
                const val = e.target.value;
                setMessage(val);
                requestAnimationFrame(autoResize);
                detectFileTrigger(val, e.target.selectionStart ?? 0);
                if (atMentionedFilesRef.current.size > 0) {
                  const gone = [...atMentionedFilesRef.current].filter(name => !val.includes(`@${name}`));
                  if (gone.length > 0) {
                    gone.forEach(name => atMentionedFilesRef.current.delete(name));
                    const removedImageIndexes: number[] = [];
                    let imageIndex = -1;
                    for (const att of attachments) {
                      if (IMAGE_EXTS.test(att.name)) imageIndex += 1;
                      if (gone.includes(att.name) && IMAGE_EXTS.test(att.name)) {
                        removedImageIndexes.push(imageIndex);
                      }
                    }
                    if (removedImageIndexes.length > 0) {
                      setSessionPendingImages(prev => prev.filter((_, i) => !removedImageIndexes.includes(i)));
                    }
                    setAttachments(prev => prev.filter(a => !gone.includes(a.name)));
                  }
                }
              }}
              onKeyDown={(e) => {
                const caretAtStart = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;
                if (
                  e.key === 'Backspace'
                  && caretAtStart
                  && pendingComponentMentions.length > 0
                  && message.length === 0
                ) {
                  e.preventDefault();
                  const lastMention = pendingComponentMentions[pendingComponentMentions.length - 1];
                  if (lastMention) removeMentionAndFocus(lastMention.appId, lastMention.componentId);
                  return;
                }
                if (fsOpen && mentionItems.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFsIndex(i => Math.min(i + 1, mentionItems.length - 1)); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setFsIndex(i => Math.max(i - 1, 0)); return; }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    selectMentionItem(mentionItems[fsIndex]);
                    return;
                  }
                  if (e.key === 'Escape') { e.preventDefault(); setFsOpen(false); return; }
                }
                if (
                  !message.includes('\n') &&
                  (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
                  !e.metaKey &&
                  !e.ctrlKey &&
                  !e.altKey &&
                  !(showSlash && filteredCommands.length > 0)
                ) {
                  const h = loadInputHistory(activeSessionKey);
                  if (e.key === 'ArrowUp' && h.length > 0) {
                    e.preventDefault();
                    if (historyNavIndex < 0) {
                      historyStashRef.current = message;
                      setMessage(h[h.length - 1]!);
                      setHistoryNavIndex(h.length - 1);
                    } else if (historyNavIndex > 0) {
                      const nextI = historyNavIndex - 1;
                      setMessage(h[nextI]!);
                      setHistoryNavIndex(nextI);
                    }
                    requestAnimationFrame(() => {
                      const el = inputRef.current;
                      if (el) {
                        const end = el.value.length;
                        el.setSelectionRange(end, end);
                        autoResize();
                      }
                    });
                  } else if (e.key === 'ArrowDown' && historyNavIndex >= 0) {
                    e.preventDefault();
                    if (historyNavIndex < h.length - 1) {
                      const nextI = historyNavIndex + 1;
                      setMessage(h[nextI]!);
                      setHistoryNavIndex(nextI);
                    } else {
                      setMessage(historyStashRef.current);
                      setHistoryNavIndex(-1);
                    }
                    requestAnimationFrame(() => {
                      const el = inputRef.current;
                      if (el) {
                        const end = el.value.length;
                        el.setSelectionRange(end, end);
                        autoResize();
                      }
                    });
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && !isExternal) { e.preventDefault(); handleSend(); }
                if (showSlash && filteredCommands.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSelected(i => Math.min(i + 1, filteredCommands.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSelected(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Tab') { e.preventDefault(); setMessage(filteredCommands[slashSelected].name); }
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement !== inputRef.current) setFsOpen(false);
                }, 150);
              }}
              placeholder={
                isVoiceActive
                  ? 'Listening...'
                  : isExternal
                    ? `Reply from ${externalLabel}. This Spotlight view is read-only.`
                    : isConnected
                      ? agentConnecting && !agentConnected
                        ? 'Queue a message while Construct reconnects...'
                        : 'Ask anything... (@ for files or components)'
                      : agentConnected
                        ? 'Starting Construct...'
                        : 'Reconnecting to Construct...'
              }
              disabled={!isConnected || isExternal}
              rows={1}
              className="min-w-[180px] flex-1 bg-transparent outline-none border-none resize-none focus:outline-none focus:ring-0 focus:border-none text-[15px]"
              style={{
                fontWeight: 400, lineHeight: '1.5', color: 'var(--color-text)',
                overflow: 'auto', maxHeight: 120, padding: '8px 0', minHeight: 36, outline: 'none',
              }}
            />
            </div>
          </div>
          {isExternal && (
            <button
              type="button"
              onClick={() => useWindowStore.getState().ensureWindowOpen('access-control')}
              className="mb-1 shrink-0 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)]/70 hover:bg-white/[0.06] hover:text-[var(--color-text)] transition-colors"
            >
              Manage access
            </button>
          )}
          <div className="flex items-center gap-0.5 shrink-0 pb-1">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            {voiceEnabled && !isExternal && (
              <VoiceButton disabled={!isConnected} />
            )}
            <Tooltip content="Attach file" side="top">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || uploading || isExternal}
                className="touch-target p-1.5 rounded-md hover:bg-white/10 text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)] disabled:opacity-20 transition-colors"
                aria-label={uploading ? 'Uploading attachment' : 'Attach file'}
                title="Attach file"
              >
                {uploading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Paperclip className="w-4.5 h-4.5" />}
              </button>
            </Tooltip>
            {sessionRunning ? (
              <>
                {queuedCount > 0 && !isExternal && (
                  <Tooltip
                    content={`${queuedCount} message${queuedCount === 1 ? '' : 's'} queued - will send next`}
                    side="top"
                  >
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]/80 text-[10px] font-medium tabular-nums"
                      aria-label={`${queuedCount} queued`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {queuedCount}
                    </span>
                  </Tooltip>
                )}
                <Tooltip content="Stop this session" side="top">
                  <button
                    type="button"
                    onClick={stopChatSession}
                    className="touch-target p-1.5 rounded-md hover:bg-red-500/15 text-red-500/70 hover:text-red-500 transition-colors"
                    aria-label="Stop this session"
                    title="Stop this session"
                  >
                    <Square className="w-4.5 h-4.5" />
                  </button>
                </Tooltip>
                {(message.trim() || attachments.length > 0 || pendingComponentMentions.length > 0) && !isExternal && (
                  <Tooltip content="Queue this message. Construct will read it next. Use Send now on a queued message to interrupt." side="top">
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!isConnected || isExternal}
                      className="touch-target p-1.5 rounded-md hover:bg-[var(--color-accent)]/10 text-[var(--color-accent)]/80 hover:text-[var(--color-accent)] disabled:opacity-20 transition-colors"
                      aria-label="Send next"
                      title="Send next"
                    >
                      <Send className="w-4.5 h-4.5" />
                    </button>
                  </Tooltip>
                )}
              </>
            ) : (message.trim() || attachments.length > 0 || pendingComponentMentions.length > 0) && !isExternal ? (
              <Tooltip content={providerCopyData.inputDisabled ? (providerCopyData.badge ?? 'Limit reached') : 'Send'} side="top">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!isConnected || isExternal || providerCopyData.inputDisabled}
                  className="touch-target p-1.5 rounded-md hover:bg-[var(--color-accent)]/10 text-[var(--color-accent)]/80 hover:text-[var(--color-accent)] disabled:opacity-20 transition-colors"
                  aria-label={providerCopyData.inputDisabled ? (providerCopyData.badge ?? 'Limit reached') : 'Send message'}
                  title="Send"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>
      {/* Provider-state indicator — below input, like a disclaimer.
          Shows BYOK-in-use, lite-model, or blocked-state CTA as one strip. */}
      {providerCopyData.badge && (
        <div className="flex items-center justify-center gap-1.5 py-1.5">
          <div
            className="w-1 h-1 rounded-full"
            style={{ background: `${TONE_HEX[providerCopyData.tone]}66` }}
          />
          {providerCopyData.cta ? (
            <button
              type="button"
              onClick={() => openSettingsToSection('subscription')}
              className="text-[10px] underline-offset-2 hover:underline"
              style={{ color: `${TONE_HEX[providerCopyData.tone]}cc` }}
            >
              {providerCopyData.badge}
            </button>
          ) : (
            <span
              className="text-[10px]"
              style={{
                color:
                  providerCopyData.tone === 'cyan-subtle'
                    ? `${TONE_HEX[providerCopyData.tone]}66`
                    : `${TONE_HEX[providerCopyData.tone]}99`,
              }}
            >
              {providerCopyData.badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
