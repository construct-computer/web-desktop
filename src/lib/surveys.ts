import { isNativePlatform } from '@/native';

export const SURVEY_DEFAULT_CALL_URL = 'https://cal.com/construct/15min';

export type SurveyKind = 'nps' | 'csat' | 'feedback' | 'churn' | 'custom';
export type SurveyStatus = 'draft' | 'active' | 'archived';
export type SurveySurface = 'web' | 'desktop_app' | 'mobile_app' | 'telegram_mini';
export type SurveyQuestionType = 'rating' | 'single_choice' | 'multiple_choice' | 'open_text';
export type SurveyEventName = 'shown' | 'started' | 'dismissed' | 'abandoned' | 'call_cta_clicked' | 'call_booked';
export type SurveyAnswerValue = string | number | string[];
export type SurveyAnswers = Record<string, SurveyAnswerValue>;
export const SURVEY_DEBUG_KINDS = ['nps', 'csat', 'feedback', 'churn', 'custom'] as const;
export const SURVEY_DEBUG_TRIGGER_PREFIX = 'survey:debug:' as const;

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  question: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  choices?: string[];
}

export interface SurveyCallToAction {
  label: string;
  url: string;
}

export interface SurveyDefinition {
  title: string;
  intro?: string;
  completionMessage?: string;
  callToAction: SurveyCallToAction;
  questions: SurveyQuestion[];
}

export interface SurveyRules {
  priority?: number;
  triggers?: string[];
  surfaces?: SurveySurface[];
  minDaysSinceSignup?: number;
  minUsageEvents?: number;
  cooldownDays?: number;
  maxShows?: number;
  requireSetupCompleted?: boolean;
  requireOnboardingCompleted?: boolean;
  planIn?: string[];
  excludeIfBookedCallDays?: number;
}

export interface SurveyPayload {
  id: string;
  slug: string;
  name: string;
  kind: SurveyKind;
  status: SurveyStatus;
  revisionId: string;
  revisionVersion: number;
  rules: SurveyRules;
  definition: SurveyDefinition;
  attemptId: string;
}

export interface SurveyEventRequest {
  attemptId: string;
  event?: SurveyEventName;
  revisionId?: string;
  surface?: SurveySurface;
  trigger?: string;
  answers?: SurveyAnswers;
  metadata?: Record<string, unknown>;
}

export interface SurveySubmitRequest extends SurveyEventRequest {
  answers: SurveyAnswers;
}

export interface SurveySubmitResult {
  responseId: string;
  score: number | null;
  callToActionUrl: string;
  submittedAt: number;
}

export function detectSurveySurface(): SurveySurface {
  if (isNativePlatform()) return 'mobile_app';
  if (typeof window !== 'undefined') {
    if (window.location.pathname === '/mini' || window.Telegram?.WebApp) return 'telegram_mini';
  }
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/ConstructDesktop/i.test(userAgent)) return 'desktop_app';
  return 'web';
}

export function isSurveyKind(value: unknown): value is SurveyKind {
  return typeof value === 'string' && (SURVEY_DEBUG_KINDS as readonly string[]).includes(value);
}

export function surveyDebugTriggerForKind(kind: SurveyKind): string {
  return `${SURVEY_DEBUG_TRIGGER_PREFIX}${kind}`;
}

export function nextSurveyDebugKind(current?: SurveyKind | null): SurveyKind {
  if (!current) return SURVEY_DEBUG_KINDS[0];
  const index = SURVEY_DEBUG_KINDS.indexOf(current);
  if (index < 0) return SURVEY_DEBUG_KINDS[0];
  return SURVEY_DEBUG_KINDS[(index + 1) % SURVEY_DEBUG_KINDS.length];
}

export function isSurveyQuestionRequired(question: SurveyQuestion): boolean {
  return question.required !== false;
}
