"use client";

import { useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/src/ui/lib/utils";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { SectionMenu } from "@/src/app/(dashboard)/app/_components/SectionMenu";
import { WebsitePicker, type PickerHold } from "@/src/app/(dashboard)/app/sites/_components/WebsitePicker";
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
 * the pages are one drop-down under the chooser. The pages are drawn by the
 * shared `SectionMenu`, as Sites' and Search Console's are, each with its
 * icon (2026-10-03 clean-up).
 *
 * The chooser is the client's website picker (`WebsitePicker`, docs/plans/
 * active/sites-website-switcher-plan.md, W9): searched, each of the company's
 * own sites with its competitors folded beneath it. A native drop-down read as
 * one long column once Korda held five sites and their competitors (Anthony,
 * 2026-10-01: "not sure this works anymore in the admin when i add lots of
 * competitors").
 */
export function WebsitesMenu({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.websitesSection");
  const pathname = usePathname();
  const choices = useQuery(api.websites.listWebsiteChoices, { companyId });

  const place = readSectionPath(companyId, pathname);
  const chosen = choices?.find((choice) => choice.companyWebsiteId === place.siteId) ?? null;
  const site = chosen ? { siteId: chosen.companyWebsiteId, relationship: chosen.relationship } : null;
  const pages = pagesFor(chosen?.relationship ?? null);

  const holds = (choices ?? []).map((choice): PickerHold => ({
    siteId: choice.companyWebsiteId,
    host: choice.host,
    relationship: choice.relationship,
    ofSiteId: choice.againstCompanyWebsiteId,
    iconUrl: choice.iconUrl,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="websites-section-site">{t("chooser.label")}</FieldLabel>
        <WebsitePicker
          holds={holds}
          currentId={place.siteId ?? null}
          hrefFor={(hold) => switchHref(companyId, place.page, { siteId: hold.siteId, relationship: hold.relationship })}
          all={{ label: t("chooser.all"), href: switchHref(companyId, place.page, null) }}
          triggerId="websites-section-site"
          triggerClassName="flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-border-dim bg-background px-3 py-0 text-[13px] text-foreground hover:bg-foreground/5 hover:text-foreground"
          renderTrigger={(isOpen) => (
            <>
              <span className="truncate">{chosen?.host ?? t("chooser.all")}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            </>
          )}
        />
      </div>

      <SectionMenu
        label={t("label")}
        currentId={place.page}
        // Every group open: twelve pages, all in view.
        openAtFirst={SECTION_GROUPS}
        groups={SECTION_GROUPS.map((group) => ({
          id: group,
          label: t(`groups.${group}`),
          items: pages.filter((page) => page.group === group).map((page) => ({
            id: page.id,
            label: t(`pages.${page.id}`),
            href: sectionHref(companyId, page.id, site),
            icon: page.icon,
          })),
        })).filter((group) => group.items.length > 0)}
      />
    </div>
  );
}
