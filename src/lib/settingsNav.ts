/**
 * Cross-window navigation for the Settings app.
 *
 * Lets other windows (e.g. AppRegistry) open Settings to a specific section.
 * Settings is a singleton window, so simply calling openWindow('settings')
 * doesn't accept metadata — this store carries the section through.
 */

import { create } from 'zustand';
import { useWindowStore } from '@/stores/windowStore';

export type SettingsSection =
  | 'user'
  | 'connections'
  | 'customisation'
  | 'subscription'
  | 'usage'
  | 'developer';

interface SettingsNavState {
  pendingSection: SettingsSection | null;
  setPendingSection: (s: SettingsSection | null) => void;
}

export const useSettingsNav = create<SettingsNavState>((set) => ({
  pendingSection: null,
  setPendingSection: (pendingSection) => set({ pendingSection }),
}));

/** Open the Settings window and jump to a specific section. */
export function openSettingsToSection(section: SettingsSection): void {
  useSettingsNav.getState().setPendingSection(section);
  useWindowStore.getState().openWindow('settings');
}
