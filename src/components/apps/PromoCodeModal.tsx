/**
 * PromoCodeModal — shown once after onboarding to a non-pro user who landed
 * on the site via a ?code=XXX URL. Offers them the promo as a coupon applied
 * to the Pro checkout flow.
 */

import { useState, useCallback } from 'react';
import { Gift, Loader2, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import { STORAGE_KEYS } from '@/lib/constants';

interface PromoCodeModalProps {
  code: string;
  onDismiss: () => void;
}

export function PromoCodeModal({ code, onDismiss }: PromoCodeModalProps) {
  const startCheckout = useBillingStore((s) => s.startCheckout);
  const [loading, setLoading] = useState(false);

  const handleUpgrade = useCallback(async () => {
    setLoading(true);
    const url = await startCheckout('pro', code);
    if (url) {
      // Keep the code in storage until checkout completes so the user can
      // retry if they abandon the Dodo page. The success redirect reloads
      // the app, at which point plan === 'pro' suppresses the modal.
      window.location.href = url;
      return;
    }
    setLoading(false);
  }, [startCheckout, code]);

  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEYS.promoSeen, '1'); } catch { /* */ }
    onDismiss();
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
      <div className="relative w-full max-w-md bg-white/50 dark:bg-black/50 backdrop-blur-2xl saturate-150 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/40 border border-black/10 dark:border-white/15 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-black/50 dark:text-white/50" />
        </button>

        <div className="text-center px-8 pt-8 pb-2 space-y-3">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-emerald-400/20 to-emerald-500/10 dark:from-emerald-400/20 dark:to-emerald-500/10 rounded-full flex items-center justify-center shadow-inner">
            <Gift className="w-8 h-8 text-emerald-500 dark:text-emerald-400 drop-shadow-sm" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">You have a promo code</h2>
          <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed">
            Use this code at checkout to get your first month of Pro on us.
          </p>
        </div>

        <div className="px-8 py-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Your code</div>
                <div className="text-[16px] font-mono font-semibold tracking-wider text-black dark:text-white truncate">{code}</div>
              </div>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              1 month free
            </span>
          </div>
        </div>

        <div className="px-8 pb-6 pt-2 flex items-center gap-2">
          <Button variant="ghost" className="flex-1" onClick={handleDismiss} disabled={loading}>
            Maybe later
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleUpgrade} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? 'Redirecting...' : 'Upgrade to Pro'}
          </Button>
        </div>
      </div>
    </div>
  );
}
