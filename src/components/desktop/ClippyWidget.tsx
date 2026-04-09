import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useAuthStore } from '@/stores/authStore';
import { useAgentStateLabel } from '@/hooks/useAgentStateLabel';
import { Z_INDEX } from '@/lib/constants';
import avatarSrc from '@/assets/widget.png';
import constructVideo from '@/assets/construct/loader.webm';
import eyesGif from '@/assets/construct/eyes.gif';

// ── Position logic (two states: center or corner) ───────────────────
//
// No windows → center of screen (welcoming presence)
// Windows open → bottom-right corner (out of the way)
// User can drag it anywhere, but when window state changes
// and it's near center, it auto-slides to corner.

const CENTER_POS = { rx: 0.5, ry: 0.5 };
const CORNER_POS = { rx: 0.93, ry: 0.85 };

/** Check if position is "near center" (within 20% of center). */
function isNearCenter(rx: number, ry: number): boolean {
  return Math.abs(rx - 0.5) < 0.2 && Math.abs(ry - 0.5) < 0.2;
}

// ── Constants ───────────────────────────────────────────────────────

type ClippyState = 'idle' | 'thinking' | 'working' | 'success' | 'error';
const AVATAR_SIZE = 112;

// ── Animation system ─────────────────────────────────────────────────
//
// Each state has a distinct motion personality. All parameters are
// continuously lerped toward their target each frame, so switching
// between any two states produces smooth, organic crossfades.
//
// The blob image never changes — all state communication is through
// motion character and glow color:
//
//   idle     → slow, peaceful breathing float. no glow. a resting pet.
//   thinking → gentle side-to-side sway + head tilt. soft blue glow.
//   working  → rhythmic purposeful bounce. steady brighter blue glow.
//   success  → happy celebratory bounce. bright green glow.
//   error    → slow uneasy sway, slightly dim. soft red glow.

interface AnimParams {
  bobAmp: number;         // vertical float amplitude (px)
  bobSpeed: number;       // ms per full bob cycle
  swayAmp: number;        // horizontal sway amplitude (px)
  swaySpeed: number;      // ms per full sway cycle
  pulseAmp: number;       // scale oscillation (0.01 = ±1%)
  pulseSpeed: number;     // ms per full pulse cycle
  rotateAmp: number;      // tilt wobble amplitude (degrees)
  rotateSpeed: number;    // ms per full rotation cycle
  squashAmp: number;      // squash-stretch factor (synced to bob)
  glowRadius: number;     // base drop-shadow spread (px)
  glowPulse: number;      // glow size oscillation (px)
  brightness: number;     // base brightness (1.0 = normal)
  ringR: number;          // glow color
  ringG: number;
  ringB: number;
  ringA: number;
}

const STATE_PARAMS: Record<ClippyState, AnimParams> = {
  // Peaceful breathing — like a sleeping pet
  idle: {
    bobAmp: 1.8,   bobSpeed: 5500,
    swayAmp: 0,    swaySpeed: 5000,
    pulseAmp: 0,   pulseSpeed: 5000,
    rotateAmp: 0,  rotateSpeed: 5000,
    squashAmp: 0.003,
    glowRadius: 0, glowPulse: 0,
    brightness: 1.0,
    ringR: 0, ringG: 0, ringB: 0, ringA: 0,
  },
  // Contemplative sway — "hmm, let me think..."
  thinking: {
    bobAmp: 0.8,   bobSpeed: 5000,
    swayAmp: 1.5,  swaySpeed: 3800,    // gentle side-to-side
    pulseAmp: 0.008, pulseSpeed: 3800,  // subtle breathing
    rotateAmp: 2.0, rotateSpeed: 3800,  // synced with sway → head tilt
    squashAmp: 0.002,
    glowRadius: 7,  glowPulse: 3,      // soft pulsing blue
    brightness: 1.02,
    ringR: 130, ringG: 180, ringB: 255, ringA: 0.5,
  },
  // Purposeful bounce — busy and productive
  working: {
    bobAmp: 2.2,   bobSpeed: 2400,     // faster rhythmic bounce
    swayAmp: 0,    swaySpeed: 4000,
    pulseAmp: 0.01, pulseSpeed: 2400,   // synced with bob → bouncy
    rotateAmp: 0,  rotateSpeed: 4000,
    squashAmp: 0.006,                   // pronounced squash on bounce
    glowRadius: 10, glowPulse: 2,      // steady bright blue
    brightness: 1.03,
    ringR: 80, ringG: 150, ringB: 255, ringA: 0.65,
  },
  // Happy celebration — brief joyful bounce (plays ~2.2s then → idle)
  success: {
    bobAmp: 2.8,   bobSpeed: 1600,     // quick happy bounce
    swayAmp: 0,    swaySpeed: 4000,
    pulseAmp: 0.02, pulseSpeed: 1600,   // synced with bob → bouncy pop
    rotateAmp: 0,  rotateSpeed: 4000,
    squashAmp: 0.008,                   // exaggerated squash-stretch
    glowRadius: 16, glowPulse: 4,      // bright green halo
    brightness: 1.06,
    ringR: 52, ringG: 211, ringB: 153, ringA: 0.8,
  },
  // Uneasy/concerned — something is wrong
  error: {
    bobAmp: 0.4,   bobSpeed: 6000,     // very slow droopy breathing
    swayAmp: 0.8,  swaySpeed: 2000,    // slow nervous sway
    pulseAmp: 0,   pulseSpeed: 4000,
    rotateAmp: 0.8, rotateSpeed: 2200,  // slight uneasy tilt
    squashAmp: 0.001,
    glowRadius: 8, glowPulse: 2,       // soft red glow
    brightness: 0.93,                   // noticeably dimmer
    ringR: 239, ringG: 68, ringB: 68, ringA: 0.6,
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Bubble-only CSS (injected once) ─────────────────────────────────

const BUBBLE_STYLES = `
/* ── Appear: comic "pop" with bounce + wobble ── */
@keyframes clippy-bubble-in {
  0%   { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.15) rotate(-4deg); }
  40%  { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.12) rotate(1.5deg); }
  60%  { transform: translateX(-50%) translateY(2px) scale(0.95) rotate(-1deg); }
  75%  { transform: translateX(-50%) translateY(-1px) scale(1.04) rotate(0.5deg); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) rotate(0deg); }
}
@keyframes clippy-bubble-in-below {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.15) rotate(4deg); }
  40%  { opacity: 1; transform: translateX(-50%) translateY(4px) scale(1.12) rotate(-1.5deg); }
  60%  { transform: translateX(-50%) translateY(-2px) scale(0.95) rotate(1deg); }
  75%  { transform: translateX(-50%) translateY(1px) scale(1.04) rotate(-0.5deg); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) rotate(0deg); }
}
/* ── Disappear: cartoonish deflate + poof ── */
@keyframes clippy-bubble-out {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) rotate(0deg); }
  30%  { opacity: 1; transform: translateX(-50%) translateY(-3px) scaleY(1.08) scaleX(0.94) rotate(1deg); }
  100% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.3) rotate(-3deg); }
}
@keyframes clippy-bubble-out-below {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) rotate(0deg); }
  30%  { opacity: 1; transform: translateX(-50%) translateY(3px) scaleY(1.08) scaleX(0.94) rotate(-1deg); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.3) rotate(3deg); }
}
/* ── Welcome: bigger overshoot + wiggle ── */
@keyframes clippy-welcome-in {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.08) rotate(-6deg); }
  30%  { opacity: 1; transform: translateX(-50%) scale(1.18) rotate(2deg); }
  50%  { transform: translateX(-50%) scale(0.92) rotate(-1.5deg); }
  65%  { transform: translateX(-50%) scale(1.06) rotate(0.8deg); }
  80%  { transform: translateX(-50%) scale(0.98) rotate(-0.3deg); }
  100% { opacity: 1; transform: translateX(-50%) scale(1) rotate(0deg); }
}
@keyframes clippy-welcome-in-below {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.08) rotate(6deg); }
  30%  { opacity: 1; transform: translateX(-50%) scale(1.18) rotate(-2deg); }
  50%  { transform: translateX(-50%) scale(0.92) rotate(1.5deg); }
  65%  { transform: translateX(-50%) scale(1.06) rotate(-0.8deg); }
  80%  { transform: translateX(-50%) scale(0.98) rotate(0.3deg); }
  100% { opacity: 1; transform: translateX(-50%) scale(1) rotate(0deg); }
}
/* ── Idle float: subtle breathing while visible ── */
@keyframes clippy-bubble-float {
  0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
  50%      { transform: translateX(-50%) translateY(-2px) rotate(0.3deg); }
}`;

function injectStyles() {
  const id = 'clippy-widget-styles';
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = BUBBLE_STYLES;
    document.head.appendChild(style);
  }
}

// ── rAF-driven animation ─────────────────────────────────────────────
//
// Writes transform + filter directly to the DOM element ref each frame
// (no React re-renders). All numeric params lerp toward their target
// with frame-rate-independent exponential decay (0.97^(dt/16) ≈ 1.4s
// to reach 95% of target). drop-shadow hugs the blob's transparent
// silhouette for a natural colored glow.

function useClippyAnimation(
  avatarRef: React.RefObject<HTMLDivElement | null>,
  state: ClippyState,
  hoverRef: { current: boolean },
) {
  const currentRef = useRef<AnimParams>({ ...STATE_PARAMS.idle });
  const targetRef = useRef<AnimParams>({ ...STATE_PARAMS.idle });
  const lastTimeRef = useRef(0);
  const hoverScaleRef = useRef(1);
  const rafRef = useRef(0);

  // Phase accumulators — advance by dt/speed each frame instead of
  // using absolute time/speed. This prevents the sin waves from going
  // haywire when speed values change during state transitions.
  const phaseRef = useRef({ bob: 0, sway: 0, pulse: 0, rotate: 0 });

  useEffect(() => {
    targetRef.current = { ...STATE_PARAMS[state] };
  }, [state]);

  useEffect(() => {
    let active = true;

    function frame(time: number) {
      if (!active) return;
      const el = avatarRef.current;
      if (!el) { rafRef.current = requestAnimationFrame(frame); return; }

      const dt = lastTimeRef.current ? Math.min(50, time - lastTimeRef.current) : 16;
      lastTimeRef.current = time;

      // Exponential decay lerp — frame-rate independent
      const k = 1 - Math.pow(0.97, dt / 16);
      const c = currentRef.current;
      const t = targetRef.current;

      c.bobAmp      = lerp(c.bobAmp,      t.bobAmp,      k);
      c.bobSpeed    = lerp(c.bobSpeed,    t.bobSpeed,    k);
      c.swayAmp     = lerp(c.swayAmp,     t.swayAmp,     k);
      c.swaySpeed   = lerp(c.swaySpeed,   t.swaySpeed,   k);
      c.pulseAmp    = lerp(c.pulseAmp,    t.pulseAmp,    k);
      c.pulseSpeed  = lerp(c.pulseSpeed,  t.pulseSpeed,  k);
      c.rotateAmp   = lerp(c.rotateAmp,   t.rotateAmp,   k);
      c.rotateSpeed = lerp(c.rotateSpeed, t.rotateSpeed, k);
      c.squashAmp   = lerp(c.squashAmp,   t.squashAmp,   k);
      c.glowRadius  = lerp(c.glowRadius,  t.glowRadius,  k);
      c.glowPulse   = lerp(c.glowPulse,   t.glowPulse,   k);
      c.brightness  = lerp(c.brightness,  t.brightness,  k);
      c.ringR       = lerp(c.ringR,       t.ringR,       k);
      c.ringG       = lerp(c.ringG,       t.ringG,       k);
      c.ringB       = lerp(c.ringB,       t.ringB,       k);
      c.ringA       = lerp(c.ringA,       t.ringA,       k);

      // Hover scale — slightly faster lerp for responsiveness
      const hTarget = hoverRef.current ? 1.08 : 1;
      hoverScaleRef.current = lerp(hoverScaleRef.current, hTarget, k * 2.5);

      // ── Oscillators (phase-accumulated) ──
      // Advance each phase by dt/speed. When speed lerps between states,
      // only the rate of phase advance changes — no discontinuous jumps.
      const tau = Math.PI * 2;
      const p = phaseRef.current;
      p.bob    += (dt / c.bobSpeed)    * tau;
      p.sway   += (dt / c.swaySpeed)   * tau;
      p.pulse  += (dt / c.pulseSpeed)  * tau;
      p.rotate += (dt / c.rotateSpeed) * tau;

      const bobSin    = Math.sin(p.bob);
      const swaySin   = Math.sin(p.sway);
      const pulseSin  = Math.sin(p.pulse);
      const rotateSin = Math.sin(p.rotate);

      // ── Derived values ──
      const translateX = swaySin * c.swayAmp;
      const translateY = bobSin * c.bobAmp;
      const scale      = (1 + pulseSin * c.pulseAmp) * hoverScaleRef.current;
      const rotate     = rotateSin * c.rotateAmp;
      const squashX    = 1 + bobSin * c.squashAmp;   // wider at bottom of bob
      const squashY    = 1 - bobSin * c.squashAmp;   // shorter at bottom of bob
      const glow       = Math.max(0, c.glowRadius + pulseSin * c.glowPulse);

      // ── Apply transform ──
      el.style.transform = [
        `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px)`,
        `scale(${(scale * squashX).toFixed(4)}, ${(scale * squashY).toFixed(4)})`,
        `rotate(${rotate.toFixed(2)}deg)`,
      ].join(' ');

      // ── Apply filter (drop-shadow hugs the blob silhouette) ──
      const r = Math.round(c.ringR);
      const g = Math.round(c.ringG);
      const b = Math.round(c.ringB);
      const a = c.ringA;
      const ring = `rgba(${r},${g},${b},${a.toFixed(2)})`;

      el.style.filter = [
        `brightness(${c.brightness.toFixed(3)})`,
        glow > 0.5 ? `drop-shadow(0 0 ${glow.toFixed(1)}px ${ring})` : '',
        'drop-shadow(0 2px 6px rgba(0,0,0,0.18))',
      ].filter(Boolean).join(' ');

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [avatarRef, hoverRef]);
}

// ── Welcome greetings ───────────────────────────────────────────────

const WELCOME_GREETINGS = [
  "Hey, welcome back!",
  "Good to see you!",
  "Hey there!",
  "Welcome back!",
  "Hi, good to have you back!",
];

const FIRST_TIME_GREETINGS = [
  "All set! Click me or press Ctrl+Space to chat.",
  "Ready to go! Click me to start chatting.",
  "Setup complete! I'm here whenever you need me.",
  "You're all set! Tap me to get started.",
];

function pickWelcome(): string {
  return WELCOME_GREETINGS[Math.floor(Math.random() * WELCOME_GREETINGS.length)];
}

function pickFirstTimeWelcome(): string {
  return FIRST_TIME_GREETINGS[Math.floor(Math.random() * FIRST_TIME_GREETINGS.length)];
}

// ── Main Component ──────────────────────────────────────────────────

export function ClippyWidget() {
  const { stateLabel, scrollText, isActive, isIdle } = useAgentStateLabel();
  const agentConnected = useComputerStore(s => s.agentConnected);
  const toggleSpotlight = useWindowStore(s => s.toggleSpotlight);
  const setupCompleted = useAuthStore(s => s.user?.setupCompleted);

  useEffect(injectStyles, []);

  // ── Position (ratio-based, driven by window state) ──
  const windowCount = useWindowStore(s => s.windows.length);
  const hasWindows = windowCount > 0;
  const [pos, setPos] = useState(() => hasWindows ? CORNER_POS : CENTER_POS);
  const [userDragged, setUserDragged] = useState(false);

  // When windows open and widget is near center, auto-slide to corner
  useEffect(() => {
    if (userDragged) return; // User manually positioned it — don't override
    if (hasWindows && isNearCenter(pos.rx, pos.ry)) {
      setPos(CORNER_POS);
    } else if (!hasWindows) {
      setPos(CENTER_POS);
    }
  }, [hasWindows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [winSize, setWinSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));

  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const px = pos.rx * winSize.w - AVATAR_SIZE / 2;
  const py = pos.ry * winSize.h - AVATAR_SIZE / 2;

  // ── Drag (pointer capture) ──
  const dragRef = useRef<{ startMX: number; startMY: number; startRx: number; startRy: number } | null>(null);
  const wasDragRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    wasDragRef.current = false;
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startRx: pos.rx, startRy: pos.ry };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startMX;
    const dy = e.clientY - dragRef.current.startMY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragRef.current = true;
    const rx = Math.max(0.03, Math.min(0.97, dragRef.current.startRx + dx / winSize.w));
    const ry = Math.max(0.05, Math.min(0.95, dragRef.current.startRy + dy / winSize.h));
    setPos({ rx, ry });
  }, [winSize]);

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      if (wasDragRef.current) setUserDragged(true);
      if (!wasDragRef.current) toggleSpotlight();
      dragRef.current = null;
    }
  }, [toggleSpotlight]);

  // ── Welcome bubble (shows once on mount, auto-dismisses) ──
  // Suppress on mount if user is still in onboarding (setup wizard / tour)
  const [welcomeMsg, setWelcomeMsg] = useState<string | null>(() =>
    setupCompleted ? pickWelcome() : null,
  );
  const welcomeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!welcomeMsg) return;
    welcomeTimerRef.current = setTimeout(() => setWelcomeMsg(null), 6000);
    return () => clearTimeout(welcomeTimerRef.current);
  }, [welcomeMsg]);
  // Dismiss welcome immediately if agent becomes active
  useEffect(() => {
    if (isActive && welcomeMsg) setWelcomeMsg(null);
  }, [isActive, welcomeMsg]);

  // Re-trigger welcome after onboarding finishes.
  // Two events: tour done (if setup already completed) or setup saved (if tour already skipped).
  useEffect(() => {
    const showGreeting = () => {
      if (!useAuthStore.getState().user?.setupCompleted) return;
      clearTimeout(welcomeTimerRef.current);
      setWelcomeMsg(pickFirstTimeWelcome());
    };
    window.addEventListener('construct:onboarding-done', showGreeting);
    window.addEventListener('construct:setup-saved', showGreeting);
    return () => {
      window.removeEventListener('construct:onboarding-done', showGreeting);
      window.removeEventListener('construct:setup-saved', showGreeting);
    };
  }, []);

  // ── Bubble visibility ──
  const [dismissed, setDismissed] = useState(false);
  const prevActiveRef = useRef(false);
  const [flash, setFlash] = useState<'success' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (isActive) {
      setDismissed(false);
      prevActiveRef.current = true;
    } else if (prevActiveRef.current) {
      setFlash('success');
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(null), 2200);
      prevActiveRef.current = false;
    }
    return () => clearTimeout(flashTimerRef.current);
  }, [isActive]);

  // ── Derive visual state ──
  const visualState: ClippyState = useMemo(() => {
    if (flash === 'success') return 'success';
    if (!agentConnected) return 'error';
    if (isIdle) return 'idle';
    if (stateLabel === 'Thinking…') return 'thinking';
    return 'working';
  }, [flash, agentConnected, isIdle, stateLabel]);

  // ── Continuous animation ──
  const avatarRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useClippyAnimation(avatarRef, visualState, hoverRef);

  // ── Video play/pause based on agent activity ──
  const shouldPlayVideo = visualState === 'thinking' || visualState === 'working';
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (shouldPlayVideo) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
      vid.currentTime = 0;
    }
  }, [shouldPlayVideo]);

  // ── Idle eyes animation (randomly show eyes.gif when idle) ──
  const [showEyes, setShowEyes] = useState(false);
  const eyesImgRef = useRef<HTMLImageElement>(null);
  const eyesTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Restart the GIF from frame 1 each time it fades in
  useEffect(() => {
    if (showEyes && eyesImgRef.current) {
      const img = eyesImgRef.current;
      img.src = '';
      img.src = eyesGif;
    }
  }, [showEyes]);

  useEffect(() => {
    if (visualState !== 'idle') {
      setShowEyes(false);
      clearTimeout(eyesTimerRef.current);
      return;
    }

    function scheduleEyes() {
      const delay = 6000 + Math.random() * 9000; // 6-15s
      eyesTimerRef.current = setTimeout(() => {
        setShowEyes(true);
        const duration = 3000 + Math.random() * 1000; // 3-4s
        eyesTimerRef.current = setTimeout(() => {
          setShowEyes(false);
          scheduleEyes();
        }, duration);
      }, delay);
    }

    scheduleEyes();
    return () => clearTimeout(eyesTimerRef.current);
  }, [visualState]);

  const bubbleAbove = py > 140;
  // Only show bubble when there's unique context the MenuBar doesn't provide:
  // - Thinking stream (actual LLM reasoning text)
  // - Operation goals (what a spawned agent is doing)
  // - Errors (disconnected, agent error)
  // Simple "Working..." status is handled by the MenuBar indicator.
  const hasUniqueContext = !!scrollText || !agentConnected;
  const showBubble = isActive && hasUniqueContext && !dismissed;
  const showWelcome = !!welcomeMsg && !showBubble;

  // Determine what to show in the unified comic bubble
  const bubbleContent = showBubble
    ? { title: stateLabel, detail: scrollText, onDismiss: () => setDismissed(true), variant: 'status' as const }
    : showWelcome
    ? { title: welcomeMsg!, detail: '', onDismiss: () => setWelcomeMsg(null), variant: 'welcome' as const }
    : null;

  // Keep bubble mounted during exit animation
  const [visibleBubble, setVisibleBubble] = useState(bubbleContent);
  const [bubbleClosing, setBubbleClosing] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (bubbleContent) {
      // New content — show immediately, cancel any pending close
      clearTimeout(closingTimerRef.current);
      setBubbleClosing(false);
      setVisibleBubble(bubbleContent);
    } else if (visibleBubble && !bubbleClosing) {
      // Content disappeared — start close animation
      setBubbleClosing(true);
      closingTimerRef.current = setTimeout(() => {
        setVisibleBubble(null);
        setBubbleClosing(false);
      }, 300); // match clippy-bubble-out duration
    }
    return () => clearTimeout(closingTimerRef.current);
  }, [bubbleContent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed select-none"
      style={{ left: px, top: py, zIndex: Z_INDEX.clippyWidget, width: AVATAR_SIZE, height: AVATAR_SIZE, transition: dragRef.current ? 'none' : 'left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)' }}
    >
      {/* ── Avatar ── */}
      <div
        ref={avatarRef}
        data-tour="chat"
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={() => { hoverRef.current = true; }}
        onMouseLeave={() => { hoverRef.current = false; }}
        style={{ willChange: 'transform, filter' }}
      >
        <img
          src={avatarSrc}
          alt="Construct"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
        {/* Screen overlay container — clips video + eyes GIF to the monitor area */}
        <div
          className="absolute overflow-hidden pointer-events-none"
          style={{
            // Positioned to match the blue screen area of the pixel-art computer.
            // Image is 1878×1758 rendered with object-contain in a square container,
            // so there's a ~3.2% vertical offset from letterboxing.
            top: '14%',
            left: '15.5%',
            width: '49%',
            height: '38.4%',
          }}
        >
          <video
            ref={videoRef}
            src={constructVideo}
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Idle eyes animation — fades in/out randomly when agent is idle */}
          <img
            ref={eyesImgRef}
            src={eyesGif}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: showEyes ? 1 : 0,
              transition: 'opacity 0.8s ease-in-out',
            }}
          />
        </div>
      </div>

      {/* Comic bubble — rendered after avatar so it stacks on top, pointer-events-none so avatar stays clickable */}
      {visibleBubble && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          <ComicBubble
            above={bubbleAbove}
            title={visibleBubble.title}
            detail={visibleBubble.detail}
            variant={visibleBubble.variant}
            onDismiss={visibleBubble.onDismiss}
            avatarSize={AVATAR_SIZE}
            closing={bubbleClosing}
          />
        </div>
      )}

      {/* Shortcut hint */}
      {!visibleBubble && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
          style={{ top: AVATAR_SIZE + 6 }}>
          <span className="text-[10px] font-mono select-none tracking-wide"
            style={{
              color: 'rgba(255,255,255,0.6)',
              textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.4)',
            }}>
            ctrl+space
          </span>
        </div>
      )}
    </div>
  );
}

// ── Unified Comic Bubble ────────────────────────────────────────────
//
// Single comic speech bubble with curved SVG tail for all content types:
// - welcome: simple greeting text
// - status: state label + scrolling detail text (thinking, working, etc.)

function ComicBubble({ above, title, detail, variant, onDismiss, avatarSize, closing }: {
  above: boolean;
  title: string;
  detail: string;
  variant: 'welcome' | 'status';
  onDismiss: () => void;
  avatarSize: number;
  closing?: boolean;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Auto-scroll thinking text to bottom
  useEffect(() => {
    const el = textRef.current;
    if (!el || !detail) return;
    const target = el.scrollHeight - el.clientHeight;
    if (target <= 0) return;
    const start = el.scrollTop;
    const distance = target - start;
    if (Math.abs(distance) < 1) return;
    const duration = Math.min(350, Math.max(120, Math.abs(distance) * 4));
    const startTime = performance.now();
    cancelAnimationFrame(rafRef.current);
    function step(now: number) {
      if (!el) return;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.scrollTop = start + distance * eased;
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [detail]);

  const W = 250;
  const TAIL_H = 17;
  const isWelcome = variant === 'welcome';

  const springEase = 'cubic-bezier(0.22, 1.2, 0.36, 1)';
  const exitEase = 'cubic-bezier(0.55, 0, 1, 0.45)';

  const enterAnim = closing
    ? (above
      ? `clippy-bubble-out 0.3s ${exitEase} forwards`
      : `clippy-bubble-out-below 0.3s ${exitEase} forwards`)
    : isWelcome
      ? (above
        ? `clippy-welcome-in 0.55s ${springEase} forwards, clippy-bubble-float 3s ease-in-out 0.55s infinite`
        : `clippy-welcome-in-below 0.55s ${springEase} forwards, clippy-bubble-float 3s ease-in-out 0.55s infinite`)
      : (above
        ? `clippy-bubble-in 0.45s ${springEase} forwards, clippy-bubble-float 3s ease-in-out 0.45s infinite`
        : `clippy-bubble-in-below 0.45s ${springEase} forwards, clippy-bubble-float 3s ease-in-out 0.45s infinite`);

  return (
    <div
      ref={wrapRef}
      className="absolute pointer-events-auto"
      style={{
        ...(above
          ? { bottom: avatarSize - 8, left: '50%', transform: 'translateX(-50%)' }
          : { top: avatarSize - 8, left: '50%', transform: 'translateX(-50%)' }
        ),
        animation: enterAnim,
        transformOrigin: above ? '42% bottom' : '42% top',
        width: W,
      }}
    >
      {/* Tail — SVG curved comic tail (above: rendered before body) */}
      {!above && (
        <svg
          className="relative z-10"
          style={{ marginBottom: -5, marginLeft: '38%' }}
          width="28"
          height={TAIL_H}
          viewBox="0 0 28 12"
          fill="none"
          transform="scale(1,-1)"
        >
          <path d="M0 0 C4 0, 8 1.5, 12 7 Q14 10.5, 14 12 Q14 10.5, 16 7 C20 1.5, 24 0, 28 0" className="fill-white dark:fill-[#f0eef5]" />

        </svg>
      )}

      {/* Bubble body — cartoony rounded rect */}
      <div
        className="relative rounded-[22px] bg-white dark:bg-[#f0eef5]"
        style={{
          filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.13)) drop-shadow(0 1px 3px rgba(0,0,0,0.06))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
          transform: 'rotate(-0.5deg)',
        }}
      >
        <div className="px-4 py-3">
          {/* Dismiss button */}
          <button
            className="absolute top-2 right-2 p-0.5 rounded-full opacity-0 hover:opacity-50 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            title="Dismiss"
          >
            <X className="w-3 h-3 text-black/60" />
          </button>

          {/* Title */}
          <div
            className={`pr-4 text-[#2d2b3a] ${detail ? 'text-[12px] font-semibold' : 'text-[13.5px]'}`}
            style={{ fontWeight: detail ? 600 : 450, lineHeight: 1.45 }}
          >
            {title}
          </div>

          {/* Detail / thinking text */}
          {detail && (
            <div
              ref={textRef}
              className="text-[11px] leading-relaxed text-[#2d2b3a]/45 mt-1 overflow-hidden"
              style={{
                maxHeight: '4.5rem',
                maxWidth: W - 36,
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)',
              }}
            >
              {detail}
            </div>
          )}
        </div>
      </div>

      {/* Tail — SVG curved comic tail (above: rendered after body) */}
      {above && (
        <svg
          className="relative z-10"
          style={{ marginTop: -5, marginLeft: '38%' }}
          width="28"
          height={TAIL_H}
          viewBox="0 0 28 12"
          fill="none"
        >
          <path d="M0 0 C4 0, 8 1.5, 12 7 Q14 10.5, 14 12 Q14 10.5, 16 7 C20 1.5, 24 0, 28 0" className="fill-white dark:fill-[#f0eef5]" />

        </svg>
      )}
    </div>
  );
}
