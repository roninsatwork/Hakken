"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Swords, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VERDICT_THRESHOLDS } from "@/convex/utils/trackingVerdicts";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { RIVAL_TONE, formatMonthly, siteBase } from "../siteView";

/**
 * The rivals this company watches against this site — its own choice, not the
 * shared competition graph — and the ones it could.
 *
 * Each rival is compared on this site's own searches, on the same page and
 * from the same place, which is the only comparison that means anything and
 * the reason a rival is collected on this site's day. Below them sit the
 * suggestions, in two kinds: sites the AI answers keep naming that this
 * company does not hold, and sites competing for the same searches. Both are
 * free to know — the answers and the rankings named them anyway — and both
 * refill every collection, which is why nothing here is ever "done".
 */
export function TrackedCompetitors({
  companyId,
  companyWebsiteId,
  host,
}: {
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
}) {
  const t = useTranslations("admin.siteView.competitors");
  const tView = useTranslations("admin.siteView");
  const tKinds = useTranslations("admin.companyWebsiteDetail.discovered");

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const view = useQuery(api.websiteClientView.listTrackedCompetitors, { companyWebsiteId });
  const discovered = useQuery(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
    companyWebsiteId,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const addRival = useMutation(api.websiteAttachments.addTrackedCompetitor);
  const stopTracking = useMutation(api.websites.removeCompanyWebsite);
  const acceptSuggestion = useMutation(api.seoDiscoveredCompetitors.acceptDiscoveredCompetitor);
  const dismissSuggestion = useMutation(api.seoDiscoveredCompetitors.dismissDiscoveredCompetitor);
  const action = useAdminAction({ scope: "admin-site-competitors" });
  const unknown = tView("priceUnknownShort");

  const run = async (key: string, work: () => Promise<unknown>, fallback: string) => {
    setError("");
    const outcome = await action.run(work, { key, suppressErrorToast: true, fallbackMessage: fallback });
    if (!outcome.ok) setError(outcome.message);
    return outcome.ok;
  };

  const handleAdd = async () => {
    if (await run("add", () => addRival({ companyWebsiteId, url: draft }), t("errors.addFailed"))) setDraft("");
  };

  const kindLabel = (kind: string | null) =>
    kind && ["COMPETITOR", "DIRECTORY", "PUBLISHER", "SUPPLIER", "OTHER"].includes(kind)
      ? tKinds(`kinds.${kind}`)
      : tKinds("unjudged");

  const rivals = view?.rivals;
  const untracked = view?.untrackedNamed;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<Swords className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle", { host })}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="site-rival"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[16rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add") || draft.trim().length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>
        <span className="text-[11px] text-muted">{t("addHint")}</span>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={rivals}
        rowKey={(row) => row.companyWebsiteId}
        minWidthClassName="min-w-[880px]"
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: rivals?.length ?? 0,
          pageSize: Math.max(rivals?.length ?? 0, 1),
          isLoading: rivals === undefined,
          onPageChange: () => undefined,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "rival",
            header: t("rivalColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <Link
                  href={siteBase(companyId, row.companyWebsiteId)}
                  className="text-[13px] text-foreground hover:text-brand"
                >
                  {row.displayHost}
                </Link>
                <span className="text-[11px] text-muted">
                  {row.lastSeenDay ? t("lastSeen", { day: row.lastSeenDay }) : t("notSeenYet")}
                </span>
              </div>
            ),
          },
          {
            key: "beats",
            header: t("beatsColumn"),
            cell: (row) => (
              row.comparedOn === 0
                ? <span className="text-[12px] text-muted">–</span>
                : (
                  <span className="text-[12px] text-foreground">
                    {t("beatsOf", { beats: row.beatsYouOn, of: row.comparedOn })}
                  </span>
                )
            ),
          },
          {
            key: "answers",
            header: t("answersColumn"),
            cell: (row) => (
              row.answersCounted === 0
                ? <span className="text-[12px] text-muted">–</span>
                : (
                  <span className="font-mono text-[12px] text-foreground">
                    {t("namedOf", { named: row.namedInAnswers, of: row.answersCounted })}
                  </span>
                )
            ),
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => <StatusPill tone={RIVAL_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>,
          },
          {
            key: "cost",
            header: t("costColumn"),
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">{formatMonthly(row.monthlyUsd, unknown)}</span>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-[11px]"
                  disabled={action.isBusy(row.companyWebsiteId)}
                  onClick={() => void run(row.companyWebsiteId, () => stopTracking({ id: row.companyWebsiteId }), t("errors.stopFailed"))}
                >
                  {t("stop")}
                </Button>
              </RowActions>
            ),
          },
        ]}
      />

      <p className="text-[11px] leading-relaxed text-muted">
        {t("thresholds", {
          quietWeeks: VERDICT_THRESHOLDS.goneQuietDays / 7,
          newWeeks: VERDICT_THRESHOLDS.tooNewDays / 7,
        })}
      </p>

      <div className="flex flex-col gap-3 border-t border-border-dim pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{t("namedTitle")}</h2>
          <p className="max-w-3xl text-[12px] text-secondary">{t("namedSubtitle")}</p>
        </div>
        <DataTable
          rows={untracked}
          rowKey={(row) => row.websiteId}
          minWidthClassName="min-w-[640px]"
          empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("namedEmpty") }}
          footer={{
            mode: "paged",
            page: 1,
            totalPages: 1,
            totalCount: untracked?.length ?? 0,
            pageSize: Math.max(untracked?.length ?? 0, 1),
            isLoading: untracked === undefined,
            onPageChange: () => undefined,
            labels: { empty: t("namedEmpty") },
          }}
          columns={[
            {
              key: "site",
              header: t("siteColumn"),
              cell: (row) => <span className="text-[13px] text-foreground">{row.displayHost}</span>,
            },
            {
              key: "times",
              header: t("timesColumn"),
              cell: (row) => (
                <span className="text-[12px] text-secondary">{t("namedTimes", { times: row.times, day: row.lastDay })}</span>
              ),
            },
            {
              key: "actions",
              header: t("actionsColumn"),
              align: "right",
              cell: (row) => (
                <RowActions>
                  <Button
                    variant="accent"
                    className="px-2 py-1 text-[11px]"
                    disabled={action.isBusy(row.websiteId)}
                    onClick={() => void run(row.websiteId, () => addRival({ companyWebsiteId, url: row.displayHost }), t("errors.addFailed"))}
                  >
                    {t("track")}
                  </Button>
                </RowActions>
              ),
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border-dim pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{tKinds("title")}</h2>
          <p className="max-w-3xl text-[12px] text-secondary">{tKinds("subtitle")}</p>
        </div>
        <DataTable
          rows={discovered?.data}
          rowKey={(row) => row._id}
          minWidthClassName="min-w-[720px]"
          empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: tKinds("empty") }}
          footer={{
            mode: "paged",
            page,
            totalPages: discovered?.totalPages ?? 1,
            totalCount: discovered?.totalCount ?? 0,
            pageSize: TABLE_PAGE_SIZE,
            isLoading: discovered === undefined,
            onPageChange: setPage,
            labels: { empty: tKinds("empty") },
          }}
          columns={[
            {
              key: "site",
              header: tKinds("websiteColumn"),
              cell: (row) => <span className="text-[13px] text-foreground">{row.host}</span>,
            },
            {
              key: "kind",
              header: tKinds("kindColumn"),
              cell: (row) => <span className="text-[12px] text-secondary">{kindLabel(row.kind)}</span>,
            },
            {
              key: "overlap",
              header: tKinds("overlapColumn"),
              cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.intersections}</span>,
            },
            {
              key: "actions",
              header: tKinds("actionsColumn"),
              align: "right",
              cell: (row) => (
                <RowActions>
                  <Button
                    variant="accent"
                    className="px-2 py-1 text-[11px]"
                    disabled={action.isBusy(row._id)}
                    onClick={() => void run(row._id, () => acceptSuggestion({ suggestionId: row._id }), tKinds("errors.decideFailed"))}
                  >
                    {tKinds("track")}
                  </Button>
                  <RowIconButton
                    label={tKinds("dismiss")}
                    onClick={() => void run(row._id, () => dismissSuggestion({ suggestionId: row._id }), tKinds("errors.decideFailed"))}
                  >
                    <X className="h-4 w-4" />
                  </RowIconButton>
                </RowActions>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
