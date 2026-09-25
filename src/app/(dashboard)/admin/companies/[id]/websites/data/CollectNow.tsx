"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type Outcome = "QUEUED" | "BEING_QUEUED" | "SENDING" | "ALREADY_SENDING";

type RoleAgent = { name: string; systemKey?: string; isActive?: boolean };

/**
 * Collect now: this company's collection, once, straight away — an override
 * of its schedule, which it leaves as it is (Anthony, 2026-09-25: "an override
 * as a one off from the company schedule").
 *
 * The Planner queues everything for the company's websites and competitors,
 * then the Collector sends it (`seoAgentRuns.collectNow`). Grey, not orange:
 * the page already has its one orange action. When it cannot run, the reason
 * sits beside it rather than leaving the reader to work out why it will not
 * press; once pressed, the line says what happened and opens the run.
 */
export function CollectNow({ companyId, companyName, collecting, agents }: {
  companyId: Id<"companies">;
  companyName: string;
  /** The saved switch: a one-off does not reach past "off", and an unsaved switch is not yet on. */
  collecting: boolean;
  agents: RoleAgent[] | undefined;
}) {
  const t = useTranslations("admin.companyDataCollection.collectNow");
  const canWriteHere = useCanWriteHere();
  const collectNow = useMutation(api.seoAgentRuns.collectNow);
  const action = useAdminAction({ scope: "admin-company-collect-now" });
  const [result, setResult] = useState<{ outcome: Outcome; cycleId: Id<"seoCollectionCycles"> } | null>(null);
  const [error, setError] = useState("");

  if (!canWriteHere) return null;

  // Found by role, never by name — the names have changed before.
  const planner = agents?.find((agent) => agent.systemKey === "DATAFORSEO_PLANNER");
  const collector = agents?.find((agent) => agent.systemKey === "DATAFORSEO_COLLECTOR");
  const blocked = !collecting
    ? t("off")
    : agents === undefined
      ? ""
      : !planner
        ? t("noPlanner")
        : !collector
          ? t("noCollector")
          : planner.isActive === false
            ? t("agentOff", { name: planner.name })
            : collector.isActive === false
              ? t("agentOff", { name: collector.name })
              : "";

  const handleCollect = async () => {
    setError("");
    setResult(null);
    const outcome = await action.run(async () => await collectNow({ companyId }), {
      suppressErrorToast: true,
      fallbackMessage: t("failed"),
    });
    if (outcome.ok) setResult(outcome.data);
    // A repeat click while the first is running owns nothing to report.
    else if (!outcome.deduplicated) setError(outcome.message);
  };

  return (
    <div className="flex max-w-sm flex-col items-start gap-1.5 sm:items-end">
      <Button
        variant="quiet"
        onClick={handleCollect}
        disabled={Boolean(blocked) || agents === undefined || action.isBusy()}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-[13px]"
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        {action.isBusy() ? t("working") : t("button")}
      </Button>
      {blocked ? <p className="text-[12px] text-muted sm:text-right">{blocked}</p> : null}
      {error ? <p role="alert" className="text-[12px] text-destructive sm:text-right">{error}</p> : null}
      {result ? (
        <p role="status" className="text-[12px] text-secondary sm:text-right">
          {t(`outcomes.${result.outcome}`, { company: companyName })}{" "}
          <Link href={`/admin/companies/${companyId}/websites/runs/${result.cycleId}`} className="text-info hover:underline">
            {t("follow")} →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
