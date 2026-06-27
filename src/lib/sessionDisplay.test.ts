import { describe, expect, it } from 'vitest';
import {
  getSessionDisplayMeta,
  isCalendarReminderSessionKey,
  isReadOnlySessionKey,
  isScheduledSessionKey,
} from './sessionDisplay';

describe('sessionDisplay', () => {
  it('maps external session keys to read-only platforms', () => {
    expect(getSessionDisplayMeta('slack_team_1').kind).toBe('slack');
    expect(getSessionDisplayMeta('telegram_42').kind).toBe('telegram');
    expect(getSessionDisplayMeta('email_thr_1').kind).toBe('email');
    expect(getSessionDisplayMeta('discord_guild_channel_msg').kind).toBe('discord');
    expect(getSessionDisplayMeta('discord_guild_channel_msg').iconUrl).toContain('discord');
    expect(isReadOnlySessionKey('slack_team_1')).toBe(true);
    expect(isReadOnlySessionKey('discord_guild_channel_msg')).toBe(true);
  });

  it('maps scheduled and calendar reminder keys', () => {
    expect(getSessionDisplayMeta('sched_sch_1_occ_1').kind).toBe('scheduled');
    expect(getSessionDisplayMeta('sched_evt_evt1').kind).toBe('scheduled');
    expect(getSessionDisplayMeta('calendar_evt_evt1').kind).toBe('calendar');
    expect(isScheduledSessionKey('sched_evt_evt1')).toBe(true);
    expect(isCalendarReminderSessionKey('calendar_evt_evt1')).toBe(true);
  });

  it('labels legacy shared lanes', () => {
    expect(getSessionDisplayMeta('scheduled_tasks').legacy).toBe(true);
    expect(getSessionDisplayMeta('calendar_reminders').legacy).toBe(true);
  });

  it('treats desktop chats as editable', () => {
    expect(getSessionDisplayMeta('default').kind).toBe('desktop');
    expect(isReadOnlySessionKey('default')).toBe(false);
  });
});
