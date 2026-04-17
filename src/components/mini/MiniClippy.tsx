import { useEffect, useRef, useState, useMemo } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { useAgentStateLabel } from '@/hooks/useAgentStateLabel';
import avatarSrc from '@/assets/widget.png';
import constructGif from '@/assets/construct/loader.gif';
import eyesGif from '@/assets/construct/eyes.gif';

// Reusing the same animation params as the desktop clippy
type ClippyState = 'idle' | 'thinking' | 'working' | 'success' | 'error';

interface AnimParams {
  bobAmp: number;         bobSpeed: number;
  swayAmp: number;        swaySpeed: number;
  pulseAmp: number;       pulseSpeed: number;
  rotateAmp: number;      rotateSpeed: number;
  squashAmp: number;
  glowRadius: number;     glowPulse: number;
  brightness: number;
  ringR: number; ringG: number; ringB: number; ringA: number;
}

const STATE_PARAMS: Record<ClippyState, AnimParams> = {
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
  thinking: {
    bobAmp: 0.8,   bobSpeed: 5000,
    swayAmp: 1.5,  swaySpeed: 3800,
    pulseAmp: 0.008, pulseSpeed: 3800,
    rotateAmp: 2.0, rotateSpeed: 3800,
    squashAmp: 0.002,
    glowRadius: 7,  glowPulse: 3,
    brightness: 1.02,
    ringR: 130, ringG: 180, ringB: 255, ringA: 0.5,
  },
  working: {
    bobAmp: 2.2,   bobSpeed: 2400,
    swayAmp: 0,    swaySpeed: 4000,
    pulseAmp: 0.01, pulseSpeed: 2400,
    rotateAmp: 0,  rotateSpeed: 4000,
    squashAmp: 0.006,
    glowRadius: 10, glowPulse: 2,
    brightness: 1.03,
    ringR: 80, ringG: 150, ringB: 255, ringA: 0.65,
  },
  success: {
    bobAmp: 2.8,   bobSpeed: 1600,
    swayAmp: 0,    swaySpeed: 4000,
    pulseAmp: 0.02, pulseSpeed: 1600,
    rotateAmp: 0,  rotateSpeed: 4000,
    squashAmp: 0.008,
    glowRadius: 16, glowPulse: 4,
    brightness: 1.06,
    ringR: 52, ringG: 211, ringB: 153, ringA: 0.8,
  },
  error: {
    bobAmp: 0.4,   bobSpeed: 6000,
    swayAmp: 0.8,  swaySpeed: 2000,
    pulseAmp: 0,   pulseSpeed: 4000,
    rotateAmp: 0.8, rotateSpeed: 2200,
    squashAmp: 0.001,
    glowRadius: 8, glowPulse: 2,
    brightness: 0.93,
    ringR: 239, ringG: 68, ringB: 68, ringA: 0.6,
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function useClippyAnimation(
  avatarRef: React.RefObject<HTMLDivElement | null>,
  state: ClippyState,
) {
  const currentRef = useRef<AnimParams>({ ...STATE_PARAMS.idle });
  const targetRef = useRef<AnimParams>({ ...STATE_PARAMS.idle });
  const lastTimeRef = useRef(0);
  const rafRef = useRef(0);
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

      const translateX = swaySin * c.swayAmp;
      const translateY = bobSin * c.bobAmp;
      const scale      = 1 + pulseSin * c.pulseAmp;
      const rotate     = rotateSin * c.rotateAmp;
      const squashX    = 1 + bobSin * c.squashAmp;
      const squashY    = 1 - bobSin * c.squashAmp;
      const glow       = Math.max(0, c.glowRadius + pulseSin * c.glowPulse);

      el.style.transform = [
        `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px)`,
        `scale(${(scale * squashX).toFixed(4)}, ${(scale * squashY).toFixed(4)})`,
        `rotate(${rotate.toFixed(2)}deg)`,
      ].join(' ');

      const r = Math.round(c.ringR);
      const g = Math.round(c.ringG);
      const b = Math.round(c.ringB);
      const a = c.ringA;
      const ring = `rgba(${r},${g},${b},${a.toFixed(2)})`;

      el.style.filter = [
        `brightness(${c.brightness.toFixed(3)})`,
        glow > 0.5 ? `drop-shadow(0 0 ${glow.toFixed(1)}px ${ring})` : '',
        'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
      ].filter(Boolean).join(' ');

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [state, avatarRef]);
}

export function MiniClippy({ size = 160 }: { size?: number }) {
  const { stateLabel, isIdle, isActive } = useAgentStateLabel();
  const agentConnected = useComputerStore(s => s.agentConnected);

  const [flash, setFlash] = useState<'success' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevActiveRef = useRef(false);

  useEffect(() => {
    if (isActive) {
      prevActiveRef.current = true;
    } else if (prevActiveRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlash('success');
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(null), 2200);
      prevActiveRef.current = false;
    }
    return () => clearTimeout(flashTimerRef.current);
  }, [isActive]);

  const visualState: ClippyState = useMemo(() => {
    if (flash === 'success') return 'success';
    if (!agentConnected) return 'error';
    if (isIdle) return 'idle';
    if (stateLabel === 'Thinking…') return 'thinking';
    return 'working';
  }, [flash, agentConnected, isIdle, stateLabel]);

  const avatarRef = useRef<HTMLDivElement>(null);
  useClippyAnimation(avatarRef, visualState);

  const [showEyes, setShowEyes] = useState(false);
  const eyesImgRef = useRef<HTMLImageElement>(null);
  const eyesTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (showEyes && eyesImgRef.current) {
      eyesImgRef.current.src = '';
      eyesImgRef.current.src = eyesGif;
    }
  }, [showEyes]);

  useEffect(() => {
    if (visualState !== 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowEyes(false);
      clearTimeout(eyesTimerRef.current);
      return;
    }

    function scheduleEyes() {
      const delay = 6000 + Math.random() * 9000;
      eyesTimerRef.current = setTimeout(() => {
        setShowEyes(true);
        const duration = 3000 + Math.random() * 1000;
        eyesTimerRef.current = setTimeout(() => {
          setShowEyes(false);
          scheduleEyes();
        }, duration);
      }, delay);
    }

    scheduleEyes();
    return () => clearTimeout(eyesTimerRef.current);
  }, [visualState]);

  return (
    <div
      ref={avatarRef}
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size, willChange: 'transform, filter' }}
    >
      <img
        src={avatarSrc}
        alt="Agent"
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
      <div
        className="absolute overflow-hidden pointer-events-none"
        style={{
          top: '14%',
          left: '15.5%',
          width: '49%',
          height: '38.4%',
        }}
      >
        <img
          src={constructGif}
          alt=""
          className="w-full h-full object-cover"
        />
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
  );
}
