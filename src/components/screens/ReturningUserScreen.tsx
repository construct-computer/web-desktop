import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEffectiveWallpaperId, useWallpaperUrl } from '@/hooks/useWallpaperUrl';
import { CrossfadeWallpaper } from '@/components/desktop/CrossfadeWallpaper';
import { LOCK_SCREEN_WALLPAPER_BLUR_PX } from '@/lib/desktopReveal';
import { useProvisionPhase, type ProvisionVariant } from '@/hooks/useProvisionPhase';
import {
  provisionErrorMessage,
  provisionFooterTagline,
  provisionSigningInLabel,
} from '@/lib/provisioningCopy';
import constructGif from '@/assets/construct/loader.gif';

interface ReturningUserScreenProps {
  /** If provided, shows "Click to unlock" — user explicitly locked the screen */
  onUnlock?: () => void;
  /** Container is being provisioned */
  isProvisioning?: boolean;
  /** Container provisioning failed */
  provisionError?: string | null;
  /** Retry provisioning */
  onRetry?: () => void;
  /** Copy variant for first-run vs returning session */
  variant?: ProvisionVariant;
}

/**
 * Lock screen for authenticated users.
 *
 * Single static blurred wallpaper + scrim; one slide-up transition (handled by App wrapper).
 * Manual lock shows clock and unlock prompt together — no wake crossfade.
 */
export function ReturningUserScreen({
  onUnlock,
  isProvisioning,
  provisionError,
  onRetry,
  variant = 'returning',
}: ReturningUserScreenProps) {
  const isLocked = !!onUnlock;
  const wallpaperId = useEffectiveWallpaperId();
  const { url: wallpaperSrc } = useWallpaperUrl(wallpaperId);
  const { progressLabel, headline } = useProvisionPhase(variant);

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      className="relative min-h-dvh flex items-center justify-center overflow-hidden bg-black"
      onClick={() => {
        if (isLocked && onUnlock) onUnlock();
      }}
      style={{ cursor: isLocked ? 'pointer' : undefined }}
    >
      <div
        className="absolute inset-0"
        style={{
          filter: `blur(${LOCK_SCREEN_WALLPAPER_BLUR_PX}px) saturate(1.25)`,
          transform: 'scale(1.02)',
        }}
      >
        <CrossfadeWallpaper url={wallpaperSrc} />
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />

      {isLocked && (
        <div className="absolute top-24 flex flex-col items-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] select-none pointer-events-none">
          <h2 className="text-[22px] font-medium tracking-wide mb-1 opacity-90">{dateStr}</h2>
          <h1 className="text-[88px] font-bold tracking-tight leading-none">{timeStr}</h1>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center select-none">
        <img
          src={constructGif}
          className="w-24 h-24 mb-5 drop-shadow-md"
          draggable={false}
          alt=""
        />

        <h1 className="text-2xl text-white font-medium tracking-tight mb-8 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] text-center px-6">
          {isProvisioning ? headline : 'construct.computer'}
        </h1>

        {provisionError ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-red-400 font-medium max-w-sm text-center px-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{provisionErrorMessage(provisionError)}</span>
            </div>
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-full font-medium
                           glass-tooltip
                           border border-white/20
                           text-white
                           hover:bg-white/25
                           transition-colors duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            )}
          </div>
        ) : isProvisioning ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <svg
                className="animate-spin w-4 h-4 text-white/90"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <p className="text-sm font-medium text-white/90 tracking-wide">
                {progressLabel}
              </p>
            </div>
          </div>
        ) : isLocked ? (
          <p className="text-[13px] font-medium text-white/60 tracking-wide uppercase px-4 py-2 rounded-full glass-tooltip border border-white/10">
            Click to unlock
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin w-4 h-4 text-white/90"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-white/90 tracking-wide">
              {provisionSigningInLabel()}
            </p>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-xs text-white/40 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
          {provisionFooterTagline()}
        </p>
      </div>
    </div>
  );
}
