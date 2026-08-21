"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Loader2, RefreshCw } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/atoms/Button";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { cn } from "@/src/ui/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import {
  describeProviderStatus,
  describeProviderStatusTone,
  formatModelTag,
  formatProviderDate,
  getProviderHealthMessage,
  isSyncProviderKey,
  type SyncProviderKey,
} from "../_components/modelAdminUtils";

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

  const [syncingProvider, setSyncingProvider] = useState<SyncProviderKey | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerError, setProviderError] = useState("");
  const [disableTarget, setDisableTarget] = useState<string | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);

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
    setSyncingProvider(providerKey);
    setProviderError("");
    try {
      await syncActionsByProvider[providerKey]();
    } catch (err) {
      console.error(err);
      setProviderError(t("syncFailed", { provider: providerKey, message: getErrorMessage(err, String(err)) }));
    } finally {
      setSyncingProvider(null);
    }
  };

  const testProvider = async (providerKey: string) => {
    setTestingProvider(providerKey);
    setProviderError("");
    try {
      const result = await testProviderConnection({ providerKey });
      if (!result.ok) {
        setProviderError(t("connectionFailed", { provider: getProviderDisplayName(providerKey), message: result.message }));
      }
    } catch (err) {
      console.error(err);
      setProviderError(t("testFailed", { provider: providerKey, message: getErrorMessage(err, String(err)) }));
    } finally {
      setTestingProvider(null);
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
      setDisableTarget(providerKey);
      return;
    }
    try {
      await setProviderEnabled({ providerKey, isEnabled: true });
    } catch (err) {
      console.error(err);
      setProviderError(t("updateFailed", { provider: providerKey, message: getErrorMessage(err, String(err)) }));
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    setIsDisabling(true);
    setProviderError("");
    try {
      await setProviderEnabled({ providerKey: disableTarget, isEnabled: false });
      setDisableTarget(null);
    } catch (err) {
      console.error(err);
      setProviderError(t("updateFailed", { provider: disableTarget, message: getErrorMessage(err, String(err)) }));
    } finally {
      setIsDisabling(false);
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
              const isTesting = testingProvider === provider.providerKey;
              const syncProviderKey = isSyncProviderKey(provider.providerKey) ? provider.providerKey : null;
              const isSyncing = syncProviderKey !== null && syncingProvider === syncProviderKey;
              return (
                <div className="flex items-center justify-end gap-2">
                  <WriteButton
                    type="button"
                    onClick={() => syncProviderKey && syncProvider(syncProviderKey)}
                    disabled={!syncProviderKey || syncingProvider !== null}
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

      <SonaeModal
        isOpen={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        title={t("switchOffTitle", { provider: getProviderDisplayName(disableTarget ?? undefined) })}
        size="sm"
      >
        <div className="flex flex-col gap-5 px-1 pb-2">
          {/* The modal's children are built whether or not it is open, so this
              has to survive `disableUsage` being absent or a shape it does not
              recognise — not only the "still loading" case. A crash here takes
              the whole screen down, which is how this was found. */}
          {!disableUsage || !Array.isArray(disableUsage.globalUseCases) ? (
            <div className="flex items-center gap-2 text-[13px] text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("checkingUsage")}
            </div>
          ) : disableUsage.globalUseCases.length === 0 && !disableUsage.companyCount ? (
            <p className="text-[13px] leading-relaxed text-secondary">
              {t("disableSafe")}
            </p>
          ) : (
            <>
              {/* The old behaviour was the opposite of alarming: disabling a
                  provider changed nothing at run time, so the button was safe
                  and meaningless. Now it does what it says, this has to be
                  said out loud. */}
              <p className="text-[13px] leading-relaxed text-secondary">
                {t.rich("disableWorking", {
                  b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
                })}
              </p>
              {disableUsage.globalUseCases.length > 0 && (
                <p className="text-[12px] leading-relaxed text-muted">
                  {t("platformJobs", { jobs: disableUsage.globalUseCases.map(formatModelTag).join(", ") })}
                </p>
              )}
              {disableUsage.companyCount > 0 && (
                <p className="text-[12px] leading-relaxed text-muted">
                  {t("alsoChosen", { count: disableUsage.companyCount })}
                </p>
              )}
              {disableUsage.isPartial && (
                <p className="text-[12px] leading-relaxed text-muted">
                  {t("maybeMore", { limit: 200 })}
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="quiet"
              onClick={() => setDisableTarget(null)}
              className="h-10 px-4 text-[13px] font-normal bg-transparent hover:bg-transparent"
            >
              {t("cancel")}
            </Button>
            <WriteButton
              type="button"
              onClick={confirmDisable}
              disabled={isDisabling}
              className="h-10 px-4 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
            >
              {isDisabling && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("switchItOff")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
