import { Monitor } from 'lucide-react';
import { useSettingsStore, getWallpaperBlurSrc } from '@/stores/settingsStore';
import constructLogo from '@/assets/logo.png';

/**
 * Full-screen overlay shown on mobile viewports.
 * Asks the user to open the app on a desktop instead.
 */
export function MobileBlockScreen() {
  const wallpaperSrc = getWallpaperBlurSrc(useSettingsStore((s) => s.wallpaperId));

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden">
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
      <div className="relative z-10 flex flex-col items-center select-none px-8 text-center">
        {/* Logo */}
        <img
          src={constructLogo}
          alt="construct.computer"
          className="w-20 h-20 mb-4 invert dark:invert-0"
          draggable={false}
        />

        {/* Name */}
        <h1
          className="text-xl text-black/90 dark:text-white mb-8"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          construct<span className="opacity-30 font-light">.</span><span className="font-light opacity-55">computer</span>
        </h1>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/15 dark:border-white/10 flex items-center justify-center mb-5">
          <Monitor className="w-7 h-7 text-black/60 dark:text-white/70" />
        </div>

        {/* Message */}
        <p
          className="text-base font-medium text-black/80 dark:text-white/85 mb-2"
          style={{}}
        >
          Desktop required
        </p>
        <p
          className="text-sm font-light text-black/55 dark:text-white/55 max-w-[280px] leading-relaxed"
          style={{}}
        >
          construct.computer is designed for larger screens. Please open it on a desktop or laptop.
        </p>
      </div>

      {/* Version — bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-xs text-black/50 dark:text-white/50
                      drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
          construct.computer v0.1.0
        </p>
      </div>
    </div>
  );
}
