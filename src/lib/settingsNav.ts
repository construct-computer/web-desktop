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
  | 'account'
  | 'construct'
  | 'billing'
  | 'appearance'
  | 'devices'
  | 'developer';

export type BillingSubsection = 'plan' | 'usage' | 'ai-provider';

/** @deprecated Legacy section IDs — resolved via resolveSettingsSection */
export type LegacySettingsSection =
  | 'user'
  | 'agent'
  | 'connections'
  | 'customisation'
  | 'subscription'
  | 'usage';

export type SettingsSectionInput = SettingsSection | LegacySettingsSection;

const LEGACY_SECTION_MAP: Record<LegacySettingsSection, SettingsSection> = {
  user: 'account',
  agent: 'construct',
  connections: 'construct',
  customisation: 'appearance',
  subscription: 'billing',
  usage: 'billing',
};

const LEGACY_SUBSECTION_MAP: Partial<Record<LegacySettingsSection, BillingSubsection>> = {
  subscription: 'plan',
  usage: 'usage',
};

export function resolveSettingsSection(section: SettingsSectionInput): SettingsSection {
  if (section in LEGACY_SECTION_MAP) {
    return LEGACY_SECTION_MAP[section as LegacySettingsSection];
  }
  return section as SettingsSection;
}

export function resolveBillingSubsection(section: SettingsSectionInput): BillingSubsection | null {
  if (section in LEGACY_SUBSECTION_MAP) {
    return LEGACY_SUBSECTION_MAP[section as LegacySettingsSection] ?? null;
  }
  return null;
}

interface SettingsNavState {
  pendingSection: SettingsSection | null;
  pendingSubsection: BillingSubsection | null;
  setPendingSection: (s: SettingsSection | null) => void;
  setPendingSubsection: (s: BillingSubsection | null) => void;
}

export const useSettingsNav = create<SettingsNavState>((set) => ({
  pendingSection: null,
  pendingSubsection: null,
  setPendingSection: (pendingSection) => set({ pendingSection }),
  setPendingSubsection: (pendingSubsection) => set({ pendingSubsection }),
}));

/** Open the Settings window and jump to a specific section. */
export function openSettingsToSection(
  section: SettingsSectionInput,
  options?: { subsection?: BillingSubsection },
): void {
  const resolved = resolveSettingsSection(section);
  const subsection = options?.subsection ?? resolveBillingSubsection(section);
  useSettingsNav.getState().setPendingSection(resolved);
  useSettingsNav.getState().setPendingSubsection(subsection);
  useWindowStore.getState().openWindow('settings');
}
