import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  Brain,
  Calendar,
  Calculator,
  ClipboardList,
  Code2,
  CreditCard,
  Database,
  FileText,
  Gamepad2,
  Globe,
  Image,
  Kanban,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageSquare,
  Mic,
  Package,
  Phone,
  Server,
  Shield,
  ShoppingCart,
  Sparkles,
  Users,
  Video,
  Wrench,
} from 'lucide-react';

const EXACT_CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  'developer-tools': Code2,
  analytics: BarChart3,
  'marketing-automation': Megaphone,
  documents: FileText,
  crm: Users,
  'artificial-intelligence': Brain,
  'project-management': Kanban,
  'team-collaboration': Users,
  'images-&-design': Image,
  ecommerce: ShoppingCart,
  productivity: Calendar,
  email: Mail,
  accounting: Calculator,
  'file-management-&-storage': Database,
  'ai-web-scraping': Globe,
  'security-&-identity-tools': Shield,
  'forms-&-surveys': ClipboardList,
  'email-newsletters': Mail,
  'scheduling-&-booking': Calendar,
  'ai-chatbots': Bot,
  'server-monitoring': Server,
  databases: Database,
  'phone-&-sms': Phone,
  'proposal-&-invoice-management': FileText,
};

type IconRule = { match: RegExp; icon: LucideIcon };

const CATEGORY_ICON_RULES: IconRule[] = [
  { match: /developer|dev-tools|code|git|api/, icon: Code2 },
  { match: /ai|llm|chatbot|machine-learning|mcp/, icon: Sparkles },
  { match: /market|ads|seo|newsletter/, icon: Megaphone },
  { match: /analytic|metric|insight/, icon: BarChart3 },
  { match: /crm|sales|contact/, icon: Users },
  { match: /email|mail/, icon: Mail },
  { match: /phone|sms|call/, icon: Phone },
  { match: /chat|messag|slack|discord/, icon: MessageSquare },
  { match: /shop|commerce|ecommerce|retail/, icon: ShoppingCart },
  { match: /pay|finance|account|invoice|billing/, icon: CreditCard },
  { match: /calendar|schedul|productiv/, icon: Calendar },
  { match: /document|file|storage|pdf/, icon: FileText },
  { match: /database|data/, icon: Database },
  { match: /image|design|photo/, icon: Image },
  { match: /video/, icon: Video },
  { match: /transcript|speech|voice/, icon: Mic },
  { match: /project|task|kanban/, icon: Kanban },
  { match: /security|identity|auth/, icon: Shield },
  { match: /server|monitor|devops|cloud/, icon: Server },
  { match: /web|scrape|browser|search/, icon: Globe },
  { match: /game/, icon: Gamepad2 },
  { match: /util|tool|automation/, icon: Wrench },
];

export function getCategoryIcon(categoryId: string): LucideIcon {
  const id = categoryId.toLowerCase();
  if (EXACT_CATEGORY_ICONS[id]) return EXACT_CATEGORY_ICONS[id];
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.match.test(id)) return rule.icon;
  }
  return Package;
}
