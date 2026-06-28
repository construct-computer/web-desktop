import { useState, useEffect, useRef } from 'react';
import { Loader2, Zap, AlertCircle } from 'lucide-react';
import { Select, InfoHint } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import { useSettingsNav, type BillingSubsection } from '@/lib/settingsNav';
import { hasPaidAccess } from '@/lib/plans';
import {
  getPlatformModelSettings, updatePlatformModel,
  type PlatformModelSettings,
} from '@/services/api';
import { SectionPanel, SettingsSubsection } from './SettingsPrimitives';
import { PlanPanel } from './billing/PlanPanel';
import { UsagePanel, InfoCard } from './billing/UsagePanel';
import { ByokPanel } from './billing/ByokPanel';

function PlatformModelPicker() {
  const [platformModel, setPlatformModel] = useState<PlatformModelSettings | null>(null);
  const [platformModelLoading, setPlatformModelLoading] = useState(true);
  const [platformModelSaving, setPlatformModelSaving] = useState(false);
  const [platformModelError, setPlatformModelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlatformModelSettings().then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPlatformModel(result.data);
        setPlatformModelError(null);
      } else {
        setPlatformModelError(result.error);
      }
      setPlatformModelLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handlePlatformModelChange = async (value: string) => {
    const nextModel = value === '__default__' ? null : value;
    setPlatformModelSaving(true);
    setPlatformModelError(null);
    const result = await updatePlatformModel(nextModel);
    if (result.success) {
      setPlatformModel(result.data);
    } else {
      setPlatformModelError(result.error);
    }
    setPlatformModelSaving(false);
  };

  if (!platformModelLoading && !platformModel?.enabled) return null;

  return (
    <InfoCard>
      <div className="px-4 pt-3.5 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
            Primary Model
            <InfoHint side="top">Choose the AI model Construct uses for its main work. The default is recommended for most teams.</InfoHint>
          </span>
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
          Choose the main model Construct uses.
        </p>
        {platformModelLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading model access...
          </div>
        ) : platformModel?.enabled ? (
          <div className="space-y-3">
            <Select
              value={platformModel.selectedModel || '__default__'}
              onChange={handlePlatformModelChange}
              disabled={platformModelSaving}
              searchable
              options={[
                {
                  value: '__default__',
                  label: `Default (${platformModel.defaultModel})`,
                  description: 'Use Construct’s recommended default.',
                },
                ...platformModel.options.map((option) => ({
                  value: option.id,
                  label: option.label,
                  description: `${option.provider} • ${option.vision ? 'image support' : 'text'}${option.reasoning ? ' • stronger reasoning' : ''}`,
                })),
              ]}
            />
            <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
              <span>Current model: <span className="font-mono">{platformModel.effectiveModel}</span></span>
              {platformModelSaving && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
          </div>
        ) : null}
        {platformModelError && (
          <div className="flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{platformModelError}</span>
          </div>
        )}
      </div>
    </InfoCard>
  );
}

const SUBSECTION_ANCHORS: Record<BillingSubsection, string> = {
  plan: 'billing-plan',
  usage: 'billing-usage',
  'ai-provider': 'billing-ai-provider',
};

export function BillingSection() {
  const subscription = useBillingStore((s) => s.subscription);
  const pendingSubsection = useSettingsNav((s) => s.pendingSubsection);
  const setPendingSubsection = useSettingsNav((s) => s.setPendingSubsection);

  const isSubscribed = hasPaidAccess(subscription?.plan);
  const isPro = subscription?.plan === 'pro';

  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!pendingSubsection || scrolledRef.current) return;
    if (!isSubscribed && (pendingSubsection === 'usage' || pendingSubsection === 'ai-provider')) {
      setPendingSubsection(null);
      return;
    }
    const anchorId = SUBSECTION_ANCHORS[pendingSubsection];
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrolledRef.current = true;
      setPendingSubsection(null);
    }
  }, [isSubscribed, pendingSubsection, setPendingSubsection]);

  return (
    <SectionPanel
      title="Billing"
      subtitle="Plan, usage limits, and AI provider settings."
    >
      <div id="billing-plan">
        <PlanPanel />
      </div>

      {isSubscribed && (
        <div id="billing-usage" className="mt-6">
          <UsagePanel />
        </div>
      )}

      {isSubscribed && (
        <div id="billing-ai-provider" className="mt-6">
          <SettingsSubsection
            title="AI provider"
            description={isPro
              ? "Choose Construct's default model or bring your own OpenRouter key."
              : "Choose Construct's default model used by your paid plan."}
          >
            <div className="space-y-4">
              <PlatformModelPicker />
              {isPro && <ByokPanel />}
            </div>
          </SettingsSubsection>
        </div>
      )}
    </SectionPanel>
  );
}
