import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Send, Mail, Hash, Blocks, Zap, Clock } from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAppStore } from '@/stores/appStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSound } from '@/hooks/useSound';
import { hapticLight } from '@/lib/haptics';

interface PlatformMessage {
  platform: string;
  user: string;
  message: string;
  subject?: string;
}

/**
 * Parse external platform message content to extract user, subject, and body.
 * Only called when msg.source confirms this is genuinely from an external platform.
 */
function parsePlatformContent(source: 'telegram' | 'slack' | 'email', content: string): PlatformMessage | null {
  if (source === 'telegram' || source === 'slack') {
    // Format: [Platform | @user | ROLE | metadata]: message
    const bracketMatch = content.match(/^\[(\w+)\s*\|\s*@?([^\]|]+?)(?:\s*\|[^\]]*)*\]:\s*([\s\S]*)$/);
    if (bracketMatch) {
      let user = bracketMatch[2].trim();
      user = user.replace(/<@([^>]+)>/g, '$1').replace(/<#([^>]+)>/g, '#$1');
      return { platform: bracketMatch[1], user, message: bracketMatch[3] };
    }
    return null;
  }

  if (source === 'email') {
    // Format: [Incoming email - type]\nFrom: ...\nTo: ...\nSubject: ...\nMessage-ID: ...\n\nbody
    const lines = content.split('\n');
    let from = '';
    let subject = '';
    let bodyStart = -1;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') {
        bodyStart = i + 1;
        break;
      }
      if (lines[i].startsWith('From: ')) from = lines[i].slice(6);
      else if (lines[i].startsWith('Subject: ')) subject = lines[i].slice(9);
    }

    const body = bodyStart >= 0 ? lines.slice(bodyStart).join('\n').trim() : '';

    return {
      platform: 'Email',
      user: from || 'Unknown',
      subject: subject || undefined,
      message: body,
    };
  }

  return null;
}

const PLATFORM_COLORS: Record<string, string> = {
  Telegram: '#2AABEE',
  Slack: '#4A154B',
  Email: '#EA4335',
  App: '#6366F1',
};

const PLATFORM_ICONS: Record<string, typeof Send> = {
  Telegram: Send,
  Slack: Hash,
  Email: Mail,
  App: Blocks,
};

/** Parse reply prefix: (Replying to ...: "quoted text")\n\nactual message */
function parseReply(content: string): { quote: string; who: string; body: string } | null {
  const match = content.match(/^\(Replying to (my earlier message|your earlier response): "([\s\S]*?)"\)\n\n([\s\S]*)$/);
  if (!match) return null;
  return { who: match[1] === 'my earlier message' ? 'You' : 'Agent', quote: match[2], body: match[3] };
}

function isExternalSessionKey(key: string | undefined) {
  if (!key) return false;
  return key.startsWith('telegram_') || key.startsWith('slack_') || key.startsWith('email_');
}

export function UserMessage({ msg, replySlot }: { msg: ChatMessage; replySlot?: React.ReactNode }) {
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const interruptSession = useComputerStore(s => s.interruptSession);
  const { play } = useSound();
  const isMobile = useIsMobile();

  const onForceSend = useCallback(
    (text: string, clientId?: string) => {
      if (!activeSessionKey || isExternalSessionKey(activeSessionKey)) return;
      const t = text.trim();
      if (!t) return;
      play('click');
      if (isMobile) hapticLight();
      interruptSession(activeSessionKey, t, clientId);
    },
    [activeSessionKey, interruptSession, play, isMobile],
  );

  // Only parse as platform message when the backend confirms the source
  const parsed = msg.source ? parsePlatformContent(msg.source, msg.content) : null;

  // Look up app icon for App platform messages
  const appIcon = parsed?.platform === 'App'
    ? useAppStore.getState().localApps.find(a => a.id === parsed.user)?.icon_url
    : undefined;

  const showPending = Boolean(msg.pendingInjection) && !isExternalSessionKey(activeSessionKey);
  const wasPending = useRef(false);
  const [injectionLanded, setInjectionLanded] = useState(false);
  const reply = parseReply(msg.content);

  useEffect(() => {
    if (wasPending.current && !showPending) {
      setInjectionLanded(true);
      const t = window.setTimeout(() => { setInjectionLanded(false); }, 900);
      wasPending.current = false;
      return () => clearTimeout(t);
    }
    wasPending.current = showPending;
  }, [showPending]);

  if (parsed?.platform) {
    const color = PLATFORM_COLORS[parsed.platform] || 'var(--color-accent)';
    const Icon = PLATFORM_ICONS[parsed.platform] || Send;

    return (
      <div className="flex items-center justify-end gap-1.5 px-3 sm:px-5 py-1.5" style={{ animation: 'spt-in 150ms ease-out' }}>
        {replySlot}
        <div className="max-w-[95%] sm:max-w-[80%] rounded-[18px] rounded-br-md shadow-sm overflow-hidden" style={{ background: color }}>
          <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium text-white/60" style={{ background: 'rgba(0,0,0,0.15)' }}>
            {appIcon ? (
              <img src={appIcon} alt="" className="w-3.5 h-3.5 rounded-[3px]" />
            ) : (
              <Icon className="w-2.5 h-2.5" />
            )}
            <span>via {parsed.platform}</span>
            <span className="text-white/40">·</span>
            <span className="text-white/80">{parsed.user}</span>
          </div>
          {parsed.subject && (
            <div className="px-3 py-1 text-[11px] font-medium text-white/70 border-b border-white/10">
              {parsed.subject}
            </div>
          )}
          <div className="px-4 py-2 text-[15px] leading-relaxed text-white selection:!bg-white/90 selection:!text-[var(--color-accent)]">
            <p className="whitespace-pre-wrap">{parsed.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-end gap-1.5 px-3 sm:px-5 py-1.5"
      style={{ animation: 'spt-in 150ms ease-out' }}
    >
      {replySlot}
      <div
        className="flex max-w-[95%] sm:max-w-[80%] min-w-0 flex-col items-end gap-0.5"
      >
        <div
          className={[
            'w-full rounded-[18px] rounded-br-md',
            'text-white selection:!bg-white/90 selection:!text-[var(--color-accent)]',
            'shadow-sm px-4 py-2.5 text-[15px] leading-relaxed',
            'bg-[var(--color-accent)]',
            'transition-[opacity,filter] duration-300 ease-out',
            showPending
              ? 'opacity-[0.7] saturate-[0.88] [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.12)]'
              : [injectionLanded ? 'user-msg-injection-landed' : ''].filter(Boolean).join(' '),
          ].filter(Boolean).join(' ')}
        >
          {(() => {
            if (reply) {
              return (
                <>
                  <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/8 text-[12px] leading-snug text-white/70 line-clamp-2">
                    {reply.quote}
                  </div>
                  <p className="whitespace-pre-wrap">{reply.body}</p>
                </>
              );
            }
            return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
          })()}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {msg.attachments.map((filePath, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[11px]">
                  <FileText className="w-2.5 h-2.5" />
                  {filePath.split('/').pop()}
                </span>
              ))}
            </div>
          )}
        </div>
        {showPending && (
          <div className="flex w-full items-center justify-end gap-2 pr-0.5 pt-0.5">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]/55"
              title="Queued — will be soft-injected at the next safe point in the agent's turn"
            >
              <Clock className="h-2.5 w-2.5" />
              Queued
            </span>
            <button
              type="button"
              onClick={() => { onForceSend(msg.content, msg.clientId); }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-accent)]/75 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 active:text-[var(--color-accent)] transition-colors"
              title="Interrupt the current turn and send this message immediately"
            >
              <Zap className="h-3 w-3" />
              Send now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
