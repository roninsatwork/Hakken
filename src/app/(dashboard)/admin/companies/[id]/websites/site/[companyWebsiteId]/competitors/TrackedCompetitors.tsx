"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Swords, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { RIVAL_TONE, siteBase } from "../siteView";

/** Discovery kinds a person can read; anything else shows as not judged. */
const KINDS = ["COMPETITOR", "DIRECTORY", "PUBLISHER", "SUPPLIER", "OTHER"] as const;

type Suggestion = {
  key: string;
  host: string;
  reason: string;
  /** Only a ranking suggestion can be dismissed; an AI mention refills itself. */
  suggestionId: Id<"discoveredCompetitors"> | null;
};

/**
 * The competitors this company compares one of its sites with — its own
 * choice, not the website's — and the ones worth adding.
 *
 * Two lists and no more. The first is who is watched, each with how it is
 * doing against this site. The second is every suggestion in one place, each
 * saying in words why it is suggested: the AI answers keep naming it, or it
 * ranks for the same searches. They were two separate tables before, which
 * asked the reader to know where a suggestion came from before they could
 * decide on it.
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
  const tKinds = useTranslations("admin.companyWebsiteDetail.discovered");

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const view = useQuery(api.websiteClientView.listTrackedCompetitors, { companyWebsiteId });
  const discovered = useQuery(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
    companyWebsiteId,
    page: 1,
    pageSize: TABLE_PAGE_SIZE,
  });
  const addRival = useMutation(api.websiteAttachments.addTrackedCompetitor);
  const stopTracking = useMutation(api.websites.removeCompanyWebsite);
  const acceptSuggestion = useMutation(api.seoDiscoveredCompetitors.acceptDiscoveredCompetitor);
  const dismissSuggestion = useMutation(api.seoDiscoveredCompetitors.dismissDiscoveredCompetitor);
  const action = useAdminAction({ scope: "admin-site-competitors" });

  const run = async (key: string, work: () => Promise<unknown>, fallback: string) => {
    setError("");
    const outcome = await action.run(work, { key, suppressErrorToast: true, fallbackMessage: fallback });
    if (!outcome.ok) setError(outcome.message);
    return outcome.ok;
  };

  const handleAdd = async () => {
    if (await run("add", () => addRival({ companyWebsiteId, url: draft }), t("errors.addFailed"))) setDraft("");
  };

  const rivals = view?.rivals;

  // AI mentions first — the engines volunteered them — then ranking overlap,
  // closest first. One row per site, whichever way it was found.
  const suggestions: Suggestion[] | undefined = view && discovered
    ? (() => {
      const seen = new Set<string>();
      const rows: Suggestion[] = [];
      for (const named of view.untrackedNamed) {
        seen.add(named.displayHost);
        rows.push({ key: named.websiteId, host: named.displayHost, reason: t("reasonNamed", { times: named.times }), suggestionId: null });
      }
      for (const found of discovered.data) {
        if (seen.has(found.host)) continue;
        const kind = found.kind && (KINDS as readonly string[]).includes(found.kind) ? tKinds(`kinds.${found.kind}`) : null;
        const overlap = t("reasonRanks", { count: found.intersections });
        rows.push({ key: found._id, host: found.host, reason: kind ? `${overlap} · ${kind}` : overlap, suggestionId: found._id });
      }
      return rows.slice(0, TABLE_PAGE_SIZE);
    })()
    : undefined;

  const staticFooter = (count: number | undefined, empty: string) => ({
    mode: "paged" as const,
    page: 1,
    totalPages: 1,
    totalCount: count ?? 0,
    pageSize: Math.max(count ?? 0, 1),
    isLoading: count === undefined,
    onPageChange: () => undefined,
    labels: { empty },
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<Swords className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle", { host })}
      />

      <div className="flex flex-col gap-2 rounded-[12px] border border-border-dim bg-card/40 p-4">
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
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={rivals}
        rowKey={(row) => row.companyWebsiteId}
        minWidthClassName="min-w-[720px]"
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={staticFooter(rivals?.length, t("empty"))}
        columns={[
          {
            key: "rival",
            header: t("rivalColumn"),
            cell: (row) => (
              <Link href={siteBase(companyId, row.companyWebsiteId)} className="text-[13px] text-foreground hover:text-brand">
                {row.displayHost}
              </Link>
            ),
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => <StatusPill tone={RIVAL_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>,
          },
          {
            key: "beats",
            header: t("beatsColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.comparedOn === 0 ? t("notYet") : t("beatsOf", { beats: row.beatsYouOn, of: row.comparedOn })}
              </span>
            ),
          },
          {
            key: "answers",
            header: t("answersColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.answersCounted === 0 ? t("notYet") : t("namedOf", { named: row.namedInAnswers, of: row.answersCounted })}
              </span>
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

      <div className="flex flex-col gap-3 pt-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-semibold text-foreground">{t("suggestedTitle")}</h2>
          <p className="max-w-2xl text-[13px] text-secondary">{t("suggestedSubtitle")}</p>
        </div>
        <DataTable
          rows={suggestions}
          rowKey={(row) => row.key}
          minWidthClassName="min-w-[640px]"
          empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("suggestedEmpty") }}
          footer={staticFooter(suggestions?.length, t("suggestedEmpty"))}
          columns={[
            {
              key: "site",
              header: t("siteColumn"),
              cell: (row) => <span className="text-[13px] text-foreground">{row.host}</span>,
            },
            {
              key: "reason",
              header: t("reasonColumn"),
              cell: (row) => <span className="text-[12px] text-secondary">{row.reason}</span>,
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
                    disabled={action.isBusy(row.key)}
                    onClick={() => void run(
                      row.key,
                      () => row.suggestionId
                        ? acceptSuggestion({ suggestionId: row.suggestionId })
                        : addRival({ companyWebsiteId, url: row.host }),
                      t("errors.addFailed"),
                    )}
                  >
                    {t("track")}
                  </Button>
                  {row.suggestionId ? (
                    <RowIconButton
                      label={t("dismiss")}
                      onClick={() => void run(row.key, () => dismissSuggestion({ suggestionId: row.suggestionId! }), t("errors.addFailed"))}
                    >
                      <X className="h-4 w-4" />
                    </RowIconButton>
                  ) : null}
                </RowActions>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
