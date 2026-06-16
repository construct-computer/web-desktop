import { BookOpen, ExternalLink, KeyRound, Wrench } from 'lucide-react';
import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { getCategoryLabel, prettyAuthLabel } from '@/hooks/useAppDiscovery';
import { Badge, InfoCard, InfoRow } from '../AppShared';

export function ComposioIntegrationDetail({
  detail,
  categoryLabels,
}: {
  detail: UnifiedApp;
  categoryLabels: Record<string, string>;
}) {
  if (!detail.composioSlug) return null;

  const toolCount = detail.tools?.length ?? detail.toolCount ?? 0;
  const authLabels = (detail.authSchemes || []).map((s) => prettyAuthLabel(s)).filter(Boolean);
  const categoryBadges = (detail.composioCategories || []).map((c) =>
    getCategoryLabel(c.slug, categoryLabels),
  );

  return (
    <div className="space-y-4">
      <InfoCard title="Integration details">
        <div className="space-y-2">
          {categoryBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categoryBadges.map((label) => (
                <Badge key={label}>{label}</Badge>
              ))}
            </div>
          )}
          {authLabels.length > 0 && (
            <InfoRow
              icon={<KeyRound className="w-3 h-3" />}
              label="Sign-in"
              value={authLabels.join(', ')}
            />
          )}
          {toolCount > 0 && (
            <InfoRow
              icon={<Wrench className="w-3 h-3" />}
              label="Actions"
              value={`${toolCount} available to Construct`}
            />
          )}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {detail.composioDocumentation && (
              <a
                href={detail.composioDocumentation}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)] hover:underline"
              >
                <BookOpen className="w-3 h-3" />
                Documentation
              </a>
            )}
            {detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                View on Composio
              </a>
            )}
          </div>
        </div>
      </InfoCard>
    </div>
  );
}
