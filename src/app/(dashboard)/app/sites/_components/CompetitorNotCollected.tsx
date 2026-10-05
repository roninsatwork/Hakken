"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useSite } from "./useSite";

/**
 * A competitor's page for something collected for a company's own websites
 * only (docs/plans/active/finish-off-plan.md, items 6 and 14): its header,
 * then a plain word on why there is nothing here — no empty table, and no
 * figures left from before the rule — and the way to the same page for the
 * website the competitor is measured against. Your pages says the same in its
 * own words (`your-pages/page.tsx`). A page shows it in place of its own
 * content when `useIsCompetitor()` says the open site is a competitor.
 */
export function CompetitorNotCollected({ icon, title, description, notice, tab }: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Why this is not collected for a competitor, and what is kept instead. */
  notice: string;
  /** The page's own path under a site, for the link to the measured website's. */
  tab: string;
}) {
  const t = useTranslations("sites.common");
  const site = useSite();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={icon} title={title} description={description} />
      <Notice
        action={site?.ofSiteId && site.ofHost ? (
          <Link href={`/app/sites/${site.ofSiteId}/${tab}`} className="text-[12.5px] text-info hover:underline">
            {t("openOwnSite", { host: site.ofHost })}
          </Link>
        ) : undefined}
      >
        {notice}
      </Notice>
    </div>
  );
}

/** Whether the open site is a competitor, once it is read: its pages bought for own websites only say so instead. */
export function useIsCompetitor(): boolean {
  return useSite()?.relationship === "TRACKED";
}
