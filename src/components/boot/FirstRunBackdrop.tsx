import { useEffectiveWallpaperId, useWallpaperBlurUrl } from '@/hooks/useWallpaperUrl';
import { CrossfadeWallpaper } from '@/components/desktop/CrossfadeWallpaper';

interface FirstRunBackdropProps {
  children: React.ReactNode;
}

export function FirstRunBackdrop({ children }: FirstRunBackdropProps) {
  const wallpaperId = useEffectiveWallpaperId();
  const { url: wallpaperSrc } = useWallpaperBlurUrl(wallpaperId);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-0 md:p-6">
      <div
        className="absolute inset-0"
        style={{ filter: 'blur(16px) saturate(1.2)', transform: 'scale(1.02)' }}
      >
        <CrossfadeWallpaper url={wallpaperSrc} />
      </div>
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 glass-scrim opacity-30 pointer-events-none" />
      <div className="relative z-10 w-full h-full md:h-auto md:w-auto flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
