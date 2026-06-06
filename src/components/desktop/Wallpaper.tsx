import { CrossfadeWallpaper } from '@/components/desktop/CrossfadeWallpaper';
import { useEffectiveWallpaperId, useWallpaperUrl } from '@/hooks/useWallpaperUrl';

export function Wallpaper() {
  const wallpaperId = useEffectiveWallpaperId();
  const { url } = useWallpaperUrl(wallpaperId);

  return <CrossfadeWallpaper url={url} />;
}
