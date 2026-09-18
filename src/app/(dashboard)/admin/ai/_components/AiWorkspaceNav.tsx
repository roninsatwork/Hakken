"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AudioLines,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Check,
  ClipboardCheck,
  ChevronDown,
  Code2,
  Cpu,
  FileText,
  List,
  ListPlus,
  MessageSquareCode,
  MessageSquareText,
  Monitor,
  NotebookPen,
  Palette,
  Scale,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

/**
 * Rules, the system prompt, and global knowledge: what the AI is told, and
 * therefore how it behaves.
 *
 * Called "Governance" until the governance layer needed the word for the AI
 * register, risk classification and compliance evidence. Nothing here is
 * governance in that sense — these are the instructions an AI administrator
 * writes — and one word meaning two unrelated things across the same admin
 * section is how people end up on the wrong screen.
 */
const instructionItems = [
  {
    labelKey: "rules",
    href: "/admin/ai/rules",
    icon: ShieldCheck,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/rules")
      || pathname.startsWith("/admin/ai/rules")
    ),
  },
  {
    labelKey: "systemPrompt",
    href: "/admin/ai/system-prompt",
    icon: TerminalSquare,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/system-prompt")
      || pathname.startsWith("/admin/ai/system-prompt")
    ),
  },
  {
    labelKey: "wiki",
    href: "/admin/ai/knowledge",
    icon: BookOpen,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/knowledge")
      || pathname.startsWith("/admin/ai/global-knowledge")
    ),
  },
  {
    labelKey: "voice",
    href: "/admin/ai/voice",
    icon: AudioLines,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/voice"),
  },
  {
    labelKey: "unanswered",
    href: "/admin/ai/unanswered",
    icon: MessageSquareText,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/unanswered"),
  },
  {
    labelKey: "diary",
    href: "/admin/ai/diary",
    icon: NotebookPen,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/diary"),
  },
  {
    // The judgments the platform makes on its own and how much rope each has
    // (docs/plans/active/decisions-typesafe-plan.md, Phase C).
    labelKey: "decisions",
    href: "/admin/ai/decisions",
    icon: Scale,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/decisions"),
  },
  {
    // The global AI's own evals (Anthony's ruling, 2026-08-16): the same
    // screen every company has, kept by hand rather than written for it.
    labelKey: "evals",
    href: "/admin/ai/evals",
    icon: ClipboardCheck,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/evals"),
  },
];

function isModelDetailRoute(pathname: string) {
  if (!/^\/admin\/ai\/models\/[^/]+$/.test(pathname)) return false;

  const routeSegment = pathname.split("/").at(-1);
  return routeSegment !== "providers" && routeSegment !== "catalogue" && routeSegment !== "defaults";
}

const modelItems = [
  {
    labelKey: "providers",
    href: "/admin/ai/models/providers",
    icon: BrainCircuit,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models/providers"),
  },
  {
    labelKey: "modelCatalogue",
    href: "/admin/ai/models/catalogue",
    icon: List,
    matches: (pathname: string) => (
      pathname === "/admin/ai/models"
      || pathname.startsWith("/admin/ai/models/catalogue")
      || isModelDetailRoute(pathname)
    ),
  },
  {
    labelKey: "defaults",
    href: "/admin/ai/models/defaults",
    icon: Cpu,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models/defaults"),
  },
];

function getWidgetSectionHref(section: string) {
  return `/admin/ai/widget?section=${section}`;
}

const widgetItems = [
  {
    labelKey: "appearance",
    href: "/admin/ai/widget",
    icon: Palette,
    matches: (pathname: string, searchParams: URLSearchParams) => (
      pathname === "/admin/ai/widget"
      && (!searchParams.get("section") || searchParams.get("section") === "appearance")
    ),
  },
  {
    labelKey: "welcomeScreen",
    href: getWidgetSectionHref("welcome-screen"),
    icon: Monitor,
    query: { section: "welcome-screen" },
  },
  {
    labelKey: "conversationStarters",
    href: getWidgetSectionHref("conversation-starters"),
    icon: ListPlus,
    query: { section: "conversation-starters" },
  },
  {
    labelKey: "greeting",
    href: getWidgetSectionHref("greeting"),
    icon: MessageSquareText,
    query: { section: "greeting" },
  },
  {
    labelKey: "integration",
    href: getWidgetSectionHref("integration"),
    icon: Code2,
    query: { section: "integration" },
  },
];

const workspaceTabs = [
  {
    labelKey: "runningCosts",
    href: "/admin/ai/usage/costs",
    icon: BarChart3,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/usage/costs")
      || pathname.startsWith("/admin/ai/costs")
    ),
  },
  {
    labelKey: "value",
    href: "/admin/ai/money",
    icon: BarChart3,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/money"),
  },
  {
    labelKey: "chatLogs",
    href: "/admin/ai/usage/chat-logs",
    icon: MessageSquareText,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/usage/chat-logs")
      || pathname.startsWith("/admin/ai/chat-logs")
    ),
  },
  {
    labelKey: "skillCenter",
    href: "/admin/ai/skills",
    icon: FileText,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/skills"),
  },
  {
    key: "widget",
    labelKey: "widget",
    href: "/admin/ai/widget",
    icon: MessageSquareCode,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/widget"),
  },
  {
    key: "models",
    labelKey: "models",
    href: "/admin/ai/models",
    icon: BrainCircuit,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models"),
  },
];

function hasMatchingQuery(searchParams: URLSearchParams, query?: Record<string, string>) {
  if (!query) return true;

  return Object.entries(query).every(([key, value]) => searchParams.get(key) === value);
}

function isWidgetItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  item: typeof widgetItems[number]
) {
  if ("matches" in item && item.matches) return item.matches(pathname, searchParams);

  return pathname === "/admin/ai/widget" && hasMatchingQuery(searchParams, item.query);
}

export function AiWorkspaceNav() {
  const t = useTranslations("ai.workspaceNav");
  const pathname = usePathname() || "/admin/ai";
  const readonlySearchParams = useSearchParams();
  const searchParams = new URLSearchParams(readonlySearchParams?.toString());
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [isModelsOpen, setIsModelsOpen] = useState(false);
  const instructionsRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const modelsRef = useRef<HTMLDivElement>(null);
  const activeInstructionsItem = instructionItems.find((item) => item.matches(pathname));
  const isInstructionsActive = Boolean(activeInstructionsItem);
  const activeWidgetItem = widgetItems.find((item) => isWidgetItemActive(pathname, searchParams, item));
  const isWidgetActive = Boolean(activeWidgetItem);
  const isModelsActive = pathname.startsWith("/admin/ai/models");

  useEffect(() => {
    if (!isInstructionsOpen && !isWidgetOpen && !isModelsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (instructionsRef.current && !instructionsRef.current.contains(event.target as Node)) {
        setIsInstructionsOpen(false);
      }
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsWidgetOpen(false);
      }
      if (modelsRef.current && !modelsRef.current.contains(event.target as Node)) {
        setIsModelsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsInstructionsOpen(false);
        setIsWidgetOpen(false);
        setIsModelsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isInstructionsOpen, isWidgetOpen, isModelsOpen]);

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="flex items-center gap-1 border-b border-border-dim/50 pb-px"
    >
      {workspaceTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.matches(pathname);

        return (
          <div key={tab.href} className={cn("shrink-0", "key" in tab && tab.key === "widget" && "flex items-center gap-1")}>
            {"key" in tab && tab.key === "widget" && (
              <div ref={instructionsRef} className="relative shrink-0">
                {/* Stays raw (here and the two dropdown tabs below): an active-state underline tab — matches no variant. */}
                <button
                  type="button"
                  aria-expanded={isInstructionsOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsWidgetOpen(false);
                    setIsModelsOpen(false);
                    setIsInstructionsOpen((current) => !current);
                  }}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isInstructionsActive
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{t("instructions")}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isInstructionsOpen && "rotate-180")} />
                </button>

                {isInstructionsOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-[240px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                  >
                    {instructionItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = item.matches(pathname);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsInstructionsOpen(false)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors",
                            isItemActive
                              ? "bg-brand text-white"
                              : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </span>
                          {isItemActive && <Check className="h-4 w-4 shrink-0" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {"key" in tab && tab.key === "widget" ? (
              <div ref={widgetRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={isWidgetOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsInstructionsOpen(false);
                    setIsModelsOpen(false);
                    setIsWidgetOpen((current) => !current);
                  }}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isWidgetActive
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  <MessageSquareCode className="h-4 w-4" />
                  <span>{t("widget")}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isWidgetOpen && "rotate-180")} />
                </button>

                {isWidgetOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-[260px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                  >
                    {widgetItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = isWidgetItemActive(pathname, searchParams, item);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsWidgetOpen(false)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors",
                            isItemActive
                              ? "bg-brand text-white"
                              : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </span>
                          {isItemActive && <Check className="h-4 w-4 shrink-0" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : "key" in tab && tab.key === "models" ? (
              <div ref={modelsRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={isModelsOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsInstructionsOpen(false);
                    setIsWidgetOpen(false);
                    setIsModelsOpen((current) => !current);
                  }}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isModelsActive
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  <BrainCircuit className="h-4 w-4" />
                  <span>{t("models")}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isModelsOpen && "rotate-180")} />
                </button>

                {isModelsOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-[240px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                  >
                    {modelItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = item.matches(pathname);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsModelsOpen(false)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors",
                            isItemActive
                              ? "bg-brand text-white"
                              : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </span>
                          {isItemActive && <Check className="h-4 w-4 shrink-0" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <Link
                href={tab.href}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
