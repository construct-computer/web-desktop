import { useEffect, useState } from 'react';

/**
 * Delays the unmounting of a component until an exit transition completes.
 * 
 * @param open - Whether the component is active/open.
 * @param delayTime - The delay in milliseconds before unmounting when open changes to false.
 * @returns An object containing shouldRender (whether to keep rendering) and isClosing (whether the exit animation is active).
 */
export function useDelayUnmount(open: boolean, delayTime: number) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    let timeoutId: number;
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      timeoutId = window.setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, delayTime);
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [open, shouldRender, delayTime]);

  return { shouldRender, isClosing };
}
