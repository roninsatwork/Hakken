"use client";

import { useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, FileText, Loader2 } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { useNow } from "@/src/hooks/useNow";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";

const AgentLogsResults = dynamic(
  () => import("./AgentLogsResults").then((module) => module.AgentLogsResults),
  { loading: LogsLoading }
);

const FILTERS = [
  { key: "ALL", labelKey: "filters.everything" },
  { key: "THINKING", labelKey: "filters.thinking" },
  { key: "TOOLS", labelKey: "filters.tools" },
  { key: "PROBLEMS", labelKey: "filters.problems" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function LogsLoading() {
  return (
    <div className="py-20 flex items-center justify-center text-muted">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export default function AgentLogsDashboard() {
  const t = useTranslations("admin.agents.details.logs.raw");
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;
  const now = useNow();

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [page, setPage] = useState(1);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Set when a reader follows "see the others" from one repeated failure.
  const [failureKey, setFailureKey] = useState<string | null>(null);

  const data = useQuery(api.agentLogs.getJobGroups, {
    agentId,
    searchTerm: debouncedSearch,
    filter,
    ...(failureKey ? { failureKey } : {}),
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
    setOpenEntryId(null);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand" />
            {t("title")}
          </h2>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            {t("description")}
          </p>
        </div>

        <div className="flex gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
          {FILTERS.map((option) => (
            /* Raw: segmented filter — the active option swaps its colours; no kit variant is stateful. */
            <button
              key={option.key}
              type="button"
              onClick={() => reset(() => setFilter(option.key))}
              className={`px-3 py-1.5 rounded-[7px] text-[12px] transition-all ${
                filter === option.key
                  ? "bg-card text-foreground border border-border-dim"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <TableSearchInput
          value={searchTerm}
          onChange={(next) => reset(() => setSearchTerm(next))}
          placeholder={t("searchPlaceholder")}
          clearLabel={t("clearSearch")}
        />
      </div>

      {failureKey && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
          <span className="text-[12.5px] text-secondary">
            {t("failureFocus")}
          </span>
          {/* Raw: an inline text link, not a button shape — no kit variant is a bare link. */}
          <button
            type="button"
            onClick={() => reset(() => setFailureKey(null))}
            className="text-[12px] text-brand hover:underline shrink-0"
          >
            {t("showEverything")}
          </button>
        </div>
      )}

      {data === undefined ? (
        <LogsLoading />
      ) : (
        <AgentLogsResults
          data={data}
          hasSearch={Boolean(debouncedSearch)}
          filter={filter}
          page={page}
          now={now}
          openEntryId={openEntryId}
          onToggleEntry={(entryId) => setOpenEntryId(openEntryId === entryId ? null : entryId)}
          onOpenJob={(runId) => router.push(`/admin/agents/${agentId}/observability/${runId}`)}
          onFocusFailure={failureKey ? undefined : (key) => reset(() => setFailureKey(key))}
          onPageChange={setPage}
          renderOpenJob={({ onClick, children }) => (
            /* Raw: an inline text link, not a button shape — no kit variant is a bare link. */
            <button
              type="button"
              onClick={onClick}
              className="text-[11.5px] text-brand hover:underline whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              {children}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          renderEntryToggle={({ isOpen, onClick, children }) => (
            /* Raw: a whole list row is the hit target — a layout, not a button recipe. */
            <button
              type="button"
              onClick={onClick}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-left min-w-0 transition-colors ${
                isOpen ? "bg-rose-500/[0.04]" : "hover:bg-white/[0.02]"
              }`}
            >
              {children}
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
          renderSeeOthers={({ onClick, children }) => (
            /* Raw: an inline text link, not a button shape — no kit variant is a bare link. */
            <button
              type="button"
              onClick={onClick}
              className="text-brand hover:underline"
            >
              {children}
            </button>
          )}
        />
      )}
    </div>
  );
}
