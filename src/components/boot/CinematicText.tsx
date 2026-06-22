import { useEffect, useRef, useState } from 'react';
import { useEffectiveWallpaperId, useWallpaperBlurUrl } from '@/hooks/useWallpaperUrl';
import { CrossfadeWallpaper } from '@/components/desktop/CrossfadeWallpaper';

const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

const HELLO_FONT_SIZE = 'clamp(5rem, 15vw, 13rem)';

const HELLO_GRADIENT_STYLE = {
  fontSize: HELLO_FONT_SIZE,
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
  padding: '0.15em 0.1em',
  background: 'linear-gradient(90deg, #EF4444 0%, #FB923C 20%, #EF4444 38%, #FB923C 48%, #C4A030 55%, #39FF14 65%, #00FF66 75%, #39FF14 88%, #00FF66 100%)',
  backgroundSize: '250% 100%',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const;

interface CinematicTextProps {
  variant: 'hello' | 'welcome';
  onComplete?: () => void;
  onFadeStart?: () => void;
  showWallpaper?: boolean;
  embedded?: boolean;
}

export function CinematicText({
  variant,
  onComplete,
  onFadeStart,
  showWallpaper = true,
  embedded = false,
}: CinematicTextProps) {
  const wallpaperId = useEffectiveWallpaperId();
  const { url: wallpaperSrc } = useWallpaperBlurUrl(wallpaperId);
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onFadeStartRef = useRef(onFadeStart);
  onCompleteRef.current = onComplete;
  onFadeStartRef.current = onFadeStart;
  const prefersReducedMotion =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const text = variant === 'hello' ? 'hello' : 'welcome';

  useEffect(() => {
    if (prefersReducedMotion) {
      const t = window.setTimeout(() => {
        onFadeStartRef.current?.();
        onCompleteRef.current?.();
      }, 400);
      return () => window.clearTimeout(t);
    }
    const t1 = window.setTimeout(() => setVisible(true), 200);
    const t2 = window.setTimeout(() => {
      setFadingOut(true);
      onFadeStartRef.current?.();
    }, 2200);
    const t3 = window.setTimeout(() => onCompleteRef.current?.(), 2800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [prefersReducedMotion]);

  const word = (
    <h1
      className="hello-cursive select-none relative z-10"
      style={{
        ...HELLO_GRADIENT_STYLE,
        ...(visible && !fadingOut ? {
          WebkitMaskImage: 'linear-gradient(to right, black calc(var(--hello-reveal) - 6%), transparent var(--hello-reveal))',
          maskImage: 'linear-gradient(to right, black calc(var(--hello-reveal) - 6%), transparent var(--hello-reveal))',
        } : fadingOut ? {
          // Keep full text visible; mask was tied to write animation
          WebkitMaskImage: 'none',
          maskImage: 'none',
        } : {}),
        animation: visible
          ? 'hello-gradient 7s ease-out forwards, hello-write 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          : undefined,
        animationPlayState: fadingOut ? 'paused' : 'running',
        opacity: fadingOut ? 0 : visible ? 1 : 0,
        transform: fadingOut ? 'translateY(-24px)' : 'none',
        transition: fadingOut ? `opacity 0.5s ease-in, transform 0.5s ${ease}` : 'opacity 0.15s ease-out',
      }}
    >
      {text}
    </h1>
  );

  if (prefersReducedMotion) {
    if (embedded) {
      return (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="hello-cursive text-6xl text-white">{text}</p>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
        <p className="hello-cursive text-6xl text-white">{text}</p>
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        {word}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden">
      {showWallpaper && (
        <>
          <div className="absolute inset-0" style={{ filter: 'blur(16px) saturate(1.2)', transform: 'scale(1.02)' }}>
            <CrossfadeWallpaper url={wallpaperSrc} />
          </div>
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}
      {word}
    </div>
  );
}
