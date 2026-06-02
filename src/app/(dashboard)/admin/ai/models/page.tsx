"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, Cpu, List, RefreshCw, Loader2, Search, Star } from "lucide-react";
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
type SyncProviderKey = "google" | "openai" | "anthropic";
type ModelAdminTab = "models" | "defaults";
type GlobalDefaultRow = {
  useCase: string;
  default: {
    modelId: string;
    providerKey: string;
    model: {
      displayName: string;
      modelId: string;
      providerKey: string;
      isEnabled: boolean;
    } | null;
  } | null;
};

const MODEL_CAPABILITY_OPTIONS = [
  "text",
  "reasoning",
  "vision",
  "audio",
  "tool-calling",
  "json-mode",
  "streaming",
  "embeddings",
];

const MODEL_USE_CASE_OPTIONS = [
  "chat",
  "agent",
  "workflow",
  "report",
  "router",
  "title",
  "embedding",
  "transcription",
  "vision",
  "tool-calling",
];

function formatModelTag(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSyncProviderKey(value: string): value is SyncProviderKey {
  return value === "google" || value === "openai" || value === "anthropic";
}

function ModelTagList({ values, emptyLabel, limit = 3 }: {
  values?: string[];
  emptyLabel: string;
  limit?: number;
}) {
  if (!values || values.length === 0) {
    return <span className="text-[11px] font-medium text-muted">{emptyLabel}</span>;
  }

  const visible = values.slice(0, limit);
  const hiddenCount = values.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((value) => (
        <span
          key={value}
          className="inline-flex rounded-[6px] border border-border-dim bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-secondary"
        >
          {formatModelTag(value)}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

export default function AIModelsPage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const syncGoogleModels = useAction(api.aiModelsActions.syncGoogleModels);
  const syncOpenAIModels = useAction(api.aiModelsActions.syncOpenAIModels);
  const syncAnthropicModels = useAction(api.aiModelsActions.syncAnthropicModels);
  const testProviderConnection = useAction(api.aiModelsActions.testProviderConnection);
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);
  const setProviderEnabled = useMutation(api.aiModels.setProviderEnabled);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);
  const setGlobalModelDefault = useMutation(api.aiModels.setGlobalModelDefault);
  const clearGlobalModelDefault = useMutation(api.aiModels.clearGlobalModelDefault);

  const [syncingProvider, setSyncingProvider] = useState<SyncProviderKey | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>("active");
  const [providerFilter, setProviderFilter] = useState("all");
  const [capabilityFilter, setCapabilityFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<ModelAdminTab>("models");
  const [page, setPage] = useState(1);
  const [syncError, setSyncError] = useState("");
  const [savingDefaultUseCase, setSavingDefaultUseCase] = useState<string | null>(null);
  const pageSize = ADMIN_PAGE_SIZE;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const modelsData = useQuery(api.aiModels.getOffsetPaginatedModels, {
    searchTerm: debouncedSearch,
    statusFilter,
    providerFilter,
    capabilityFilter,
    useCaseFilter,
    page,
    pageSize
  });
  const providersResult = useQuery(api.aiModels.getProviders);
  const allModelsResult = useQuery(api.aiModels.getModels);
  const globalDefaultsResult = useQuery(api.aiModels.getGlobalModelDefaults);
  const providers = Array.isArray(providersResult) ? providersResult : [];
  const allModels = Array.isArray(allModelsResult) ? allModelsResult : [];
  const globalDefaults = (globalDefaultsResult && "defaults" in globalDefaultsResult
    ? globalDefaultsResult.defaults
    : []) as GlobalDefaultRow[];

  const isLoading = modelsData === undefined;
  const models = modelsData?.data || [];
  const totalCount = modelsData?.totalCount || 0;
  const totalPages = modelsData?.totalPages || 1;
  const providerNameByKey = new Map(providers.map((provider) => [provider.providerKey, provider.displayName]));
  const getProviderDisplayName = (providerKey?: string) => {
    if (!providerKey) return "Legacy";
    if (providerKey === "google") return providerNameByKey.get(providerKey) || "Google Vertex AI";
    return providerNameByKey.get(providerKey) || providerKey;
  };

  const getProviderHealthMessage = (settings?: string) => {
    if (!settings) return "";
    try {
      const parsed = JSON.parse(settings) as { lastHealthMessage?: unknown };
      return typeof parsed.lastHealthMessage === "string" ? parsed.lastHealthMessage : "";
    } catch {
      return "";
    }
  };

  const formatProviderDate = (value?: number) => {
    if (!value) return "Never";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const syncProvider = async (providerKey: SyncProviderKey) => {
    setSyncingProvider(providerKey);
    setSyncError("");
    try {
      if (providerKey === "google") {
        await syncGoogleModels();
      } else if (providerKey === "openai") {
        await syncOpenAIModels();
      } else {
        await syncAnthropicModels();
      }
    } catch (err) {
      console.error(err);
      setSyncError(`Failed to sync ${providerKey} models: ${getErrorMessage(err, String(err))}`);
    } finally {
      setSyncingProvider(null);
    }
  };

  const testProvider = async (providerKey: string) => {
    setTestingProvider(providerKey);
    setSyncError("");
    try {
      const result = await testProviderConnection({ providerKey });
      if (!result.ok) {
        setSyncError(`${getProviderDisplayName(providerKey)} connection failed: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setSyncError(`Failed to test ${providerKey} provider: ${getErrorMessage(err, String(err))}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleProvider = async (providerKey: string, isEnabled: boolean) => {
    setSyncError("");
    try {
      await setProviderEnabled({ providerKey, isEnabled: !isEnabled });
    } catch (err) {
      console.error(err);
      setSyncError(`Failed to update ${providerKey} provider: ${getErrorMessage(err, String(err))}`);
    }
  };

  const modelSupportsUseCase = (model: { supportedUseCases?: string[] }, useCase: string) => {
    return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
  };

  const setPlatformDefault = async (useCase: string, modelId: string) => {
    setSavingDefaultUseCase(useCase);
    setSyncError("");
    try {
      if (modelId) {
        await setGlobalModelDefault({ useCase, modelId });
      } else {
        await clearGlobalModelDefault({ useCase });
      }
    } catch (err) {
      console.error(err);
      setSyncError(`Failed to update ${useCase} default: ${getErrorMessage(err, String(err))}`);
    } finally {
      setSavingDefaultUseCase(null);
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
      </div>
      <AdminSaveError>{syncError}</AdminSaveError>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {providers.map((provider) => {
          const isTesting = testingProvider === provider.providerKey;
          const syncProviderKey: SyncProviderKey | null = isSyncProviderKey(provider.providerKey) ? provider.providerKey : null;
          const isSyncing = syncProviderKey !== null && syncingProvider === syncProviderKey;
          const healthMessage = getProviderHealthMessage(provider.settings);
          const status = provider.isEnabled ? provider.status || "unknown" : "disabled";

          return (
            <section
              key={provider.providerKey}
              className="rounded-[16px] border border-border-dim bg-card/40 p-4 shadow-sm backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-bold text-foreground">{provider.displayName}</h2>
                  <p className="mt-1 text-[11px] font-mono uppercase tracking-widest text-muted">
                    {provider.providerKey} / {provider.authMode || "environment"}
                  </p>
                </div>
                <span className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                  status === "healthy"
                    ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
                    : status === "error"
                      ? "border-red-500/20 bg-red-500/10 text-red-400"
                      : status === "disabled"
                        ? "border-border-dim bg-foreground/5 text-muted"
                        : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500"
                )}>
                  {status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <p className="font-mono uppercase tracking-widest text-muted">Health</p>
                  <p className="mt-1 font-medium text-secondary">{formatProviderDate(provider.lastHealthCheckAt)}</p>
                </div>
                <div>
                  <p className="font-mono uppercase tracking-widest text-muted">Synced</p>
                  <p className="mt-1 font-medium text-secondary">{formatProviderDate(provider.lastSyncedAt)}</p>
                </div>
              </div>

              {healthMessage && (
                <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-secondary">{healthMessage}</p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => syncProviderKey && syncProvider(syncProviderKey)}
                  disabled={!syncProviderKey || syncingProvider !== null}
                  className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-brand/25 bg-brand/10 px-3 text-[11px] font-bold uppercase tracking-wider text-brand transition-colors hover:border-brand/40 hover:bg-brand/15 hover:text-foreground disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync
                </button>
                <button
                  type="button"
                  onClick={() => testProvider(provider.providerKey)}
                  disabled={isTesting}
                  className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-border-dim px-3 text-[11px] font-bold uppercase tracking-wider text-secondary transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-60"
                >
                  {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => toggleProvider(provider.providerKey, provider.isEnabled)}
                  className={cn(
                    "h-9 rounded-[10px] px-3 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    provider.isEnabled
                      ? "bg-foreground/5 text-foreground hover:bg-red-500/10 hover:text-red-400"
                      : "border border-brand/20 bg-brand/10 text-brand hover:bg-brand hover:text-white"
                  )}
                >
                  {provider.isEnabled ? "Disable" : "Enable"}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex border-b border-border-dim">
        {[
          { value: "models" as const, label: "Model Catalogue", icon: List },
          { value: "defaults" as const, label: "Platform Defaults", icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex h-14 items-center gap-3 border-b-2 px-5 text-[13px] font-bold transition-colors",
                isActive
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-transparent text-secondary hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "defaults" && (
        <section className="overflow-hidden rounded-[16px] border border-border-dim bg-card/40 shadow-sm backdrop-blur-xl">
          <div className="border-b border-border-dim px-5 py-4">
            <h2 className="text-[14px] font-bold text-foreground">Platform Defaults</h2>
            <p className="mt-1 text-[12px] text-secondary">
              Assign the default model for each runtime use case. Company, agent, and workflow overrides inherit from these rows.
            </p>
          </div>
          <div className="divide-y divide-border-dim/70">
            {globalDefaults.length === 0 ? (
              <div className="px-5 py-6 text-[13px] text-muted">No default rows loaded yet.</div>
            ) : (
              globalDefaults.map((row) => {
                const candidates = allModels.filter((model) => model.isEnabled && modelSupportsUseCase(model, row.useCase));
                const isSaving = savingDefaultUseCase === row.useCase;

                return (
                  <div key={row.useCase} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[170px_1fr_120px] md:items-center">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{formatModelTag(row.useCase)}</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted">{row.useCase}</p>
                    </div>
                    <select
                      value={row.default?.modelId || ""}
                      disabled={isSaving}
                      onChange={(event) => setPlatformDefault(row.useCase, event.target.value)}
                      className="min-w-0 rounded-[12px] border border-border-dim bg-background/60 px-3 py-2.5 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 disabled:opacity-60"
                    >
                      <option value="">No platform default</option>
                      {candidates.map((model) => (
                        <option key={model.modelId} value={model.modelId}>
                          {getProviderDisplayName(model.providerKey)} / {model.friendlyName || model.displayName || model.modelId}
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-start md:justify-end">
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      ) : (
                        <span className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                          row.default
                            ? "border-brand/20 bg-brand/10 text-brand"
                            : "border-border-dim bg-foreground/5 text-muted"
                        )}>
                          {row.default ? "Configured" : "Unset"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {activeTab === "models" && (
        <>
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
                      <button
                        onClick={() => syncProvider("google")}
                        disabled={syncingProvider !== null}
                        className="mt-2 h-9 px-5 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                      >
                        {syncingProvider === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {syncingProvider === "google" ? t("empty.button.syncing") : t("empty.button.idle")}
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
                        <span className="inline-flex rounded-full border border-border-dim bg-foreground/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-secondary">
                          {getProviderDisplayName(model.providerKey)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <p className={`text-[12.5px] font-mono tracking-wide opacity-50`}>
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
        </>
      )}
    </div>
  );
}
