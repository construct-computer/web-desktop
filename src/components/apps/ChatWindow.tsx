import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Square, Bot, User, Loader2, Globe, Terminal, FileText, Monitor, Wrench, SquarePen, ChevronDown, ChevronRight, Trash2, MessageSquare, Zap, AlertCircle, CalendarDays, Network, Cog, CheckCircle2, XCircle } from 'lucide-react';
import constructLogo from '@/assets/logo.png';
import { Button, MarkdownRenderer } from '@/components/ui';
import { AuthConnectCard, parseAuthMarker } from '@/components/ui/AuthConnectCard';
import { AskUserCard } from '@/components/ui/AskUserCard';
import { useComputerStore, type ChatMessage } from '@/stores/agentStore';
import { useAgentTrackerStore, type TrackedSubAgent } from '@/stores/agentTrackerStore';
import { useBillingStore } from '@/stores/billingStore';
import { useShallow } from 'zustand/react/shallow';
import { providerCopy, TONE_CLASSES } from '@/lib/providerCopy';
import { openSettingsToSection } from '@/lib/settingsNav';
import { agentWS } from '@/services/websocket';
import { useSound } from '@/hooks/useSound';
import analytics from '@/lib/analytics';
import type { WindowConfig } from '@/types';

/** Typing indicator (staggered bouncing dots) or scrollable thinking text. */
function AgentThinkingIndicator() {
  const stream = useComputerStore(s => s.agentThinkingStream);
  const running = useComputerStore(s => s.agentRunning);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const isActive = stream !== null || running;
  useEffect(() => {
    setVisible(isActive);
  }, [isActive]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [stream]);

  if (!visible) return null;

  const hasThinkingText = stream && stream.length > 0;

  return (
    <div className="flex gap-2 justify-start">
      <img src={constructLogo} alt="" className="w-5 h-5 shrink-0 mt-1" />
      {!hasThinkingText ? (
        /* Typing indicator — staggered bouncing dots */
        <div className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-xl px-4 py-3 flex items-center gap-[3px]">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="block w-[5px] h-[5px] rounded-full bg-[var(--color-text-muted)]"
              style={{
                opacity: 0.45,
                animation: 'typing-dot 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes typing-dot {
              0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
              30% { opacity: 0.7; transform: translateY(-3px); }
            }
          `}</style>
        </div>
      ) : (
        /* Thinking text stream */
        <div className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-xl px-3 py-2 max-w-[320px]">
          <div
            ref={scrollRef}
            className="overflow-y-auto text-[10px] leading-[1.3em] text-[var(--color-text-muted)]/50 font-mono scrollbar-none"
            style={{ maxHeight: '34px' }}
          >
            {stream}
          </div>
        </div>
      )}
    </div>
  );
}

/** Return an icon component for activity messages based on type */
function ActivityIcon({ type }: { type?: ChatMessage['activityType'] }) {
  const cls = "w-3 h-3";
  switch (type) {
    case 'browser': return <Globe className={cls} />;
    case 'web': return <Zap className={cls} />;
    case 'terminal': return <Terminal className={cls} />;
    case 'file': return <FileText className={cls} />;
    case 'desktop': return <Monitor className={cls} />;
    case 'calendar': return <CalendarDays className={cls} />;
    case 'delegation': return <Network className={cls} />;
    case 'background': return <Cog className={cls} />;
    default: return <Wrench className={cls} />;
  }
}

// ── Session Picker Dropdown (portaled for backdrop-blur) ─────────

interface SessionDropdownProps {
  anchorRect: DOMRect;
  onClose: () => void;
}

function SessionDropdown({ anchorRect, onClose }: SessionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { play } = useSound();

  const chatSessions = useComputerStore((s) => s.chatSessions);
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);
  const createSession = useComputerStore((s) => s.createSession);
  const switchSession = useComputerStore((s) => s.switchSession);
  const deleteSession = useComputerStore((s) => s.deleteSession);
  const renameSession = useComputerStore((s) => s.renameSession);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  // Focus the input when editing starts
  useEffect(() => {
    if (editingKey) editRef.current?.focus();
  }, [editingKey]);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handle);
    };
  }, [onClose]);

  // Close on Escape (cancel editing first if active)
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingKey) { setEditingKey(null); }
        else { onClose(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, editingKey]);

  const handleNew = () => {
    play('click');
    createSession();
    onClose();
  };

  const handleSwitch = (key: string) => {
    if (editingKey) return; // don't switch while editing
    if (key === activeSessionKey) { onClose(); return; }
    play('click');
    switchSession(key);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    play('click');
    deleteSession(key);
    if (editingKey === key) setEditingKey(null);
  };

  const startRename = (e: React.MouseEvent, key: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingKey(key);
    setEditValue(currentTitle);
  };

  const commitRename = (key: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed.length <= 64) {
      renameSession(key, trimmed);
    }
    setEditingKey(null);
  };

  // Position below the anchor trigger, clamped to the visible viewport so the
  // menu never spills off-screen on narrow / mobile windows.
  const DROPDOWN_W = 224; // matches w-56 (14rem)
  const DROPDOWN_MAX_H = 320;
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const left = Math.max(8, Math.min(anchorRect.left, vw - DROPDOWN_W - 8));
  const top = Math.max(8, Math.min(anchorRect.bottom + 4, vh - DROPDOWN_MAX_H - 8));

  return createPortal(
    <div
      ref={dropdownRef}
      id="chat-session-dropdown"
      className="fixed z-[9999] w-56 rounded-lg border border-white/20 dark:border-white/10 glass-popover shadow-2xl overflow-hidden"
      style={{ top, left }}
    >
      {/* New chat */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-accent)] hover:bg-white/40 dark:hover:bg-white/10 transition-colors border-b border-black/5 dark:border-white/10"
        onClick={handleNew}
      >
        <SquarePen className="w-3.5 h-3.5" />
        New Chat
      </button>

      {/* Session list */}
      <div className="max-h-52 overflow-y-auto py-1">
        {chatSessions.map((session) => (
          <button
            key={session.key}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors group ${
              session.key === activeSessionKey
                ? 'bg-white/40 dark:bg-white/10 font-medium'
                : 'hover:bg-white/30 dark:hover:bg-white/5'
            }`}
            onClick={() => handleSwitch(session.key)}
          >
            <MessageSquare className="w-3 h-3 shrink-0 opacity-40" />

            {editingKey === session.key ? (
              <input
                ref={editRef}
                className="flex-1 min-w-0 bg-white/60 dark:bg-white/10 rounded px-1 py-0.5 text-xs outline-none border border-[var(--color-accent)]/50 focus:border-[var(--color-accent)]"
                value={editValue}
                maxLength={64}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename(session.key);
                  if (e.key === 'Escape') setEditingKey(null);
                }}
                onBlur={() => commitRename(session.key)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="truncate flex-1 text-left"
                onDoubleClick={(e) => startRename(e, session.key, session.title)}
                title="Double-click to rename"
              >
                {session.title}
              </span>
            )}

            <span
              role="button"
              className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
              onClick={(e) => handleDelete(e, session.key)}
              title="Delete chat"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ── Elapsed timer hook ───────────────────────────────────────────

function useElapsed(startedAt: number, active: boolean): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const s = Math.round((Date.now() - startedAt) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Subagent line (shimmer while running, collapsible) ──────────

function SubAgentLine({ agent }: { agent: TrackedSubAgent }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = agent.status === 'running' || agent.status === 'pending';
  const isFailed = agent.status === 'failed';
  const isCancelled = agent.status === 'cancelled';
  const elapsed = useElapsed(agent.startedAt, isRunning);
  const duration = agent.durationMs ? `${Math.round(agent.durationMs / 1000)}s` : elapsed;

  const shortGoal = agent.goal.length > 45 ? agent.goal.slice(0, 45) + '...' : agent.goal;
  const hasContent = agent.result || agent.error || agent.activities.length > 0;

  // Show current tool as a compact status hint when running
  const progressHint = isRunning && agent.currentActivity
    ? agent.currentActivity
    : null;

  return (
    <div className="ml-1">
      <button
        className="flex items-center gap-1.5 w-full text-left py-0.5 group"
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        {/* Status icon */}
        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)] shrink-0" />
        ) : isFailed ? (
          <XCircle className="w-3 h-3 text-red-400 shrink-0" />
        ) : isCancelled ? (
          <Square className="w-3 h-3 text-gray-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
        )}

        {/* Label — shimmer while running */}
        <span className={`text-xs truncate flex-1 ${isRunning ? 'shimmer-text' : (isFailed || isCancelled) ? 'text-red-400' : 'text-[var(--color-text-muted)]'}`}>
          {shortGoal}
        </span>

        {/* Current tool hint when running */}
        {progressHint && (
          <span className="text-[10px] text-[var(--color-text-subtle)] shrink-0 max-w-[80px] truncate">
            {progressHint}
          </span>
        )}

        {/* Duration / elapsed */}
        <span className="text-xs text-[var(--color-text-subtle)] shrink-0 tabular-nums">
          {duration}
        </span>

        {/* Expand chevron */}
        {hasContent && (
          <ChevronRight className={`w-3 h-3 text-[var(--color-text-subtle)] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasContent && (
        <div className="ml-4.5 mt-0.5 mb-1 px-2 py-1.5 rounded-md bg-black/5 dark:bg-white/5 border border-[var(--color-border)] text-xs overflow-auto max-h-60">
          {/* Activity log */}
          {agent.activities.length > 0 && (
            <div className="space-y-0.5 mb-1">
              {agent.activities.map((act, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                  <ActivityIcon type={act.activityType as ChatMessage['activityType']} />
                  <span className="truncate">{act.text}</span>
                </div>
              ))}
            </div>
          )}
          {/* Result or error */}
          {agent.error ? (
            <p className="text-red-400">{agent.error}</p>
          ) : agent.result ? (
            <div className={agent.activities.length > 0 ? 'mt-1.5 pt-1.5 border-t border-[var(--color-border)]' : ''}>
              <MarkdownRenderer content={agent.result} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Operation card (delegation-group / consultation-group / background-group) ──

function OperationCard({ operationId, label }: { operationId: string; label: string }) {
  const operation = useAgentTrackerStore(s => s.operations[operationId]);
  const isRunning = operation?.status === 'running' || operation?.status === 'aggregating';
  const elapsed = useElapsed(operation?.startedAt ?? 0, Boolean(operation && isRunning));

  if (!operation) {
    // Operation not tracked yet — show placeholder
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center bg-[var(--color-border)] text-[var(--color-text-muted)]">
          <Network className="w-3 h-3" />
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      </div>
    );
  }

  const isFailed = operation.status === 'failed';
  const completed = operation.subAgents.filter(a => a.status === 'complete').length;
  const failed = operation.subAgents.filter(a => a.status === 'failed').length;
  const total = operation.subAgents.length;
  const duration = operation.durationMs ? `${Math.round(operation.durationMs / 1000)}s` : elapsed;

  // Border color by type
  const borderColor = operation.type === 'delegation'
    ? 'border-l-blue-400'
    : operation.type === 'consultation'
    ? 'border-l-purple-400'
    : 'border-l-amber-400';

  return (
    <div className={`rounded-lg border border-[var(--color-border)] ${borderColor} border-l-2 bg-[var(--color-surface-raised)] overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Network className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{label}</span>
        {/* Stats badge */}
        <span className="text-xs text-[var(--color-text-subtle)] tabular-nums shrink-0">
          {isRunning
            ? `${completed}/${total}`
            : isFailed
            ? `${failed} failed`
            : `${completed}/${total}`
          }
        </span>
        <span className="text-xs text-[var(--color-text-subtle)] tabular-nums shrink-0">{duration}</span>
        {isRunning && operation.status === 'aggregating' && (
          <span className="text-xs shimmer-text">aggregating</span>
        )}
      </div>

      {/* Subagent lines */}
      {total > 0 && (
        <div className="px-2 pb-1.5 space-y-0">
          {operation.subAgents.map(agent => (
            <SubAgentLine key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ChatWindow ──────────────────────────────────────────────

interface ChatWindowProps {
  config: WindowConfig;
}

const DRAFT_STORAGE_KEY = 'construct:chat-draft';

export function ChatWindow({ config: _config }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { play } = useSound();

  // Auto-resize textarea to fit content
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const computer = useComputerStore((s) => s.computer);
  const instanceId = useComputerStore((s) => s.instanceId);
  const hasApiKey = useComputerStore((s) => s.hasApiKey);
  const chatMessages = useComputerStore((s) => s.chatMessages);
  const agentThinking = useComputerStore((s) => s.agentThinking);
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const agentConnected = useComputerStore((s) => s.agentConnected);
  const sendChatMessage = useComputerStore((s) => s.sendChatMessage);
  const stopChatSession = useComputerStore((s) => s.stopChatSession);
  const chatSessions = useComputerStore((s) => s.chatSessions);
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);
  const createSession = useComputerStore((s) => s.createSession);
  const taskProgress = useComputerStore((s) => s.taskProgress);

  // Provider state drives the sticky usage banner + per-message notice styling.
  const providerState = useBillingStore(useShallow((s) => s.getEffectiveProvider()));
  const providerCopyData = providerCopy(providerState);
  const showBanner =
    providerState.kind === 'byok-fallback' ||
    providerState.kind === 'blocked-no-key' ||
    providerState.kind === 'blocked-byok-cap';

  const isConnected = computer && computer.status === 'running';
  const activeSession = chatSessions.find(s => s.key === activeSessionKey);
  const needsSetup = !hasApiKey;

  // Track whether we've completed the initial draft restore so the persist
  // effect doesn't clobber the saved draft with the empty initial state.
  const draftRestoredRef = useRef(false);

  // Restore draft when component mounts or session changes
  useEffect(() => {
    draftRestoredRef.current = false;
    try {
      const draft = localStorage.getItem(`${DRAFT_STORAGE_KEY}:${activeSessionKey}`);
      setMessage(draft || '');
      // Defer autoResize so the textarea has the new value
      requestAnimationFrame(autoResize);
    } catch { setMessage(''); }
    // Mark restore as complete on the next tick so the persist effect
    // (which fires synchronously after this one in the same render)
    // knows to skip its first run.
    requestAnimationFrame(() => { draftRestoredRef.current = true; });
  }, [activeSessionKey, autoResize]);

  // Persist draft as user types — skips the initial mount to avoid
  // clobbering the saved draft with the empty useState('') default.
  useEffect(() => {
    if (!draftRestoredRef.current) return; // Skip until restore is done
    try {
      if (message) {
        localStorage.setItem(`${DRAFT_STORAGE_KEY}:${activeSessionKey}`, message);
      } else {
        localStorage.removeItem(`${DRAFT_STORAGE_KEY}:${activeSessionKey}`);
      }
    } catch {}
  }, [message, activeSessionKey]);

  // Connect to agent WS
  useEffect(() => {
    if (isConnected && instanceId) {
      agentWS.connect(instanceId);
    }
  }, [isConnected, instanceId]);

  // Auto-scroll — trigger on new messages, thinking state, or running state changes
  const agentThinkingStream = useComputerStore((s) => s.agentThinkingStream);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, agentThinking, agentRunning, agentThinkingStream]);

  const toggleDropdown = useCallback(() => {
    if (dropdownOpen) {
      setDropdownOpen(false);
    } else {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setAnchorRect(rect);
        setDropdownOpen(true);
      }
    }
  }, [dropdownOpen]);

  // Chat stop button only shows when the current desktop chat session is actively
  // running. Platform agents (Slack, Telegram, etc.) and subagent operations
  // are stopped via the Agent Tracker, not the chat window.
  const isChatBusy = agentRunning;

  const handleSend = () => {
    if (!message.trim() || !isConnected) return;
    play('click');
    analytics.chatMessageSent({ sessionKey: activeSessionKey, messageLength: message.trim().length });
    sendChatMessage(message);
    setMessage('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try { localStorage.removeItem(`${DRAFT_STORAGE_KEY}:${activeSessionKey}`); } catch {}
  };

  const handleStop = () => {
    play('click');
    analytics.chatStopped();
    stopChatSession();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    play('click');
    analytics.chatSessionCreated();
    createSession();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] surface-toolbar">
        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            agentConnected
              ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]'
              : isConnected
              ? 'bg-amber-400 animate-pulse'
              : 'bg-neutral-400'
          }`}
          title={agentConnected ? 'Online' : isConnected ? 'Connecting' : 'Offline'}
        />

        {/* Session title — opens dropdown */}
        <button
          ref={triggerRef}
          className="flex items-center gap-0.5 text-xs font-medium hover:text-[var(--color-accent)] transition-colors min-w-0"
          onClick={toggleDropdown}
        >
          <span className="truncate">{activeSession?.title || 'Chat'}</span>
          <ChevronDown className={`w-3 h-3 shrink-0 opacity-40 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex-1" />

        {/* New chat */}
        <button
          className="p-1 rounded-md hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          onClick={handleNewChat}
          title="New Chat"
        >
          <SquarePen className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Portal dropdown */}
      {dropdownOpen && anchorRect && (
        <SessionDropdown
          anchorRect={anchorRect}
          onClose={() => setDropdownOpen(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {showBanner && providerCopyData.bannerTitle && (
          <div
            className={`rounded-md border px-3 py-2 ${TONE_CLASSES[providerCopyData.tone].bg} ${TONE_CLASSES[providerCopyData.tone].border}`}
          >
            <div className={`text-xs font-semibold ${TONE_CLASSES[providerCopyData.tone].text}`}>
              {providerCopyData.bannerTitle}
            </div>
            {providerCopyData.bannerBody && (
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {providerCopyData.bannerBody}
              </div>
            )}
            {providerCopyData.cta && (
              <button
                type="button"
                onClick={() => openSettingsToSection('subscription')}
                className={`mt-1.5 text-xs underline underline-offset-2 ${TONE_CLASSES[providerCopyData.tone].text}`}
              >
                {providerCopyData.cta.label}
              </button>
            )}
          </div>
        )}
        {chatMessages.length === 0 && !agentThinking && (
          <div className="text-center text-[var(--color-text-muted)] py-8">
                <img src={constructLogo} alt="" className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1 opacity-50">
              {needsSetup
                ? 'Complete setup in Settings to start chatting'
                : isConnected
                ? 'Send a message to start a conversation'
                : 'Start your computer to begin chatting'}
            </p>
          </div>
        )}

        {chatMessages.map((msg, index) => {
          // Skip internal app messages
          if (msg.role === 'user' && msg.content.startsWith('[App | ')) {
            return null;
          }

          // ── Operation group cards (delegation / consultation / background) ──
          if (msg.role === 'activity' && msg.operationId && (msg.activityType === 'delegation-group' || msg.activityType === 'consultation-group' || msg.activityType === 'background-group' || msg.activityType === 'orchestration-group')) {
            return (
              <div key={index} className="px-1">
                <OperationCard operationId={msg.operationId} label={msg.content} />
              </div>
            );
          }

          if (msg.role === 'activity') {
            const isAgentBrowser = msg.activityType === 'web';
            return (
              <div key={index} className="flex items-center gap-2 px-2 py-1">
                <div className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                  isAgentBrowser
                    ? 'bg-amber-500/20 text-amber-500'
                    : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}>
                  <ActivityIcon type={msg.activityType} />
                </div>
                <span className={`text-xs truncate ${
                  isAgentBrowser ? 'text-amber-400/80' : 'text-[var(--color-text-muted)]'
                }`}>
                  {msg.content}
                </span>
                <span className="text-xs text-[var(--color-text-subtle)] ml-auto shrink-0">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
            );
          }

          // Skip empty agent messages (e.g. when LLM emits no text before tool calls)
          if (msg.role === 'agent' && !msg.isError && !msg.content.trim()) {
            return null;
          }

          // Skip system sentinel messages (used as message boundary markers),
          // but still render interactive approval cards.
          if (msg.role === 'system' && !msg.askUser) {
            return null;
          }

          // Render provider-transition notices as subtle muted inline text.
          if (msg.role === 'notice') {
            return (
              <div key={index} className="flex justify-center py-1">
                <span className="text-[11px] text-[var(--color-text-muted)] italic">
                  {msg.content}
                </span>
              </div>
            );
          }

          const isError = msg.role === 'agent' && msg.isError;
          const isStopped = msg.role === 'agent' && msg.isStopped;

          // Stopped-by-user messages render as muted inline text, not a full bubble
          if (isStopped) {
            return (
              <div key={index} className="flex justify-center py-1">
                <span className="text-xs text-[var(--color-text-muted)] italic">
                  {msg.content} &mdash; {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
            );
          }

          return (
            <div
              key={index}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'agent' && (
                isError
                  ? <div className="w-6 h-6 shrink-0 rounded-full bg-red-500/80 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                  : <img src={constructLogo} alt="" className="w-5 h-5 shrink-0 mt-1" />
              )}

              <div
                className={`max-w-[80%] px-3 py-2 text-sm rounded-xl ${
                  msg.role === 'user'
                    ? 'bg-[var(--color-accent)] text-white selection:bg-white/30 selection:text-white'
                    : isError
                    ? 'bg-red-500/10 dark:bg-red-500/15 border border-red-500/30 dark:border-red-500/25 text-red-600 dark:text-red-400'
                    : 'bg-[var(--color-surface-raised)] border border-[var(--color-border)]'
                }`}
              >
                {(() => {
                  if (msg.askUser) return <AskUserCard data={msg.askUser} />;
                  // Detect auth connect markers in agent messages
                  if (msg.role === 'agent' && !isError) {
                    const auth = parseAuthMarker(msg.content)
                    if (auth) {
                      return (
                        <>
                          <AuthConnectCard payload={auth.payload} />
                          {auth.rest && <MarkdownRenderer content={auth.rest} />}
                        </>
                      )
                    }
                  }
                  return <MarkdownRenderer content={msg.content} plain={msg.role === 'user'} />
                })()}
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'opacity-70' : isError ? 'text-red-500/60 dark:text-red-400/60' : 'text-[var(--color-text-muted)]'}`}>
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>

              {msg.role === 'user' && (
                <div className="w-6 h-6 shrink-0 rounded-full bg-[var(--color-text-muted)] flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          );
        })}

        {/* Show working indicator whenever the agent loop is running */}
        <AgentThinkingIndicator />

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => { setMessage(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type a message...' : 'Start your computer first'}
            disabled={!isConnected}
            rows={1}
            className="flex-1 min-h-[32px] max-h-[120px] px-3 py-1.5 bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded-[var(--radius-input)] text-sm shadow-inner shadow-black/[0.02] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150 resize-none"
          />
          {isChatBusy && (
            <Button
              onClick={handleStop}
              size="icon"
              className="!bg-red-500/80 hover:!bg-red-500 text-white shrink-0"
              title="Stop current task"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </Button>
          )}
          <Button
            onClick={handleSend}
            size="icon"
            disabled={!isConnected || !message.trim()}
            title="Send message"
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
