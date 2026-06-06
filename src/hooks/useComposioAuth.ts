import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/services/api';
import { openAuthPopup } from '@/lib/utils';
import type { AuthScheme, ComposioAuthDetail } from '@/components/apps/composioAuthUtils';
import {
  normalizeAuthSchemes,
  orderAuthSchemes,
  prettifyConnectError,
} from '@/components/apps/composioAuthUtils';

export interface ComposioAuthPrefetch {
  authSchemes?: string[];
  authConfig?: Array<{ mode: string; fields: Array<{ name: string; displayName: string; description?: string; required: boolean }> }>;
  composioManagedSchemes?: string[];
}

export function useComposioAuth(
  slug: string,
  onConnected?: () => void,
  prefetch?: ComposioAuthPrefetch,
) {
  const [detail, setDetail] = useState<ComposioAuthDetail | null>(() => {
    if (!prefetch?.authSchemes?.length) return null;
    return {
      auth_schemes: normalizeAuthSchemes(prefetch.authSchemes),
      auth_config: prefetch.authConfig,
      composio_managed_schemes: normalizeAuthSchemes(prefetch.composioManagedSchemes),
    };
  });
  const [loading, setLoading] = useState(!prefetch?.authSchemes?.length);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [busyScheme, setBusyScheme] = useState<AuthScheme | null>(null);
  const popupTimerRef = useRef<number | null>(null);
  const oauthConnIdRef = useRef<string | null>(null);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const refresh = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getComposioToolkitDetail(slug);
      if (res.success && res.data) {
        setDetail({
          auth_schemes: normalizeAuthSchemes(res.data.auth_schemes),
          auth_config: res.data.auth_config,
          composio_managed_schemes: normalizeAuthSchemes(res.data.composio_managed_schemes),
        });
      } else {
        setError(!res.success ? res.error : 'Could not load authentication info.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load authentication info.');
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (prefetch?.authSchemes?.length) {
      setDetail({
        auth_schemes: normalizeAuthSchemes(prefetch.authSchemes),
        auth_config: prefetch.authConfig,
        composio_managed_schemes: normalizeAuthSchemes(prefetch.composioManagedSchemes),
      });
      setLoading(false);
    }
  }, [slug, prefetch?.authSchemes, prefetch?.authConfig, prefetch?.composioManagedSchemes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => () => {
    if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'composio:connected') {
        const connId = (typeof e.data.connectedAccountId === 'string' && e.data.connectedAccountId)
          || oauthConnIdRef.current
          || undefined;
        api.composioFinalize(connId).finally(() => {
          oauthConnIdRef.current = null;
          setBusyScheme(null);
          onConnectedRef.current?.();
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const schemes = detail?.auth_schemes ?? [];
  const managed = new Set(detail?.composio_managed_schemes ?? []);
  const orderedSchemes = orderAuthSchemes(schemes, managed);
  const managedOAuth = schemes.filter((s) => (s === 'OAUTH2' || s === 'OAUTH1') && managed.has(s));
  const credentialSchemes = schemes.filter((s) => s === 'API_KEY' || s === 'BEARER_TOKEN' || s === 'BASIC');
  const hasManagedOAuth = managedOAuth.length > 0;
  const anyBusy = busyScheme !== null;

  const startOAuth = async (scheme: AuthScheme) => {
    setError(null);
    setBusyScheme(scheme);
    try {
      const r = await api.composioConnect(slug, scheme, {});
      if (!r.success) {
        setError(r.error || 'Could not start OAuth flow.');
        setBusyScheme(null);
        return;
      }
      const url = r.data.url;
      if (!url) {
        setError(r.data.error || 'OAuth is not available for this toolkit right now.');
        setBusyScheme(null);
        return;
      }
      oauthConnIdRef.current = r.data.connected_account_id || null;
      const popup = openAuthPopup(url, 520, 640, 'composio-oauth');
      if (!popup) {
        setError('Your browser blocked the popup. Allow popups for this site and try again.');
        setBusyScheme(null);
        return;
      }
      if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
      popupTimerRef.current = window.setInterval(async () => {
        if (popup.closed) {
          if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
          popupTimerRef.current = null;
          const connId = oauthConnIdRef.current || undefined;
          try { await api.composioFinalize(connId); } catch { /* ignore */ }
          oauthConnIdRef.current = null;
          setBusyScheme(null);
          onConnectedRef.current?.();
        }
      }, 800) as unknown as number;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth flow failed.');
      setBusyScheme(null);
    }
  };

  const submitCredentials = async (scheme: AuthScheme): Promise<boolean> => {
    setError(null);
    setBusyScheme(scheme);
    try {
      const r = await api.composioConnect(slug, scheme, credentials);
      if (r.success && r.data?.ok) {
        setCredentials({});
        onConnectedRef.current?.();
        setBusyScheme(null);
        return true;
      }
      const raw = (r.success && r.data?.error) || (!r.success && r.error) || '';
      setError(prettifyConnectError(slug, raw));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credentials.');
    }
    setBusyScheme(null);
    return false;
  };

  const connectNoAuth = async () => {
    setError(null);
    setBusyScheme('NO_AUTH');
    try {
      const r = await api.composioConnect(slug, 'NO_AUTH', {});
      if (r.success && r.data?.ok) {
        onConnectedRef.current?.();
      } else {
        const raw = (r.success && r.data?.error) || (!r.success && r.error) || '';
        setError(prettifyConnectError(slug, raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    }
    setBusyScheme(null);
  };

  const clearError = useCallback(() => setError(null), []);
  const setCredential = useCallback((name: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [name]: value }));
  }, []);
  const resetCredentials = useCallback(() => setCredentials({}), []);

  return {
    detail,
    loading,
    error,
    clearError,
    schemes,
    orderedSchemes,
    managed,
    managedOAuth,
    credentialSchemes,
    hasManagedOAuth,
    busyScheme,
    anyBusy,
    credentials,
    setCredential,
    resetCredentials,
    startOAuth,
    submitCredentials,
    connectNoAuth,
    refresh,
  };
}
