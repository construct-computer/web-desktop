import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, FileText, Folder, Loader2, Paperclip, Square, XCircle, AlertCircle, Zap } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { useComputerStore } from '@/stores/agentStore';
import { useBillingStore } from '@/stores/billingStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { useSound } from '@/hooks/useSound';
import { uploadAttachment } from '@/lib/uploadAttachment';
import { listFiles, downloadContainerFile } from '@/services/api';
import { VoiceButton } from '@/components/ui/VoiceButton';
import { useSlashCommands } from './hooks';
import { providerCopy, TONE_HEX } from '@/lib/providerCopy';
import { openSettingsToSection } from '@/lib/settingsNav';

const DRAFT_KEY = 'construct:spotlight-draft';
const INPUT_HISTORY_PREFIX = 'construct:spotlight-input-history:';
const MAX_INPUT_HISTORY = 200;

function inputHistoryKey(sessionKey: string | undefined) {
  return `${INPUT_HISTORY_PREFIX}${sessionKey || 'default'}`;
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

type FileSuggestion = { id: string; display: string; isDir: boolean };
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function isExternalSession(key: string): boolean {
  return key.startsWith('telegram_') || key.startsWith('slack_') || key.startsWith('email_');
}

export function SpotlightInput() {
  const sendChatMessage = useComputerStore(s => s.sendChatMessage);
  const stopChatSession = useComputerStore(s => s.stopChatSession);
  const interruptSession = useComputerStore(s => s.interruptSession);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const computer = useComputerStore(s => s.computer);
  const instanceId = useComputerStore(s => s.instanceId);
  const pendingImages = useComputerStore(s => s.pendingImageData);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const activeSessionStatus = useComputerStore(s => s.activeSessions[s.activeSessionKey]);
  const isExternal = isExternalSession(activeSessionKey || '');
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slashSelected, setSlashSelected] = useState(0);
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string }>>([]);
  const atMentionedFilesRef = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const slashCommands = useSlashCommands();

  /** -1 = editing live draft; 0..n-1 = browsing stored history (0 = oldest, n-1 = newest) */
  const [historyNavIndex, setHistoryNavIndex] = useState(-1);
  const historyStashRef = useRef('');

  const [message, setMessageRaw] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; }
  });
  const setMessage = useCallback((val: string) => {
    setMessageRaw(val);
    try { localStorage.setItem(DRAFT_KEY, val); } catch { /* */ }
  }, []);

  const isConnected = computer?.status === 'running';
  const showSlash = message.startsWith('/') && !message.includes(' ');
  const filteredCommands = showSlash ? slashCommands.filter(c => c.name.startsWith(message.toLowerCase())) : [];
  useEffect(() => { setSlashSelected(0); }, [message]);

  useEffect(() => {
    setHistoryNavIndex(-1);
    historyStashRef.current = '';
  }, [activeSessionKey]);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  // Focus input on mount and when typing
  useEffect(() => {
    const t = setTimeout(() => { inputRef.current?.focus(); autoResize(); }, 120);
    return () => clearTimeout(t);
  }, [autoResize]);

  useEffect(() => {
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
  }, []);

  // ── @ file/folder selector ────────────────────────────────────────────
  const [fsOpen, setFsOpen] = useState(false);
  const [fsItems, setFsItems] = useState<FileSuggestion[]>([]);
  const [fsIndex, setFsIndex] = useState(0);
  const fsAtPosRef = useRef(-1);
  const fsCacheRef = useRef<Map<string, { entries: FileSuggestion[]; ts: number }>>(new Map());
  const fsGenRef = useRef(0);

  const fetchFsSuggestions = useCallback(async (query: string) => {
    if (!instanceId) { setFsItems([]); return; }
    const gen = ++fsGenRef.current;
    const lastSlash = query.lastIndexOf('/');
    const dirSuffix = lastSlash >= 0 ? '/' + query.slice(0, lastSlash) : '';
    const searchName = lastSlash >= 0 ? query.slice(lastSlash + 1) : query;
    const dirPath = `/home/sandbox/workspace${dirSuffix}`;

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
          return { id: `${dirPath}/${e.name}`, display: isDir ? `${baseName}/` : baseName, isDir };
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
    } else {
      setFsOpen(false);
    }
  }, [fetchFsSuggestions]);

  const selectFsItem = useCallback((item: FileSuggestion) => {
    const el = inputRef.current;
    if (!el || fsAtPosRef.current < 0) return;
    el.focus();
    el.setSelectionRange(fsAtPosRef.current, el.selectionStart ?? el.value.length);

    if (item.isDir) {
      document.execCommand('insertText', false, `@${item.display}`);
    } else {
      document.execCommand('insertText', false, `@${item.display} `);
      atMentionedFilesRef.current.add(item.display);
      setAttachments(prev => {
        if (prev.some(a => a.path === item.id)) return prev;
        return [...prev, { name: item.display, path: item.id }];
      });
      setFsOpen(false);

      if (IMAGE_EXTS.test(item.display) && instanceId) {
        downloadContainerFile(instanceId, item.id).then(async (res) => {
          if (!res.ok) return;
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            useComputerStore.setState(state => ({
              pendingImageData: [...state.pendingImageData, dataUrl],
            }));
          };
          reader.readAsDataURL(blob);
        }).catch(() => {});
      }
    }
  }, [instanceId]);

  useEffect(() => {
    if (!fsOpen) return;
    const el = document.querySelector('[data-fs-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [fsIndex, fsOpen]);

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
        setAttachments(prev => [...prev, { name: result.name, path: result.path }]);
        const isImage = IMAGE_EXTS.test(file.name) || IMAGE_MIME.test(file.type);
        if (isImage) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          useComputerStore.setState(state => ({
            pendingImageData: [...state.pendingImageData, dataUrl],
          }));
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
  }, [instanceId]);

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
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
    requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; });
  }, []);

  const executeSlashCommand = useCallback((cmd: { action: () => void }) => {
    play('click');
    cmd.action();
    clearDraft();
  }, [play, clearDraft]);

  const handleSend = useCallback(() => {
    if (isExternal) return;
    const text = message.trim();
    if (!text && attachments.length === 0) return;
    if (filteredCommands.length > 0 && showSlash) {
      executeSlashCommand(filteredCommands[slashSelected] || filteredCommands[0]);
      return;
    }
    if (!isConnected) return;

    const allPaths = [...new Set(attachments.map(a => a.path))];

    // Prepend reply context if replying to a message
    let fullText = text || 'See attached files';
    if (replyingTo) {
      const quote = replyingTo.content.split('\n').slice(0, 3).join('\n');
      const truncated = quote.length > 200 ? quote.slice(0, 200) + '...' : quote;
      const who = replyingTo.role === 'user' ? 'my earlier message' : 'your earlier response';
      fullText = `(Replying to ${who}: "${truncated}")\n\n${fullText}`;
      setReplyingTo(null);
    }

    play('click');
    if (text) appendToInputHistory(activeSessionKey, text);
    else if (allPaths.length > 0) appendToInputHistory(activeSessionKey, `📎 ${allPaths.length} attachment(s)`);
    sendChatMessage(fullText, allPaths.length > 0 ? allPaths : undefined);
    clearDraft();
    setAttachments([]);
    atMentionedFilesRef.current.clear();
    setUploadError(null);
    setFsOpen(false);
  }, [message, isConnected, sendChatMessage, play, filteredCommands, showSlash, slashSelected, executeSlashCommand, clearDraft, attachments, replyingTo, setReplyingTo, activeSessionKey]);

  const fetchUsage = useBillingStore(s => s.fetchUsage);
  const fetchByok = useBillingStore(s => s.fetchByok);
  const providerState = useBillingStore(s => s.getEffectiveProvider());
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

    if (voiceAutoSend && text) {
      play('click');
      appendToInputHistory(activeSessionKey, text);
      sendChatMessage(text);
      clearDraft();
    } else if (text) {
      setMessage(text);
      requestAnimationFrame(autoResize);
      inputRef.current?.focus();
    }
  }, [sttState, finalTranscript, message, voiceAutoSend, sendChatMessage, play, setMessage, autoResize, voiceReset, clearDraft, activeSessionKey]);

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
    <div className="shrink-0 border-t border-white/[0.08]">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
          <div className="w-0.5 h-6 rounded-full bg-[var(--color-accent)] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-[var(--color-accent)]">
              Replying to {replyingTo.role === 'user' ? 'yourself' : 'agent'}
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
              onClick={() => executeSlashCommand(cmd)}
            >
              <span className="text-[13px] font-mono font-medium text-[var(--color-accent)]">{cmd.name}</span>
              <span className="text-[12px] text-[var(--color-text-muted)]/40">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative px-5 py-3">
        {/* @ file/folder dropdown — opens upward */}
        {fsOpen && fsItems.length > 0 && (
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
            {fsItems.map((item, i) => (
              <div
                key={item.id}
                data-fs-focused={i === fsIndex ? 'true' : undefined}
                onMouseDown={(e) => { e.preventDefault(); selectFsItem(item); }}
                onMouseEnter={() => setFsIndex(i)}
                className={`flex items-center gap-2 px-3 py-[7px] rounded-md cursor-pointer text-[13px] whitespace-nowrap ${
                  i === fsIndex ? 'text-white/95' : 'text-white/75 hover:bg-white/5'
                }`}
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  ...(i === fsIndex ? { backgroundColor: 'rgba(255,255,255,0.08)' } : {}),
                }}
              >
                {item.isDir
                  ? <Folder className="w-3.5 h-3.5 shrink-0 text-white/40" />
                  : <FileText className="w-3.5 h-3.5 shrink-0 opacity-40" />}
                <span className="truncate">{item.display}</span>
                {item.isDir && <span className="ml-auto text-[10px] opacity-30 shrink-0">Tab &#8614;</span>}
              </div>
            ))}
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
                    useComputerStore.setState(state => ({
                      pendingImageData: state.pendingImageData.filter((_, j) => j !== i),
                    }));
                    setAttachments(prev => {
                      const remaining = [...prev];
                      const imgIdx = remaining.findIndex((_, j) => {
                        const ext = remaining[j].name.split('.').pop()?.toLowerCase();
                        return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
                      });
                      if (imgIdx >= 0) remaining.splice(imgIdx, 1);
                      return remaining;
                    });
                  }}
                  className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5"
                >
                  <XCircle className="w-3 h-3 text-white" />
                </button>
              </span>
            ))}
            {attachments.filter(att => !IMAGE_EXTS.test(att.name)).map((att, i) => (
              <span key={`file-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[11px]">
                <FileText className="w-3 h-3" />
                {att.name}
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
            <textarea
              ref={inputRef}
              value={message}
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
                    setAttachments(prev => prev.filter(a => !gone.includes(a.name)));
                  }
                }
              }}
              onKeyDown={(e) => {
                if (fsOpen && fsItems.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFsIndex(i => Math.min(i + 1, fsItems.length - 1)); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setFsIndex(i => Math.max(i - 1, 0)); return; }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    selectFsItem(fsItems[fsIndex]);
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
              placeholder={isVoiceActive ? 'Listening...' : isExternal ? 'This conversation is from an external platform (read-only)' : isConnected ? 'Ask anything... (@ to reference files)' : 'Connecting...'}
              disabled={!isConnected || isExternal}
              rows={1}
              className="w-full bg-transparent outline-none border-none resize-none focus:outline-none focus:ring-0 focus:border-none text-[15px]"
              style={{
                fontWeight: 400, lineHeight: '1.5', color: 'var(--color-text)',
                overflow: 'auto', maxHeight: 120, padding: '8px 0', minHeight: 36, outline: 'none',
              }}
            />
          </div>
          <div className="flex items-center gap-0.5 shrink-0 pb-1">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            {voiceEnabled && !isExternal && (
              <VoiceButton disabled={!isConnected} />
            )}
            <Tooltip content="Attach file" side="top">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || uploading || isExternal}
                className="p-1.5 rounded-md hover:bg-white/10 text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)] disabled:opacity-20 transition-colors"
              >
                {uploading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Paperclip className="w-4.5 h-4.5" />}
              </button>
            </Tooltip>
            {sessionRunning ? (
              <>
                {/* Always-visible Stop = hard-abort this session, no re-queue. */}
                <Tooltip content="Stop this session" side="top">
                  <button
                    onClick={stopChatSession}
                    className="p-1.5 rounded-md hover:bg-red-500/15 text-red-500/70 hover:text-red-500 transition-colors"
                  >
                    <Square className="w-4.5 h-4.5" />
                  </button>
                </Tooltip>
                {/*
                  When there's text in the box while the session is running we
                  surface a 2-mode control:
                    Send (inject)   → soft-inject into the running turn
                    Send + interrupt → hard-abort and replace the current turn
                  We render the inject path as the primary action because that
                  matches the user-controlled default.
                */}
                {(message.trim() || attachments.length > 0) && !isExternal && (
                  <>
                    <Tooltip content="Send as context (soft-inject)" side="top">
                      <button
                        onClick={handleSend}
                        disabled={!isConnected || isExternal}
                        className="p-1.5 rounded-md hover:bg-[var(--color-accent)]/10 text-[var(--color-accent)]/80 hover:text-[var(--color-accent)] disabled:opacity-20 transition-colors"
                      >
                        <Send className="w-4.5 h-4.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Interrupt + send (hard-abort current turn)" side="top">
                      <button
                        onClick={() => {
                          const text = message.trim();
                          if (!text && attachments.length === 0) return;
                          if (!activeSessionKey) return;
                          play('click');
                          if (text) appendToInputHistory(activeSessionKey, text);
                          else if (attachments.length > 0) appendToInputHistory(activeSessionKey, `📎 ${attachments.length} attachment(s)`);
                          interruptSession(activeSessionKey, text || 'See attached files');
                          clearDraft();
                          setAttachments([]);
                          atMentionedFilesRef.current.clear();
                          setUploadError(null);
                        }}
                        disabled={!isConnected || isExternal}
                        className="p-1.5 rounded-md hover:bg-amber-500/15 text-amber-500/80 hover:text-amber-400 disabled:opacity-20 transition-colors"
                      >
                        <Zap className="w-4.5 h-4.5" />
                      </button>
                    </Tooltip>
                  </>
                )}
              </>
            ) : (message.trim() || attachments.length > 0) && !isExternal ? (
              <Tooltip content={providerCopyData.inputDisabled ? (providerCopyData.badge ?? 'Limit reached') : 'Send'} side="top">
                <button
                  onClick={handleSend}
                  disabled={!isConnected || isExternal || providerCopyData.inputDisabled}
                  className="p-1.5 rounded-md hover:bg-[var(--color-accent)]/10 text-[var(--color-accent)]/80 hover:text-[var(--color-accent)] disabled:opacity-20 transition-colors"
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
