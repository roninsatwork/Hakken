"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Cpu, Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { getErrorMessage } from "@/src/lib/errors";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import {
  describeModelUseCase,
  formatModelTag,
  formatTokenCost,
  getProviderDisplayName,
  modelSupportsUseCase,
  ModelAdminHeader,
  type GlobalDefaultRow,
} from "../_components/modelAdminUtils";

export default function AIModelDefaultsPage() {
  const allModelsResult = useQuery(api.aiModels.getModels);
  const providersResult = useQuery(api.aiModels.getProviders);
  const globalDefaultsResult = useQuery(api.aiModels.getGlobalModelDefaults);
  const setGlobalModelDefault = useMutation(api.aiModels.setGlobalModelDefault);
  const clearGlobalModelDefault = useMutation(api.aiModels.clearGlobalModelDefault);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [defaultsError, setDefaultsError] = useState("");
  const [savingDefaultUseCase, setSavingDefaultUseCase] = useState<string | null>(null);
  const [everyJobModelId, setEveryJobModelId] = useState("");
  const [isEveryJobConfirmOpen, setIsEveryJobConfirmOpen] = useState(false);
  const [isApplyingEveryJob, setIsApplyingEveryJob] = useState(false);

  const allModels = Array.isArray(allModelsResult) ? allModelsResult : [];
  const providers = Array.isArray(providersResult) ? providersResult : [];
  const providerNameByKey = new Map(providers.map((provider) => [provider.providerKey, provider.displayName]));
  const globalDefaults = (globalDefaultsResult && "defaults" in globalDefaultsResult
    ? globalDefaultsResult.defaults
    : []) as GlobalDefaultRow[];
  const isLoading = allModelsResult === undefined || providersResult === undefined || globalDefaultsResult === undefined;

  /** The price of whichever model a row has chosen, so the trade-off is visible. */
  const selectedCost = (modelId: string) => {
    const model = allModels.find((entry) => entry.modelId === modelId);
    if (!model) return "";
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return "No price set";
    return `${input} in · ${output} out per million`;
  };

  const enabledModels = allModels.filter((model) => model.isEnabled);
  const everyJobModel = enabledModels.find((model) => model._id === everyJobModelId);

  /**
   * Point every job at one model.
   *
   * This action used to be a hover-revealed *Make Default* button on a Model
   * Catalogue row, where it read as marking a favourite. It rewrites all ten
   * platform defaults — chat, router, title, embedding and the rest — so it
   * belongs on the screen that shows those ten rows, and it asks first.
   */
  const applyToEveryJob = async () => {
    if (!everyJobModel) return;
    setIsApplyingEveryJob(true);
    setDefaultsError("");
    try {
      await setDefaultModel({ modelId: everyJobModel._id as Id<"aiModels"> });
      setIsEveryJobConfirmOpen(false);
      setEveryJobModelId("");
    } catch (err) {
      console.error(err);
      setDefaultsError(`Failed to apply that model to every job: ${getErrorMessage(err, String(err))}`);
    } finally {
      setIsApplyingEveryJob(false);
    }
  };

  const setPlatformDefault = async (useCase: string, modelId: string) => {
    setSavingDefaultUseCase(useCase);
    setDefaultsError("");
    try {
      if (modelId) {
        await setGlobalModelDefault({ useCase, modelId });
      } else {
        await clearGlobalModelDefault({ useCase });
      }
    } catch (err) {
      console.error(err);
      setDefaultsError(`Failed to update ${useCase} default: ${getErrorMessage(err, String(err))}`);
    } finally {
      setSavingDefaultUseCase(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <ModelAdminHeader
        icon={<Cpu className="w-6 h-6 text-brand" />}
        title="Model Defaults"
        subtitle="Which model handles each kind of work, unless something more specific says otherwise."
      />
      <AiWorkspaceNav />
      <AdminSaveError>{defaultsError}</AdminSaveError>

      <section className="overflow-hidden rounded-[16px] border border-border-dim bg-card/40 shadow-sm backdrop-blur-xl">
        <div className="border-b border-border-dim px-5 py-4">
          <h2 className="text-[14px] font-bold text-foreground">Platform Defaults</h2>
          <p className="mt-1 text-[12px] text-secondary">
            The model Sonae reaches for when nothing more specific has been chosen. A company, an agent or a workflow can override any of these.
          </p>
        </div>
        <div className="divide-y divide-border-dim/70">
          {isLoading ? (
            <div className="px-5 py-16 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
            </div>
          ) : globalDefaults.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-muted">No default rows loaded yet.</div>
          ) : (
            globalDefaults.map((row) => {
              const candidates = allModels.filter((model) => model.isEnabled && modelSupportsUseCase(model, row.useCase));
              const isSaving = savingDefaultUseCase === row.useCase;

              return (
                <div key={row.useCase} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[260px_1fr_140px] md:items-start">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{formatModelTag(row.useCase)}</p>
                    {/* What the job is, in a sentence. The internal key used to
                        sit here instead, printing the same word twice — once
                        for a person and once for a machine. */}
                    <p className="text-[12px] leading-relaxed text-secondary mt-1">{describeModelUseCase(row.useCase)}</p>
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
                        {getProviderDisplayName(model.providerKey, providerNameByKey)} / {model.friendlyName || model.displayName || model.modelId}
                      </option>
                    ))}
                  </select>
                  {/* A badge reading "Configured" on every row costs attention
                      and carries no information. Only the exception is worth
                      saying, and the cost of the choice is worth showing where
                      the choice is made. */}
                  <div className="flex justify-start md:justify-end md:pt-2">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    ) : row.default ? (
                      <span className="text-[11px] text-muted text-right">
                        {selectedCost(row.default.modelId)}
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-400">
                        Not set
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bulk assignment lives here rather than on a catalogue row, and it
            names what it overwrites. */}
        {globalDefaults.length > 0 && (
        <div className="border-t border-border-dim px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Use one model for every job</h3>
            <p className="mt-1 text-[12px] text-secondary">
              Sets all {globalDefaults.length} rows above at once. Useful when setting up; it will
              replace every choice you have made here.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={everyJobModelId}
              onChange={(event) => setEveryJobModelId(event.target.value)}
              className="min-w-0 rounded-[12px] border border-border-dim bg-background/60 px-3 py-2.5 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 sm:w-[280px]"
            >
              <option value="">Choose a model</option>
              {enabledModels.map((model) => (
                <option key={model._id} value={model._id}>
                  {getProviderDisplayName(model.providerKey, providerNameByKey)} / {model.friendlyName || model.displayName || model.modelId}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!everyJobModel}
              onClick={() => setIsEveryJobConfirmOpen(true)}
              className="h-10 shrink-0 rounded-[8px] border border-border-dim px-4 text-[13px] font-medium text-secondary transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
            >
              Apply to every job
            </button>
          </div>
        </div>
        )}
      </section>

      <SonaeModal
        isOpen={isEveryJobConfirmOpen}
        onClose={() => setIsEveryJobConfirmOpen(false)}
        title="Use one model for every job"
        size="sm"
      >
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            Every job above will be handled by{" "}
            <span className="font-semibold text-foreground">
              {everyJobModel?.friendlyName || everyJobModel?.displayName || everyJobModel?.modelId}
            </span>
            , replacing the choices currently set:
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            {globalDefaults.map((row) => formatModelTag(row.useCase)).join(", ")}.
          </p>
          <p className="text-[12px] leading-relaxed text-secondary">
            Turning documents into something searchable needs an embedding model, so check that
            this one can do that job before applying it to all of them.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEveryJobConfirmOpen(false)}
              className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyToEveryJob}
              disabled={isApplyingEveryJob}
              className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {isApplyingEveryJob && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply to every job
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
