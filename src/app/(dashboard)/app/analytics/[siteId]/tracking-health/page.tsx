"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDateTime } from "@/src/lib/dates";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { useHealthWords } from "../../_components/useHealthWords";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

/**
 * Tracking health (§6; §11 board 9): whether Google Analytics is counting the
 * website properly — the failing checks first, each saying what is wrong, why
 * it matters and how to fix it, and the passing ones folded into one line
 * (GA22). Checked when it connected and every week since.
 */
export default function AnalyticsTrackingHealthPage() {
  const t = useTranslations("googleAnalytics.health");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const checkedAt = status?.connection?.health?.checkedAt;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Activity className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={checkedAt ? t("descriptionChecked", { when: formatDateTime(checkedAt) }) : t("description")}
      />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <HealthBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function HealthBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const words = useHealthWords(status);
  const { platformName } = useSystemSettings();
  const [showPassing, setShowPassing] = useState(false);
  const checks = status.connection?.health?.checks;
  if (!checks) return <Notice>{t("notYet")}</Notice>;
  const failing = checks.filter((check) => !check.passing);
  const passing = checks.filter((check) => check.passing);
  const fixable = new Set(["NOTHING_COUNTED", "NO_VALUE"]);
  return (
    <div className="flex flex-col gap-4">
      {failing.length > 0 ? (
        <Notice tone="warning">
          <span className="block font-medium text-foreground">{t("lineTitle", { failing: failing.length, total: checks.length })}</span>
          <span className="block">{t("toldOnce", { platformName })}</span>
        </Notice>
      ) : (
        <Notice>{t("allPassing", { total: checks.length })}</Notice>
      )}
      <div className="flex flex-col divide-y divide-border-dim/50 overflow-hidden rounded-2xl border border-border-dim bg-card/40">
        {[...failing, ...(showPassing ? passing : [])].map((check) => {
          const said = words(check);
          return (
            <div key={check.check} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-[14px] font-medium text-foreground">{said.title}</h2>
                <StatusLabel tone={check.passing ? "success" : "warning"}>{check.passing ? t("passing") : t("needsLook")}</StatusLabel>
              </div>
              <p className="text-[13px] text-secondary">{said.wrong}</p>
              {!check.passing ? (
                <>
                  <p className="text-[13px] text-secondary"><span className="text-foreground">{t("why")}</span> {said.why}</p>
                  <p className="text-[13px] text-secondary"><span className="text-foreground">{t("fix")}</span> {said.fix}</p>
                  {fixable.has(check.check) && status.canManage ? (
                    <div>
                      <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>
                        {check.check === "NO_VALUE" ? t("setValue") : t("chooseWhatCounts")}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        {passing.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => setShowPassing((shown) => !shown)}
            className="flex w-full items-center justify-between rounded-none px-5 py-3 text-left"
            aria-expanded={showPassing}
          >
            <StatusLabel tone="success">{t("passingCount", { count: passing.length })}</StatusLabel>
            <span className="inline-flex items-center gap-1 text-[12px] text-secondary">
              {showPassing ? t("hide") : t("show")}
              {showPassing ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
