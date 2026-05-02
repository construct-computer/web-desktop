import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
import analytics from '@/lib/analytics';

// ─── Wallpaper registry ────────────────────────────────────────────────────
import wpConstruct from '@/assets/wallpapers/wallpaper.jpg';
import wpConstructTiny from '@/assets/wallpapers/wallpaper-tiny.jpg';
import wpDeathStar from '@/assets/wallpapers/deathstar.jpg';
import wpDeathStarTiny from '@/assets/wallpapers/deathstar-tiny.jpg';
import wpCatGalaxy from '@/assets/wallpapers/catgalaxy.jpg';

export interface WallpaperOption {
  id: string;
  name: string;
  src: string;
  /** Tiny (~2KB) version for blurred backgrounds — loads instantly */
  blurSrc?: string;
}

export const WALLPAPERS: WallpaperOption[] = [
  { id: 'construct', name: 'Construct', src: wpConstruct, blurSrc: wpConstructTiny },
  { id: 'deathstar', name: 'Death Star', src: wpDeathStar, blurSrc: wpDeathStarTiny },
  { id: 'catgalaxy', name: 'Cat Galaxy', src: wpCatGalaxy },
];

/** Look up wallpaper src by ID, falling back to the default */
export function getWallpaperSrc(id: string): string {
  if (id === 'custom') {
    try {
      return localStorage.getItem('construct:custom-wallpaper') || wpConstruct;
    } catch { return wpConstruct; }
  }
  return WALLPAPERS.find((w) => w.id === id)?.src ?? wpConstruct;
}

/**
 * Look up the tiny (~2KB) wallpaper variant for blurred backgrounds.
 * Falls back to the full-size wallpaper if no tiny version exists.
 * Used by lock screens, startup screens, and overlays where the wallpaper
 * is always behind a blur filter — the tiny version is visually identical
 * when blurred but loads instantly instead of waiting for a 1MB+ download.
 */
export function getWallpaperBlurSrc(id: string): string {
  if (id === 'custom') {
    try {
      return localStorage.getItem('construct:custom-wallpaper') || wpConstruct;
    } catch { return wpConstruct; }
  }
  const wp = WALLPAPERS.find((w) => w.id === id);
  return wp?.blurSrc ?? wp?.src ?? wpConstruct;
}

/** Save a custom wallpaper from a File object. Returns true on success. */
export function saveCustomWallpaper(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        localStorage.setItem('construct:custom-wallpaper', reader.result as string);
        resolve(true);
      } catch {
        // localStorage quota exceeded
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(file);
  });
}

interface SettingsState {
  soundEnabled: boolean;
  wallpaperId: string;
  /** Bumped when custom wallpaper data changes, to force re-render even though wallpaperId stays 'custom'. */
  wallpaperRev: number;
  developerMode: boolean;
  voiceEnabled: boolean;
  voiceAutoSend: boolean;

  // Actions
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  setWallpaper: (id: string) => void;
  bumpWallpaperRev: () => void;
  setDeveloperMode: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setVoiceAutoSend: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      wallpaperId: 'construct',
      wallpaperRev: 0,
      developerMode: false,
      voiceEnabled: true,
      voiceAutoSend: false,
      
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

      toggleSound: () => set((state) => {
        analytics.soundToggled(!state.soundEnabled);
        return { soundEnabled: !state.soundEnabled };
      }),

      setWallpaper: (id) => {
        analytics.wallpaperChanged(id);
        set((s) => ({ wallpaperId: id, wallpaperRev: s.wallpaperRev + 1 }));
      },

      bumpWallpaperRev: () => set((s) => ({ wallpaperRev: s.wallpaperRev + 1 })),

      setDeveloperMode: (enabled) => set({ developerMode: enabled }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setVoiceAutoSend: (enabled) => set({ voiceAutoSend: enabled }),
    }),
    {
      name: STORAGE_KEYS.settings,
      onRehydrateStorage: () => () => {
        document.documentElement.classList.add('dark');
      },
    }
  )
);
