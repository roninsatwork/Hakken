/**
 * Artificial Intelligence: one item in the admin menu, and every one of its
 * screens in a menu down the left of the page (wiki-sonae-catch-up-plan-
 * 2026-11-21.md, S0 and S2, from the upstream framework's `aiMenu.ts` of
 * 2026-11-12). The tabs and three drop-downs each screen drew across its top
 * (`AiWorkspaceNav`, until 21 November 2026) became these groups, and Tools
 * and Tool servers moved here from the admin menu. The wiki's map is a line of
 * its own beside the wiki's pages, and the wiki's one long page became five
 * (S6): its pages, Add to the wiki, Waiting on you, Ask the wiki and Check-up.
 *
 * This file says only what the pages, groups and addresses are; `AiFrame`
 * draws them with the shared `SectionMenu`, as every section's side menu is.
 */

export const AI_ROOT = "/admin/ai";

/** The addresses of the AI screens, so the menu and its tests share one spelling. */
export const AI_PATHS = {
  costs: `${AI_ROOT}/usage/costs`,
  value: `${AI_ROOT}/money`,
  chatLogs: `${AI_ROOT}/usage/chat-logs`,
  unanswered: `${AI_ROOT}/unanswered`,
  wiki: `${AI_ROOT}/knowledge`,
  wikiMap: `${AI_ROOT}/knowledge/map`,
  wikiAdd: `${AI_ROOT}/knowledge/add`,
  wikiWaiting: `${AI_ROOT}/knowledge/waiting`,
  wikiAsk: `${AI_ROOT}/knowledge/ask`,
  wikiCheckup: `${AI_ROOT}/knowledge/checkup`,
  /** A page about one goal being written, opened from the wiki's pages: it stands on its own, with no menu. */
  wikiNewGoal: `${AI_ROOT}/knowledge/new-goal`,
  diary: `${AI_ROOT}/diary`,
  systemPrompt: `${AI_ROOT}/system-prompt`,
  rules: `${AI_ROOT}/rules`,
  skills: `${AI_ROOT}/skills`,
  voice: `${AI_ROOT}/voice`,
  decisions: `${AI_ROOT}/decisions`,
  evals: `${AI_ROOT}/evals`,
  providers: `${AI_ROOT}/models/providers`,
  modelCatalogue: `${AI_ROOT}/models/catalogue`,
  defaults: `${AI_ROOT}/models/defaults`,
  tools: `${AI_ROOT}/tools`,
  toolServers: `${AI_ROOT}/tool-servers`,
  widget: `${AI_ROOT}/widget`,
} as const;

/** The website chat's five screens: one page, with its `section` chosen in the address, as before. */
export const AI_WIDGET_SECTIONS = ["appearance", "welcome-screen", "conversation-starters", "greeting", "integration"] as const;
export type AiWidgetSection = (typeof AI_WIDGET_SECTIONS)[number];

const WIDGET_PAGE_IDS = {
  appearance: "appearance",
  "welcome-screen": "welcomeScreen",
  "conversation-starters": "conversationStarters",
  greeting: "greeting",
  integration: "integration",
} as const satisfies Record<AiWidgetSection, string>;

export function aiWidgetHref(section: AiWidgetSection) {
  return section === "appearance" ? AI_PATHS.widget : `${AI_PATHS.widget}?section=${section}`;
}

export const AI_MENU_GROUPS = ["costs", "conversations", "knows", "behaves", "checks", "models", "tools", "widget"] as const;
export type AiMenuGroup = (typeof AI_MENU_GROUPS)[number];

export type AiPageId =
  | "costs" | "value"
  | "chatLogs" | "unanswered"
  | "wiki" | "wikiMap" | "wikiAdd" | "wikiWaiting" | "wikiAsk" | "wikiCheckup" | "diary"
  | "systemPrompt" | "rules" | "skills" | "voice"
  | "decisions" | "evals"
  | "providers" | "modelCatalogue" | "defaults"
  | "tools" | "toolServers"
  | (typeof WIDGET_PAGE_IDS)[AiWidgetSection];

/** Each line of the menu, in the agreed order: its words are `ai.menu.<id>`, its group's `ai.menu.groups.<group>`. */
export const AI_MENU_PAGES: readonly { id: AiPageId; group: AiMenuGroup; href: string }[] = [
  { id: "costs", group: "costs", href: AI_PATHS.costs },
  { id: "value", group: "costs", href: AI_PATHS.value },
  { id: "chatLogs", group: "conversations", href: AI_PATHS.chatLogs },
  { id: "unanswered", group: "conversations", href: AI_PATHS.unanswered },
  { id: "wiki", group: "knows", href: AI_PATHS.wiki },
  { id: "wikiMap", group: "knows", href: AI_PATHS.wikiMap },
  { id: "wikiAdd", group: "knows", href: AI_PATHS.wikiAdd },
  { id: "wikiWaiting", group: "knows", href: AI_PATHS.wikiWaiting },
  { id: "wikiAsk", group: "knows", href: AI_PATHS.wikiAsk },
  { id: "wikiCheckup", group: "knows", href: AI_PATHS.wikiCheckup },
  { id: "diary", group: "knows", href: AI_PATHS.diary },
  { id: "systemPrompt", group: "behaves", href: AI_PATHS.systemPrompt },
  { id: "rules", group: "behaves", href: AI_PATHS.rules },
  { id: "skills", group: "behaves", href: AI_PATHS.skills },
  { id: "voice", group: "behaves", href: AI_PATHS.voice },
  { id: "decisions", group: "checks", href: AI_PATHS.decisions },
  { id: "evals", group: "checks", href: AI_PATHS.evals },
  { id: "providers", group: "models", href: AI_PATHS.providers },
  { id: "modelCatalogue", group: "models", href: AI_PATHS.modelCatalogue },
  { id: "defaults", group: "models", href: AI_PATHS.defaults },
  { id: "tools", group: "tools", href: AI_PATHS.tools },
  { id: "toolServers", group: "tools", href: AI_PATHS.toolServers },
  ...AI_WIDGET_SECTIONS.map((section) => ({ id: WIDGET_PAGE_IDS[section], group: "widget" as const, href: aiWidgetHref(section) })),
];

const within = (pathname: string, ...hrefs: string[]) =>
  hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));

/** The wiki's own pages under its address, each a menu line; any other word there is one wiki page, or New goal. */
const WIKI_OWN_PAGES = ["map", "add", "waiting", "ask", "checkup"] as const;

/**
 * Pages about one record, which stand on their own with their back link and no
 * menu, as the upstream's do: a rule, an eval and its edit page, a decision, a
 * wiki page and a new goal, a model, a tool, a connector, and the add pages for
 * each. The lists they open from keep the frame. A new wiki page of its own
 * joins `WIKI_OWN_PAGES`, or it loses the menu.
 */
const RECORD_PATTERNS: readonly RegExp[] = [
  /^\/admin\/ai\/rules\/[^/]+$/,
  /^\/admin\/ai\/evals\/[^/]+(\/edit)?$/,
  /^\/admin\/ai\/decisions\/[^/]+$/,
  new RegExp(`^/admin/ai/knowledge/(?!(?:${WIKI_OWN_PAGES.join("|")})$)[^/]+$`),
  /^\/admin\/ai\/models\/(?!providers$|catalogue$|defaults$)[^/]+$/,
  /^\/admin\/ai\/tools\/[^/]+$/,
  /^\/admin\/ai\/tools\/connectors\/[^/]+$/,
];

export function isAiRecordPath(pathname: string) {
  return RECORD_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isWidgetSection(section: string | null | undefined): section is AiWidgetSection {
  return (AI_WIDGET_SECTIONS as readonly string[]).includes(section ?? "");
}

/**
 * The menu line a page belongs to, lit while it is read. A record keeps its
 * list lit, the old addresses (`/admin/ai/costs`, `/admin/ai/chat-logs`,
 * `/admin/ai/global-knowledge`, `/admin/ai/models`) light the line they lead
 * to, and the website chat's `section` picks one of its five lines.
 */
export function aiPageForPath(pathname: string, widgetSection?: string | null): AiPageId | null {
  const P = AI_PATHS;
  if (pathname === AI_ROOT || within(pathname, P.costs, `${AI_ROOT}/costs`)) return "costs";
  if (within(pathname, P.value)) return "value";
  if (within(pathname, P.chatLogs, `${AI_ROOT}/chat-logs`)) return "chatLogs";
  if (within(pathname, P.unanswered)) return "unanswered";
  if (within(pathname, P.wikiMap)) return "wikiMap";
  if (within(pathname, P.wikiAdd)) return "wikiAdd";
  if (within(pathname, P.wikiWaiting)) return "wikiWaiting";
  if (within(pathname, P.wikiAsk)) return "wikiAsk";
  if (within(pathname, P.wikiCheckup)) return "wikiCheckup";
  if (within(pathname, P.wiki, `${AI_ROOT}/global-knowledge`)) return "wiki";
  if (within(pathname, P.diary)) return "diary";
  if (within(pathname, P.systemPrompt)) return "systemPrompt";
  if (within(pathname, P.rules)) return "rules";
  if (within(pathname, P.skills)) return "skills";
  if (within(pathname, P.voice)) return "voice";
  if (within(pathname, P.decisions)) return "decisions";
  if (within(pathname, P.evals)) return "evals";
  if (within(pathname, P.providers)) return "providers";
  if (within(pathname, P.defaults)) return "defaults";
  if (within(pathname, `${AI_ROOT}/models`)) return "modelCatalogue";
  if (within(pathname, P.toolServers)) return "toolServers";
  if (within(pathname, P.tools)) return "tools";
  if (pathname === P.widget) return WIDGET_PAGE_IDS[isWidgetSection(widgetSection) ? widgetSection : "appearance"];
  return null;
}
