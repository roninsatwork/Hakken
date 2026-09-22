"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from "lucide-react";

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
import useDebounce from "@/src/hooks/useDebounce";
import { SEARCH_TONE, formatMonthly } from "../siteView";

/**
 * The searches on this site's record, each judged and priced.
 *
 * The rows arrive judged, sorted by what needs attention and cut to a page —
 * all on the server, from summaries kept as results are filed — so a list of
 * two hundred searches costs the browser fifteen rows. The thresholds behind
 * each verdict are printed under the table, because a verdict is an opinion
 * with money attached and somebody will want to argue with the line.
 *
 * Adding a search here adds it to the website's own list, shared with every
 * client watching the site: one list, checked once per place.
 */
export function TrackedSearches({
  websiteId,
  companyWebsiteId,
  host,
  place,
}: {
  websiteId: Id<"websites">;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
  place: string;
}) {
  const t = useTranslations("admin.siteView.searches");
  const tView = useTranslations("admin.siteView");
  const tIntent = useTranslations("admin.websiteDetail.keywords");

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addKeyword = useMutation(api.websiteCanonical.addWebsiteKeyword);
  const setActive = useMutation(api.websiteCanonical.setWebsiteKeywordActive);
  const removeKeyword = useMutation(api.websiteCanonical.removeWebsiteKeyword);
  const action = useAdminAction({ scope: "admin-site-searches" });

  const rows = useQuery(api.websiteClientView.listTrackedSearches, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = rows === undefined;
  const unknown = tView("priceUnknownShort");

  const run = async (key: string, work: () => Promise<unknown>, fallback: string) => {
    setError("");
    const outcome = await action.run(work, { key, suppressErrorToast: true, fallbackMessage: fallback });
    if (!outcome.ok) setError(outcome.message);
    return outcome.ok;
  };

  const handleAdd = async () => {
    if (await run("add", () => addKeyword({ websiteId, keyword: draft }), t("errors.addFailed"))) setDraft("");
  };

  const intentLabel = (intent: string | null) =>
    intent && ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER"].includes(intent)
      ? tIntent(`intents.${intent}`)
      : tIntent("unjudged");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<Search className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle", { host, place })}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="site-search"
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
        rows={isLoading ? undefined : rows.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Search className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: rows?.totalPages ?? 1,
          totalCount: rows?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "search",
            header: t("searchColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.keyword}</span>
                <span className="text-[11px] text-muted">
                  {row.weeksRunning === null
                    ? t("notCheckedYet")
                    : t("checkedFor", { weeks: row.weeksRunning })}
                </span>
              </div>
            ),
          },
          {
            key: "position",
            header: t("positionColumn"),
            cell: (row) => {
              if (row.lastCheckedDay === null) return <span className="text-[12px] text-muted">–</span>;
              if (row.lastPosition === null) {
                return <span className="text-[12px] text-muted">{t("notOnPage")}</span>;
              }
              const change = row.previousPosition === null ? 0 : row.previousPosition - row.lastPosition;
              return (
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-foreground">
                  {row.lastPosition}
                  {change > 0 ? (
                    <span className="flex items-center text-[11px] text-success">
                      <ArrowUp className="h-3 w-3" aria-label={t("up")} />{change}
                    </span>
                  ) : change < 0 ? (
                    <span className="flex items-center text-[11px] text-destructive">
                      <ArrowDown className="h-3 w-3" aria-label={t("down")} />{-change}
                    </span>
                  ) : null}
                </span>
              );
            },
          },
          {
            key: "intent",
            header: t("intentColumn"),
            cell: (row) => (
              <span className={`text-[12px] ${row.intent ? "text-secondary" : "text-muted"}`}>
                {intentLabel(row.intent)}
              </span>
            ),
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => (
              row.isActive
                ? <StatusPill tone={SEARCH_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>
                : <StatusPill tone="neutral">{t("paused")}</StatusPill>
            ),
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
                  disabled={action.isBusy(row._id)}
                  onClick={() => void run(row._id, () => setActive({ keywordId: row._id, isActive: !row.isActive }), t("errors.toggleFailed"))}
                >
                  {row.isActive ? t("pause") : t("resume")}
                </Button>
                <RowIconButton
                  label={t("remove")}
                  tone="danger"
                  onClick={() => void run(row._id, () => removeKeyword({ keywordId: row._id }), t("errors.removeFailed"))}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <p className="text-[11px] leading-relaxed text-muted">
        {t("thresholds", {
          slipping: VERDICT_THRESHOLDS.slippingPlaces,
          neverWeeks: VERDICT_THRESHOLDS.neverRankedDays / 7,
          newWeeks: VERDICT_THRESHOLDS.tooNewDays / 7,
        })}
      </p>
    </div>
  );
}
