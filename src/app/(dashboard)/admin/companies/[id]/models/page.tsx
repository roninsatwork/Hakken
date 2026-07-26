"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { canProviderServeUseCase, describeUseCaseProviderLimit } from "@/convex/aiModelService";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import {
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  describeModelUseCase,
  formatModelDisplayName,
  formatModelTag,
  formatTokenCost,
  getProviderDisplayName,
  modelSupportsUseCase,
} from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";
import { cn } from "@/src/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Cpu, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

type DefaultModelSummary = {
  modelId: string;
  providerKey: string;
  providerModelId: string;
  displayName: string;
  isEnabled: boolean;
};

type ModelDefaultRow = {
  useCase: string;
  companyDefault: {
    modelId: string;
    providerKey: string;
    model: DefaultModelSummary | null;
  } | null;
  globalDefault: {
    modelId: string;
    providerKey: string;
    model: DefaultModelSummary | null;
  } | null;
};

export default function CompanyModelDefaultsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const defaultsData = useQuery(api.aiModels.getCompanyModelDefaults, { companyId }) as {
    defaults: ModelDefaultRow[];
  } | undefined;
  // Enabled models, narrowed in the database. This used to read the whole
  // catalogue and filter here, which held up at twenty models and would not at
  // four hundred.
  const modelsData = useQuery(api.aiModels.getActiveModels, {}) as Doc<"aiModels">[] | undefined;
  const providersData = useQuery(api.aiModels.getProviders);
  const setCompanyDefault = useMutation(api.aiModels.setCompanyModelDefault);
  const clearCompanyDefault = useMutation(api.aiModels.clearCompanyModelDefault);

  const activeModels = useMemo(
    () => (modelsData ?? []).filter((model) => model.isEnabled),
    [modelsData]
  );
  const providerNameByKey = useMemo(
    () => new Map((providersData ?? []).map((provider) => [provider.providerKey, provider.displayName])),
    [providersData]
  );

  const [savingUseCase, setSavingUseCase] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  const rows = defaultsData?.defaults ?? [];
  const isLoading = defaultsData === undefined || modelsData === undefined || providersData === undefined;

  /**
   * A model's name as a person would write it, from whatever the row carries.
   *
   * The summary the query returns holds `displayName` but not `friendlyName`, so
   * the catalogue entry is preferred where there is one. This column used to
   * print the provider key and the raw model id under every row, which is
   * the internal key restated.
   */
  const describeModel = (modelId: string, fallback: DefaultModelSummary | null) => {
    const model = (modelsData ?? []).find((entry) => entry.modelId === modelId);
    return formatModelDisplayName(model ?? fallback ?? { modelId });
  };

  /** The price of whichever model this row will actually use, so the trade-off is visible. */
  const describeCost = (modelId: string) => {
    const model = (modelsData ?? []).find((entry) => entry.modelId === modelId);
    if (!model) return "No price set";
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return "No price set";
    // The unit is said once, above the table, rather than nine times down one edge.
    return `${input} in · ${output} out`;
  };

  const handleChange = async (useCase: string, nextModelId: string) => {
    setSavingUseCase(useCase);
    setSaveError("");
    try {
      if (nextModelId) {
        await setCompanyDefault({ companyId, useCase, modelId: nextModelId });
      } else {
        await clearCompanyDefault({ companyId, useCase });
      }
    } catch (error) {
      console.error(error);
      setSaveError(
        `Failed to update the ${formatModelTag(useCase)} model: ${getErrorMessage(error, String(error))}`
      );
    } finally {
      setSavingUseCase(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <AdminPageHeader
        icon={<Cpu className="h-6 w-6 text-brand" />}
        title="Company AI Model Defaults"
        description="Which model this company uses for each kind of work."
      />

      <AdminSaveError>{saveError}</AdminSaveError>

      <p className="text-[13px] text-secondary">
        Every row follows the platform default unless this company is given its own model. An agent
        or a workflow can still override any of these. Prices are per million tokens.
      </p>

      {/* The standard admin table, as the platform Defaults screen and the Model
          Catalogue use. This was a hand-rolled grid with its own header styling
          and a spinner that blanked the whole page before anything drew. */}
      <AdminTableShell minWidthClassName="min-w-[920px]">
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="w-[32%] px-4 py-3 font-medium">Job</th>
            <th className="w-[22%] px-4 py-3 font-medium">Platform default</th>
            <th className="w-[30%] px-4 py-3 font-medium">This company</th>
            <th className="w-[16%] px-4 py-3 text-right font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={4} />
          ) : rows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={4}
              icon={<Cpu className="h-8 w-8 text-muted/30" />}
              label="No jobs to configure yet"
            />
          ) : (
            rows.map((row) => {
              // Same rule as the platform Defaults screen: a company can only
              // override a job with a model whose provider can actually do it.
              const candidates = activeModels.filter((model) =>
                modelSupportsUseCase(model, row.useCase)
                && canProviderServeUseCase(model.providerKey, row.useCase)
              );
              const providerLimit = describeUseCaseProviderLimit(row.useCase);
              const isSaving = savingUseCase === row.useCase;

              /**
               * An override can point at a model this row would not offer — a
               * model switched off, or a provider narrowed by a later sync.
               *
               * When that happens the dropdown's value matches no option, so a
               * browser silently displays the *first* one — "Follow the platform
               * default" — while the row is still overridden. The screen
               * contradicted itself, and touching the dropdown at all fired a
               * change with an empty value and destroyed the setting.
               *
               * So the model that is actually set is always an option, named and
               * marked with why it is not running.
               *
               * The name comes from the row's own summary rather than the model
               * list, because the commonest way to stand a row up is to switch
               * the model off — and a switched-off model is not in that list at
               * all. Reading it from there would have left this fix covering
               * only the rarer case.
               */
              const selectedModelId = row.companyDefault?.modelId ?? "";
              const isStranded = Boolean(selectedModelId)
                && !candidates.some((model) => model.modelId === selectedModelId);
              const strandedModel = isStranded
                ? (modelsData ?? []).find((model) => model.modelId === selectedModelId)
                  ?? row.companyDefault?.model
                  ?? { modelId: selectedModelId }
                : undefined;
              // A model that is switched off is not the same as one that cannot
              // do the work, and telling someone the wrong one sends them to the
              // wrong screen to fix it.
              const strandedReason = row.companyDefault?.model?.isEnabled === false
                ? "is switched off"
                : "cannot do this job";

              // What this company will actually run: its own choice where it has
              // one, otherwise the platform's. A stranded override runs neither,
              // so the price belongs to the platform default it falls through to.
              const effectiveModelId = (isStranded ? undefined : row.companyDefault?.modelId)
                ?? row.globalDefault?.modelId
                ?? "";

              return (
                <tr key={row.useCase} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <div className="text-[13px] font-semibold text-foreground">
                      {formatModelTag(row.useCase)}
                    </div>
                    {/* What the job is, in a sentence. The rows used to read
                        "Router", "Title", "Transcription" with nothing to say
                        what any of them were. */}
                    <div className="mt-0.5 text-[12px] leading-relaxed text-secondary">
                      {describeModelUseCase(row.useCase)}
                    </div>
                    {providerLimit && (
                      <div className="mt-1 text-[11px] leading-relaxed text-muted">{providerLimit}</div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    {row.globalDefault ? (
                      <>
                        <div className="text-[13px] text-foreground">
                          {describeModel(row.globalDefault.modelId, row.globalDefault.model)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {getProviderDisplayName(row.globalDefault.providerKey, providerNameByKey)}
                        </div>
                      </>
                    ) : (
                      <span className="text-[13px] text-[#f59e0b]">Not set</span>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <select
                      value={selectedModelId}
                      disabled={isSaving}
                      aria-label={`${formatModelTag(row.useCase)} model for this company`}
                      onChange={(event) => handleChange(row.useCase, event.target.value)}
                      className={cn(
                        "h-9 w-full min-w-0 rounded-[8px] border bg-card px-3 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 disabled:opacity-60",
                        isStranded ? "border-[#f59e0b]/50" : "border-border-dim"
                      )}
                    >
                      {/* Also the way to clear an override. There used to be a
                          second control beside this one doing the same thing. */}
                      <option value="">Follow the platform default</option>
                      {strandedModel && (
                        <option value={strandedModel.modelId}>
                          {formatModelDisplayName(strandedModel)} — {strandedReason}
                        </option>
                      )}
                      {candidates.map((model) => (
                        <option key={model.modelId} value={model.modelId}>
                          {formatModelDisplayName(model)} · {getProviderDisplayName(model.providerKey, providerNameByKey)}
                        </option>
                      ))}
                    </select>
                    {isStranded && (
                      <div className="mt-1 text-[11px] leading-relaxed text-[#f59e0b]">
                        This model {strandedReason}, so the work falls back to the platform
                        default. Choose another, or follow the platform default.
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    {isSaving ? (
                      <Loader2 className="inline-block h-4 w-4 animate-spin text-brand" />
                    ) : effectiveModelId ? (
                      <span className="text-[12px] text-secondary">{describeCost(effectiveModelId)}</span>
                    ) : (
                      // Only the exception is worth saying. A pill reading
                      // "Inherited" on every row cost attention and carried no
                      // information the dropdown beside it did not already give.
                      <span className="text-[12px] text-[#f59e0b]">Not set</span>
                    )}
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
