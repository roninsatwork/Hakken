"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, List, RefreshCw, Search, Star } from "lucide-react";
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
import useDebounce from "@/src/hooks/useDebounce";
import { cn } from "@/src/ui/lib/utils";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import {
  formatModelTag,
  getProviderDisplayName,
  MODEL_CAPABILITY_OPTIONS,
  MODEL_USE_CASE_OPTIONS,
  ModelAdminHeader,
  ModelTagList,
  type ModelStatusFilter,
} from "../_components/modelAdminUtils";

export default function AIModelCataloguePage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>("active");
  const [providerFilter, setProviderFilter] = useState("all");
  const [capabilityFilter, setCapabilityFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [modelError, setModelError] = useState("");
  const pageSize = ADMIN_PAGE_SIZE;

  const modelsData = useQuery(api.aiModels.getOffsetPaginatedModels, {
    searchTerm: debouncedSearch,
    statusFilter,
    providerFilter,
    capabilityFilter,
    useCaseFilter,
    page,
    pageSize,
  });
  const providersResult = useQuery(api.aiModels.getProviders);
  const providers = Array.isArray(providersResult) ? providersResult : [];
  const isLoading = modelsData === undefined;
  const models = modelsData?.data || [];
  const totalCount = modelsData?.totalCount || 0;
  const totalPages = modelsData?.totalPages || 1;
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

  const handleCapabilityFilterChange = (value: string) => {
    setCapabilityFilter(value);
    setPage(1);
  };

  const handleUseCaseFilterChange = (value: string) => {
    setUseCaseFilter(value);
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

  const makeDefault = async (modelId: Id<"aiModels">) => {
    setModelError("");
    try {
      await setDefaultModel({ modelId });
    } catch (error) {
      console.error(error);
      setModelError("Failed to update default model.");
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <ModelAdminHeader
        icon={<List className="w-6 h-6 text-brand" />}
        title="Model Catalogue"
        subtitle="Manage synced model availability, capabilities, and catalogue metadata."
      />
      <AiWorkspaceNav />
      <AdminSaveError>{modelError}</AdminSaveError>

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

        <select
          aria-label="Provider filter"
          value={providerFilter}
          onChange={(event) => handleProviderFilterChange(event.target.value)}
          className="h-10 rounded-[12px] border border-border-dim bg-background/40 px-3 text-[12px] font-medium text-foreground outline-none md:w-[220px]"
        >
          <option value="all">All Providers</option>
          {providers.map((provider) => (
            <option key={provider._id} value={provider.providerKey}>{provider.displayName}</option>
          ))}
        </select>

        <select
          aria-label="Capability filter"
          value={capabilityFilter}
          onChange={(event) => handleCapabilityFilterChange(event.target.value)}
          className="h-10 rounded-[12px] border border-border-dim bg-background/40 px-3 text-[12px] font-medium text-foreground outline-none md:w-[180px]"
        >
          <option value="all">All Capabilities</option>
          {MODEL_CAPABILITY_OPTIONS.map((capability) => (
            <option key={capability} value={capability}>{formatModelTag(capability)}</option>
          ))}
        </select>

        <select
          aria-label="Use case filter"
          value={useCaseFilter}
          onChange={(event) => handleUseCaseFilterChange(event.target.value)}
          className="h-10 rounded-[12px] border border-border-dim bg-background/40 px-3 text-[12px] font-medium text-foreground outline-none md:w-[180px]"
        >
          <option value="all">All Use Cases</option>
          {MODEL_USE_CASE_OPTIONS.map((useCase) => (
            <option key={useCase} value={useCase}>{formatModelTag(useCase)}</option>
          ))}
        </select>

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
            <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[190px]">Provider</th>
            <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase">Model ID</th>
            <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[230px]">Capabilities</th>
            <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[230px]">Use Cases</th>
            <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[150px] text-right">Status</th>
            <th className="w-[180px] px-5 py-3.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {isLoading ? (
            <AdminTableLoadingRow colSpan={7} />
          ) : models.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={7}
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
                  <span className="inline-flex rounded-full border border-border-dim bg-foreground/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-secondary">
                    {getProviderDisplayName(model.providerKey, providerNameByKey)}
                  </span>
                </td>
                <td className="px-5 py-4 align-middle">
                  <p className="text-[12.5px] font-mono tracking-wide opacity-50">
                    {model.providerModelId || model.modelId}
                  </p>
                </td>
                <td className="px-5 py-4 align-middle">
                  <ModelTagList values={model.capabilities} emptyLabel="Unclassified" />
                </td>
                <td className="px-5 py-4 align-middle">
                  <ModelTagList values={model.supportedUseCases} emptyLabel="Inherited" />
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
                        onClick={(event) => {
                          event.stopPropagation();
                          makeDefault(model._id);
                        }}
                        className="px-3 py-1.5 border border-border-dim rounded-[6px] text-[11px] font-bold tracking-wider uppercase text-secondary hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-all opacity-0 group-hover:opacity-100"
                      >
                        Make Default
                      </button>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
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
