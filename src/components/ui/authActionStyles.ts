import type { CSSProperties } from 'react';

export type AuthActionTone = 'primary' | 'connected' | 'cancelled' | 'ghost';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[\da-f]{6}$/i.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

export function alphaColor(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : color;
}

export function authShieldStyle(tone: AuthActionTone = 'primary'): CSSProperties {
  const styles: Record<AuthActionTone, CSSProperties> = {
    primary: {
      color: '#bfdbfe',
      borderColor: 'rgba(147,197,253,0.22)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.065) 45%, rgba(0,0,0,0.12) 100%), rgba(96,165,250,0.13)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.26), 0 8px 22px rgba(37,99,235,0.11)',
    },
    connected: {
      color: '#bbf7d0',
      borderColor: 'rgba(74,222,128,0.20)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.12) 100%), rgba(74,222,128,0.11)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.24), 0 8px 20px rgba(22,163,74,0.08)',
    },
    cancelled: {
      color: '#cbd5e1',
      borderColor: 'rgba(203,213,225,0.14)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.095) 0%, rgba(255,255,255,0.05) 48%, rgba(0,0,0,0.12) 100%), rgba(148,163,184,0.08)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.24), 0 8px 18px rgba(0,0,0,0.10)',
    },
    ghost: {
      color: 'rgba(255,255,255,0.58)',
      borderColor: 'rgba(255,255,255,0.09)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.035) 100%), rgba(255,255,255,0.025)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.20)',
    },
  };
  return styles[tone];
}

export function platformIconFrameStyle(brandColor: string, state: 'default' | 'connected' | 'cancelled' = 'default'): CSSProperties {
  if (state === 'connected') {
    return {
      color: '#bbf7d0',
      background: 'rgba(74,222,128,0.13)',
      borderColor: 'rgba(74,222,128,0.22)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    };
  }
  if (state === 'cancelled') {
    return {
      color: 'rgba(255,255,255,0.64)',
      background: 'rgba(148,163,184,0.10)',
      borderColor: 'rgba(203,213,225,0.14)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
    };
  }
  return {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: alphaColor(brandColor, 0.35),
    boxShadow: `inset 0 0 0 1px ${alphaColor(brandColor, 0.10)}, 0 8px 18px rgba(0,0,0,0.12)`,
  };
}
