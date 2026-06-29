import type { SurveyKind, SurveySurface } from '@/lib/surveys';

export {};

type SurveyConsoleTarget = SurveyKind | { kind?: SurveyKind; surface?: SurveySurface };
type SurveyConsoleResult = { kind: SurveyKind; trigger: string; surface: SurveySurface };

interface SurveyConsoleCheatcode {
  (target?: SurveyConsoleTarget): Promise<SurveyConsoleResult | null>;
  kinds: readonly SurveyKind[];
  reset: () => void;
}

declare global {
  interface Window {
    survey?: SurveyConsoleCheatcode;
  }
}
