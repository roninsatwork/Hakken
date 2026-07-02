"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Loader2, RefreshCw } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { cn } from "@/src/ui/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import {
  formatProviderDate,
  getProviderHealthMessage,
  isSyncProviderKey,
  ModelAdminHeader,
  type SyncProviderKey,
} from "../_components/modelAdminUtils";

export default function AIModelProvidersPage() {
  const providersResult = useQuery(api.aiModels.getProviders);
  const syncGoogleModels = useAction(api.aiModelsActions.syncGoogleModels);
  const syncOpenAIModels = useAction(api.aiModelsActions.syncOpenAIModels);
  const syncAnthropicModels = useAction(api.aiModelsActions.syncAnthropicModels);
  const testProviderConnection = useAction(api.aiModelsActions.testProviderConnection);
  const setProviderEnabled = useMutation(api.aiModels.setProviderEnabled);

  const [syncingProvider, setSyncingProvider] = useState<SyncProviderKey | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerError, setProviderError] = useState("");

  const providers = Array.isArray(providersResult) ? providersResult : [];

  const getProviderDisplayName = (providerKey?: string) => {
    if (!providerKey) return "Legacy";
    if (providerKey === "google") return providers.find((provider) => provider.providerKey === providerKey)?.displayName || "Google Vertex AI";
    return providers.find((provider) => provider.providerKey === providerKey)?.displayName || providerKey;
  };

  const syncProvider = async (providerKey: SyncProviderKey) => {
    setSyncingProvider(providerKey);
    setProviderError("");
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
      setProviderError(`Failed to sync ${providerKey} models: ${getErrorMessage(err, String(err))}`);
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
        setProviderError(`${getProviderDisplayName(providerKey)} connection failed: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setProviderError(`Failed to test ${providerKey} provider: ${getErrorMessage(err, String(err))}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleProvider = async (providerKey: string, isEnabled: boolean) => {
    setProviderError("");
    try {
      await setProviderEnabled({ providerKey, isEnabled: !isEnabled });
    } catch (err) {
      console.error(err);
      setProviderError(`Failed to update ${providerKey} provider: ${getErrorMessage(err, String(err))}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <ModelAdminHeader
        icon={<Bot className="w-6 h-6 text-brand" />}
        title="AI Providers"
        subtitle="Manage model provider health, sync, and availability."
      />
      <AiWorkspaceNav />
      <AdminSaveError>{providerError}</AdminSaveError>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {providersResult === undefined ? (
          <div className="col-span-full py-24 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : providers.length === 0 ? (
          <section className="col-span-full rounded-[16px] border border-border-dim/50 border-dashed bg-foreground/[0.02] px-6 py-16 text-center">
            <h2 className="text-sm font-medium text-foreground">No providers configured</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-secondary">
              Configure model providers before syncing model catalogues and setting platform defaults.
            </p>
          </section>
        ) : (
          providers.map((provider) => {
            const isTesting = testingProvider === provider.providerKey;
            const syncProviderKey = isSyncProviderKey(provider.providerKey) ? provider.providerKey : null;
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
          })
        )}
      </div>
    </div>
  );
}
