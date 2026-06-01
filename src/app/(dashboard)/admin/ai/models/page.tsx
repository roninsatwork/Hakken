"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, RefreshCw, Loader2, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPaginationFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { getErrorMessage } from "@/src/lib/errors";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";

type ModelStatusFilter = "active" | "inactive";

export default function AIModelsPage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const syncVertexModels = useAction(api.aiModelsActions.syncVertexModels);
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [syncError, setSyncError] = useState("");
  const pageSize = ADMIN_PAGE_SIZE;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const modelsData = useQuery(api.aiModels.getOffsetPaginatedModels, {
    searchTerm: debouncedSearch,
    statusFilter,
    page,
    pageSize
  });

  const isLoading = modelsData === undefined;
  const models = modelsData?.data || [];
  const totalCount = modelsData?.totalCount || 0;
  const totalPages = modelsData?.totalPages || 1;

  const fetchModels = async () => {
    setIsSyncing(true);
    setSyncError("");
    try {
      await syncVertexModels();
    } catch (err) {
      console.error(err);
      setSyncError(`Failed to sync models: ${getErrorMessage(err, String(err))}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleStatus = async (modelId: Id<"aiModels">, currentState: boolean) => {
    await toggleModelEnforcement({ modelId, isEnabled: !currentState });
  };

  const makeDefault = async (modelId: Id<"aiModels">) => {
    await setDefaultModel({ modelId });
  };

  const handleStatusFilterChange = (value: ModelStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-dim pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Bot className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={fetchModels}
          disabled={isSyncing}
          className="h-9 px-4 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
        >
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {isSyncing ? t("syncButton.syncing") : t("syncButton.idle")}
        </button>
      </div>
      <AdminSaveError>{syncError}</AdminSaveError>

      <div className="w-full flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/40 p-2 shadow-sm backdrop-blur-xl md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <Search className="w-4 h-4 flex-shrink-0 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search model names or IDs..."
            className="h-9 w-full bg-transparent text-[13px] tracking-wide text-foreground outline-none placeholder:text-muted/60"
          />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-[12px] border border-border-dim bg-background/40 p-1 md:w-[300px]">
          {[
            { value: "active" as const, label: "Active" },
            { value: "inactive" as const, label: "Inactive" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleStatusFilterChange(option.value)}
              className={cn(
                "h-8 rounded-[8px] px-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors",
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

      {/* Listing Area */}
      <AdminTableShell
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            isLoading={isLoading}
            onPageChange={setPage}
          />
        }
      >
            <thead>
              <tr className="border-b border-border-dim/50 bg-sidebar/40">
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[300px]">Model Name</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase">Model ID</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[150px] text-right">Status</th>
                <th className="w-[180px] px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <AdminTableLoadingRow colSpan={4} />
                ) : models.length === 0 ? (
                  <AdminTableEmptyRow
                    colSpan={4}
                    icon={<Bot className="w-8 h-8 text-muted/30" />}
                    label={t("empty.title")}
                    action={
                      <button
                        onClick={fetchModels}
                        disabled={isSyncing}
                        className="mt-2 h-9 px-5 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                      >
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {isSyncing ? t("empty.button.syncing") : t("empty.button.idle")}
                      </button>
                    }
                  />
                ) : (
                  models.map((model) => (
                    <tr 
                      key={model._id} 
                      onClick={() => router.push(`/admin/ai/models/${model._id}`)}
                      className="group hover:bg-white/[0.02] transition-colors items-center cursor-pointer"
                    >
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 shadow-sm",
                            model.isDefault ? "bg-brand text-white" : model.isEnabled ? "bg-foreground/10 text-foreground" : "bg-foreground/5 text-muted"
                          )}>
                             <Bot className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <h3 className="text-[13px] font-bold text-foreground group-hover:text-brand transition-colors flex items-center gap-2">
                              {model.displayName}
                              {model.isDefault && (
                                <Star className="w-3 h-3 fill-brand text-brand" />
                              )}
                            </h3>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <p className={`text-[12.5px] font-mono tracking-wide opacity-50`}>
                          {model.modelId}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-middle text-right border-r border-white/5">
                        <span className={cn(
                          "font-bold px-2 py-0.5 rounded-[4px] uppercase tracking-[0.1em] text-[10px] border inline-block",
                          model.isEnabled ? "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20" : "text-muted bg-foreground/5 border-border-dim"
                        )}>
                          {model.isEnabled ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-3 text-secondary">
                          {model.isEnabled && !model.isDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                makeDefault(model._id);
                              }}
                              className="px-3 py-1.5 border border-border-dim rounded-[6px] text-[11px] font-bold tracking-wider uppercase text-secondary hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-all opacity-0 group-hover:opacity-100"
                            >
                              Make Default
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(model._id, model.isEnabled);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-[6px] text-[11px] font-bold tracking-wider uppercase transition-all",
                              model.isEnabled
                                ? "bg-foreground/5 text-foreground hover:bg-red-500/10 hover:text-red-500"
                                : "bg-brand/10 text-brand border border-brand/20 hover:bg-brand hover:text-white"
                            )}
                          >
                            {model.isEnabled ? "Deactivate" : "Initialize"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
            </tbody>
      </AdminTableShell>
    </div>
  );
}
