"use client";

import { useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChooseWebsite } from "../_components/ChooseWebsite";

/**
 * Page classification with All websites chosen (docs/plans/active/
 * page-groups-plan.md, decision 6): each of the company's own websites — a
 * competitor has none — with how many classifications it has and how many of
 * its pages are Not sorted, each row opening that website's own page, where
 * they are set.
 */
export default function AllWebsitesClassificationPage() {
  const t = useTranslations("admin.siteView.classification.all");
  return (
    <ChooseWebsite
      page="classification"
      columns={[
        {
          key: "classifications",
          header: t("classifications"),
          align: "right",
          className: "w-[160px]",
          cell: (choice) => <ClassificationCounts companyWebsiteId={choice.companyWebsiteId} show="classifications" />,
        },
        {
          key: "notSorted",
          header: t("notSorted"),
          align: "right",
          className: "w-[160px]",
          cell: (choice) => <ClassificationCounts companyWebsiteId={choice.companyWebsiteId} show="notSorted" />,
        },
      ]}
    />
  );
}

/**
 * One website's counts. Each website is read on its own — its pages are
 * classified whole to count Not sorted, which is as much as one read holds —
 * and both cells of a row share the one answer.
 */
function ClassificationCounts({ companyWebsiteId, show }: { companyWebsiteId: Id<"companyWebsites">; show: "classifications" | "notSorted" }) {
  const t = useTranslations("admin.siteView.classification.all");
  const format = useFormatter();
  const list = useQuery(api.pageClassifications.pageClassificationList, { companyWebsiteId });
  if (list === undefined) return <span className="font-mono text-[12px] text-muted">…</span>;
  if (list === null) return <span className="text-[12px] text-muted">—</span>;
  const { summary } = list;
  return (
    <span className="font-mono text-[12px] text-secondary">
      {show === "classifications"
        ? format.number(summary.classifications)
        : t("notSortedOf", { notSorted: format.number(summary.notSorted), pages: format.number(summary.pages) })}
    </span>
  );
}
