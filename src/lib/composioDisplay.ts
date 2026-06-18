/** Shared Composio slug/toolkit display helpers (no store imports). */

export function titleCaseToolkit(name: string): string {
  const lower = name.toLowerCase();
  const brands: Record<string, string> = {
    github: 'GitHub', hubspot: 'HubSpot', linkedin: 'LinkedIn',
    clickup: 'ClickUp', googlecalendar: 'Google Calendar',
    googledrive: 'Google Drive', googlesheets: 'Google Sheets',
    googledocs: 'Google Docs', mongodb: 'MongoDB', postgresql: 'PostgreSQL',
    bitbucket: 'Bitbucket', gmail: 'Gmail',
    microsoft_teams: 'Microsoft Teams', dropbox: 'Dropbox',
    notion: 'Notion',
  };
  return brands[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

/** Convert a Composio slug like NOTION_CREATE_A_NEW_PAGE → "Notion: create a new page" */
export function formatComposioSlug(slug: string): string {
  const idx = slug.indexOf('_');
  if (idx === -1) return slug;
  const toolkitRaw = slug.slice(0, idx).toLowerCase();
  const actionRaw = slug.slice(idx + 1).toLowerCase().replace(/_/g, ' ');
  return `${titleCaseToolkit(toolkitRaw)}: ${actionRaw}`;
}

/** Extract a display-friendly tool name from composio params */
export function composioDisplayTool(params?: Record<string, unknown>): string {
  if (!params) return 'composio';
  const slug = params.tool_slug as string | undefined;
  if (slug) {
    const idx = slug.indexOf('_');
    return idx > 0 ? slug.slice(0, idx).toLowerCase() : slug.toLowerCase();
  }
  const toolkit = params.toolkit as string | undefined;
  if (toolkit) return toolkit.toLowerCase();
  return 'composio';
}
