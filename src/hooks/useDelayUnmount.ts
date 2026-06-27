import { useEffect, useState } from 'react';

/**
 * Delays the unmounting of a component until an exit transition completes.
 * 
 * @param open - Whether the component is active/open.
 * @param delayTime - The delay in milliseconds before unmounting when open changes to false.
 * @returns An object containing shouldRender (whether to keep rendering) and isClosing (whether the exit animation is active).
 */
export function useDelayUnmount(open: boolean, delayTime: number) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (!isClosing) return;
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, delayTime);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isClosing, delayTime]);

  return { shouldRender, isClosing };
}
