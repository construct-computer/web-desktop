import { useCallback, useState } from 'react';
import { getFieldsForScheme } from '@/components/apps/composioAuthUtils';
import type { AuthScheme } from '@/components/apps/composioAuthUtils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useComposioAuth, type ComposioAuthPrefetch } from '@/hooks/useComposioAuth';

export type ComposioAuthHandle = ReturnType<typeof useComposioAuth>;

export function useComposioConnectFlow(
  slug: string,
  prefetch: ComposioAuthPrefetch | undefined,
  onConnected?: () => void,
) {
  const auth = useComposioAuth(slug, onConnected, prefetch);
  const [credentialScheme, setCredentialScheme] = useState<AuthScheme | null>(null);
  const isMobile = useIsMobile();

  const openCredential = useCallback((scheme: AuthScheme) => {
    const fields = getFieldsForScheme(auth.detail, scheme);
    auth.resetCredentials();
    const init: Record<string, string> = {};
    fields.forEach((f) => { init[f.name] = ''; });
    for (const [k, v] of Object.entries(init)) auth.setCredential(k, v);
    setCredentialScheme(scheme);
  }, [auth]);

  const closeCredential = useCallback(() => {
    setCredentialScheme(null);
    auth.resetCredentials();
  }, [auth]);

  const submitCredential = useCallback(async () => {
    if (!credentialScheme) return;
    const ok = await auth.submitCredentials(credentialScheme);
    if (ok) closeCredential();
  }, [auth, credentialScheme, closeCredential]);

  return {
    auth,
    credentialScheme,
    openCredential,
    closeCredential,
    submitCredential,
    isMobile,
  };
}
