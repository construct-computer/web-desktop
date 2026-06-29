import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useWindowStore } from '@/stores/windowStore';
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

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

export function SurveyModal({ suspended = false }: SurveyModalProps) {
  const survey = useSurveyStore((s) => s.activeSurvey);
  const loading = useSurveyStore((s) => s.loading);
  const submitting = useSurveyStore((s) => s.submitting);
  const started = useSurveyStore((s) => s.started);
  const completed = useSurveyStore((s) => s.completed);
  const error = useSurveyStore((s) => s.error);
  const callToActionUrl = useSurveyStore((s) => s.callToActionUrl);
  const responseId = useSurveyStore((s) => s.responseId);
  const markShown = useSurveyStore((s) => s.markShown);
  const markStarted = useSurveyStore((s) => s.markStarted);
  const syncDraft = useSurveyStore((s) => s.syncDraft);
  const dismiss = useSurveyStore((s) => s.dismiss);
  const submit = useSurveyStore((s) => s.submit);
  const clickCallToAction = useSurveyStore((s) => s.clickCallToAction);
  const clear = useSurveyStore((s) => s.clear);
  const minimizeAll = useWindowStore((s) => s.minimizeAll);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const shownAttemptRef = useRef<string | null>(null);
  const exitHandledRef = useRef(false);
  const draftTimerRef = useRef<number | null>(null);
  const lastDraftSnapshotRef = useRef('');

  useEffect(() => {
    if (!survey || suspended) return;
    minimizeAll();
    setAnswers({});
    exitHandledRef.current = false;
    lastDraftSnapshotRef.current = '';
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (shownAttemptRef.current === survey.attemptId) return;
    shownAttemptRef.current = survey.attemptId;
    void markShown();
  }, [survey?.attemptId, suspended, minimizeAll, markShown]);

  useEffect(() => {
    if (!survey || suspended || completed || submitting) return;

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
  }, [answers, survey?.attemptId, suspended, completed, submitting, started, markStarted, syncDraft]);

  useEffect(() => {
    if (!survey || suspended || completed) return;

    const handleExit = () => {
      if (exitHandledRef.current) return;
      exitHandledRef.current = true;

      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }

      const snapshot = JSON.stringify(answers);
      if (snapshot !== '{}' && snapshot !== lastDraftSnapshotRef.current) {
        void markStarted({ keepalive: true });
        void syncDraft(answers, { keepalive: true });
        lastDraftSnapshotRef.current = snapshot;
      }

      void dismiss({ keepalive: true });
    };

    window.addEventListener('pagehide', handleExit);
    window.addEventListener('beforeunload', handleExit);
    return () => {
      window.removeEventListener('pagehide', handleExit);
      window.removeEventListener('beforeunload', handleExit);
    };
  }, [survey?.attemptId, suspended, completed, answers, markStarted, syncDraft, dismiss]);

  if (!survey || suspended) return null;

  const activeSurvey = survey;
  const definition = activeSurvey.definition;
  const displayCallToActionUrl = callToActionUrl ? displayUrl(callToActionUrl) : null;
  const prompt = completed ? definition.completionMessage || 'Thanks. We read every response.' : definition.intro;
  const canSubmit = definition.questions.every((question) => !isSurveyQuestionRequired(question) || hasAnswer(question, answers));

  async function handleSubmit() {
    const ok = await submit(answers, {
      answer_count: Object.keys(answers).length,
      survey_kind: activeSurvey.kind,
      survey_title: definition.title,
    });
    if (ok) return;
  }

  function handleClose() {
    if (completed) {
      clear();
      return;
    }
    const snapshot = JSON.stringify(answers);
    if (snapshot !== '{}' && snapshot !== lastDraftSnapshotRef.current) {
      void markStarted();
      void syncDraft(answers);
      lastDraftSnapshotRef.current = snapshot;
    }
    void dismiss();
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
      style={{ zIndex: 2147483647 }}
    >
      <div
        className="relative w-[min(94vw,760px)] max-h-[88vh] overflow-hidden glass-popover rounded-[28px] shadow-2xl shadow-black/25 border border-black/10 dark:border-white/15 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-title"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Close survey"
        >
          <X className="w-4 h-4 text-black/50 dark:text-white/50" />
        </button>

        <div className="px-7 pt-7 pb-5 border-b border-black/5 dark:border-white/10 bg-gradient-to-br from-[var(--color-accent-muted)]/40 via-transparent to-transparent">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-accent)]">
            <Sparkles className="w-3.5 h-3.5" />
            Construct survey
          </div>
          <h2 id="survey-title" className="mt-4 text-[28px] leading-tight font-semibold tracking-tight text-balance">
            {definition.title}
          </h2>
          {prompt ? <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)] max-w-2xl">{prompt}</p> : null}
        </div>

        <div className="max-h-[calc(88vh-220px)] overflow-y-auto px-7 py-6 space-y-5">
          {!completed ? definition.questions.map((question, index) => {
            const value = answers[question.id];
            return (
              <div key={question.id} className="space-y-3 rounded-2xl border border-black/8 dark:border-white/10 bg-white/60 dark:bg-white/5 px-4 py-4">
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <label className="text-sm font-medium text-[var(--color-text)]">
                      <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">{index + 1}</span>
                      {question.question}
                    </label>
                    {isSurveyQuestionRequired(question) ? <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Required</span> : null}
                  </div>
                  {question.description ? <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{question.description}</p> : null}
                </div>

                {question.type === 'rating' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-11 gap-1">
                      {questionScale(question).map((score) => {
                        const selected = value === score;
                        return (
                          <Button
                            key={score}
                            type="button"
                            size="sm"
                            variant={selected ? 'primary' : 'default'}
                            className="px-0 text-xs"
                            onClick={() => {
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
                    <div className="flex justify-between text-[10px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
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
                          onClick={() => {
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
                          onClick={() => {
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
                      void markStarted();
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                    }}
                    rows={4}
                    className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/20 px-4 py-3 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/12"
                  />
                ) : null}
              </div>
            );
          }) : (
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Thanks for the response</div>
                  <div className="text-xs text-[var(--color-text-muted)]">We will use it to tune the product and outreach.</div>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                {prompt || 'We appreciate the time.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void clickCallToAction()}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {definition.callToAction.label}
                </Button>
                <Button type="button" variant="ghost" onClick={handleClose}>
                  Close
                </Button>
              </div>
              {responseId ? <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Response {responseId}</div> : null}
              {displayCallToActionUrl ? <div className="text-xs text-[var(--color-text-muted)] break-all">{displayCallToActionUrl}</div> : null}
            </div>
          )}
        </div>

        {!completed ? (
          <div className="flex items-center justify-between gap-3 border-t border-black/5 dark:border-white/10 px-7 py-5 bg-[var(--color-surface)]/75 backdrop-blur-sm">
            <div className="text-xs text-[var(--color-text-muted)]">
              {loading ? 'Loading a survey…' : 'Quick feedback helps us keep the product sharp.'}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
                Maybe later
              </Button>
              <Button type="button" variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Sending…' : 'Submit'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-black/5 dark:border-white/10 px-7 py-5 bg-[var(--color-surface)]/75 backdrop-blur-sm">
            <div className="text-xs text-[var(--color-text-muted)]">The founders call button is above.</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {error ? <div className="px-7 pb-6 text-xs text-red-500">{error}</div> : null}
      </div>
    </div>
  );
}
