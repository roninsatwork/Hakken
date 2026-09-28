"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT, NAV_IDLE_TEXT } from "@/src/ui/components/layout/navStyles";
import { Select } from "@/src/ui/components/screens/Select";
import { SEARCH_CONSOLE_PAGES, pageForPath, useSearchConsoleHref } from "./useSearchConsole";

/**
 * A website's pages in the Search Console section: Performance, Searches,
 * Pages, Countries and devices, and its Connection. Page names only — never a
 * mark or a label (Anthony, 2026-09-25). A search's or a page's own screen
 * keeps the list it was opened from lit; on a phone the menu is one
 * drop-down, as the Sites menu is.
 */
export function SearchConsoleMenu({ siteId }: { siteId: string }) {
  const t = useTranslations("searchConsole.menu");
  const pathname = usePathname();
  const router = useRouter();
  const hrefFor = useSearchConsoleHref(siteId);
  const current = pageForPath(pathname, siteId);

  return (
    <>
      <div className="lg:hidden">
        <Select
          aria-label={t("label")}
          value={current}
          onChange={(id) => {
            const page = SEARCH_CONSOLE_PAGES.find((entry) => entry.id === id);
            if (page) router.push(hrefFor(page.segment));
          }}
        >
          {SEARCH_CONSOLE_PAGES.map((page) => <option key={page.id} value={page.id}>{t(page.id)}</option>)}
        </Select>
      </div>
      <nav aria-label={t("label")} className="hidden flex-col gap-0.5 text-[13px] lg:flex">
        {SEARCH_CONSOLE_PAGES.map((page) => {
          const isCurrent = page.id === current;
          return (
            <Link
              key={page.id}
              href={hrefFor(page.segment)}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "rounded-[8px] border px-3 py-1.5 tracking-wide transition-colors",
                isCurrent ? cn(NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT) : cn("border-transparent", NAV_IDLE_TEXT),
              )}
            >
              {t(page.id)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
