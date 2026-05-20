import {
  AlertCircle,
  AppWindow,
  AtSign,
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Camera,
  ClipboardList,
  Clock,
  Cog,
  Database,
  Eye,
  FileText,
  FolderOpen,
  Github,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Info,
  Keyboard,
  ListTodo,
  Mail,
  MessageSquare,
  Monitor,
  MousePointerClick,
  Network,
  Pencil,
  Plug,
  Puzzle,
  ScrollText,
  Search,
  Send,
  Terminal,
  Trash2,
  Users,
  Wrench,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import type { ActivityTone } from './activityStyles';

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function iconForTool(type?: ChatMessage['activityType'], tool?: string, label?: string): LucideIcon {
  const toolId = (tool || '').toLowerCase();
  const text = `${toolId} ${label || ''}`.toLowerCase();

  if (hasAny(text, [/gmail|email|\bmail\b|inbox|thread/])) return Mail;
  if (hasAny(text, [/slack/])) return MessageSquare;
  if (hasAny(text, [/telegram/])) return Send;
  if (hasAny(text, [/github/])) return Github;
  if (hasAny(text, [/youtube/])) return Youtube;
  if (hasAny(text, [/google_calendar|\bcalendar\b|schedule|event/])) return CalendarDays;
  if (hasAny(text, [/google_drive|\bdrive\b/])) return HardDrive;
  if (hasAny(text, [/memory|recall|forgetting memory/])) return Brain;
  if (hasAny(text, [/notify|notification|alert/])) return Bell;
  if (hasAny(text, [/task_|todo|task #|listing active tasks|listing all tasks|planning|plan/])) return ListTodo;
  if (hasAny(text, [/composio|integration|registry_app|connecting app|app connection/])) return Plug;
  if (hasAny(text, [/tool_search|finding tools/])) return Puzzle;
  if (hasAny(text, [/\bapp\b|app call|app registry|creating app|updating app|deleting app|app state/])) return AppWindow;
  if (hasAny(text, [/database|stored output|audit log|activity history|activity stats/])) return Database;
  if (hasAny(text, [/arxiv|domain|web_search|web fetch|web_fetch|fetching|searching|finding tools/])) return Search;
  if (hasAny(text, [/document_guide|coding guide|local app guide|web design guide|guide/])) return BookOpen;
  if (hasAny(text, [/image|screenshot/])) return Camera;

  if (hasAny(text, [/clicking|\bclick\b/])) return MousePointerClick;
  if (hasAny(text, [/typing|\btype\b/])) return Keyboard;
  if (hasAny(text, [/scrolling|\bscroll\b/])) return ScrollText;
  if (hasAny(text, [/reading page|snapshot|rendered page/])) return Eye;
  if (hasAny(text, [/browser|browsing|web_scrape|remote_browser/])) return Globe;

  if (hasAny(text, [/exec|terminal|running `|sandbox/])) return Terminal;
  if (hasAny(text, [/delete_file|deleting .*file|trash/])) return Trash2;
  if (hasAny(text, [/write_file|writing|edit|editing|saving .*workspace/])) return Pencil;
  if (hasAny(text, [/list_directory|listing .*files|listing \//])) return FolderOpen;
  if (hasAny(text, [/read_file|reading .*file|loading .*workspace/])) return FileText;
  if (hasAny(text, [/view_image/])) return ImageIcon;

  if (hasAny(text, [/delegate|consult|spawn_agent|spawn_agents|subagent|advisor|agent status/])) return Users;
  if (hasAny(text, [/background task/])) return Bot;
  if (hasAny(text, [/wait_for_agents|waiting for \d+ agent/])) return Clock;
  if (hasAny(text, [/ask_user|asking:/])) return AtSign;
  if (hasAny(text, [/observation|clipboard/])) return ClipboardList;

  switch (type) {
    case 'browser': return Globe;
    case 'web': return Search;
    case 'terminal': return Terminal;
    case 'file': return FileText;
    case 'desktop': return Monitor;
    case 'calendar': return CalendarDays;
    case 'delegation': return Network;
    case 'background': return Cog;
    case 'delegation-group':
    case 'consultation-group':
    case 'orchestration-group': return Users;
    case 'background-group': return Bot;
    default: return Wrench;
  }
}

function renderIcon(type: ChatMessage['activityType'] | undefined, tool: string | undefined, label: string | undefined, className: string) {
  const Icon = iconForTool(type, tool, label);
  return <Icon className={className} />;
}

export function ActivityIcon({ type, tone, tool, label, className }: {
  type?: ChatMessage['activityType'];
  tone?: ActivityTone;
  tool?: string;
  label?: string;
  className?: string;
}) {
  const cls = className || 'w-3 h-3';
  if (tone === 'error' || tone === 'warn') return <AlertCircle className={cls} />;
  if (tone === 'info') return <Info className={cls} />;
  return renderIcon(type, tool, label, cls);
}
