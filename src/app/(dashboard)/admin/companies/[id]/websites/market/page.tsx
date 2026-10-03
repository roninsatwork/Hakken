"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "@/convex/utils/seoLocations";
import { countryName } from "@/src/app/(dashboard)/app/search-console/_components/countries";
import { ChooseWebsite } from "../_components/ChooseWebsite";

type WebsiteRow = FunctionReturnType<typeof api.websites.listCompanyWebsiteRows>["rows"][number];

const placeOf = (row: WebsiteRow | undefined) =>
  row ? row.locationLabel ?? findSeoLocation(row.locationCode ?? DEFAULT_LOCATION_CODE)?.label ?? "" : "";

/**
 * Market with All websites chosen (docs/plans/active/search-console-plan.md
 * §16): every website the company holds, with where each trades and where it
 * is watched from — what is set, never what came back — each row opening
 * that website's Market page, where they are changed. A paired competitor is
 * watched from its pair's place, and says so.
 */
export default function AllWebsitesMarketPage() {
  const t = useTranslations("admin.siteView.market.all");
  const locale = useLocale();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const listed = useQuery(api.websites.listCompanyWebsiteRows, { companyId });
  const byHold = new Map((listed?.rows ?? []).map((row) => [row._id as string, row]));

  return (
    <ChooseWebsite
      page="market"
      loading={listed === undefined}
      columns={[
        {
          key: "trades",
          header: t("trades"),
          cell: (choice) => {
            if (choice.relationship === "TRACKED") return <span className="text-[12px] text-muted">{t("notForCompetitor")}</span>;
            const countries = byHold.get(choice.companyWebsiteId)?.searchConsoleCountries ?? [];
            return countries.length === 0
              ? <span className="text-[12px] text-muted">{t("none")}</span>
              : <span className="text-[12px] text-secondary">{countries.map((code) => countryName(code, locale) ?? code.toUpperCase()).join(", ")}</span>;
          },
        },
        {
          key: "watch",
          header: t("watch"),
          cell: (choice) => (
            <span className="text-[12px] text-secondary">
              {choice.againstCompanyWebsiteId
                ? t("asPair", { place: placeOf(byHold.get(choice.againstCompanyWebsiteId)), host: choice.againstHost ?? "" })
                : placeOf(byHold.get(choice.companyWebsiteId))}
            </span>
          ),
        },
      ]}
    />
  );
}
