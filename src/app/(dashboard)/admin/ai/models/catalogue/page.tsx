"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, List, RefreshCw, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPaginationFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import useDebounce from "@/src/hooks/useDebounce";
import { isModelCostMeasurable } from "@/convex/agentRuntimeService";
import { cn } from "@/src/ui/lib/utils";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import {
  buildDefaultJobsByModelId,
  formatModelTag,
  getProviderDisplayName,
  type ModelStatusFilter,
} from "../_components/modelAdminUtils";

export default function AIModelCataloguePage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>("active");
  const [providerFilter, setProviderFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [modelError, setModelError] = useState("");
  const pageSize = ADMIN_PAGE_SIZE;

  /**
   * A page at a time, out of what the database has actually returned.
   *
   * The query used to read up to 500 models and slice the page here. It now
   * pages in the database, so this holds only what has been fetched — and the
   * numbered pager pulls the next page in when the reader steps past the end.
   */
  const {
    results: fetchedModels,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.aiModels.getPaginatedModels,
    { searchTerm: debouncedSearch, statusFilter, providerFilter },
    { initialNumItems: pageSize }
  );
  // The pager wants a total, and a total means counting the catalogue on every
  // view — which is what the rollup exists to avoid. While a search or provider
  // filter is on, no rollup can know the answer, so the pager stops claiming one.
  const counts = useQuery(api.aiModels.getModelCounts);
  const providersResult = useQuery(api.aiModels.getProviders);
  const providers = Array.isArray(providersResult) ? providersResult : [];
  // What each model is actually doing, rather than which one carries the legacy
  // flag. Ten rows, unaffected by the page or the filters.
  const globalDefaultsResult = useQuery(api.aiModels.getGlobalModelDefaults);
  const defaultJobsByModelId = buildDefaultJobsByModelId(globalDefaultsResult);
  const isLoading = paginationStatus === "LoadingFirstPage";
  const pageStart = (page - 1) * pageSize;
  const models = fetchedModels.slice(pageStart, pageStart + pageSize);
  const isFiltered = Boolean(debouncedSearch.trim()) || providerFilter !== "all";
  const knownTotal = !isFiltered && counts?.computedAt && !counts.isPartial
    ? (statusFilter === "active" ? counts.enabledModels : counts.totalModels - counts.enabledModels)
    : fetchedModels.length;
  const totalCount = knownTotal;
  const totalPages = Math.max(1, Math.ceil(knownTotal / pageSize));

  // Stepping past what has been fetched pulls the next page in first.
  const goToPage = (next: number) => {
    setPage(next);
    if (fetchedModels.length < next * pageSize && paginationStatus === "CanLoadMore") {
      loadMore(pageSize);
    }
  };
  const providerNameByKey = new Map(providers.map((provider) => [provider.providerKey, provider.displayName]));

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: ModelStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleProviderFilterChange = (value: string) => {
    setProviderFilter(value);
    setPage(1);
  };

  const toggleStatus = async (modelId: Id<"aiModels">, currentState: boolean) => {
    setModelError("");
    try {
      await toggleModelEnforcement({ modelId, isEnabled: !currentState });
    } catch (error) {
      console.error(error);
      setModelError("Failed to update model status.");
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full h-full pb-12">
      <AdminPageHeader
        divider
        icon={<List className="w-6 h-6 text-brand" />}
        title="Model Catalogue"
        description="Which models this platform has, and which of them are switched on."
      />
      <AiWorkspaceNav />
      <AdminSaveError>{modelError}</AdminSaveError>

      {/* Search and both filters on one line. The original crammed three
          dropdowns and a toggle in beside the search box, squeezing its
          placeholder down to "Sea" — with two controls instead of four there is
          room for the search to grow and still read as a search box. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search models by name"
            className="w-full h-10 pl-9 pr-3 rounded-[8px] border border-border-dim bg-card text-[13px] text-foreground outline-none focus:border-brand/50"
          />
        </div>

        <select
          aria-label="Provider filter"
          value={providerFilter}
          onChange={(event) => handleProviderFilterChange(event.target.value)}
          className="h-10 shrink-0 rounded-[8px] border border-border-dim bg-card px-3 text-[13px] text-foreground outline-none focus:border-brand/50 sm:w-[200px]"
        >
          <option value="all">All providers</option>
          {providers.map((provider) => (
            <option key={provider._id} value={provider.providerKey}>{provider.displayName}</option>
          ))}
        </select>

        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-[8px] border border-border-dim bg-card p-1 sm:w-[220px]">
          {[
            { value: "active" as const, label: "Active" },
            { value: "inactive" as const, label: "Inactive" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleStatusFilterChange(option.value)}
              className={cn(
                "h-8 rounded-[6px] px-3 text-[12px] font-medium transition-colors",
                statusFilter === option.value
                  ? "bg-foreground/10 text-foreground shadow-sm"
                  : "text-muted hover:bg-foreground/5 hover:text-secondary"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            isLoading={paginationStatus === "LoadingMore"}
            onPageChange={goToPage}
            labels={{
              empty: "No models found",
              showing: (start, end, total) =>
                isFiltered
                  ? `Showing ${start}-${end} of ${total} matching`
                  : `Showing ${start}-${end} of ${total} models`,
            }}
          />
        }
      >
        <thead>
          {/* A model is a name, who supplies it, whether it is doing any job,
              and whether it is on. Capabilities and use cases were five to eight
              chips a row of provider metadata nobody could act on from here. */}
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium w-[38%]">Model name</th>
            <th className="px-4 py-3 font-medium w-[20%]">Provider</th>
            <th className="px-4 py-3 font-medium w-[14%]">Pricing</th>
            <th className="px-4 py-3 font-medium w-[14%]">Default</th>
            <th className="px-4 py-3 font-medium w-[14%]">Active</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : models.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<Bot className="w-8 h-8 text-muted/30" />}
              label={t("empty.title")}
              action={
                <Link
                  href="/admin/ai/models/providers"
                  className="mt-2 h-9 px-5 rounded-full bg-foreground text-background font-medium text-[13px] inline-flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Open providers
                </Link>
              }
            />
          ) : (
            models.map((model) => {
              const defaultJobs = defaultJobsByModelId.get(model.modelId) ?? [];
              return (
                <tr
                  key={model._id}
                  onClick={() => router.push(`/admin/ai/models/${model._id}`)}
                  className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
                >
                  {/* The name, and the id underneath so a developer can still
                      match it to the provider's docs. Price belongs on the
                      model's own page, where it is set. */}
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {model.friendlyName || model.displayName}
                    </div>
                    <div className="text-[11px] font-mono text-muted truncate mt-0.5">
                      {model.providerModelId || model.modelId}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-secondary">
                    {getProviderDisplayName(model.providerKey, providerNameByKey)}
                  </td>
                  {/* One word. Missing is worth colouring because it has a
                      consequence: without a price the runtime cannot measure
                      spend, so agents on this model are held to a smaller
                      budget. The model's own page says so and is one click
                      away. */}
                  <td className="px-4 py-3">
                    {isModelCostMeasurable(model) ? (
                      <span className="text-[12px] text-secondary">Added</span>
                    ) : (
                      <span className="text-[12px] text-[#f59e0b]">Missing</span>
                    )}
                  </td>
                  {/* Yes or no, and nothing else. Naming the ten jobs here made
                      one row three times taller than the rest and put back the
                      wall of text this pass exists to remove — they are on hover
                      instead, and in full on the Defaults screen.

                      The answer comes from the jobs a model is really handling,
                      not the `isDefault` flag, which is only the fourth thing
                      the runtime tries and can sit on a model doing nothing. */}
                  <td className="px-4 py-3">
                    {defaultJobs.length > 0 ? (
                      <span
                        title={`Handles ${defaultJobs.map(formatModelTag).join(", ")}`}
                        className="inline-flex rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand"
                      >
                        Yes
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted">No</span>
                    )}
                  </td>
                  {/* The column is the control. An Active column beside a
                      separate Deactivate button would print the same fact
                      twice, which is the duplication the ONLINE badge was
                      removed for. */}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={model.isEnabled}
                      aria-label={`${model.isEnabled ? "Deactivate" : "Activate"} ${model.friendlyName || model.displayName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleStatus(model._id, model.isEnabled);
                      }}
                      className="flex items-center gap-2 group/switch"
                    >
                      <span
                        className={cn(
                          "relative h-5 w-9 rounded-full transition-colors",
                          model.isEnabled ? "bg-brand" : "bg-foreground/15"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                            model.isEnabled ? "left-[18px]" : "left-0.5"
                          )}
                        />
                      </span>
                      <span className="text-[12px] text-secondary group-hover/switch:text-foreground transition-colors">
                        {model.isEnabled ? "Active" : "Inactive"}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
