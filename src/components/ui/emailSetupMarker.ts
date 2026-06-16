export interface EmailSetupPayload {
  sessionKey?: string;
  reason?: string;
  createdAt?: number;
}

const EMAIL_SETUP_MARKER_RE = /<!--EMAIL_SETUP:(.*?)-->/;

export function parseEmailSetupMarker(content: string): { payload: EmailSetupPayload; rest: string } | null {
  const match = content.match(EMAIL_SETUP_MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as EmailSetupPayload;
    const rest = content.replace(EMAIL_SETUP_MARKER_RE, '').trim();
    return { payload, rest };
  } catch {
    return null;
  }
}
