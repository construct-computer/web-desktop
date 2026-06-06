/**
 * Display copy for learned defaults — mirrors worker/src/agent/learnedPolicyCopy.ts
 * (frontend cannot import worker sources; keep in sync when adding policy types).
 */

export type LearnedPolicyStrength = 'strong' | 'likely' | 'tentative';

export interface LearnedPolicyCopy {
  title: string;
  description: string;
  agentInstruction: string;
  scopeLabel: string;
  strength: LearnedPolicyStrength;
  promptCategory: string;
}

export interface LearnedPolicyDisplayInput {
  policyKey: string;
  scope?: string | null;
  scopeValue?: string | null;
  policyValue?: string | null;
  confidence?: number | null;
  displayTitle?: string | null;
  displayDescription?: string | null;
  displayScopeLabel?: string | null;
  strength?: LearnedPolicyStrength | null;
  strengthLabel?: string | null;
}

export function confidenceToStrength(confidence: number | null | undefined): LearnedPolicyStrength {
  const value = Math.max(0, Math.min(1, confidence ?? 0));
  if (value >= 0.75) return 'strong';
  if (value >= 0.65) return 'likely';
  return 'tentative';
}

export function strengthLabel(strength: LearnedPolicyStrength): string {
  if (strength === 'strong') return 'Strong';
  if (strength === 'likely') return 'Likely';
  return 'Tentative';
}

function scopeLabelFor(scopeValue: string | null | undefined): string {
  const normalized = (scopeValue || '').trim().toLowerCase();
  if (normalized === 'scheduled_work') return 'Scheduled work';
  if (normalized === 'reports') return 'Reports';
  if (normalized === 'general') return 'General';
  if (!normalized) return 'General';
  return normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function taskKind(scopeValue: string | null | undefined): 'scheduled' | 'report' {
  return (scopeValue || '').trim().toLowerCase() === 'reports' ? 'report' : 'scheduled';
}

function deliveryChannelCopy(channel: string, scopeValue: string | null | undefined): LearnedPolicyCopy {
  const scopeLabel = scopeLabelFor(scopeValue);
  const kind = taskKind(scopeValue);
  const taskNoun = kind === 'report' ? 'report' : 'scheduled task';
  const taskPlural = kind === 'report' ? 'reports' : 'scheduled tasks';

  if (channel === 'slack') {
    return {
      title: 'Send results to Slack',
      description: `Construct usually posts finished ${taskPlural} to Slack.`,
      agentInstruction: 'When delivering scheduled or report output, default to Slack unless the user specifies another channel.',
      scopeLabel,
      strength: 'likely',
      promptCategory: 'delivery',
    };
  }
  if (channel === 'telegram') {
    return {
      title: 'Send results on Telegram',
      description: `Construct usually sends finished ${taskPlural} via Telegram.`,
      agentInstruction: 'When delivering scheduled or report output, default to Telegram unless the user specifies another channel.',
      scopeLabel,
      strength: 'likely',
      promptCategory: 'delivery',
    };
  }
  return {
    title: 'Send results by email',
    description: `Construct usually emails finished ${taskNoun}s instead of posting elsewhere.`,
    agentInstruction: 'When delivering scheduled or report output, default to email unless the user specifies another channel.',
    scopeLabel,
    strength: 'likely',
    promptCategory: 'delivery',
  };
}

function persistBeforeDeliveryCopy(scopeValue: string | null | undefined): LearnedPolicyCopy {
  const scopeLabel = scopeLabelFor(scopeValue);
  return {
    title: 'Save to Files before sending',
    description: 'Construct saves the deliverable to your workspace before emailing or sharing it externally.',
    agentInstruction: 'Before sending scheduled or report deliverables externally, write them to the workspace (Files) first.',
    scopeLabel,
    strength: 'strong',
    promptCategory: 'files',
  };
}

function formatExtensionLabel(format: string): string {
  const lower = format.toLowerCase();
  if (lower === 'md' || lower === 'markdown') return 'Markdown';
  return lower.toUpperCase();
}

function preferredFormatCopy(format: string, scopeValue: string | null | undefined): LearnedPolicyCopy {
  const scopeLabel = scopeLabelFor(scopeValue);
  const label = formatExtensionLabel(format);
  const ext = format.toLowerCase() === 'markdown' ? 'md' : format.toLowerCase();
  return {
    title: `Use ${label} deliverables`,
    description: `Recent successful runs saved the output as a ${label} (.${ext}) file.`,
    agentInstruction: `When creating scheduled or report deliverables, prefer ${label} (.${ext}) unless the user asks for another format.`,
    scopeLabel,
    strength: 'likely',
    promptCategory: 'format',
  };
}

function humanizePolicyValue(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackCopy(input: LearnedPolicyDisplayInput): LearnedPolicyCopy {
  const scopeLabel = scopeLabelFor(input.scopeValue);
  const value = (input.policyValue || '').trim();
  const title = value ? humanizePolicyValue(value) : 'Learned default';
  return {
    title,
    description: 'Construct picked this up from a successful run.',
    agentInstruction: value
      ? `Use "${humanizePolicyValue(value)}" as a soft default when similar work runs again, unless the user says otherwise.`
      : 'Use this learned default as a soft preference when similar work runs again, unless the user says otherwise.',
    scopeLabel,
    strength: confidenceToStrength(input.confidence),
    promptCategory: input.scope || 'default',
  };
}

export function resolveLearnedPolicyCopy(input: LearnedPolicyDisplayInput): LearnedPolicyCopy {
  if (input.displayTitle && input.displayDescription) {
    const strength = input.strength ?? confidenceToStrength(input.confidence);
    return {
      title: input.displayTitle,
      description: input.displayDescription,
      agentInstruction: '',
      scopeLabel: input.displayScopeLabel ?? scopeLabelFor(input.scopeValue),
      strength,
      promptCategory: input.scope || 'default',
    };
  }

  const policyKey = (input.policyKey || '').trim().toLowerCase();
  const policyValue = (input.policyValue || '').trim().toLowerCase();
  const scopeValue = input.scopeValue ?? null;

  let copy: LearnedPolicyCopy;
  if (policyKey.startsWith('delivery.preferred_channel.')) {
    copy = deliveryChannelCopy(policyValue || 'email', scopeValue);
  } else if (policyKey.startsWith('artifact.persist_before_delivery.')) {
    copy = persistBeforeDeliveryCopy(scopeValue);
  } else if (policyKey.startsWith('artifact.preferred_format.')) {
    copy = preferredFormatCopy(policyValue || 'md', scopeValue);
  } else {
    copy = fallbackCopy(input);
  }

  return {
    ...copy,
    strength: confidenceToStrength(input.confidence ?? (
      copy.strength === 'strong' ? 0.78 : copy.strength === 'likely' ? 0.72 : 0.6
    )),
  };
}

export function formatLearnedPolicyDisplay(input: LearnedPolicyDisplayInput) {
  const copy = resolveLearnedPolicyCopy(input);
  return {
    title: copy.title,
    description: copy.description,
    scopeLabel: copy.scopeLabel,
    strength: copy.strength,
    strengthText: input.strengthLabel ?? strengthLabel(copy.strength),
  };
}
