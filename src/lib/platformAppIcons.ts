import discordIcon from '@/icons/apps/discord.png';
import slackIcon from '@/icons/apps/slack.png';
import telegramIcon from '@/icons/apps/telegram.png';

const ICONS: Record<string, string> = {
  discord: discordIcon,
  slack: slackIcon,
  telegram: telegramIcon,
};

export function platformAppIcon(platform?: string | null): string | undefined {
  return platform ? ICONS[platform.toLowerCase()] : undefined;
}
