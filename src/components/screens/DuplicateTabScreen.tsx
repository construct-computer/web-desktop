import { Monitor } from 'lucide-react';
import { useSettingsStore, getWallpaperBlurSrc } from '@/stores/settingsStore';
import { takeoverLeadership } from '@/lib/tabSingleton';
import constructLogo from '@/assets/logo.png';

/**
 * Shown when another browser tab already has the desktop open.
 * "Open Here" closes the other tab and opens the desktop in this one.
 */
export function DuplicateTabScreen() {
  const wallpaperSrc = getWallpaperBlurSrc(useSettingsStore((s) => s.wallpaperId));

  const handleOpenHere = async () => {
    await takeoverLeadership();
    // Force reload to boot the desktop fresh as the new leader
    window.location.reload();
  };

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
      {/* Wallpaper */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${wallpaperSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 backdrop-blur-md bg-black/10 dark:bg-black/30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center select-none w-full max-w-xs">
        {/* Logo */}
        <img
          src={constructLogo}
          alt="construct.computer"
          className="w-24 h-24 mb-5 invert dark:invert-0"
          draggable={false}
        />

        {/* Name */}
        <h1
          className="text-xl text-black/90 dark:text-white mb-6"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          construct<span className="opacity-30 font-light">.</span><span className="font-light opacity-55">computer</span>
        </h1>

        {/* Message */}
        <p
          className="text-sm text-center text-black/60 dark:text-white/60 mb-6 leading-relaxed"
        >
          Your desktop is already open in another tab.
        </p>

        {/* Open Here button */}
        <button
          onClick={handleOpenHere}
          className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg
                     bg-white/60 dark:bg-white/12 backdrop-blur-xl
                     border border-black/10 dark:border-white/15
                     text-black/80 dark:text-white/90
                     hover:bg-white/80 dark:hover:bg-white/20
                     transition-colors duration-200
                     shadow-sm"
        >
          <Monitor className="w-4 h-4" />
          Open Here
        </button>
      </div>

      {/* Version */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-xs text-black/40 dark:text-white/30
                      drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
          construct.computer v0.1.0
        </p>
      </div>
    </div>
  );
}
