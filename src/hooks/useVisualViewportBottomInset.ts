import { useEffect, useState } from 'react';

/**
 * Pixels the visual viewport is inset from the bottom of the layout viewport,
 * e.g. when the on-screen keyboard is open (iOS / Android) or the browser
 * UI shifts the visible area.
 */
export function useVisualViewportBottomInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = globalThis.window?.visualViewport;
    if (!vv) return;

    const update = () => {
      // Space between the bottom of the layout viewport and the bottom of
      // the visual viewport (keyboard, foldables, address bar, etc.)
      setInset(
        Math.max(0, globalThis.window.innerHeight - vv.height - vv.offsetTop),
      );
    };

    update();
    vv.addEventListener('resize', update, { passive: true });
    vv.addEventListener('scroll', update, { passive: true });
    globalThis.window.addEventListener('resize', update, { passive: true });
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      globalThis.window.removeEventListener('resize', update);
    };
  }, []);

  return inset;
}
