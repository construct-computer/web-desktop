export const ACTIVE_PLANS = ['free', 'starter', 'pro'] as const;
export const PAID_PLANS = ['starter', 'pro'] as const;

export type ActivePlan = typeof ACTIVE_PLANS[number];
export type PaidPlan = typeof PAID_PLANS[number];

export function hasAgentAccess(plan: string | null | undefined): plan is ActivePlan {
  return !!plan && (ACTIVE_PLANS as readonly string[]).includes(plan);
}

export function hasPaidAccess(plan: string | null | undefined): plan is PaidPlan {
  return !!plan && (PAID_PLANS as readonly string[]).includes(plan);
}
