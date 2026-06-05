import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
import analytics from '@/lib/analytics';
import { isCustomWallpaperId } from '@/lib/wallpapers';

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

const BUILTIN_BY_ID = new Map(WALLPAPERS.map((wp) => [wp.id, wp]));

/** Built-in preset src only (custom IDs must use useWallpaperUrl). */
export function getBuiltinWallpaperSrc(id: string): string {
  if (isCustomWallpaperId(id) || id === 'custom') {
    return wpConstruct;
  }
  return BUILTIN_BY_ID.get(id)?.src ?? wpConstruct;
}

/** @deprecated Use useWallpaperUrl for display. Built-in presets only. */
export function getWallpaperSrc(id: string): string {
  return getBuiltinWallpaperSrc(id);
}

/** @deprecated Use useWallpaperBlurUrl for display. Built-in presets only. */
export function getWallpaperBlurSrc(id: string): string {
  if (isCustomWallpaperId(id) || id === 'custom') {
    return wpConstruct;
  }
  const wp = BUILTIN_BY_ID.get(id);
  return wp?.blurSrc ?? wp?.src ?? wpConstruct;
}

interface SettingsState {
  soundEnabled: boolean;
  wallpaperId: string;
  /** Bumped when custom wallpaper data changes, to force re-render. */
  wallpaperRev: number;
  developerMode: boolean;
  voiceEnabled: boolean;
  voiceAutoSend: boolean;

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
