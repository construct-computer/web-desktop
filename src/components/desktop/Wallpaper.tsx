import { useSettingsStore, getWallpaperSrc } from '@/stores/settingsStore';

export function Wallpaper() {
  const wallpaperId = useSettingsStore((s) => s.wallpaperId);
  // Subscribe to rev so custom wallpaper changes trigger re-render
  const _rev = useSettingsStore((s) => s.wallpaperRev);

  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `url(${getWallpaperSrc(wallpaperId)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: 0,
      }}
    />
  );
}
