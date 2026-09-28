"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/src/ui/lib/utils";
import { NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT, NAV_IDLE_TEXT } from "@/src/ui/components/layout/navStyles";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import {
  SECTION_GROUPS,
  pagesFor,
  readSectionPath,
  sectionHref,
  switchHref,
} from "./websitesSection";

/**
 * The Websites section's menu (docs/plans/active/websites-section-menu-plan.md):
 * a website chooser, then the section's pages in four groups — the websites,
 * what the company tracks, what came back, and collection. Choosing a website
 * narrows every page to it and keeps the page open where that website has
 * it; the pages a competitor does not have are not offered for it. Names
 * only: nothing on a menu but where it goes (no-labels-on-menus). On a phone
 * the pages are one drop-down under the chooser.
 */
export function WebsitesMenu({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.websitesSection");
  const pathname = usePathname();
  const router = useRouter();
  const choices = useQuery(api.websites.listWebsiteChoices, { companyId });

  const place = readSectionPath(companyId, pathname);
  const chosen = choices?.find((choice) => choice.companyWebsiteId === place.siteId) ?? null;
  const site = chosen ? { siteId: chosen.companyWebsiteId, relationship: chosen.relationship } : null;
  const pages = pagesFor(chosen?.relationship ?? null);

  const choose = (value: string) => {
    const next = choices?.find((choice) => choice.companyWebsiteId === value) ?? null;
    router.push(switchHref(companyId, place.page, next ? { siteId: next.companyWebsiteId, relationship: next.relationship } : null));
  };

  // Each of the company's own sites, then the competitors watched against it; then those on their own.
  const owned = (choices ?? []).filter((choice) => choice.relationship === "OWNED");
  const alone = (choices ?? []).filter((choice) => choice.relationship === "TRACKED" && !choice.againstCompanyWebsiteId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="websites-section-site">{t("chooser.label")}</FieldLabel>
        <Select id="websites-section-site" value={place.siteId ?? ""} onChange={choose} className="w-full">
          <option value="">{t("chooser.all")}</option>
          {owned.map((own) => (
            <optgroup key={own.companyWebsiteId} label={own.host}>
              <option value={own.companyWebsiteId}>{own.host}</option>
              {(choices ?? [])
                .filter((choice) => choice.againstCompanyWebsiteId === own.companyWebsiteId)
                .map((rival) => (
                  <option key={rival.companyWebsiteId} value={rival.companyWebsiteId}>
                    {t("chooser.competitor", { host: rival.host })}
                  </option>
                ))}
            </optgroup>
          ))}
          {alone.length > 0 ? (
            <optgroup label={t("chooser.alone")}>
              {alone.map((rival) => (
                <option key={rival.companyWebsiteId} value={rival.companyWebsiteId}>
                  {t("chooser.competitor", { host: rival.host })}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </div>

      <div className="lg:hidden">
        <Select
          aria-label={t("label")}
          value={place.page}
          onChange={(id) => {
            const page = pages.find((entry) => entry.id === id);
            if (page) router.push(sectionHref(companyId, page.id, site));
          }}
        >
          {SECTION_GROUPS.map((group) => (
            <optgroup key={group} label={t(`groups.${group}`)}>
              {pages.filter((page) => page.group === group).map((page) => (
                <option key={page.id} value={page.id}>{t(`pages.${page.id}`)}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <nav aria-label={t("label")} className="hidden flex-col gap-4 text-[13px] lg:flex">
        {SECTION_GROUPS.map((group) => {
          const inGroup = pages.filter((page) => page.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                {t(`groups.${group}`)}
              </span>
              {inGroup.map((page) => {
                const Icon = page.icon;
                const isCurrent = page.id === place.page;
                return (
                  <Link
                    key={page.id}
                    href={sectionHref(companyId, page.id, site)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      // The page being read wears the sidebar's own pill (`navStyles.ts`);
                      // the rest keep a clear border so nothing shifts when it moves.
                      "flex items-center gap-2.5 rounded-[8px] border px-3 py-1.5 tracking-wide transition-colors",
                      isCurrent ? cn(NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT) : cn("border-transparent", NAV_IDLE_TEXT),
                    )}
                  >
                    {/* Never orange: that is a page's action, not where you are (`navStyles.ts`). */}
                    <Icon className={cn("h-4 w-4 shrink-0", isCurrent ? "text-foreground" : "text-muted")} aria-hidden="true" />
                    <span>{t(`pages.${page.id}`)}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
