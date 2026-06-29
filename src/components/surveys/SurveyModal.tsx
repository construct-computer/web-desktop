import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { Z_INDEX } from '@/lib/constants';
import { isNativePlatform } from '@/native';
import { useSurveyStore } from '@/stores/surveyStore';
import { isSurveyQuestionRequired, type SurveyAnswers, type SurveyQuestion } from '@/lib/surveys';

interface SurveyModalProps {
  suspended?: boolean;
}

function hasAnswer(question: SurveyQuestion, answers: SurveyAnswers): boolean {
  const value = answers[question.id];
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return Number.isFinite(value);
}

function questionScale(question: SurveyQuestion): number[] {
  const min = Math.floor(question.min ?? 0);
  const max = Math.floor(question.max ?? 10);
  const size = Math.max(0, max - min + 1);
  return Array.from({ length: size }, (_, index) => min + index);
}

function answeredQuestionCount(questions: SurveyQuestion[], answers: SurveyAnswers): number {
  return questions.filter((question) => hasAnswer(question, answers)).length;
}

function founderCallLabel(label: string): string {
  return /book\s*15/i.test(label) ? 'Talk to the founders' : label;
}

export function SurveyModal({ suspended = false }: SurveyModalProps) {
  const survey = useSurveyStore((s) => s.activeSurvey);
  const loading = useSurveyStore((s) => s.loading);
  const submitting = useSurveyStore((s) => s.submitting);
  const started = useSurveyStore((s) => s.started);
  const completed = useSurveyStore((s) => s.completed);
  const error = useSurveyStore((s) => s.error);
  const markShown = useSurveyStore((s) => s.markShown);
  const markStarted = useSurveyStore((s) => s.markStarted);
  const syncDraft = useSurveyStore((s) => s.syncDraft);
  const dismiss = useSurveyStore((s) => s.dismiss);
  const submit = useSurveyStore((s) => s.submit);
  const clickCallToAction = useSurveyStore((s) => s.clickCallToAction);
  const clear = useSurveyStore((s) => s.clear);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [expanded, setExpanded] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const initializedAttemptRef = useRef<string | null>(null);
  const shownAttemptRef = useRef<string | null>(null);
  const exitHandledRef = useRef(false);
  const draftTimerRef = useRef<number | null>(null);
  const lastDraftSnapshotRef = useRef('');

  useEffect(() => {
    if (!survey) return;
    if (initializedAttemptRef.current === survey.attemptId) return;

    initializedAttemptRef.current = survey.attemptId;
    shownAttemptRef.current = null;
    exitHandledRef.current = false;
    lastDraftSnapshotRef.current = '';
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    setAnswers({});
    setExpanded(false);
    setHasShown(false);
  }, [survey?.attemptId]);

  useEffect(() => {
    return () => {
      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, []);

  function revealSurvey() {
    if (!survey || shownAttemptRef.current === survey.attemptId) return;
    shownAttemptRef.current = survey.attemptId;
    exitHandledRef.current = false;
    setHasShown(true);
    void markShown();
  }

  function flushDraft(options?: RequestInit) {
    const snapshot = JSON.stringify(answers);
    if (snapshot === '{}' || snapshot === lastDraftSnapshotRef.current) return;
    void markStarted(options);
    void syncDraft(answers, options);
    lastDraftSnapshotRef.current = snapshot;
  }

  useEffect(() => {
    if (!survey || suspended || completed || submitting || !hasShown) return;

    const snapshot = JSON.stringify(answers);
    if (snapshot === '{}' || snapshot === lastDraftSnapshotRef.current) return;

    if (!started) {
      void markStarted();
    }

    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = window.setTimeout(() => {
      lastDraftSnapshotRef.current = snapshot;
      void syncDraft(answers);
    }, 200);

    return () => {
      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [answers, survey?.attemptId, suspended, completed, submitting, hasShown, started, markStarted, syncDraft]);

  useEffect(() => {
    if (!survey || suspended || completed || !hasShown) return;

    const handleExit = () => {
      if (exitHandledRef.current) return;
      exitHandledRef.current = true;

      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }

      flushDraft({ keepalive: true });
      void dismiss({ keepalive: true });
    };

    window.addEventListener('pagehide', handleExit);
    window.addEventListener('beforeunload', handleExit);
    return () => {
      window.removeEventListener('pagehide', handleExit);
      window.removeEventListener('beforeunload', handleExit);
    };
  }, [survey?.attemptId, suspended, completed, hasShown, answers, markStarted, syncDraft, dismiss]);

  if (!survey || suspended) return null;

  const activeSurvey = survey;
  const definition = activeSurvey.definition;
  const questionCount = definition.questions.length;
  const answeredCount = answeredQuestionCount(definition.questions, answers);
  const prompt = completed
    ? definition.completionMessage || 'Thanks. We read every response.'
    : definition.intro || 'Quick feedback helps us improve Construct without getting in the way.';
  const collapsedSummary = hasShown && answeredCount > 0
    ? `${answeredCount} of ${questionCount} answered.`
    : prompt;
  const isExpanded = expanded && !completed;
  const canSubmit = definition.questions.every((question) => !isSurveyQuestionRequired(question) || hasAnswer(question, answers));
  const callToActionLabel = founderCallLabel(definition.callToAction.label);
  const callOpensInBrowser = Boolean(window.Telegram?.WebApp?.openLink) || isNativePlatform();
  const founderCallTitle = 'Book a 15-minute call with the founders';
  const founderCallDescription = 'Want to go deeper? Talk directly with the Construct founders about your feedback and what should happen next.';
  const founderCallHint = callOpensInBrowser ? 'Opens the booking page in your browser.' : 'Opens the booking page in a new tab.';

  async function handleSubmit() {
    revealSurvey();
    const ok = await submit(answers, {
      answer_count: Object.keys(answers).length,
      survey_kind: activeSurvey.kind,
      survey_title: definition.title,
    });
    if (!ok) return;
    setExpanded(false);
  }

  function handleExpand() {
    revealSurvey();
    setExpanded(true);
  }

  function handleCollapse() {
    setExpanded(false);
  }

  function handleDismiss() {
    if (completed) {
      clear();
      return;
    }

    if (!hasShown) {
      clear();
      return;
    }

    flushDraft();
    void dismiss();
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] flex justify-end sm:inset-x-auto sm:right-4 sm:bottom-4"
      style={{ zIndex: Z_INDEX.survey }}
    >
      <section
        className={`pointer-events-auto w-full max-w-[calc(100vw-24px)] overflow-hidden rounded-[24px] border border-black/8 shadow-[0_24px_70px_rgba(0,0,0,0.18)] soft-popover dark:border-white/12 ${isExpanded ? 'sm:w-[400px]' : 'sm:w-[360px]'}`}
        aria-live="polite"
        aria-labelledby="survey-title"
        data-survey-state={completed ? 'submitted' : isExpanded ? 'expanded' : 'collapsed'}
      >
        {completed ? (
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/14 text-emerald-600 dark:text-emerald-400">
                <Check className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                      Feedback sent
                    </div>
                    <h2 id="survey-title" className="mt-1 text-[17px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[18px]">
                      Thanks for the response
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="rounded-full p-2 text-black/35 transition-colors hover:bg-black/5 hover:text-black/60 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/60"
                    aria-label="Close survey"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                  {prompt}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-[var(--color-accent)]/15 bg-[var(--color-accent)]/7 px-4 py-4 dark:bg-[var(--color-accent)]/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent)]/14 text-[var(--color-accent)]">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    Optional next step
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--color-text)] sm:text-[15px]">
                    {founderCallTitle}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)] sm:text-[13px]">
                    {founderCallDescription}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {founderCallHint}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="primary" className="sm:flex-1" onClick={() => void clickCallToAction()}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {callToActionLabel}
                </Button>
                <Button type="button" variant="ghost" className="sm:flex-1" onClick={handleDismiss}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : isExpanded ? (
          <>
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/10 dark:bg-white/12 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/15 bg-[var(--color-accent)]/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Quick survey
                  </div>
                  <h2 id="survey-title" className="mt-3 text-[18px] font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[20px]">
                    {definition.title}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                    {prompt}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCollapse}
                    className="rounded-full p-2 text-black/35 transition-colors hover:bg-black/5 hover:text-black/60 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/60"
                    aria-label="Collapse survey"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="rounded-full p-2 text-black/35 transition-colors hover:bg-black/5 hover:text-black/60 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/60"
                    aria-label="Close survey"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>
                {answeredCount > 0 ? <span>{answeredCount} answered</span> : <span>Non-blocking</span>}
              </div>
            </div>

            <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
              <div className="max-h-[40dvh] space-y-4 overflow-y-auto pr-1 sm:max-h-[46vh]">
                {definition.questions.map((question, index) => {
                  const value = answers[question.id];
                  const shouldShowQuestion = question.type !== 'open_text'
                    || isSurveyQuestionRequired(question)
                    || answeredCount > 0
                    || hasAnswer(question, answers);
                  if (!shouldShowQuestion) return null;

                  return (
                    <div key={question.id} className="space-y-3 rounded-[20px] border border-black/8 bg-white/55 px-4 py-4 dark:border-white/10 dark:bg-white/[0.06]">
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <label className="text-sm font-medium text-[var(--color-text)]">
                            <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{index + 1}</span>
                            {question.question}
                          </label>
                          {isSurveyQuestionRequired(question) ? (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Required</span>
                          ) : null}
                        </div>
                        {question.description ? <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{question.description}</p> : null}
                      </div>

                      {question.type === 'rating' ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {questionScale(question).map((score) => {
                              const selected = value === score;
                              return (
                                <Button
                                  key={score}
                                  type="button"
                                  size="sm"
                                  variant={selected ? 'primary' : 'default'}
                                  className="h-9 w-9 rounded-full px-0 text-xs font-semibold"
                                  onClick={() => {
                                    revealSurvey();
                                    if (value !== score) void markStarted();
                                    setAnswers((current) => ({ ...current, [question.id]: score }));
                                  }}
                                  aria-pressed={selected}
                                >
                                  {score}
                                </Button>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                            <span>{question.min ?? 0} low</span>
                            <span>{question.max ?? 10} high</span>
                          </div>
                        </div>
                      ) : null}

                      {question.type === 'single_choice' ? (
                        <div className="flex flex-wrap gap-2">
                          {question.choices?.map((choice) => {
                            const selected = value === choice;
                            return (
                              <Button
                                key={choice}
                                type="button"
                                size="sm"
                                variant={selected ? 'primary' : 'default'}
                                className="rounded-full"
                                onClick={() => {
                                  revealSurvey();
                                  void markStarted();
                                  setAnswers((current) => ({ ...current, [question.id]: choice }));
                                }}
                              >
                                {choice}
                              </Button>
                            );
                          })}
                        </div>
                      ) : null}

                      {question.type === 'multiple_choice' ? (
                        <div className="flex flex-wrap gap-2">
                          {question.choices?.map((choice) => {
                            const selected = Array.isArray(value) && value.includes(choice);
                            return (
                              <Button
                                key={choice}
                                type="button"
                                size="sm"
                                variant={selected ? 'primary' : 'default'}
                                className="rounded-full"
                                onClick={() => {
                                  revealSurvey();
                                  void markStarted();
                                  setAnswers((current) => {
                                    const currentValue = Array.isArray(current[question.id]) ? current[question.id] as string[] : [];
                                    const next = selected
                                      ? currentValue.filter((item) => item !== choice)
                                      : [...currentValue, choice];
                                    return { ...current, [question.id]: next };
                                  });
                                }}
                              >
                                {choice}
                              </Button>
                            );
                          })}
                        </div>
                      ) : null}

                      {question.type === 'open_text' ? (
                        <textarea
                          value={typeof value === 'string' ? value : ''}
                          placeholder={question.placeholder || 'Type your answer'}
                          onChange={(event) => {
                            revealSurvey();
                            void markStarted();
                            setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                          }}
                          rows={3}
                          className="w-full rounded-[18px] border border-black/10 bg-white/80 px-4 py-3 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/12 dark:border-white/10 dark:bg-black/20"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-black/6 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--color-text-muted)]">
                  {loading ? 'Loading a survey…' : answeredCount > 0 ? `${answeredCount} of ${questionCount} answered` : 'Takes about a minute.'}
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={handleDismiss} disabled={submitting}>
                    Not now
                  </Button>
                  <Button type="button" variant="primary" className="flex-1 sm:flex-none" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submitting ? 'Sending…' : 'Submit'}
                  </Button>
                </div>
              </div>

              {error ? <div className="mt-3 text-xs text-red-500">{error}</div> : null}
            </div>
          </>
        ) : (
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <Sparkles className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/15 bg-[var(--color-accent)]/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                      Quick survey
                    </div>
                    <h2 id="survey-title" className="mt-3 text-[17px] font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[18px]">
                      {definition.title}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="rounded-full p-2 text-black/35 transition-colors hover:bg-black/5 hover:text-black/60 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/60"
                    aria-label="Close survey"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                  {collapsedSummary}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>
                  <span>{hasShown ? (started ? 'In progress' : 'Opened') : 'Non-blocking'}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" className="sm:flex-none" onClick={handleDismiss}>
                {hasShown ? 'Dismiss' : 'Not now'}
              </Button>
              <Button type="button" variant="primary" className="sm:flex-none" onClick={handleExpand}>
                {hasShown && answeredCount > 0 ? 'Continue' : 'Give feedback'}
              </Button>
            </div>

            {error ? <div className="mt-3 text-xs text-red-500">{error}</div> : null}
          </div>
        )}
      </section>
    </div>
  );
}
