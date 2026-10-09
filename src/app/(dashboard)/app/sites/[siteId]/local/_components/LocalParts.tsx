"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../../_components/siteFormat";
import { sharedSiteQuery } from "../../../_components/useSiteParam";
import { useSiteId } from "../../../_components/useSite";

/**
 * What Discovery's Local pages share (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, §7): the office switch at the top of each, a
 * business's name with the line under it, a figure cell, and the one note a
 * page shows when there is nothing to show yet.
 */

export type OfficeOption = { listingId: Id<"listings">; name: string; town: string | null };

/** The office open, from the address: `?office=`. */
export function useOfficeId(): Id<"listings"> | undefined {
  const params = useSearchParams();
  return (params.get("office") ?? undefined) as Id<"listings"> | undefined;
}

/** "Guildford office", or the business's own name where Google gives no town. */
export function useOfficeName(): (office: { name: string; town: string | null }) => string {
  const t = useTranslations("sites.local");
  return (office) => (office.town ? t("officeOf", { town: office.town }) : office.name);
}

/**
 * Which office a page reads, as drawn: a dropdown in the page's header, one
 * choice an office, and on Business profile "Every office side by side"
 * after them. Hidden while there is only one office to choose and no
 * side-by-side page.
 */
export function OfficeSwitch({ offices, open, profile = false, every = false, allOffices = false }: {
  offices: readonly OfficeOption[];
  open: Id<"listings"> | null;
  /** Business profile's own: it offers every office side by side. */
  profile?: boolean;
  /** The side-by-side page is the one open. */
  every?: boolean;
  /** Reviews' own: "Every office" first, the page's whole scope, chosen when no office is. */
  allOffices?: boolean;
}) {
  const t = useTranslations("sites.local");
  const officeName = useOfficeName();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const siteId = useSiteId();
  const sideBySide = profile && offices.length > 1;
  if (offices.length < 2 && !sideBySide) return null;
  const EVERY = "every";
  const ALL = "";
  const go = (next: string) => {
    const query = new URLSearchParams(sharedSiteQuery(params).replace(/^\?/, ""));
    if (allOffices && next === ALL) {
      router.push(`${pathname}${query.toString() ? `?${query}` : ""}`);
      return;
    }
    if (next === EVERY) {
      router.push(`/app/sites/${siteId}/local/offices${query.toString() ? `?${query}` : ""}`);
      return;
    }
    query.set("office", next);
    const base = every ? `/app/sites/${siteId}/local` : pathname;
    router.push(`${base}?${query}`);
  };
  return (
    <Select aria-label={t("officeChoice")} className="w-[220px]" value={every ? EVERY : (open ?? ALL)} onChange={go}>
      {allOffices ? <option value={ALL}>{t("allOffices")}</option> : null}
      {offices.map((office) => <option key={office.listingId} value={office.listingId}>{officeName(office)}</option>)}
      {sideBySide ? <option value={EVERY}>{t("everyOffice")}</option> : null}
    </Select>
  );
}

/** A business's name, with its address or website under it, and where it links. */
export function BusinessCell({ name, sub, href, you }: { name: string; sub: string | null; href?: string; you?: boolean }) {
  const t = useTranslations("sites.local");
  const title = you ? t("you", { name }) : name;
  return (
    <span className="flex min-w-0 flex-col">
      {href ? (
        <Link href={href} className="text-[13px] text-foreground hover:underline">{title}</Link>
      ) : (
        <span className="text-[13px] text-foreground">{title}</span>
      )}
      {sub ? <span className="truncate text-[12px] text-secondary">{sub}</span> : null}
    </span>
  );
}

/** A figure in a table, in the tables' mono, or the kit's dash when there is none. */
export function FigureCell({ value, text }: { value: number | null | undefined; text?: string }) {
  if (value === null || value === undefined) return <NoFigure />;
  return <span className="font-mono text-[12px] tabular-nums">{text ?? formatNumber(value)}</span>;
}

/** A rating to one place, "4.8". */
export function ratingText(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : value.toFixed(1);
}

/** The page's one note when Local has nothing to show yet, with the way to set it up. */
export function LocalSetupNotice({ siteId, reason }: { siteId: string; reason: "off" | "noOffice" | "notChecked" | "noRivals" }) {
  const t = useTranslations("sites.local.setup");
  const params = useSearchParams();
  return (
    <Notice
      action={reason === "noOffice" || reason === "noRivals" ? (
        <Link href={`/app/sites/${siteId}/local/listings${sharedSiteQuery(params)}`} className="text-[12px] font-medium text-foreground hover:underline">
          {t("openListings")}
        </Link>
      ) : undefined}
    >
      {t(reason)}
    </Notice>
  );
}
