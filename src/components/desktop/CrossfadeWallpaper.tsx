import { useEffect, useRef, useState } from 'react';
import { runDeferredWallpaperCacheClear } from '@/lib/wallpaperCache';
import { clearSessionWallpaper } from '@/lib/wallpaperSession';

const CROSSFADE_MS = 700;

/** Survives LoginScreen ↔ ReturningUserScreen remounts within the same page session. */
let lastWallpaperUrl: string | null = null;

interface WallpaperLayer {
  id: number;
  url: string;
  opacity: number;
}

interface CrossfadeWallpaperProps {
  url: string;
  className?: string;
}

export function CrossfadeWallpaper({ url, className = 'absolute inset-0' }: CrossfadeWallpaperProps) {
  const layerIdRef = useRef(0);
  const [layers, setLayers] = useState<WallpaperLayer[]>(() => {
    if (!url) return [];
    lastWallpaperUrl = url;
    return [{ id: 0, url, opacity: 1 }];
  });

  useEffect(() => {
    if (!url) return;

    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top?.url === url) return prev;

      const previousUrl = top?.url ?? lastWallpaperUrl;
      if (!previousUrl || previousUrl === url) {
        lastWallpaperUrl = url;
        if (previousUrl === url) {
          runDeferredWallpaperCacheClear();
        }
        return [{ id: ++layerIdRef.current, url, opacity: 1 }];
      }

      const bottomId = ++layerIdRef.current;
      const topId = ++layerIdRef.current;
      return [
        { id: bottomId, url: previousUrl, opacity: 1 },
        { id: topId, url, opacity: 0 },
      ];
    });
  }, [url]);

  useEffect(() => {
    const pending = layers.find((layer) => layer.opacity === 0);
    if (!pending || layers.length < 2) return;

    const frame = requestAnimationFrame(() => {
      setLayers((prev) =>
        prev.map((layer) => (layer.id === pending.id ? { ...layer, opacity: 1 } : layer)),
      );
    });

    const timer = window.setTimeout(() => {
      lastWallpaperUrl = url;
      setLayers([{ id: pending.id, url, opacity: 1 }]);
      clearSessionWallpaper();
      runDeferredWallpaperCacheClear();
    }, CROSSFADE_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [layers, url]);

  if (!url || layers.length === 0) return null;

  return (
    <div className={className}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${layer.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: layer.opacity,
            transition: layers.length > 1 ? `opacity ${CROSSFADE_MS}ms ease-out` : undefined,
          }}
        />
      ))}
    </div>
  );
}
