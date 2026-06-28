/**
 * Marketing copy for the subscribe window plan cards.
 *
 * Keep these in sync with worker/src/config/tiers.ts (TIER_LIMITS).
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

export const LITE_FEATURES: PlanFeature[] = [
  { icon: Zap, text: 'Public $9/mo plan', highlight: true },
  { icon: Footprints, text: '50 steps per task' },
  { icon: Clock, text: '5 min command runtime' },
  { icon: Layers, text: '2 tasks in parallel' },
  { icon: HardDrive, text: '100 MB cloud storage' },
  { icon: Mail, text: 'No agent email' },
  { icon: Bot, text: 'No background tasks' },
];

export const STARTER_FEATURES: PlanFeature[] = [
  { icon: Zap, text: '6× the usage of Lite' },
  { icon: Footprints, text: '150 steps per task' },
  { icon: Clock, text: '30 min command runtime' },
  { icon: Layers, text: '5 tasks in parallel' },
  { icon: Mail, text: 'Agent email address' },
  { icon: Bot, text: 'Background & scheduled tasks' },
  { icon: HardDrive, text: '1 GB cloud storage' },
];

export const PRO_FEATURES: PlanFeature[] = [
  { icon: Zap, text: '32× the usage of Lite', highlight: true },
  { icon: Footprints, text: '1,000 steps per task', highlight: true },
  { icon: Clock, text: '1 hr command runtime' },
  { icon: Layers, text: 'Unlimited parallel tasks', highlight: true },
  { icon: Mail, text: 'Agent email address' },
  { icon: Bot, text: 'Background & scheduled tasks', highlight: true },
  { icon: HardDrive, text: '3 GB cloud storage' },
  { icon: Key, text: 'BYOK support' },
];
