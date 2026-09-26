"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { ResultsSwitcher } from "../ResultsSwitcher";
import { RemoveSearchDialog, type SearchToRemove } from "../RemoveSearchDialog";

/**
 * What the AI engines search for when asked this website's questions.
 *
 * An engine does not answer the question it is given. It expands it into
 * related searches and writes from what those return, so the fan-out is the
 * surface a site has to be visible on rather than the one question we asked.
 * The engines have been sending it in every answer we buy since the citations
 * pipeline shipped; it was being discarded with the rest of the payload.
 *
 * Most persistent first, because a search an engine keeps returning to is the
 * one worth having a page for. The intent beside it is the same judgment and
 * the same store the rankings screen uses, so a phrase met on both screens is
 * judged once and paid for once.
 */
export default function WebsiteFanOutPage() {
  const t = useTranslations("admin.websiteFanOut");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const [buyingUntracked, setBuyingUntracked] = useState(false);
  const [error, setError] = useState("");
  const [untracking, setUntracking] = useState<SearchToRemove | null>(null);
  const queries = useQuery(api.seoFanOutReports.listWebsiteFanOutQueries, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    buyingUntracked,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const addKeyword = useMutation(api.websiteCanonical.addWebsiteKeyword);
  const engineLabel = useEngineLabel();
  const action = useAdminAction({ scope: "admin-site-fan-out" });

  const track = async (keyword: string) => {
    setError("");
    const outcome = await action.run(
      // Onto this company's own list (docs/plans/active/private-tracking-lists-plan.md).
      () => addKeyword({ companyWebsiteId, keyword }),
      { key: keyword, suppressErrorToast: true, fallbackMessage: t("errors.trackFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const intentLabel = (intent: string) => {
    if (intent === "BUYING") return t("intents.BUYING");
    if (intent === "RESEARCHING") return t("intents.RESEARCHING");
    if (intent === "BRANDED") return t("intents.BRANDED");
    if (intent === "IRRELEVANT") return t("intents.IRRELEVANT");
    return t("intents.OTHER");
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <ResultsSwitcher active="fanOut" />
      <PageHeader
        icon={<Sparkles className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <Button
            variant={buyingUntracked ? "accent" : "quiet"}
            aria-pressed={buyingUntracked}
            onClick={() => {
              setBuyingUntracked((current) => !current);
              setPage(1);
            }}
          >
            {t("buyingUntracked", { count: queries?.buyingUntrackedCount ?? 0 })}
          </Button>
        }
      />
      <SaveError>{error}</SaveError>

      <DataTable
        rows={queries === undefined ? undefined : queries.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[920px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Sparkles className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: queries?.totalPages ?? 1,
          totalCount: queries?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: queries === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "query",
            header: t("queryColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.queryText}</span>
                {/* The question that produced it, so the row is readable on its own. */}
                <span className="text-[11px] text-muted">{row.prompt}</span>
              </div>
            ),
          },
          {
            key: "intent",
            header: t("intentColumn"),
            cell: (row) => (
              row.intent === null ? (
                <span className="text-[12px] text-muted">{t("unjudged")}</span>
              ) : (
                <StatusPill tone={row.intent === "BUYING" ? "success" : "neutral"}>
                  {intentLabel(row.intent)}
                </StatusPill>
              )
            ),
          },
          {
            key: "engines",
            header: t("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span>
            ),
          },
          {
            key: "times",
            header: t("timesColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[13px] text-foreground">{row.timesSeen}</span>
            ),
          },
          {
            // When it was last checked, in its own column on every results
            // table, so no number is read without its age (Anthony, 2026-09-23).
            key: "lastChecked",
            header: t("lastCheckedColumn"),
            cell: (row) => <span className="text-[12px] text-secondary">{row.lastSeenDay}</span>,
          },
          {
            /*
              "Track it" puts the search on this site's own list, so it is
              checked from next collection on; "Untrack" takes it off again,
              asked first because the list is shared by everyone watching the
              site. Always visible: hidden until hover, the column read as
              empty (Anthony, 2026-09-23).
            */
            key: "track",
            header: t("trackColumn"),
            align: "right",
            cell: (row) => (
              row.trackedKeywordId ? (
                <RowActions alwaysVisible>
                  <span className="text-[11px] text-muted">{t("alreadyTracked")}</span>
                  <Button
                    variant="quiet"
                    className="px-2 py-1 text-[11px]"
                    onClick={() => setUntracking({ keywordId: row.trackedKeywordId!, keyword: row.queryText })}
                  >
                    {t("untrack")}
                  </Button>
                </RowActions>
              ) : (
                <RowActions alwaysVisible>
                  <Button
                    variant="accent"
                    className="px-2 py-1 text-[11px]"
                    disabled={action.isBusy(row.queryText)}
                    onClick={() => void track(row.queryText)}
                  >
                    {t("track")}
                  </Button>
                </RowActions>
              )
            ),
          },
        ]}
      />
      <RemoveSearchDialog target={untracking} onClose={() => setUntracking(null)} />
    </div>
  );
}
