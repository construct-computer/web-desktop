/**
 * Subtle haptic on supported devices; no-op if unsupported (desktop / older browsers).
 */
export function hapticLight() {
  try {
    if (globalThis.navigator && 'vibrate' in globalThis.navigator) {
      void globalThis.navigator.vibrate(12);
    }
  } catch {
    /* */
  }
}
