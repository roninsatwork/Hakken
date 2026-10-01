"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { sitePageForPath, switchHref } from "./sitePages";
import { sharedSiteQuery } from "./useSiteParam";
import { WebsitePicker, type PickerHold } from "./WebsitePicker";

/**
 * The site's name in its header, and the list of the company's websites it
 * opens (docs/plans/active/sites-website-switcher-plan.md, W2 and W3):
 * choosing one opens the same page there, with the same dates, and "Your
 * sites" opens the list of them all.
 */
export function SiteSwitcher({ siteId, host, holds }: { siteId: string; host: string; holds: readonly PickerHold[] }) {
  const t = useTranslations("sites.switcher");
  const tm = useTranslations("sites.menu");
  const pathname = usePathname();
  const query = sharedSiteQuery(useSearchParams());
  const page = sitePageForPath(pathname, siteId);

  return (
    <WebsitePicker
      holds={holds}
      currentId={siteId}
      hrefFor={(hold) => switchHref(pathname, siteId, hold.siteId, query)}
      all={{ label: t("yourSites"), href: `/app/sites${query}` }}
      footer={t("keepsPage", { page: tm(`pages.${page.id}`) })}
      triggerLabel={t("open", { host })}
      // The heading's own size and weight rather than a button's.
      triggerClassName="-mx-2 inline-flex min-w-0 items-center gap-2 rounded-[10px] px-2 py-0.5 text-[length:inherit] font-[inherit] tracking-[inherit] text-foreground hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5"
      renderTrigger={(isOpen) => (
        <>
          <span className="truncate">{host}</span>
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
          </span>
        </>
      )}
    />
  );
}
