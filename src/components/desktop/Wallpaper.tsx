import { useSettingsStore } from '@/stores/settingsStore';
import { useWallpaperUrl } from '@/hooks/useWallpaperUrl';

export function Wallpaper() {
  const wallpaperId = useSettingsStore((s) => s.wallpaperId);
  const { url } = useWallpaperUrl(wallpaperId);

  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: 0,
      }}
    />
  );
}
