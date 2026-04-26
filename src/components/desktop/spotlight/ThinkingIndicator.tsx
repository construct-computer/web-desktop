import { useRef, useEffect } from 'react';
import constructGif from '@/assets/construct/loader.gif';
import { useComputerStore } from '@/stores/agentStore';

function TypingDots() {
  return (
    <div className="flex items-center gap-[3px] h-5">
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
  );
}

export function ThinkingIndicator() {
  const stream = useComputerStore(s => s.agentThinkingStream);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const agentStatusLabel = useComputerStore(s => s.agentStatusLabel);
  const activeKey = useComputerStore(s => s.activeSessionKey);
  const runningSet = useComputerStore(s => s.runningSessions);
  const live = useComputerStore(s => s.activeSessions[s.activeSessionKey]);
  const running =
    agentRunning
    || (activeKey ? runningSet.has(activeKey) : false)
    || Boolean(live && live.status !== 'idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isActive = stream !== null || running;
  const isCompacting = agentStatusLabel === 'compacting';
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [stream]);
  if (!isActive) return null;
  const hasText = stream && stream.length > 0;

  return (
    <div className="flex gap-3 px-6 py-2">
      <img src={constructGif} alt="" className="w-[27px] h-[27px] shrink-0 mt-0.5 drop-shadow-sm" />
      {isCompacting ? (
        <div className="min-w-0 flex items-center" style={{ minHeight: '1.625rem' }}>
          <p className="text-[13px] text-[var(--color-text-muted)]/80 leading-snug">
            Compacting conversation context…
          </p>
        </div>
      ) : !hasText ? (
        <div className="min-w-0 flex items-center" style={{ minHeight: '1.625rem' }}>
          <TypingDots />
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto text-[10px] leading-relaxed text-[var(--color-text-muted)]/30 font-mono" style={{ maxHeight: '36px', marginTop: '2px' }}>
          {stream}
        </div>
      )}
    </div>
  );
}
