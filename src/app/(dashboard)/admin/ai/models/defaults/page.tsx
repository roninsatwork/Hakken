"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Cpu, Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { getErrorMessage } from "@/src/lib/errors";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import { canProviderServeUseCase, describeUseCaseProviderLimit } from "@/convex/aiModelService";
import { cn } from "@/src/ui/lib/utils";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import {
  describeModelUseCase,
  formatModelDisplayName,
  formatModelTag,
  formatTokenCost,
  getProviderDisplayName,
  modelSupportsUseCase,
  type GlobalDefaultRow,
} from "../_components/modelAdminUtils";

export default function AIModelDefaultsPage() {
  // Only models that can actually be chosen — enabled, and on a provider that is
  // switched on. The unfiltered catalogue read that used to be here is what made
  // this screen a four-hundred-item dropdown once a large provider synced.
  // The compact picker read: names, providers, jobs and the two prices —
  // not every model's prose.
  const allModelsResult = useQuery(api.aiModels.getModelPickerOptions, {});
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
    // The unit is said once, in the panel header. Printing "per million" on all
    // ten rows was the same three words ten times down one edge.
    return `${input} in · ${output} out`;
  };

  const enabledModels = allModels.filter((model) => model.isEnabled);
  const everyJobModel = enabledModels.find((model) => model._id === everyJobModelId);

  // Which of the jobs on this screen the chosen model can actually take over.
  // Said before the action runs rather than discovered afterwards — "every job"
  // was never true for most models, and the rows it could not take were left
  // pointing at whatever was there before.
  const everyJobSplit = everyJobModel
    ? globalDefaults.reduce<{ can: string[]; cannot: string[] }>((split, row) => {
        const canServe = modelSupportsUseCase(everyJobModel, row.useCase)
          && canProviderServeUseCase(everyJobModel.providerKey, row.useCase);
        split[canServe ? "can" : "cannot"].push(row.useCase);
        return split;
      }, { can: [], cannot: [] })
    : { can: [], cannot: [] };

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
      <AdminPageHeader
        divider
        icon={<Cpu className="w-6 h-6 text-brand" />}
        title="Model Defaults"
        description="Which model handles each kind of work, unless something more specific says otherwise."
      />
      <AiWorkspaceNav />
      <AdminSaveError>{defaultsError}</AdminSaveError>

      <p className="text-[13px] text-secondary">
        The model Sonae reaches for when nothing more specific has been chosen. A company, an agent
        or a workflow can override any of these. Prices are per million tokens.
      </p>

      {/* The standard admin table, as the Model Catalogue and AI Providers use.
          This screen was nine tall rows of label, paragraph, full-width dropdown
          and a floating price — every row a different height, and nothing lining
          up down the page. */}
      <AdminTableShell minWidthClassName="min-w-[860px]">
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium w-[38%]">Job</th>
            <th className="px-4 py-3 font-medium w-[42%]">Model</th>
            <th className="px-4 py-3 font-medium w-[20%] text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={3} />
          ) : globalDefaults.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={3}
              icon={<Cpu className="w-8 h-8 text-muted/30" />}
              label="No jobs to configure yet"
            />
          ) : (
            globalDefaults.map((row) => {
              // Only models that can actually do this job. The screen used to
              // offer every enabled model for every row, so a reader could pick
              // one that would fail at run time — and find out only when the
              // work did not happen.
              const candidates = allModels.filter((model) =>
                model.isEnabled
                && modelSupportsUseCase(model, row.useCase)
                && canProviderServeUseCase(model.providerKey, row.useCase)
              );
              const providerLimit = describeUseCaseProviderLimit(row.useCase);

              /**
               * A default can be set to a model this row would not offer —
               * "Apply to every job" wrote every row without checking, and a
               * model's supported jobs can be narrowed by a later sync.
               *
               * When that happens the dropdown's value matches no option, so a
               * browser silently displays the *first* one — "No platform
               * default" — beside a price for the default that does exist. The
               * screen contradicted itself, and touching the dropdown at all
               * fired a change with an empty value and cleared the setting.
               *
               * So the model that is actually set is always an option, named and
               * marked as unable to do the job.
               */
              const selectedModelId = row.default?.modelId ?? "";
              const isStranded = Boolean(selectedModelId)
                && !candidates.some((model) => model.modelId === selectedModelId);
              const strandedModel = isStranded
                ? allModels.find((model) => model.modelId === selectedModelId)
                : undefined;
              const isSaving = savingDefaultUseCase === row.useCase;

              return (
                <tr key={row.useCase} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <div className="text-[13px] font-semibold text-foreground">{formatModelTag(row.useCase)}</div>
                    {/* What the job is, in a sentence. The internal key used to
                        sit here instead, printing the same word twice — once for
                        a person and once for a machine. */}
                    <div className="text-[12px] leading-relaxed text-secondary mt-0.5">
                      {describeModelUseCase(row.useCase)}
                    </div>
                    {/* A short list with no explanation reads as a bug; a short
                        list with a reason reads as a constraint. */}
                    {providerLimit && (
                      <div className="text-[11px] leading-relaxed text-muted mt-1">{providerLimit}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <select
                      value={selectedModelId}
                      disabled={isSaving}
                      onChange={(event) => setPlatformDefault(row.useCase, event.target.value)}
                      className={cn(
                        "w-full min-w-0 rounded-[8px] border bg-card px-3 h-9 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 disabled:opacity-60",
                        isStranded ? "border-[#f59e0b]/50" : "border-border-dim"
                      )}
                    >
                      <option value="">No platform default</option>
                      {strandedModel && (
                        <option value={strandedModel.modelId}>
                          {formatModelDisplayName(strandedModel)} — cannot do this job
                        </option>
                      )}
                      {candidates.map((model) => (
                        <option key={model.modelId} value={model.modelId}>
                          {formatModelDisplayName(model)} · {getProviderDisplayName(model.providerKey, providerNameByKey)}
                        </option>
                      ))}
                    </select>
                    {isStranded && (
                      <div className="text-[11px] leading-relaxed text-[#f59e0b] mt-1">
                        This model cannot do this job, so the work falls through to whatever is set
                        below it. Choose another, or clear it.
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand inline-block" />
                    ) : row.default ? (
                      <span className="text-[12px] text-secondary">{selectedCost(row.default.modelId)}</span>
                    ) : (
                      // Only the exception is worth saying. A badge reading
                      // "Configured" on every row cost attention and carried no
                      // information.
                      <span className="text-[12px] text-[#f59e0b]">Not set</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTableShell>

      {/* Bulk assignment lives here rather than on a catalogue row, and it names
          what it overwrites. */}
      {globalDefaults.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-border-dim bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Use one model for every job</h3>
            <p className="mt-0.5 text-[12px] text-secondary">
              Sets every row above that the model can handle. It will replace those choices.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={everyJobModelId}
              onChange={(event) => setEveryJobModelId(event.target.value)}
              className="h-9 min-w-0 rounded-[8px] border border-border-dim bg-background/60 px-3 text-[13px] text-foreground outline-none focus:border-brand/50 sm:w-[260px]"
            >
              <option value="">Choose a model</option>
              {enabledModels.map((model) => (
                <option key={model._id} value={model._id}>
                  {formatModelDisplayName(model)} · {getProviderDisplayName(model.providerKey, providerNameByKey)}
                </option>
              ))}
            </select>
            <AdminWriteButton
              type="button"
              disabled={!everyJobModel}
              onClick={() => setIsEveryJobConfirmOpen(true)}
              className="h-9 shrink-0 rounded-[8px] border border-border-dim px-4 text-[12px] font-medium text-secondary transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
            >
              Apply
            </AdminWriteButton>
          </div>
        </div>
      )}

      <SonaeModal
        isOpen={isEveryJobConfirmOpen}
        onClose={() => setIsEveryJobConfirmOpen(false)}
        title="Use one model for every job"
        size="sm"
      >
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            <span className="font-semibold text-foreground">
              {everyJobModel ? formatModelDisplayName(everyJobModel) : ""}
            </span>{" "}
            will take over {everyJobSplit.can.length} of the {globalDefaults.length} jobs above,
            replacing what is set for each:
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            {everyJobSplit.can.map(formatModelTag).join(", ")}.
          </p>
          {everyJobSplit.cannot.length > 0 && (
            // Named rather than silently skipped. "Apply to every job" used to
            // write all ten rows without checking, which is how a model ended up
            // set for a job it cannot do.
            <p className="text-[12px] leading-relaxed text-[#f59e0b]">
              It cannot do {everyJobSplit.cannot.map(formatModelTag).join(", ")}, so
              {everyJobSplit.cannot.length === 1 ? " that row is" : " those rows are"} left as
              {everyJobSplit.cannot.length === 1 ? " it is" : " they are"}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEveryJobConfirmOpen(false)}
              className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <AdminWriteButton
              type="button"
              onClick={applyToEveryJob}
              disabled={isApplyingEveryJob}
              className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {isApplyingEveryJob && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply to every job
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
