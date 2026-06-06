export type PopularGroup = { id: string; label: string; slugs: string[] };

/** Curated integration groups for the App Store home (All tab). Slugs verified at build/runtime against Composio catalog. */
export const POPULAR_INTEGRATION_GROUPS: PopularGroup[] = [
  {
    id: 'google-workspace',
    label: 'Google Workspace',
    slugs: ['gmail', 'googledocs', 'googlesheets', 'googledrive', 'googlecalendar'],
  },
  {
    id: 'work-projects',
    label: 'Work & projects',
    slugs: ['notion', 'jira', 'linear', 'asana', 'monday', 'clickup', 'trello'],
  },
  {
    id: 'developer-tools',
    label: 'Developer tools',
    slugs: ['github', 'gitlab', 'sentry', 'vercel', 'supabase', 'datadog'],
  },
  {
    id: 'marketing-ads',
    label: 'Marketing & ads',
    slugs: ['googleads', 'metaads', 'linkedin', 'mailchimp', 'hubspot', 'stripe'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    slugs: ['googleanalytics', 'posthog', 'mixpanel', 'amplitude'],
  },
  {
    id: 'ai-automation',
    label: 'AI & automation',
    slugs: ['firecrawl', 'v0', 'openai', 'anthropic', 'perplexity'],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    slugs: ['shopify', 'woocommerce', 'square', 'paypal'],
  },
  {
    id: 'communication',
    label: 'Communication',
    slugs: ['slack', 'discord', 'zoom', 'calendly', 'intercom'],
  },
];
