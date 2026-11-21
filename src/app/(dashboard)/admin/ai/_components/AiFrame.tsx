"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SectionMenu } from "@/src/app/(dashboard)/app/_components/SectionMenu";
import { AI_MENU_GROUPS, AI_MENU_PAGES, aiPageForPath } from "./aiMenu";

/**
 * The Artificial Intelligence section around one of its screens
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S0): the section's title and its
 * rule, then the menu down the left beside the screen. It opens from the admin
 * menu, so it wears the top-level header with `divider`; each screen inside
 * keeps its own `PageHeader` with no `divider`, as the frame has drawn the rule
 * (docs/developer/screen-kit.md, "Headers").
 *
 * The menu is the shared `SectionMenu` in the Sites layout's grid, sticky at
 * the top ("A section's side menu"). The groups open at first are what it
 * costs, its conversations and what it knows; the group of the page being read
 * always opens too.
 *
 * Pages about one record leave the frame out (`show` is false). They keep
 * their own record header, with its back link, and no menu.
 */
export function AiFrame({ children, show = true }: { children: ReactNode; show?: boolean }) {
  const t = useTranslations("ai.menu");
  // The same spacing the section's layout always gave them.
  if (!show) return <div className="flex w-full flex-col gap-6 pb-12">{children}</div>;
  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider icon={<Bot className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          {/* The website chat's lines read `?section=`, which waits for the browser; the screen beside it doesn't. */}
          <Suspense fallback={null}>
            <AiMenu />
          </Suspense>
        </aside>
        <section className="flex min-w-0 flex-col">{children}</section>
      </div>
    </div>
  );
}

function AiMenu() {
  const t = useTranslations("ai.menu");
  const pathname = usePathname() || "";
  const section = useSearchParams()?.get("section");
  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={aiPageForPath(pathname, section) ?? ""}
      openAtFirst={["costs", "conversations", "knows"]}
      groups={AI_MENU_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: AI_MENU_PAGES.filter((page) => page.group === group).map((page) => ({
          id: page.id,
          label: t(page.id),
          href: page.href,
        })),
      }))}
    />
  );
}
