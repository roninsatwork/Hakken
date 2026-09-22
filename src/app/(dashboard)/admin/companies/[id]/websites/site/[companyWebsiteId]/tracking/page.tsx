"use client";

import { useQuery } from "convex/react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteSwitcher } from "../SiteSwitcher";
import { formatMonthly, siteBase } from "../siteView";
import { TrackedCompetitors } from "./TrackedCompetitors";
import { TrackedQuestions } from "./TrackedQuestions";
import { TrackedSearches } from "./TrackedSearches";

const LISTS = ["searches", "questions", "competitors"] as const;
type TrackedList = (typeof LISTS)[number];

/**
 * What this site pays to watch: its searches, its questions and its rivals.
 *
 * One route with a switch rather than three tabs, because the three share a
 * shape and an economics — every row is charged on every collection — and
 * showing their counts and monthly costs side by side is what makes the
 * trade-off legible. The switch is a link, so each list has an address.
 *
 * Searches and questions are the website's own lists, shared with every client
 * attached to it; rivals are this company's own choice. The lists say which.
 */
export default function CompanySiteTrackingPage() {
  const t = useTranslations("admin.siteView");
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;

  const requested = searchParams.get("list");
  const list: TrackedList = LISTS.includes(requested as TrackedList) ? (requested as TrackedList) : "searches";
  const base = `${siteBase(companyId, companyWebsiteId)}/tracking`;
  const unknown = t("priceUnknown");

  // The count, and the price beside it once there is one to state.
  const detail = (count: number, cost: number | null) =>
    cost === null ? String(count) : `${count} · ${formatMonthly(cost, unknown)}`;

  if (header.relationship !== "OWNED") {
    return <p className="text-[13px] text-secondary">{t("trackingOwnedOnly")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SiteSwitcher
          label={t("tabs.tracking")}
          items={[
            { href: `${base}?list=searches`, label: t("lists.searches"), detail: detail(header.counts.searches, header.monthly.searches), active: list === "searches" },
            { href: `${base}?list=questions`, label: t("lists.questions"), detail: detail(header.counts.questions, header.monthly.questions), active: list === "questions" },
            { href: `${base}?list=competitors`, label: t("lists.competitors"), detail: detail(header.counts.rivals, header.monthly.rivals), active: list === "competitors" },
          ]}
        />
        <p className="text-[12px] text-muted">
          {header.monthly.total === null
            ? t("chargedUnknown")
            : t("charged", { cost: formatMonthly(header.monthly.total, unknown) })}
        </p>
      </div>

      {list === "searches" ? (
        <TrackedSearches websiteId={header.websiteId} companyWebsiteId={companyWebsiteId} host={header.displayHost} place={header.placeLabel} />
      ) : list === "questions" ? (
        <TrackedQuestions websiteId={header.websiteId} companyWebsiteId={companyWebsiteId} host={header.displayHost} place={header.placeLabel} />
      ) : (
        <TrackedCompetitors companyId={companyId} companyWebsiteId={companyWebsiteId} host={header.displayHost} />
      )}
    </div>
  );
}
