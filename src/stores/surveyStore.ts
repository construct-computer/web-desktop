import { create } from 'zustand';
import * as api from '@/services/api';
import { openNativeExternalUrl } from '@/native';
import { detectSurveySurface, type SurveyAnswers, type SurveyEventName, type SurveyPayload, type SurveySurface } from '@/lib/surveys';

interface SurveyContext {
  trigger: string;
  surface: SurveySurface;
}

interface SurveyStore {
  activeSurvey: SurveyPayload | null;
  context: SurveyContext | null;
  loading: boolean;
  submitting: boolean;
  started: boolean;
  completed: boolean;
  error: string | null;
  callToActionUrl: string | null;
  responseId: string | null;
  requestId: number;
  refresh: (trigger: string, surface?: SurveySurface) => Promise<void>;
  markShown: () => Promise<void>;
  markStarted: (options?: RequestInit) => Promise<void>;
  syncDraft: (answers: SurveyAnswers, options?: RequestInit) => Promise<void>;
  dismiss: (options?: RequestInit) => Promise<void>;
  submit: (answers: SurveyAnswers, metadata?: Record<string, unknown>) => Promise<boolean>;
  clickCallToAction: () => Promise<void>;
  clear: () => void;
}

function createInitialState(requestId = 0) {
  return {
    activeSurvey: null,
    context: null,
    loading: false,
    submitting: false,
    started: false,
    completed: false,
    error: null,
    callToActionUrl: null,
    responseId: null,
    requestId,
  };
}

async function sendSurveyEvent(
  survey: SurveyPayload,
  context: SurveyContext,
  event: SurveyEventName,
  metadata?: Record<string, unknown>,
  body?: { answers?: SurveyAnswers },
  options?: RequestInit,
): Promise<void> {
  void api.trackSurveyEvent(survey.id, {
    attemptId: survey.attemptId,
    event,
    revisionId: survey.revisionId,
    surface: context.surface,
    trigger: context.trigger,
    ...(body?.answers ? { answers: body.answers } : {}),
    metadata,
  }, options);
}

async function openSurveyCallToActionUrl(url: string): Promise<void> {
  const tg = window.Telegram?.WebApp;
  if (typeof tg?.openLink === 'function') {
    tg.openLink(url);
    return;
  }

  try {
    if (await openNativeExternalUrl(url)) return;
  } catch {
    // Fall through to the browser open path.
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}

const initialState = createInitialState();

export const useSurveyStore = create<SurveyStore>((set, get) => ({
  ...initialState,

  refresh: async (trigger, surface = detectSurveySurface()) => {
    const { activeSurvey, loading, requestId } = get();
    if (activeSurvey || loading) return;

    const nextRequestId = requestId + 1;
    set({ loading: true, error: null, requestId: nextRequestId });
    const result = await api.getNextSurvey(trigger, surface);
    if (get().requestId !== nextRequestId) return;
    if (!result.success) {
      set({ ...createInitialState(nextRequestId), error: result.error });
      return;
    }

    const survey = result.data.survey;
    if (!survey) {
      set(createInitialState(nextRequestId));
      return;
    }

    set({
      activeSurvey: survey,
      context: { trigger, surface },
      loading: false,
      submitting: false,
      started: false,
      completed: false,
      error: null,
      callToActionUrl: null,
      responseId: null,
      requestId: nextRequestId,
    });
  },

  markShown: async () => {
    const { activeSurvey, context } = get();
    if (!activeSurvey || !context) return;
    await sendSurveyEvent(activeSurvey, context, 'shown');
  },

  markStarted: async (options) => {
    const { activeSurvey, context, started } = get();
    if (!activeSurvey || !context || started) return;
    set({ started: true });
    await sendSurveyEvent(activeSurvey, context, 'started', undefined, undefined, options);
  },

  syncDraft: async (answers, options) => {
    const { activeSurvey, context, completed, submitting } = get();
    if (!activeSurvey || !context || completed || submitting) return;
    await sendSurveyEvent(activeSurvey, context, 'started', undefined, { answers }, options);
  },

  dismiss: async (options) => {
    const { activeSurvey, context, started } = get();
    if (!activeSurvey || !context) return;
    await sendSurveyEvent(activeSurvey, context, started ? 'abandoned' : 'dismissed', undefined, undefined, options);
    set((state) => createInitialState(state.requestId + 1));
  },

  submit: async (answers, metadata = {}) => {
    const { activeSurvey, context, submitting, completed } = get();
    if (!activeSurvey || !context || submitting || completed) return false;

    if (!get().started) {
      set({ started: true });
      await sendSurveyEvent(activeSurvey, context, 'started');
    }

    set({ submitting: true, error: null });
    const result = await api.submitSurveyResponse(activeSurvey.id, {
      attemptId: activeSurvey.attemptId,
      revisionId: activeSurvey.revisionId,
      surface: context.surface,
      trigger: context.trigger,
      answers,
      metadata,
    });

    if (!result.success) {
      set({ submitting: false, error: result.error || 'Could not submit survey.' });
      return false;
    }

    set({
      submitting: false,
      completed: true,
      callToActionUrl: result.data.callToActionUrl,
      responseId: result.data.responseId,
    });
    return true;
  },

  clickCallToAction: async () => {
    const { activeSurvey, context, callToActionUrl } = get();
    if (!activeSurvey || !context) return;
    const url = callToActionUrl || activeSurvey.definition.callToAction.url;
    void sendSurveyEvent(activeSurvey, context, 'call_cta_clicked', { url });
    await openSurveyCallToActionUrl(url);
  },

  clear: () => set((state) => createInitialState(state.requestId + 1)),
}));
