"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { NEWS_ITEM_KINDS, TOPIC_KEY_PATTERN, type NewsItemKind } from "@/convex/utils/learnLists";
import Header from "@/src/ui/components/layout/Header";
import { SectionMenu, type SectionMenuItem } from "../_components/SectionMenu";
import { localDay } from "./learnDates";

/** News's kinds in the side menu's order, as drawn: Google's own first. */
const MENU_KINDS: NewsItemKind[] = ["GOOGLE_UPDATE", "YOUTUBE", "X", "WEBSITE"];

export const newsKindHref = (kind: NewsItemKind) => `/app/news?kind=${kind}`;
export const knowledgeTopicHref = (topic: string) => `/app/knowledge?topic=${topic}`;
/** Helpful content's list, or one topic's (insights-helpful-content-plan.md, IH4, IH6). */
export const helpfulTopicHref = (topic?: string) => (topic ? `/app/helpful-content?topic=${topic}` : "/app/helpful-content");

export function isNewsKind(value: string | null): value is NewsItemKind {
  return value !== null && (NEWS_ITEM_KINDS as readonly string[]).includes(value);
}

/** An address's topic, when it is shaped like a key in the shared topic list (`convex/topics.ts`). */
export function isTopicKey(value: string | null): value is string {
  return value !== null && TOPIC_KEY_PATTERN.test(value);
}

/**
 * The menu item a Learn address answers to: a story lights All news, an
 * article All articles unless its page says which topic it is.
 */
export function learnItemFor(pathname: string, params: URLSearchParams): string {
  if (pathname.startsWith("/app/who-to-follow")) return "follow";
  if (pathname.startsWith("/app/helpful-content")) {
    const topic = params.get("topic");
    return isTopicKey(topic) ? `helpful-${topic}` : "helpful";
  }
  if (pathname.startsWith("/app/knowledge")) {
    const topic = params.get("topic");
    return isTopicKey(topic) ? `topic-${topic}` : "articles";
  }
  const kind = params.get("kind");
  return pathname === "/app/news" && isNewsKind(kind) ? `kind-${kind}` : "news";
}

/**
 * Learn (docs/plans/active/knowledge-news-and-digest-plan.md, revised again
 * 2026-10-01, R4): one item on the main menu, holding News, Who to follow and
 * Knowledge, laid out as a site is — the page's own header across the top,
 * the side menu down the left, the page beside it.
 *
 * The page hands in its header (`PageHeader`, or `DetailHeader` for a story
 * or an article) rather than this drawing one, so each screen still says what
 * it is above its own list, as every screen in the kit does.
 */
export function LearnShell({ header, current, children }: { header: ReactNode; current?: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        {header}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <LearnMenu current={current} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">{children}</section>
        </div>
      </div>
    </>
  );
}

/**
 * News by kind, the people worth following, and Knowledge by topic — every
 * group open at first, as drawn. News's numbers are this week's stories, the
 * front page's own week; a topic with no articles is left out.
 */
function LearnMenu({ current }: { current?: string }) {
  const t = useTranslations("learn.menu");
  const pathname = usePathname();
  const params = useSearchParams();
  const language = useLocale();
  const counts = useQuery(api.learnMenu.getLearnMenuCounts, { today: localDay(), language });
  const number = (value: number | undefined) => (value ? value.toLocaleString() : null);

  const news: SectionMenuItem[] = [
    { id: "news", label: t("allNews"), href: "/app/news", count: number(counts?.news.all) },
    ...MENU_KINDS.map((kind) => ({ id: `kind-${kind}`, label: t(`kinds.${kind}`), href: newsKindHref(kind), count: number(counts?.news[kind]) })),
  ];
  const knowledge: SectionMenuItem[] = [
    { id: "articles", label: t("allArticles"), href: "/app/knowledge", count: number(counts?.articles.all) },
    // The shared topic list, in its order and the reader's language; a topic with no articles is left out.
    ...(counts?.topics ?? []).filter((topic) => (counts?.articles.byTopic[topic.key] ?? 0) > 0).map((topic) => ({
      id: `topic-${topic.key}`,
      label: topic.name,
      href: knowledgeTopicHref(topic.key),
      count: number(counts?.articles.byTopic[topic.key]),
    })),
  ];

  // Helpful content under Knowledge, by the same topics (insights-helpful-content-plan.md, IH4).
  const helpful: SectionMenuItem[] = [
    { id: "helpful", label: t("allArticles"), href: helpfulTopicHref(), count: number(counts?.helpful.all) },
    ...(counts?.topics ?? []).filter((topic) => (counts?.helpful.byTopic[topic.key] ?? 0) > 0).map((topic) => ({
      id: `helpful-${topic.key}`,
      label: topic.name,
      href: helpfulTopicHref(topic.key),
      count: number(counts?.helpful.byTopic[topic.key]),
    })),
  ];

  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={current ?? learnItemFor(pathname, params)}
      openAtFirst={["news", "people", "knowledge", "helpful"]}
      groups={[
        { id: "news", label: t("groups.news"), items: news },
        { id: "people", label: t("groups.people"), items: [{ id: "follow", label: t("whoToFollow"), href: "/app/who-to-follow", count: number(counts?.follows) }] },
        { id: "knowledge", label: t("groups.knowledge"), items: knowledge },
        { id: "helpful", label: t("groups.helpful"), items: helpful },
      ]}
    />
  );
}
