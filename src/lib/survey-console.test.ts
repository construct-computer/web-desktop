import { describe, expect, it } from 'vitest';
import {
  SURVEY_DEBUG_KINDS,
  nextSurveyDebugKind,
  surveyDebugTriggerForKind,
} from './surveys';

describe('survey console deck', () => {
  it('cycles manual survey kinds in a fixed order', () => {
    expect(nextSurveyDebugKind()).toBe(SURVEY_DEBUG_KINDS[0]);
    expect(nextSurveyDebugKind('nps')).toBe('csat');
    expect(nextSurveyDebugKind('csat')).toBe('feedback');
    expect(nextSurveyDebugKind('feedback')).toBe('churn');
    expect(nextSurveyDebugKind('churn')).toBe('custom');
    expect(nextSurveyDebugKind('custom')).toBe('nps');
  });

  it('maps manual survey kinds to stable debug triggers', () => {
    expect(surveyDebugTriggerForKind('nps')).toBe('survey:debug:nps');
    expect(surveyDebugTriggerForKind('custom')).toBe('survey:debug:custom');
  });
});
