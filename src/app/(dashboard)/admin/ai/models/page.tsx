"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, RefreshCw, Loader2, Star, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

export default function AIModelsPage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const syncVertexModels = useAction(api.aiModelsActions.syncVertexModels);
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [syncError, setSyncError] = useState("");
  const pageSize = 15;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const modelsData = useQuery(api.aiModels.getOffsetPaginatedModels, {
    searchTerm: debouncedSearch,
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
      setSyncError("Failed to sync models: " + (err instanceof Error ? err.message : String(err)));
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
      {syncError && (
        <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
          {syncError}
        </div>
      )}

      {/* Control Bar */}
      <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
        <div className="flex items-center gap-2 px-3 flex-1">
          <Search className="w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search model names or IDs..."
            className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
          />
        </div>
      </div>

      {/* Listing Area */}
      <div className="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
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
                  <tr>
                    <td colSpan={4} className="px-5 py-16 text-center text-secondary">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand opacity-80" />
                    </td>
                  </tr>
                ) : models.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-16 text-center">
                       <div className="flex flex-col items-center justify-center gap-4 w-full">
                         <Bot className="w-8 h-8 text-muted/30" />
                         <span className="text-muted text-[13px] font-medium tracking-widest uppercase">{t("empty.title")}</span>
                         <button
                           onClick={fetchModels}
                           disabled={isSyncing}
                           className="mt-2 h-9 px-5 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                         >
                           {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                           {isSyncing ? t("empty.button.syncing") : t("empty.button.idle")}
                         </button>
                       </div>
                    </td>
                  </tr>
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
          </table>
        </div>

        {/* Numbered Pagination Footer */}
        <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
          <div className="text-[12px] font-medium text-secondary">
            {totalCount > 0 ? (
              <span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}</span>
            ) : (
              <span>No entries found</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
              Page {page} of {totalPages}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
