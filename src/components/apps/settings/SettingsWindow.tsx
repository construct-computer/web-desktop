/**
 * Settings — macOS System Settings-style app with sidebar navigation.
 *
 * Sections: Account, Construct, Billing, Appearance, Devices, Developer
 */

import { useState } from 'react';
import { User, Bot, Paintbrush, CreditCard, Code2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui';
import { useSettingsNav, type SettingsSection } from '@/lib/settingsNav';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useBillingConfirmStore } from '@/stores/billingConfirmStore';
import type { WindowConfig } from '@/types';
import { DeviceSidebarIcon } from './SettingsPrimitives';
import { AccountSection } from './AccountSection';
import { ConstructSection } from './ConstructSection';
import { BillingSection } from './BillingSection';
import { AppearanceSection } from './AppearanceSection';
import { DevicesSection } from './DevicesSection';
import { DeveloperSection } from './DeveloperSection';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionDef[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'construct', label: 'Construct', icon: Bot },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'appearance', label: 'Appearance', icon: Paintbrush },
  { id: 'devices', label: 'Devices', icon: DeviceSidebarIcon },
  { id: 'developer', label: 'Developer', icon: Code2 },
];

export function SettingsWindow({ config }: { config: WindowConfig }) {
  void config;
  const isMobile = useIsMobile();
  const pendingSection = useSettingsNav((s) => s.pendingSection);
  const setPendingSection = useSettingsNav((s) => s.setPendingSection);
  const [localSection, setLocalSection] = useState<SettingsSection>('account');
  const section = pendingSection ?? localSection;
  const setSection = (next: SettingsSection) => {
    if (pendingSection) setPendingSection(null);
    setLocalSection(next);
  };

  const billingConfirm = useBillingConfirmStore((s) => s.confirm);
  const setBillingConfirm = useBillingConfirmStore((s) => s.setConfirm);

  return (
    <div className={`settings-window relative flex ${isMobile ? 'flex-col' : ''} h-full text-[var(--color-text)] select-none`}>
      <div
        className={`${isMobile ? 'w-full flex-shrink-0 border-b overflow-x-auto py-2 px-2 whitespace-nowrap' : 'w-[180px] flex-shrink-0 border-r overflow-y-auto py-2 px-2'} border-black/[0.06] dark:border-white/[0.06] surface-sidebar`}
        style={isMobile ? {
          maskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
        } : undefined}
      >
        <div className={`${isMobile ? 'flex gap-1.5' : 'space-y-0.5'}`}>
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 px-2.5 ${isMobile ? 'py-2' : 'py-[5px]'} rounded-md text-[13px] transition-all duration-100 ${
                  !isMobile ? 'w-full' : ''
                } ${
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-black/90 dark:text-white/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center justify-center w-4 shrink-0">
                  <s.icon className={`w-[15px] h-[15px] ${active ? 'text-white' : 'text-black/50 dark:text-white/50'}`} />
                </span>
                <span className={active ? 'font-medium' : ''}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-content flex-1 min-w-0 overflow-y-auto">
        {section === 'account' && <AccountSection />}
        {section === 'construct' && <ConstructSection />}
        {section === 'billing' && <BillingSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'devices' && <DevicesSection />}
        {section === 'developer' && <DeveloperSection />}
      </div>

      <ConfirmDialog
        open={!!billingConfirm}
        wide
        title={billingConfirm?.title ?? ''}
        message={billingConfirm?.message ?? ''}
        confirmLabel={billingConfirm?.confirmLabel}
        destructive={billingConfirm?.destructive}
        onConfirm={() => {
          const action = billingConfirm?.onConfirm;
          setBillingConfirm(null);
          void action?.();
        }}
        onCancel={() => setBillingConfirm(null)}
      />
    </div>
  );
}
