/**
 * Provisioning copy — user-facing strings + platform phase labels.
 */

export type ProvisionVariant = 'first_run' | 'returning';

export type ProvisionPhase =
  | 'auth_session'
  | 'instance_create'
  | 'instance_start'
  | 'agent_connect'
  | 'ready';

export const PROVISION_PLATFORM_LABELS: Record<ProvisionPhase, string> = {
  auth_session: 'auth_session_established',
  instance_create: 'instance_provisioning',
  instance_start: 'instance_starting',
  agent_connect: 'agent_websocket_connecting',
  ready: 'instance_ready',
};

const PROGRESS_STEPS: Record<ProvisionVariant, readonly string[]> = {
  first_run: [
    'Connecting to Construct…',
    'Preparing your workspace…',
    'Starting your assistant…',
    'Getting everything ready…',
    'Ready for you',
  ],
  returning: [
    'Reconnecting to your computer…',
    'Waking your workspace…',
    'Starting your assistant…',
    'Almost there…',
    'Ready',
  ],
};

/** Maps platform phase to minimum step index (0-based). */
export const PHASE_TO_STEP_INDEX: Record<ProvisionPhase, number> = {
  auth_session: 0,
  instance_create: 1,
  instance_start: 2,
  agent_connect: 3,
  ready: 4,
};

export const PROVISION_MIN_DWELL_MS = 2000;

export function provisionProgressLabel(variant: ProvisionVariant, stepIndex: number): string {
  const steps = PROGRESS_STEPS[variant];
  return steps[Math.min(Math.max(stepIndex, 0), steps.length - 1)]!;
}

export function provisionHeadline(variant: ProvisionVariant, firstName?: string): string {
  const base = variant === 'first_run' ? 'Setting up your computer' : 'Welcome back';
  if (!firstName) return base;
  return `${base}, ${firstName}`;
}

export function provisionFooterTagline(): string {
  return 'Your AI computer, always on';
}

export function provisionSigningInLabel(): string {
  return 'Signing you in…';
}

export function provisionHandoffLine(variant: ProvisionVariant): string {
  return variant === 'first_run' ? "Let's personalize your computer" : 'Welcome back';
}

export function provisionErrorMessage(raw?: string | null): string {
  if (!raw) return 'Something went wrong while starting your computer.';
  const lower = raw.toLowerCase();
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return "Couldn't reach your computer. Check your connection and try again.";
  }
  return 'Something went wrong while starting your computer.';
}

export function extractFirstName(name?: string | null, email?: string | null): string | undefined {
  if (name?.trim()) return name.trim().split(/\s+/)[0];
  if (email?.includes('@')) return email.split('@')[0] || undefined;
  return undefined;
}

export function deriveProvisionPhase(input: {
  isLoading: boolean;
  computerStatus?: string | null;
  hasComputer: boolean;
}): ProvisionPhase {
  const { isLoading, computerStatus, hasComputer } = input;
  if (!hasComputer && isLoading) return 'auth_session';
  if (!hasComputer) return 'auth_session';
  if (computerStatus === 'creating') return 'instance_create';
  if (computerStatus === 'starting') return 'instance_start';
  if (computerStatus === 'running') return 'ready';
  return 'agent_connect';
}
