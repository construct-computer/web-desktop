import { usePreloadProgress } from '@/lib/preload';

/**
 * macOS boot-style progress bar shown during asset preloading.
 * Appears below the power button or "hello" text.
 * Fades out when preloading completes.
 */
export function BootProgressBar() {
  const { loaded, total, done } = usePreloadProgress();

  if (total === 0) return null;

  const pct = Math.min(100, Math.round((loaded / total) * 100));

  return (
    <div
      className="flex flex-col items-center gap-1.5 transition-opacity duration-700"
      style={{ opacity: done ? 0 : 1, pointerEvents: 'none' }}
    >
      <div className="w-48 h-1 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full bg-white/40 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-white/20 tabular-nums">
        {pct}%
      </span>
    </div>
  );
}