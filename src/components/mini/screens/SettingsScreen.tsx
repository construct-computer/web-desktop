/**
 * SettingsScreen -- Mobile settings for the Telegram Mini App.
 * Mirrors the desktop SettingsWindow sections 1:1 (minus Appearance/Sound/Developer
 * which are desktop-only concepts).
 *
 * Sections:
 *   User         — Agent status, profile, agent name, email, agent email, timezone
 *   Connections   — Read-only status for all platforms
 *   Subscription  — Plan, AI usage with cost + timer, storage, top-ups
 */

import { useState, useEffect, useCallback } from 'react';
import {
  User, Link2, CreditCard, ChevronRight, Check, X,
  Hash, Send, Mail, CalendarDays, HardDrive,
  Clock, Zap, AlertTriangle, Lock,
} from 'lucide-react';
import {
  MiniHeader, Card, Field, Badge, useToast, haptic,
  SectionLabel, Spinner,
  api, apiJSON, bg2, textColor, accent,
} from '../ui';
import { getTimezoneOptions, getDetectedTimezone } from '@/lib/timezones';

// -- Types --

type Section = 'list' | 'user' | 'connections' | 'subscription';

// -- Helpers --


function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

function formatTimeRemaining(resetsAt: number | string): string {
  const ts = typeof resetsAt === 'string' ? new Date(resetsAt).getTime() : resetsAt;
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// -- Main Component --

export function SettingsScreen() {
  const [section, setSection] = useState<Section>('list');

  const goBack = () => { setSection('list'); haptic(); };

  if (section === 'user') return <UserSection onBack={goBack} />;
  if (section === 'connections') return <ConnectionsSection onBack={goBack} />;
  if (section === 'subscription') return <SubscriptionSection onBack={goBack} />;

  const sections: { id: Section; label: string; icon: typeof User; desc: string }[] = [
    { id: 'user', label: 'User', icon: User, desc: 'Profile, agent identity, and email' },
    { id: 'connections', label: 'Connections', icon: Link2, desc: 'Slack, Telegram, Email, Calendar, Drive' },
    { id: 'subscription', label: 'Subscription', icon: CreditCard, desc: 'Plan, usage, and billing' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader title="Settings" />
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {sections.map((s) => (
          <Card key={s.id} onClick={() => { setSection(s.id); haptic(); }}>
            <div className="flex items-center gap-3">
              <s.icon size={20} className="opacity-40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium" style={{ color: textColor() }}>{s.label}</p>
                <p className="text-[12px] opacity-40">{s.desc}</p>
              </div>
              <ChevronRight size={16} className="opacity-20 shrink-0" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// -- User Section (matches desktop: status, name, agent name, email, agent email, timezone) --

function UserSection({ onBack }: { onBack: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [email, setEmail] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [agentOnline, setAgentOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const [me, agentConfig] = await Promise.all([
        apiJSON<any>('/auth/me'),
        apiJSON<any>('/agent/config'),
      ]);
      if (me?.user) {
        setDisplayName(me.user.displayName || '');
        setEmail(me.user.email || '');
      }
      if (agentConfig) {
        setAgentName(agentConfig.agent_name || agentConfig.identityName || '');
        setTimezone(agentConfig.timezone || getDetectedTimezone());
        setAgentOnline(true);

        const existing = agentConfig.agentmailEmail || agentConfig.agentmail_email || '';
        if (existing) {
          setAgentEmail(existing);
          setEmailLocked(true);
          // Extract base username: "ankush@agents.construct.computer" -> "ankush"
          setEmailUsername(existing.replace(/@.*$/, ''));
        } else {
          const inbox = agentConfig.agentmail_inbox_username || '';
          if (inbox) {
            setEmailUsername(inbox.replace(/@.*$/, ''));
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const updateData: Record<string, string> = {
        agent_name: agentName.trim() || 'Construct Agent',
        timezone: timezone.trim(),
      };

      if (!emailLocked && emailUsername.trim()) {
        updateData.email_username = emailUsername.trim();
      }

      const [profileRes, agentRes] = await Promise.all([
        api('/auth/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: displayName.trim() }),
        }),
        api('/agent/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        }),
      ]);
      if (profileRes.ok && agentRes.ok) {
        haptic('success');
        toast.show('Saved', 'success');
      } else {
        haptic('error');
        toast.show('Save failed', 'error');
      }
    } catch {
      haptic('error');
      toast.show('Save failed', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader title="User" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {/* Your Name */}
            <SectionLabel>You</SectionLabel>
            <Field label="Your Name" value={displayName} onChange={setDisplayName} placeholder="Display name" />
            {email && (
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] opacity-50">Email</span>
                  <span className="text-[13px] opacity-70">{email}</span>
                </div>
              </Card>
            )}

            {/* Agent Name + Agent Email */}
            <SectionLabel>Agent</SectionLabel>
            <Field label="Agent Name" value={agentName} onChange={setAgentName} placeholder="Construct Agent" />
            {emailLocked ? (
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] opacity-50">Agent Email</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] truncate opacity-70">{agentEmail}</span>
                    <Lock size={12} className="opacity-30 shrink-0" />
                  </div>
                </div>
              </Card>
            ) : (
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider opacity-40 mb-1.5 block">Agent Email</label>
                <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ backgroundColor: bg2() }}>
                  <input
                    type="text"
                    value={emailUsername}
                    onChange={(e) => setEmailUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                    placeholder="yourname"
                    className="flex-1 min-w-0 text-[14px] px-3.5 py-2.5 bg-transparent outline-none"
                    style={{ color: textColor() }}
                  />
                  <span className="text-[12px] opacity-30 px-3 py-2.5 whitespace-nowrap select-none">
                    @agents.construct.computer
                  </span>
                </div>
              </div>
            )}

            {/* Timezone */}
            <SectionLabel>Timezone</SectionLabel>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full text-[14px] px-3.5 py-2.5 rounded-xl outline-none appearance-none"
              style={{ backgroundColor: bg2(), color: textColor() }}
            >
              {!timezone && <option value="">Select timezone...</option>}
              {getTimezoneOptions().map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
              className="w-full py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40"
              style={{ backgroundColor: accent(), color: '#fff' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Connections Section (read-only status, matches desktop platforms) --

const CONNECTION_ITEMS = [
  { name: 'Slack', key: 'slack', Icon: Hash, color: '#4A154B' },
  { name: 'Telegram', key: 'telegram', Icon: Send, color: '#2AABEE' },
  { name: 'Email', key: 'email', Icon: Mail, color: '#EA4335' },
  { name: 'Google Calendar', key: 'googleCalendar', Icon: CalendarDays, color: '#4285F4' },
  { name: 'Google Drive', key: 'googleDrive', Icon: HardDrive, color: '#0F9D58' },
] as const;

function ConnectionsSection({ onBack }: { onBack: () => void }) {
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [slack, telegram, email, composio] = await Promise.all([
        apiJSON<any>('/slack/status'),
        apiJSON<any>('/telegram/status'),
        apiJSON<any>('/email/status'),
        apiJSON<any>('/composio/connected'),
      ]);
      const conn: Record<string, boolean> = {};
      conn.slack = !!slack?.connected;
      conn.telegram = !!telegram?.connected;
      conn.email = !!email?.configured || !!email?.inbox;
      const composioList = composio?.connected || [];
      conn.googleCalendar = composioList.some((c: any) => c.toolkit === 'googlecalendar');
      conn.googleDrive = composioList.some((c: any) => c.toolkit === 'googledrive');
      setConnections(conn);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader title="Connections" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="space-y-2">
            {CONNECTION_ITEMS.map(item => (
              <Card key={item.key}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}20` }}>
                    <item.Icon size={16} style={{ color: item.color }} />
                  </div>
                  <span className="flex-1 text-[14px]" style={{ color: textColor() }}>{item.name}</span>
                  {connections[item.key] ? (
                    <Badge color="#22c55e">
                      <Check size={10} /> Connected
                    </Badge>
                  ) : (
                    <Badge>
                      <X size={10} /> Not connected
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-[11px] opacity-20 text-center mt-4">Manage connections from the desktop app</p>
      </div>
    </div>
  );
}

// -- Subscription Section (matches desktop: plan, AI usage w/ cost + timer, storage, top-ups) --

function SubscriptionSection({ onBack }: { onBack: () => void }) {
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    (async () => {
      const [sub, usg, stor] = await Promise.all([
        apiJSON<any>('/billing/subscription'),
        apiJSON<any>('/billing/usage/current'),
        apiJSON<any>('/billing/storage'),
      ]);
      setSubscription(sub);
      setUsage(usg);
      setStorage(stor);
      setLoading(false);
    })();
  }, []);

  // Refresh usage periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const usg = await apiJSON<any>('/billing/usage/current');
      if (usg) setUsage(usg);
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Reset countdown timer
  useEffect(() => {
    if (!usage?.resetsAt) return;
    const update = () => setTimeLeft(formatTimeRemaining(usage.resetsAt));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [usage?.resetsAt]);

  const isPro = subscription?.plan === 'pro';
  const isCancelling = subscription?.cancelAtPeriodEnd;
  const isStaging = usage?.environment === 'staging';
  const costCap = usage?.costCapUsd ?? 0;
  const isUnlimited = costCap === -1;
  const pct = usage?.percentUsed || 0;
  const barColor = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : accent();

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader title="Subscription" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {/* Plan */}
            <SectionLabel>Plan</SectionLabel>
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-[13px] opacity-50">Current plan</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-medium capitalize"
                    style={{ color: isPro ? '#22d3ee' : textColor() }}
                  >
                    {isPro ? 'Pro' : 'Free'}
                  </span>
                  {isPro && (
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded-full uppercase tracking-wide"
                      style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      Active
                    </span>
                  )}
                </div>
              </div>
              {isPro && (
                <p className="text-[12px] opacity-40 mt-1">
                  {isCancelling ? '$250/month — cancels at end of period' : '$250/month'}
                </p>
              )}
            </Card>

            {!isPro && (
              <Card>
                <div className="space-y-2">
                  <p className="text-[12px] opacity-50">Subscribe to use your AI computer</p>
                  {['Unlimited access to your AI computer',
                    'All frontier AI models included',
                    'Unlimited messages, searches, and emails',
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[12px] opacity-40">
                      <Check size={12} style={{ color: '#22c55e' }} className="shrink-0" />
                      {f}
                    </div>
                  ))}
                  <p className="text-[11px] opacity-30 mt-1">Subscribe from the desktop app</p>
                </div>
              </Card>
            )}

            {/* AI Usage */}
            <SectionLabel>AI Usage</SectionLabel>
            {usage ? (
              <Card>
                <div className="space-y-2.5">
                  {/* Cost + reset timer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] opacity-50">Cost this period</span>
                    <span className="text-[13px] font-mono font-medium">
                      {isUnlimited ? (
                        <>
                          {formatCost(usage.totalCostUsd || 0)}
                          <span className="opacity-40 font-normal text-[12px] ml-1">(unlimited)</span>
                        </>
                      ) : costCap > 0 ? (
                        <>
                          {formatCost(usage.totalCostUsd || 0)}
                          <span className="opacity-40 font-normal"> / {formatCost(costCap)}</span>
                        </>
                      ) : (
                        <>{pct}% used</>
                      )}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {!isUnlimited && (
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(1, Math.min(100, pct))}%`, backgroundColor: barColor }}
                      />
                    </div>
                  )}

                  {/* Timer */}
                  {timeLeft && (
                    <div className="flex items-center gap-1.5 text-[11px] opacity-40">
                      <Clock size={11} />
                      Resets in {timeLeft}
                    </div>
                  )}

                  {/* Stats (staging only) */}
                  {isStaging && (
                    <div className="flex justify-between text-[11px] opacity-40 font-mono">
                      <span>{((usage.promptTokens || 0) + (usage.completionTokens || 0)).toLocaleString()} tokens</span>
                      <span>{usage.requestCount || 0} requests</span>
                    </div>
                  )}

                  {/* Warning */}
                  {!isUnlimited && pct >= 80 && (
                    <div
                      className="flex items-center gap-2 p-2 rounded-lg text-[12px]"
                      style={{
                        backgroundColor: pct >= 95 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: pct >= 95 ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      <AlertTriangle size={14} className="shrink-0" />
                      {pct >= 95
                        ? `AI cost limit nearly reached. Resets in ${timeLeft}.`
                        : `${pct}% of AI cost budget used this period.`}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card>
                <p className="text-[12px] opacity-40">No usage data available.</p>
              </Card>
            )}

            {/* Storage */}
            {storage && storage.bytesUsed != null && (
              <>
                <SectionLabel>Storage</SectionLabel>
                <Card>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="opacity-50">
                        {storage.fileCount} file{storage.fileCount !== 1 ? 's' : ''}
                      </span>
                      <span className="font-mono font-medium">
                        {(storage.bytesUsed / (1024 * 1024 * 1024)).toFixed(2)} GB
                        <span className="opacity-40 font-normal"> / {(storage.maxBytes / (1024 * 1024 * 1024)).toFixed(0)} GB</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(1, Math.min(100, (storage.bytesUsed / storage.maxBytes) * 100))}%`,
                          backgroundColor: storage.bytesUsed / storage.maxBytes >= 0.95 ? '#ef4444'
                            : storage.bytesUsed / storage.maxBytes >= 0.8 ? '#f59e0b'
                            : accent(),
                        }}
                      />
                    </div>
                    <div className="text-right text-[11px] opacity-40">
                      {((storage.maxBytes - storage.bytesUsed) / (1024 * 1024 * 1024)).toFixed(2)} GB available
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Credit Top-Ups */}
            {isPro && !isUnlimited && subscription?.topupsEnabled && (
              <>
                <SectionLabel>Credit Top-Ups</SectionLabel>
                <Card>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="opacity-50">Current balance</span>
                      <span className="font-mono font-medium">
                        ${(subscription.topupCreditsUsd || 0).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[12px] opacity-40">
                      Credits extend your AI usage when you hit the cost cap.
                    </p>
                    <p className="text-[11px] opacity-30">Purchase top-ups from the desktop app</p>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
