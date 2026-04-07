import { useState, useEffect, useRef } from 'react';
import { useSettingsStore, getWallpaperBlurSrc } from '@/stores/settingsStore';
import { useSound } from '@/hooks/useSound';
import logoImg from '@/assets/construct-logo.png';

interface GoodbyeScreenProps {
  /** Called when the full animation finishes and screen is black */
  onComplete: () => void;
  /** Called once the screen is opaque enough to start the actual shutdown work */
  onShutdownStart: () => void;
}

/**
 * Cinematic shutdown screen — mirrors the WelcomeScreen in reverse.
 *
 * Phase 1: Overlay fades in over desktop, wallpaper desaturates to black-and-white
 * Phase 2: "goodbye" text — handwriting reveal with colorful gradient that
 *          desaturates to grayscale over 5 seconds (mirrors "hello" style)
 * Phase 3: "goodbye" fades out, brand + "See you next time" appears briefly
 * Phase 4: Everything fades to solid black → onComplete
 */
export function GoodbyeScreen({ onComplete, onShutdownStart }: GoodbyeScreenProps) {
  const wallpaperSrc = getWallpaperBlurSrc(useSettingsStore((s) => s.wallpaperId));
  const { play } = useSound();

  // Animation phases
  const [overlayIn, setOverlayIn] = useState(false);
  const [desaturated, setDesaturated] = useState(false);
  const [goodbyeIn, setGoodbyeIn] = useState(false);
  const [goodbyeOut, setGoodbyeOut] = useState(false);
  const [showGoodbye, setShowGoodbye] = useState(true);
  const [showBrand, setShowBrand] = useState(false);
  const [brandIn, setBrandIn] = useState(false);
  const [brandOut, setBrandOut] = useState(false);
  const [fadeToBlack, setFadeToBlack] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onShutdownStartRef = useRef(onShutdownStart);
  onShutdownStartRef.current = onShutdownStart;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    // Play goodbye sound after 500ms delay
    t(() => play('goodbye', 0.69), 500);

    // Phase 1: overlay + desaturate wallpaper
    t(() => setOverlayIn(true), 50);
    t(() => setDesaturated(true), 150);

    // Fire the actual shutdown call once the overlay is opaque
    t(() => onShutdownStartRef.current(), 300);

    // Phase 2: "goodbye" text — handwriting reveal + gradient desaturates over 3s
    t(() => setGoodbyeIn(true), 500);
    // goodbye stays visible for 2s, then fades out
    t(() => setGoodbyeOut(true), 2500);
    t(() => setShowGoodbye(false), 2900);

    // Phase 3: brand reveal
    t(() => setShowBrand(true), 3000);
    t(() => setBrandIn(true), 3100);
    t(() => setBrandOut(true), 4200);

    // Phase 4: fade to black
    t(() => setFadeToBlack(true), 4400);
    t(() => onCompleteRef.current(), 5500);

    return () => timers.forEach(clearTimeout);
  }, []);

  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div className="fixed inset-0" style={{ zIndex: 99999 }}>
      {/* Wallpaper base — desaturates from color to B&W */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${wallpaperSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: desaturated ? 'grayscale(1) brightness(0.4)' : 'grayscale(0) brightness(1)',
          transition: 'filter 2.5s ease-in-out',
        }}
      />

      {/* Dark scrim — fades in, then to solid black */}
      <div
        className="absolute inset-0 backdrop-blur-3xl"
        style={{
          backgroundColor: fadeToBlack ? 'rgba(0,0,0,1)' : overlayIn ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0)',
          transition: fadeToBlack
            ? 'background-color 1.5s ease-in'
            : 'background-color 1.2s ease-in-out',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
          opacity: overlayIn ? 1 : 0,
          transition: `opacity 1s ${ease}`,
        }}
      />

      {/* Content — centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* "goodbye" text — hello-style with handwriting reveal + color-to-grayscale gradient */}
        {showGoodbye && (
          <h1
            className="hello-cursive select-none relative z-10"
            style={{
              fontSize: 'clamp(4rem, 13vw, 11rem)',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              padding: '0.3em 0.5em',
              // Same warm palette as "hello" — starts colorful, desaturates via animation
              background: 'linear-gradient(90deg, #EF4444 0%, #FB923C 20%, #EF4444 38%, #FB923C 48%, #C4A030 55%, #39FF14 65%, #00FF66 75%, #39FF14 88%, #00FF66 100%)',
              backgroundSize: '250% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              // Handwriting mask — soft-edge sweep left to right
              ...(goodbyeIn ? {
                WebkitMaskImage: 'linear-gradient(to right, black calc(var(--goodbye-reveal) - 6%), transparent var(--goodbye-reveal))',
                maskImage: 'linear-gradient(to right, black calc(var(--goodbye-reveal) - 6%), transparent var(--goodbye-reveal))',
              } : {}),
              // Handwriting reveal (1.8s) + gradient desaturation (2s)
              animation: goodbyeIn
                ? 'goodbye-gradient 2s ease-in-out forwards, goodbye-write 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                : 'none',
              opacity: goodbyeOut ? 0 : goodbyeIn ? 1 : 0,
              transform: goodbyeOut ? 'translateY(-24px)' : 'none',
              transition: goodbyeOut
                ? 'opacity 0.7s ease-in, transform 0.7s ease-in'
                : 'opacity 0.15s ease-out',
            }}
          >
            goodbye
          </h1>
        )}

        {/* Brand reveal */}
        {showBrand && (
          <div
            className="flex flex-col items-center select-none relative z-10"
            style={{
              opacity: brandOut ? 0 : brandIn ? 1 : 0,
              transform: brandOut ? 'translateY(-12px) scale(0.98)' : brandIn ? 'translateY(0) scale(1)' : 'translateY(12px) scale(1)',
              transition: brandOut
                ? 'opacity 0.8s ease-in, transform 0.8s ease-in'
                : `opacity 0.7s ${ease}, transform 0.7s ${ease}`,
            }}
          >
            <img
              src={logoImg}
              alt=""
              className="w-24 h-24 mb-6 invert dark:invert-0 drop-shadow-md transition-all duration-500"
              draggable={false}
            />
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 400,
                letterSpacing: '0.15em',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              See you next time
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
