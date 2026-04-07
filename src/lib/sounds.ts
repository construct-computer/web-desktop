// Sound effect types
export type SoundEffect = 
  | 'click'
  | 'open'
  | 'close'
  | 'minimize'
  | 'maximize'
  | 'error'
  | 'notification'
  | 'startup'
  | 'hello'
  | 'goodbye';

// Sound file paths (only sounds that actually exist on disk)
const soundPaths: Partial<Record<SoundEffect, string>> = {
  click: '/sounds/click.mp3',
  error: '/sounds/error.mp3',
  notification: '/sounds/notification.mp3',
  startup: '/sounds/startup.mp3',
  hello: '/sounds/hello.mp3',
  goodbye: '/sounds/goodbye.mp3',
};

// Default volume (0-1)
const DEFAULT_VOLUME = 0.3;

// Web Audio API state
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
const bufferCache = new Map<SoundEffect, AudioBuffer>();
let precacheStarted = false;

// Queue of sounds requested before AudioContext was unlocked
const pendingPlays: Array<{ sound: SoundEffect; volume: number }> = [];

/**
 * Get or create the AudioContext. Browsers require this to be created
 * from a user gesture, so we lazily init on first interaction.
 */
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

/**
 * Resume the AudioContext if suspended (browser autoplay policy).
 * Returns true if the context is running.
 */
async function ensureResumed(): Promise<boolean> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/**
 * Fetch and decode a single sound into an AudioBuffer.
 */
async function fetchAndDecode(sound: SoundEffect): Promise<void> {
  if (bufferCache.has(sound)) return;
  const path = soundPaths[sound];
  if (!path) return; // sound effect has no file — skip silently
  try {
    const resp = await fetch(path);
    if (!resp.ok) return;
    const arrayBuf = await resp.arrayBuffer();
    const ctx = getAudioContext();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    bufferCache.set(sound, audioBuf);
  } catch {
    // Silently ignore — sound just won't play
  }
}

/**
 * Preload all sound effects — fetches mp3s and decodes into AudioBuffers.
 * Safe to call multiple times; only runs once.
 */
export function preloadAllSounds(): void {
  if (precacheStarted) return;
  precacheStarted = true;

  // Create context eagerly so decodeAudioData works
  getAudioContext();

  // Fetch all in parallel
  const names = Object.keys(soundPaths) as SoundEffect[];
  Promise.all(names.map(fetchAndDecode)).catch(() => {});
}

/**
 * Play a sound effect instantly from the pre-decoded buffer.
 */
export function playSound(sound: SoundEffect, volume = DEFAULT_VOLUME): void {
  try {
    const ctx = getAudioContext();

    // If context is suspended, queue and try to resume
    if (ctx.state === 'suspended') {
      // Only queue if not already queued
      if (pendingPlays.length < 8) {
        pendingPlays.push({ sound, volume });
      }
      ctx.resume().catch(() => {});
      return;
    }

    const buffer = bufferCache.get(sound);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Per-sound volume via a temporary gain node
    const vol = ctx.createGain();
    vol.gain.value = volume;
    source.connect(vol);
    vol.connect(ctx.destination);

    source.start(0);
  } catch {
    // Ignore errors
  }
}

/**
 * Flush any sounds that were queued while AudioContext was suspended.
 * Call this after user interaction unlocks audio.
 */
function flushPending(): void {
  if (pendingPlays.length === 0) return;
  const copy = [...pendingPlays];
  pendingPlays.length = 0;
  for (const { sound, volume } of copy) {
    playSound(sound, volume);
  }
}

/**
 * Unlock audio on first user interaction. Call once at app startup.
 * Listens for click/keydown/touchstart, resumes AudioContext, then
 * flushes any queued sounds.
 */
export function unlockAudio(): void {
  const events = ['click', 'keydown', 'touchstart'] as const;

  function handler() {
    ensureResumed().then((ok) => {
      if (ok) {
        events.forEach((e) => document.removeEventListener(e, handler, true));
        flushPending();
      }
    });
  }

  events.forEach((e) => document.addEventListener(e, handler, { capture: true, once: false }));
}

/**
 * Install a global click-sound listener via event delegation.
 * Plays the "click" sound for any interactive element (button, link, input, etc.).
 * Uses a short cooldown so components that already call play('click') don't double-fire.
 *
 * @param isEnabled — function that returns whether sounds are currently enabled
 * @returns cleanup function to remove the listener
 */
export function installGlobalClickSound(isEnabled: () => boolean): () => void {
  let lastPlayedAt = 0;
  const COOLDOWN_MS = 60; // ignore rapid duplicate plays

  /** Check whether an element (or an ancestor) is interactive / clickable. */
  function isInteractive(el: HTMLElement | null): boolean {
    while (el) {
      const tag = el.tagName;
      if (
        tag === 'BUTTON' ||
        tag === 'A' ||
        tag === 'SELECT' ||
        tag === 'SUMMARY' ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('role') === 'menuitem' ||
        el.getAttribute('role') === 'tab' ||
        el.getAttribute('role') === 'option' ||
        (tag === 'INPUT' && ['checkbox', 'radio', 'submit', 'reset', 'button'].includes(
          (el as HTMLInputElement).type,
        ))
      ) {
        return true;
      }
      // Stop at common boundaries so we don't walk the entire DOM
      if (tag === 'BODY' || tag === 'HTML') break;
      el = el.parentElement;
    }
    return false;
  }

  function handler(e: MouseEvent) {
    if (!isEnabled()) return;
    if (!isInteractive(e.target as HTMLElement)) return;

    const now = performance.now();
    if (now - lastPlayedAt < COOLDOWN_MS) return;
    lastPlayedAt = now;

    playSound('click');
  }

  document.addEventListener('click', handler, { capture: true });
  return () => document.removeEventListener('click', handler, { capture: true });
}
