import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useComputerStore } from '@/stores/agentStore';
import {
  deriveProvisionPhase,
  extractFirstName,
  PHASE_TO_STEP_INDEX,
  PROVISION_MIN_DWELL_MS,
  PROVISION_PLATFORM_LABELS,
  provisionHeadline,
  provisionProgressLabel,
  type ProvisionPhase,
  type ProvisionVariant,
} from '@/lib/provisioningCopy';

export function useProvisionPhase(variant: ProvisionVariant) {
  const user = useAuthStore((s) => s.user);
  const computer = useComputerStore((s) => s.computer);
  const isLoading = useComputerStore((s) => s.isLoading);

  const phase = useMemo(
    () =>
      deriveProvisionPhase({
        isLoading,
        computerStatus: computer?.status,
        hasComputer: Boolean(computer),
      }),
    [isLoading, computer?.status, computer],
  );

  const targetStepIndex = PHASE_TO_STEP_INDEX[phase];
  const [displayStepIndex, setDisplayStepIndex] = useState(0);
  const [lastAdvanceAt, setLastAdvanceAt] = useState(() => Date.now());

  useEffect(() => {
    if (targetStepIndex <= displayStepIndex) return;
    const elapsed = Date.now() - lastAdvanceAt;
    const delay = Math.max(0, PROVISION_MIN_DWELL_MS - elapsed);
    const timer = window.setTimeout(() => {
      setDisplayStepIndex((i) => Math.max(i, targetStepIndex));
      setLastAdvanceAt(Date.now());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [targetStepIndex, displayStepIndex, lastAdvanceAt]);

  useEffect(() => {
    if (!isLoading && !computer) {
      setDisplayStepIndex(0);
      setLastAdvanceAt(Date.now());
    }
  }, [isLoading, computer]);

  const firstName = extractFirstName(user?.displayName, user?.email);

  return {
    phase,
    platformLabel: PROVISION_PLATFORM_LABELS[phase],
    stepIndex: displayStepIndex,
    progressLabel: provisionProgressLabel(variant, displayStepIndex),
    headline: provisionHeadline(variant, firstName),
  };
}

export type { ProvisionPhase, ProvisionVariant };
