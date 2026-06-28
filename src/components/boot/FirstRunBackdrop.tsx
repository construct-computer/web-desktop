import { useEffectiveWallpaperId, useWallpaperUrl } from '@/hooks/useWallpaperUrl';
import { CrossfadeWallpaper } from '@/components/desktop/CrossfadeWallpaper';

interface FirstRunBackdropProps {
  children: React.ReactNode;
}

export function FirstRunBackdrop({ children }: FirstRunBackdropProps) {
  const wallpaperId = useEffectiveWallpaperId();
  const { url: wallpaperSrc } = useWallpaperUrl(wallpaperId);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-0 md:p-6">
      <CrossfadeWallpaper url={wallpaperSrc} />
      <div className="relative z-10 w-full h-full md:h-auto md:w-auto flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
