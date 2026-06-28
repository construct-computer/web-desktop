/**
 * Marketing copy for the subscription overlay plan cards.
 *
 * Keep these in sync with worker/src/config/tiers.ts (TIER_LIMITS). Construct
 * runs the same model quality on every plan — paid plans buy more usage, steps,
 * runtime, parallelism, and storage plus email/background tasks. This is a
 * standalone content module (no React/store deps) so the copy can be unit
 * tested against the canonical tier limits.
 */

import {
  Zap, Footprints, Clock, Layers, Mail, HardDrive, Bot, Key,
  type LucideIcon,
} from 'lucide-react';

export interface PlanFeature {
  icon: LucideIcon;
  text: string;
  highlight?: boolean;
}

export const STARTER_FEATURES: PlanFeature[] = [
  { icon: Zap, text: '4\u00d7 the usage of Free' },
  { icon: Footprints, text: '150 steps per task' },
  { icon: Clock, text: '30 min command runtime' },
  { icon: Layers, text: '5 tasks in parallel' },
  { icon: Mail, text: 'Agent email address' },
  { icon: Bot, text: 'Background & scheduled tasks' },
  { icon: HardDrive, text: '1 GB cloud storage' },
  { icon: Key, text: 'BYOK support' },
];

export const PRO_FEATURES: PlanFeature[] = [
  { icon: Zap, text: '24\u00d7 the usage of Free', highlight: true },
  { icon: Footprints, text: '1,000 steps per task', highlight: true },
  { icon: Clock, text: '1 hr command runtime' },
  { icon: Layers, text: 'Unlimited parallel tasks', highlight: true },
  { icon: Mail, text: 'Agent email address' },
  { icon: Bot, text: 'Background & scheduled tasks', highlight: true },
  { icon: HardDrive, text: '3 GB cloud storage' },
  { icon: Key, text: 'BYOK support' },
];
