"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { InsightsMenu } from "./_components/InsightsMenu";
import { useInsightsHome } from "./_components/useInsights";

/**
 * The Insights section (docs/plans/active/insights-analyst-plan.md §4.1; a
 * top-level page under Ask Hakken, menu-names-plan.md phase 7): the company
 * read the way an agency would, across every source and against its rivals.
 * Its header, the choice of website, the side menu and the page. The pages
 * read the whole company with a filter for one website (`site`).
 */
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("insights.section");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const home = useInsightsHome();
  const site = params.get("site") ?? "";

  const choose = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next) query.set("site", next);
    else query.delete("site");
    const rest = query.toString();
    router.push(`${pathname}${rest ? `?${rest}` : ""}`);
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          divider
          icon={<Lightbulb className="h-6 w-6 text-brand" />}
          title={t("title")}
          description={home ? t("description", { company: home.company }) : undefined}
          pills={home?.lastLooked ? <span className="text-[12px] text-secondary">{t("lastLooked", { when: formatDateTime(home.lastLooked) })}</span> : undefined}
          action={home && home.sites.length > 1 ? (
            <Select aria-label={t("website")} value={site} onChange={choose}>
              <option value="">{t("everyWebsite")}</option>
              {home.sites.map((entry) => <option key={entry.siteId} value={entry.siteId}>{entry.host}</option>)}
            </Select>
          ) : undefined}
        />
        {home === null ? (
          <HakkenEmptyState icon={Lightbulb} title={t("noCompanyTitle")} description={t("noCompanyDescription")} />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <InsightsMenu />
            </aside>
            <section className="flex min-w-0 flex-col gap-6">{children}</section>
          </div>
        )}
      </div>
    </>
  );
}
