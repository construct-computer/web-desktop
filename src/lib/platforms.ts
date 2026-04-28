export interface PlatformMeta {
  slug: string;
  logoUrl: string;
  color: string;
  initials: string;
  name: string;
}

const PLATFORM_META: Record<string, Omit<PlatformMeta, 'slug'>> = {
  googlecalendar: {
    logoUrl: 'https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_18_2x.png',
    color: '#4285F4',
    initials: 'GC',
    name: 'Google Calendar',
  },
  googledrive: {
    logoUrl: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
    color: '#0F9D58',
    initials: 'GD',
    name: 'Google Drive',
  },
  googlesheets: {
    logoUrl: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png',
    color: '#0F9D58',
    initials: 'GS',
    name: 'Google Sheets',
  },
  googledocs: {
    logoUrl: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x32.png',
    color: '#4285F4',
    initials: 'GD',
    name: 'Google Docs',
  },
  googleslides: {
    logoUrl: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_presentation_x32.png',
    color: '#F4B400',
    initials: 'GS',
    name: 'Google Slides',
  },
  gmail: {
    logoUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    color: '#EA4335',
    initials: 'GM',
    name: 'Gmail',
  },
  github: {
    logoUrl: 'https://github.githubassets.com/favicons/favicon-dark.svg',
    color: '#24292E',
    initials: 'GH',
    name: 'GitHub',
  },
  slack: {
    logoUrl: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    color: '#4A154B',
    initials: 'S',
    name: 'Slack',
  },
  telegram: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
    color: '#2AABEE',
    initials: 'T',
    name: 'Telegram',
  },
  notion: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64',
    color: '#000000',
    initials: 'N',
    name: 'Notion',
  },
  jira: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=jira.atlassian.com&sz=64',
    color: '#0052CC',
    initials: 'J',
    name: 'Jira',
  },
  linear: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=linear.app&sz=64',
    color: '#5E6AD2',
    initials: 'L',
    name: 'Linear',
  },
  airtable: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=airtable.com&sz=64',
    color: '#18BFFF',
    initials: 'A',
    name: 'Airtable',
  },
  hubspot: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=hubspot.com&sz=64',
    color: '#FF5C35',
    initials: 'HS',
    name: 'HubSpot',
  },
  salesforce: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=salesforce.com&sz=64',
    color: '#00A1E0',
    initials: 'SF',
    name: 'Salesforce',
  },
  stripe: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=64',
    color: '#635BFF',
    initials: 'S',
    name: 'Stripe',
  },
  shopify: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=64',
    color: '#7AB55C',
    initials: 'S',
    name: 'Shopify',
  },
  figma: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=figma.com&sz=64',
    color: '#A259FF',
    initials: 'F',
    name: 'Figma',
  },
  dropbox: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=dropbox.com&sz=64',
    color: '#0061FF',
    initials: 'D',
    name: 'Dropbox',
  },
  outlook: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=outlook.com&sz=64',
    color: '#0078D4',
    initials: 'O',
    name: 'Outlook',
  },
};

const FALLBACK_COLORS = [
  '#4285F4',
  '#7C3AED',
  '#0EA5E9',
  '#10B981',
  '#F97316',
  '#EC4899',
  '#6366F1',
  '#14B8A6',
];

export function normalizePlatformSlug(platform: string): string {
  return platform.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fallbackColor(slug: string): string {
  const hash = slug.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function initialsForName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

function fallbackName(platform: string): string {
  const readable = titleCase(platform);
  return readable || 'Service';
}

export function getPlatformMeta(platform: string, logoUrl?: string): PlatformMeta {
  const slug = normalizePlatformSlug(platform);
  const known = PLATFORM_META[slug];
  const name = known?.name || fallbackName(platform);

  return {
    slug,
    logoUrl: logoUrl || known?.logoUrl || (slug ? `https://logos.composio.dev/api/${slug}` : ''),
    color: known?.color || fallbackColor(slug || name),
    initials: known?.initials || initialsForName(name),
    name,
  };
}

export function getPlatformName(platform: string): string {
  return getPlatformMeta(platform).name;
}

export function getPlatformDisplayName(platform: string, providedName?: string): string {
  const trimmed = providedName?.trim();
  if (!trimmed) return getPlatformName(platform);

  const normalizedProvided = normalizePlatformSlug(trimmed);
  const normalizedPlatform = normalizePlatformSlug(platform);
  if (normalizedProvided === normalizedPlatform || trimmed === trimmed.toLowerCase()) {
    return getPlatformName(trimmed);
  }

  return trimmed;
}

export function getPlatformColor(platform: string): string {
  return getPlatformMeta(platform).color;
}

export function formatPlatformDescription(description: string, platform: string, displayName = getPlatformName(platform)): string {
  const trimmed = description.trim();
  if (!trimmed) return `Connect ${displayName} to continue.`;

  const raw = platform.trim();
  if (!raw || trimmed.includes(displayName)) return trimmed;

  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), displayName);
}
