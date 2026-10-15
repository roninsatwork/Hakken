"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDateTime } from "@/src/lib/dates";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { HEALTH_CHECKS_WITH_STEPS, trackingCheckSees } from "@/convex/utils/sees/analytics";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsPanel } from "../../../_components/AnalyticsPanels";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { choosableHere, useHealthWords } from "../../../_components/useHealthWords";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../../_components/useAnalytics";

type Check = NonNullable<NonNullable<AnalyticsStatus["connection"]>["health"]>["checks"][number];

/** The checks whose names are conversions or events; those whose names are addresses; the one whose names are pages. */
const NAMES_EVENTS = new Set(["NEVER_HAPPENS", "ENQUIRY_UNCOUNTED", "NO_VALUE", "SOMETHING_ELSE"]);
const NAMES_ADDRESSES = new Set(["STRANGERS", "SELF_REFERRAL", "PAYMENT_REFERRALS"]);
const NAMES_PAGES = new Set(["COUNTED_AGAIN"]);

/**
 * A tracking health check's own screen (docs/plans/active/ga-tracking-health-plan.md
 * TH2), opened from Tracking health's table: what it checks and when, its
 * status; What Hakken sees saying what it found and why that matters, its fix
 * as numbered steps; then what it names — the conversions, the addresses or
 * the pages. Read from the checks the weekly run keeps: nothing is asked of
 * Google.
 */
export default function AnalyticsTrackingCheckPage() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <CheckBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function CheckBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const words = useHealthWords(status);
  const { platformName } = useSystemSettings();
  const key = useSearchParams().get("key") ?? "";
  const health = status.connection?.health ?? null;
  const check = health?.checks.find((one) => one.check === key) ?? null;
  const known = HEALTH_CHECKS_WITH_STEPS.includes(key);
  const said = check ? words(check) : null;
  // Fixed on the Connection page: what counts, a value, and an uncounted enquiry listed there.
  const fixable = check !== null && !check.passing && (check.check === "NOTHING_COUNTED" || check.check === "NO_VALUE" || choosableHere(check, status));

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("screen.back"), href: hrefFor("tracking-health") }}
        icon={<Activity className="h-5 w-5 text-brand" />}
        title={said?.title ?? (known ? t(`checks.${key}.title`) : t("title"))}
        description={known && health ? t("screen.description", { about: t(`checks.${key}.about`), when: formatDateTime(health.checkedAt) }) : undefined}
        pills={check ? <StatusLabel tone={check.passing ? "success" : "warning"}>{check.passing ? t("passing") : t("needsLook")}</StatusLabel> : undefined}
      />
      {!health ? <Notice>{t("notYet")}</Notice> : !check || !known ? <Notice>{t("screen.unknown", { platformName })}</Notice> : (
        <>
          {/* The page's own box keeps the advice: a check's is worked out from the same checks, never saved twice. */}
          <AnalyticsSees screen="trackingHealth" seen={trackingCheckSees(check, status.host)} currency={status.connection?.currency} keep={false} />
          {fixable && status.canManage ? (
            <div>
              <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>
                {check.check === "NO_VALUE" ? t("setValue") : t("chooseWhatCounts")}
              </Button>
            </div>
          ) : null}
          {!check.passing && (check.names ?? []).length > 0 ? <WhatItNames check={check} status={status} /> : null}
        </>
      )}
    </div>
  );
}

/** What a failing check names (TH2): its conversions by their own names and Google's, its addresses with their visits, or its pages. */
function WhatItNames({ check, status }: { check: Check; status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health.screen");
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const { platformName } = useSystemSettings();
  const names = check.names ?? [];
  const rows = names.map((name, at) => ({ name, other: check.others?.[at] ?? null }));
  type Named = (typeof rows)[number];

  if (NAMES_EVENTS.has(check.check)) {
    const found = (row: Named) => t(`events.${check.check}`, { other: row.other ? nameOf(row.other) : "" });
    return (
      <AnalyticsPanel title={t("events.title")} description={t("events.note")}>
        <CompactList
          rows={rows}
          rowKey={(row) => row.name}
          empty="–"
          columns={[
            { key: "event", header: t("events.event"), cell: (row) => <Link href={hrefFor("events/event", { key: row.name })} className="text-[13px] text-foreground hover:text-info">{nameOf(row.name)}</Link> },
            { key: "google", header: t("events.google"), cell: (row) => <span className="font-mono text-[11px] text-muted">{row.name}</span> },
            { key: "found", header: t("events.found", { platformName }), cell: (row) => <StatusLabel tone="warning">{found(row)}</StatusLabel> },
          ]}
        />
      </AnalyticsPanel>
    );
  }
  if (NAMES_ADDRESSES.has(check.check)) {
    // Each other address's visits, as the weekly run counted them for the check.
    const visits = new Map((status.connection?.hostVisits ?? []).map((one) => [one.host, one.visits]));
    const counted = check.check === "STRANGERS";
    return (
      <AnalyticsPanel title={t("addresses.title")} description={t("addresses.note")}>
        <CompactList
          rows={counted ? [...rows].sort((left, right) => (visits.get(right.name) ?? 0) - (visits.get(left.name) ?? 0)) : rows}
          rowKey={(row) => row.name}
          empty="–"
          columns={[
            { key: "address", header: t("addresses.address"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
            ...(counted ? [{
              key: "visits",
              header: t("addresses.visits"),
              align: "right" as const,
              cell: (row: Named) => (visits.has(row.name) ? <span className="font-mono text-[12px] text-foreground">{formatNumber(visits.get(row.name) ?? 0)}</span> : <NoFigure />),
            }] : []),
          ]}
        />
      </AnalyticsPanel>
    );
  }
  if (NAMES_PAGES.has(check.check)) {
    return (
      <AnalyticsPanel title={t("pages.title")} description={t("pages.note")}>
        <CompactList
          rows={rows}
          rowKey={(row) => row.name}
          empty="–"
          columns={[{ key: "page", header: t("pages.page"), cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.name}</span> }]}
        />
      </AnalyticsPanel>
    );
  }
  return null;
}
