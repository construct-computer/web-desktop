import { useRef, useEffect } from 'react';
import constructVideo from '@/assets/construct/loader.webm';
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
  const running = useComputerStore(s => s.agentRunning);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isActive = stream !== null || running;
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [stream]);
  if (!isActive) return null;
  const hasText = stream && stream.length > 0;

  return (
    <div className="flex gap-3 px-6 py-2">
      <video src={constructVideo} autoPlay loop muted playsInline className="w-[27px] h-[27px] shrink-0 mt-0.5 drop-shadow-sm" />
      {!hasText ? (
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
