import constructLogo from '@/assets/construct-logo.png';
import type { WindowConfig } from '@/types';

declare const __GIT_HASH__: string;

interface AboutWindowProps {
  config: WindowConfig;
}

export function AboutWindow({ config: _config }: AboutWindowProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] p-8 text-center">
      <img
        src={constructLogo}
        alt="construct.computer"
        className="w-20 h-20 mb-5 rounded-2xl invert dark:invert-0"
        draggable={false}
      />

      <h1 className="text-xl" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: '-0.02em' }}>
        construct<span className="opacity-30 font-light">.</span><span className="font-light opacity-55">computer</span>
      </h1>

      <p className="text-sm text-[var(--color-text-muted)] mt-1">
        Your personal AI agent platform
      </p>

      <div className="mt-6 text-sm text-[var(--color-text-muted)] max-w-sm leading-relaxed space-y-3">
        <p>
          A serverless AI agent that runs 24/7 with persistent memory,
          email, calendar, and third-party integrations.
        </p>
        <p>
          Connects across Slack, Telegram, email, and the web — orchestrating
          sub-agents, managing files, and executing scheduled tasks on your behalf.
        </p>
      </div>

      <div className="mt-8 px-3 py-1.5 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] font-mono tabular-nums">
        build {__GIT_HASH__}
      </div>

      <a
        href="https://construct.computer"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors"
      >
        construct.computer
      </a>
    </div>
  );
}
