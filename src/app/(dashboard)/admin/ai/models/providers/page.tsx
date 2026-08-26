"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Loader2, RefreshCw } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { cn } from "@/src/ui/lib/utils";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import {
  describeProviderStatus,
  describeProviderStatusTone,
  formatProviderDate,
  getProviderHealthMessage,
  isSyncProviderKey,
  type SyncProviderKey,
} from "../_components/modelAdminUtils";

const loadProviderDisableDialog = () => import("./ModelProviderDisableDialog");
const ModelProviderDisableDialog = dynamic(() =>
  loadProviderDisableDialog().then((module) => module.ModelProviderDisableDialog),
);

export default function AIModelProvidersPage() {
  const t = useTranslations("ai.models.providers");
  const tShared = useTranslations("ai.models.shared");
  const locale = useLocale();
  const providersResult = useQuery(api.aiModels.getProviders);
  const syncGoogleModels = useAction(api.aiModelsActions.syncGoogleModels);
  const syncOpenAIModels = useAction(api.aiModelsActions.syncOpenAIModels);
  const syncAnthropicModels = useAction(api.aiModelsActions.syncAnthropicModels);
  const syncOpenRouterModels = useAction(api.aiModelsActions.syncOpenRouterModels);
  const testProviderConnection = useAction(api.aiModelsActions.testProviderConnection);
  const setProviderEnabled = useMutation(api.aiModels.setProviderEnabled);
  const action = useAdminAction({ scope: "admin-ai-model-providers" });

  const [providerError, setProviderError] = useState("");
  const [disableTarget, setDisableTarget] = useState<string | null>(null);

  // Only asked for while a disable is being confirmed.
  const disableUsage = useQuery(
    api.aiModels.getProviderDefaultUsage,
    disableTarget ? { providerKey: disableTarget } : "skip"
  );

  const providers = Array.isArray(providersResult) ? providersResult : [];
  // From the rollup, so this costs one document rather than a count per row.
  const counts = useQuery(api.aiModels.getModelCounts);
  const countsByProvider = new Map(
    (counts?.byProvider ?? []).map((entry) => [entry.providerKey, entry])
  );

  const getProviderDisplayName = (providerKey?: string) => {
    if (!providerKey) return tShared("legacyProvider");
    if (providerKey === "google") return providers.find((provider) => provider.providerKey === providerKey)?.displayName || "Google Vertex AI";
    return providers.find((provider) => provider.providerKey === providerKey)?.displayName || providerKey;
  };

  /**
   * One entry per provider, so an unmapped provider cannot fall through.
   *
   * This was an if/else-if chain whose final `else` called the Anthropic sync.
   * Adding a fourth provider to `SyncProviderKey` without adding a branch would
   * have meant pressing Sync on it silently syncing Anthropic — and adding a
   * fourth provider is exactly what comes next. A record keyed by the union type
   * makes the compiler refuse the omission instead.
   */
  const syncActionsByProvider: Record<SyncProviderKey, () => Promise<unknown>> = {
    google: syncGoogleModels,
    openai: syncOpenAIModels,
    anthropic: syncAnthropicModels,
    openrouter: syncOpenRouterModels,
  };

  const syncProvider = async (providerKey: SyncProviderKey) => {
    setProviderError("");
    const outcome = await action.run(() => syncActionsByProvider[providerKey](), {
      key: `sync:${providerKey}`,
      suppressErrorToast: true,
    });
    if (!outcome.ok && outcome.message) {
      setProviderError(t("syncFailed", { provider: providerKey, message: outcome.message }));
    }
  };

  const testProvider = async (providerKey: string) => {
    setProviderError("");
    const outcome = await action.run(() => testProviderConnection({ providerKey }), {
      key: `test:${providerKey}`,
      suppressErrorToast: true,
    });
    if (outcome.ok) {
      if (!outcome.data.ok) {
        setProviderError(t("connectionFailed", { provider: getProviderDisplayName(providerKey), message: outcome.data.message }));
      }
      return;
    }
    if (outcome.message) {
      setProviderError(t("testFailed", { provider: providerKey, message: outcome.message }));
    }
  };

  /**
   * Switching a provider off now genuinely stops its models serving, so it can
   * take a company's agents offline. Enabling is harmless and happens straight
   * away; disabling asks first, and says what it is about to stop.
   */
  const toggleProvider = async (providerKey: string, isEnabled: boolean) => {
    setProviderError("");
    if (isEnabled) {
      void loadProviderDisableDialog();
      setDisableTarget(providerKey);
      return;
    }
    const outcome = await action.run(() => setProviderEnabled({ providerKey, isEnabled: true }), {
      key: `toggle:${providerKey}`,
      suppressErrorToast: true,
    });
    if (!outcome.ok && outcome.message) {
      setProviderError(t("updateFailed", { provider: providerKey, message: outcome.message }));
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    setProviderError("");
    const outcome = await action.run(
      () => setProviderEnabled({ providerKey: disableTarget, isEnabled: false }),
      { key: `toggle:${disableTarget}`, suppressErrorToast: true },
    );
    if (outcome.ok) {
      setDisableTarget(null);
      return;
    }
    if (outcome.message) {
      setProviderError(t("updateFailed", { provider: disableTarget, message: outcome.message }));
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <PageHeader
        divider
        icon={<Bot className="w-6 h-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />
      <AiWorkspaceNav />
      <SaveError>{providerError}</SaveError>

      {/* The standard admin table, the same one the model catalogue uses, so the
          two screens that describe the same thing finally look related. No
          search box: at four rows it is furniture, and the footer honestly
          reports the count. */}
      <DataTable
        rows={providersResult === undefined ? undefined : providers}
        rowKey={(provider) => provider.providerKey}
        minWidthClassName="min-w-[820px]"
        empty={{ icon: <Bot className="w-8 h-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: providers.length,
          pageSize: Math.max(providers.length, 1),
          isLoading: providersResult === undefined,
          onPageChange: () => {},
          labels: {
            empty: t("empty"),
            showing: (_start, _end, total) => t("showing", { count: total }),
          },
        }}
        columns={[
          {
            key: "provider",
            header: t("columnProvider"),
            className: "w-[34%]",
            /* The name, and nothing under it. The raw provider key and
               `authMode` used to sit here; the last sync message replaced them
               and was no more wanted. The Status column says whether the
               provider answers, and a failed test still reports why in the
               banner above. */
            cell: (provider) => (
              <div
                className="text-[13px] font-semibold text-foreground"
                title={getProviderHealthMessage(provider.settings) || undefined}
              >
                {provider.displayName}
              </div>
            ),
          },
          {
            key: "models",
            header: t("columnModels"),
            className: "w-[16%]",
            /* The question this screen exists to answer, and it was not on it:
               how many models this provider gives you, and how many are on. */
            cell: (provider) => {
              const counts = countsByProvider.get(provider.providerKey);
              return (
                <span className="text-[12px] text-secondary">
                  {counts ? (
                    <>
                      {counts.total} <span className="text-muted">{t("modelsOn", { count: counts.enabled })}</span>
                    </>
                  ) : (
                    <span className="text-muted">{t("noneYet")}</span>
                  )}
                </span>
              );
            },
          },
          {
            key: "status",
            header: t("columnStatus"),
            className: "w-[16%]",
            cell: (provider) => (
              <span className={`text-[12px] ${describeProviderStatusTone(provider.isEnabled, provider.status)}`}>
                {tShared(describeProviderStatus(provider.isEnabled, provider.status))}
              </span>
            ),
          },
          {
            key: "lastSynced",
            header: t("columnLastSynced"),
            className: "w-[16%]",
            cell: (provider) => (
              <span className="text-[12px] text-secondary">{formatProviderDate(provider.lastSyncedAt, locale) ?? tShared("never")}</span>
            ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            className: "w-[18%]",
            cell: (provider) => {
              const isTesting = action.isBusy(`test:${provider.providerKey}`);
              const syncProviderKey = isSyncProviderKey(provider.providerKey) ? provider.providerKey : null;
              // Any sync, not this row's. Pulling a provider's whole model
              // catalogue is not a per-row action that happens to be in a
              // table: the old single flag disabled every sync button while
              // one ran, and moving to a per-provider key — right for the rest
              // of this table — quietly allowed three catalogue pulls at once.
              const isSyncing = action.isBusy();
              return (
                <div className="flex items-center justify-end gap-2">
                  <WriteButton
                    type="button"
                    onClick={() => syncProviderKey && syncProvider(syncProviderKey)}
                    disabled={!syncProviderKey || isSyncing}
                    className="flex h-8 items-center gap-1.5 rounded-[6px] border border-border-dim px-3 text-[12px] font-medium text-secondary transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {t("sync")}
                  </WriteButton>
                  <Button
                    variant="quiet"
                    onClick={() => testProvider(provider.providerKey)}
                    disabled={isTesting}
                    className="flex h-8 items-center gap-1.5 rounded-[6px] px-3 bg-transparent hover:bg-transparent disabled:opacity-40"
                  >
                    {isTesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("test")}
                  </Button>
                  {/* The switch is the control, not a badge beside a button
                      saying the same thing. */}
                  <WriteButton
                    type="button"
                    role="switch"
                    aria-checked={provider.isEnabled}
                    aria-label={provider.isEnabled ? t("ariaDisable", { name: provider.displayName }) : t("ariaEnable", { name: provider.displayName })}
                    onClick={() => toggleProvider(provider.providerKey, provider.isEnabled)}
                    className="ml-1"
                  >
                    <span
                      className={cn(
                        "relative block h-5 w-9 rounded-full transition-colors",
                        provider.isEnabled ? "bg-brand" : "bg-foreground/15"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                          provider.isEnabled ? "left-[18px]" : "left-0.5"
                        )}
                      />
                    </span>
                  </WriteButton>
                </div>
              );
            },
          },
        ]}
      />

      {disableTarget !== null && (
        <ModelProviderDisableDialog
          providerName={getProviderDisplayName(disableTarget)}
          disableUsage={disableUsage}
          isDisabling={action.isBusy(`toggle:${disableTarget}`)}
          onClose={() => setDisableTarget(null)}
          onConfirm={confirmDisable}
        />
      )}
    </div>
  );
}
