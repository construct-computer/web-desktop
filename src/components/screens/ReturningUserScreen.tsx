import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useSettingsStore, getWallpaperSrc } from '@/stores/settingsStore';
import { BootProgressBar } from '@/components/ui';
import constructVideo from '@/assets/construct/loader.webm';

const BOOT_STEPS = [
  'Connecting to server...',
  'Creating your container...',
  'Starting services...',
  'Initializing desktop...',
  'Almost ready...',
];

interface ReturningUserScreenProps {
  /** If provided, shows "Click to unlock" — user explicitly locked the screen */
  onUnlock?: () => void;
  /** Container is being provisioned */
  isProvisioning?: boolean;
  /** Container provisioning failed */
  provisionError?: string | null;
  /** Retry provisioning */
  onRetry?: () => void;
}

/**
 * Lock screen for authenticated users.
 *
 * Three modes:
 * - Provisioning: spinner + progress steps while container starts up
 * - Locked (onUnlock): "Click to unlock"
 * - Error: provision failed, retry button
 */
export function ReturningUserScreen({ onUnlock, isProvisioning, provisionError, onRetry }: ReturningUserScreenProps) {
  const isLocked = !!onUnlock;
  const videoRef = useRef<HTMLVideoElement>(null);

  const replayVideo = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play();
    }
  }, []);

  // macOS lockscreen logic: crisp wallpaper by default, blurred when "wake" happens.
  const [woken, setWoken] = useState(false);
  
  // Real-time clock for the lockscreen
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // Boot step cycling during provisioning
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isProvisioning) return;
    setWoken(true); // force wake state during provisioning
    setStepIndex(0);
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, BOOT_STEPS.length - 1));
    }, 2500);
    return () => clearInterval(interval);
  }, [isProvisioning]);

  useEffect(() => {
    if (provisionError) setWoken(true); // force wake mode on error
  }, [provisionError]);

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      onClick={() => {
        if (!woken) setWoken(true);
        replayVideo();
        if (isLocked && onUnlock) onUnlock();
      }}
      onMouseMove={() => {
        if (!woken && isLocked) setWoken(true);
      }}
      style={{ cursor: isLocked ? 'pointer' : undefined }}
    >
      {/* Crisp Wallpaper transforming to blurred glass */}
      <div
        className="absolute inset-0 transition-all duration-700 ease-out"
        style={{
          backgroundImage: `url(${getWallpaperSrc(useSettingsStore((s) => s.wallpaperId))})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: woken || !isLocked ? 'blur(24px) saturate(1.5)' : 'blur(0px) saturate(1)',
          transform: woken || !isLocked ? 'scale(1.03)' : 'scale(1)'
        }}
      />
      
      {/* Dark overlay that fades in upon wake */}
      <div 
        className="absolute inset-0 transition-opacity duration-700 bg-black/20" 
        style={{ opacity: woken || !isLocked ? 1 : 0 }} 
      />

      {/* Clock at top (visible when sleeping) */}
      <div 
        className="absolute top-24 flex flex-col items-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-all duration-700 ease-in-out select-none"
        style={{ 
          opacity: woken || !isLocked ? 0 : 1,
          transform: woken || !isLocked ? 'translateY(-20px)' : 'translateY(0)',
          pointerEvents: 'none'
        }}
      >
        <h2 className="text-[22px] font-medium tracking-wide mb-1 opacity-90">{dateStr}</h2>
        <h1 className="text-[88px] font-bold tracking-tight leading-none">{timeStr}</h1>
      </div>

      {/* Content — Avatar and Status */}
      <div 
        className="relative z-10 flex flex-col items-center select-none transition-all duration-700 ease-out"
        style={{
          opacity: woken || !isLocked ? 1 : 0,
          transform: woken || !isLocked ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          pointerEvents: woken || !isLocked ? 'auto' : 'none'
        }}
      >
        {/* Profile Avatar */}
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) el.playbackRate = 2;
          }}
          src={constructVideo}
          autoPlay
          muted
          playsInline
          className="w-24 h-24 mb-5 drop-shadow-md transition-all duration-500"
          draggable={false}
        />

        {/* Name */}
        <h1 className="text-2xl text-white font-medium tracking-tight mb-8 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
          construct.computer
        </h1>

        {provisionError ? (
          /* Error state */
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-red-400 font-medium">
              <AlertCircle className="w-4 h-4" />
              <span style={{}}>{provisionError}</span>
            </div>
            {onRetry && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-full font-medium
                           bg-white/15 backdrop-blur-3xl
                           border border-white/20
                           text-white
                           hover:bg-white/25
                           transition-colors duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
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
              <p
                className="text-sm font-medium text-white/90 tracking-wide"
                style={{}}
              >
                {BOOT_STEPS[stepIndex]}
              </p>
            </div>
            <BootProgressBar />
          </div>
        ) : isLocked ? (
          /* Locked mode — click to unlock */
          <p
            className="text-[13px] font-medium text-white/60 tracking-wide uppercase px-4 py-2 rounded-full bg-black/20 backdrop-blur-xl border border-white/10"
            style={{}}
          >
            Click to unlock
          </p>
        ) : (
          /* Brief auto-login spinner (before provisioning state kicks in) */
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin w-4 h-4 text-white/90"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p
              className="text-sm font-medium text-white/90 tracking-wide"
              style={{}}
            >
              Logging in...
            </p>
          </div>
        )}
      </div>

      {/* Version — bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-xs text-white/40 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
          construct.computer v0.1.0
        </p>
      </div>
    </div>
  );
}
