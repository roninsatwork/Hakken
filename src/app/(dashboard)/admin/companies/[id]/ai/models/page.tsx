"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canProviderServeUseCase, describeUseCaseProviderLimit } from "@/convex/aiModelService";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import {
  describeModelUseCase,
  formatModelDisplayName,
  formatModelTag,
  formatTokenCost,
  getProviderDisplayName,
  modelSupportsUseCase,
} from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";
import { cn } from "@/src/ui/lib/utils";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useMutation, useQuery } from "convex/react";
import { Cpu, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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

type ModelPickerOption = {
  modelId: string;
  providerKey: string;
  displayName: string;
  supportedUseCases: string[];
  standardInputCostBelow200k?: number;
  outputResponseCost?: number;
};

export default function CompanyModelDefaultsPage() {
  const t = useTranslations("admin.companyDetails.models");
  const tShared = useTranslations("ai.models.shared");
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const pageData = useQuery(api.aiModels.getCompanyModelDefaults, { companyId }) as {
    defaults: ModelDefaultRow[];
    modelPickerOptions: ModelPickerOption[];
    providerNames: Array<{ providerKey: string; displayName: string }>;
  } | undefined;
  const modelsData = pageData?.modelPickerOptions;
  const providersData = pageData?.providerNames;
  const setCompanyDefault = useMutation(api.aiModels.setCompanyModelDefault);
  const clearCompanyDefault = useMutation(api.aiModels.clearCompanyModelDefault);
  const action = useAdminAction({ scope: "admin-company-model-defaults" });

  const activeModels = modelsData ?? [];
  const providerNameByKey = useMemo(
    () => new Map((providersData ?? []).map((provider) => [provider.providerKey, provider.displayName])),
    [providersData]
  );

  const [saveError, setSaveError] = useState("");

  const rows = pageData?.defaults ?? [];
  const isLoading = pageData === undefined;

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
    if (!model) return t("noPriceSet");
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return t("noPriceSet");
    // The unit is said once, above the table, rather than nine times down one edge.
    return t("costInOut", { input, output });
  };

  const handleChange = async (useCase: string, nextModelId: string) => {
    setSaveError("");
    const outcome = await action.run(
      () => nextModelId
        ? setCompanyDefault({ companyId, useCase, modelId: nextModelId })
        : clearCompanyDefault({ companyId, useCase }),
      { key: useCase, suppressErrorToast: true }
    );
    if (!outcome.ok && outcome.message) {
      setSaveError(t("updateFailed", { useCase: formatModelTag(useCase), message: outcome.message }));
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <PageHeader
        icon={<Cpu className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />

      <SaveError>{saveError}</SaveError>

      <p className="text-[13px] text-secondary">
        {t("intro")}
      </p>

      {/* The standard admin table, as the platform Defaults screen and the Model
          Catalogue use. This was a hand-rolled grid with its own header styling
          and a spinner that blanked the whole page before anything drew. */}
      <DataTable
        rows={isLoading ? undefined : rows}
        rowKey={(row) => row.useCase}
        minWidthClassName="min-w-[920px]"
        empty={{ icon: <Cpu className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: rows.length,
          pageSize: Math.max(rows.length, 1),
          isLoading,
          onPageChange: () => {},
          labels: {
            empty: t("empty"),
            showing: (_start, _end, total) => t("showing", { count: total }),
          },
        }}
        columns={[
          {
            key: "job",
            header: t("columnJob"),
            className: "w-[32%]",
            cell: (row) => (
              <>
                <div className="text-[13px] font-semibold text-foreground">
                  {formatModelTag(row.useCase)}
                </div>
                {/* What the job is, in a sentence. The rows used to read
                    "Router", "Title", "Transcription" with nothing to say what
                    any of them were. */}
                {describeModelUseCase(row.useCase) && (
                  <div className="mt-0.5 text-[12px] leading-relaxed text-secondary">
                    {tShared(describeModelUseCase(row.useCase)!)}
                  </div>
                )}
                {describeUseCaseProviderLimit(row.useCase) && (
                  <div className="mt-1 text-[11px] leading-relaxed text-muted">
                    {describeUseCaseProviderLimit(row.useCase)}
                  </div>
                )}
              </>
            ),
          },
          {
            key: "platformDefault",
            header: t("columnPlatformDefault"),
            className: "w-[22%]",
            cell: (row) =>
              row.globalDefault ? (
                <>
                  <div className="text-[13px] text-foreground">
                    {describeModel(row.globalDefault.modelId, row.globalDefault.model)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {getProviderDisplayName(row.globalDefault.providerKey, providerNameByKey) ?? tShared("legacyProvider")}
                  </div>
                </>
              ) : (
                <span className="text-[13px] text-[#f59e0b]">{t("notSet")}</span>
              ),
          },
          {
            key: "companyChoice",
            header: t("columnCompany"),
            className: "w-[30%]",
            cell: (row) => {
              // Same rule as the platform Defaults screen: a company can only
              // override a job with a model whose provider can actually do it.
              const candidates = activeModels.filter((model) =>
                modelSupportsUseCase(model, row.useCase)
                && canProviderServeUseCase(model.providerKey, row.useCase)
              );
              const isSaving = action.isBusy(row.useCase);

              /**
               * An override can point at a model this row would not offer — a
               * model switched off, or a provider narrowed by a later sync. The
               * dropdown's value would then match no option, so a browser
               * silently shows the *first* one while the row is still
               * overridden. So the model that is actually set is always an
               * option, named and marked with why it is not running.
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
                ? t("reasonOff")
                : t("reasonCannot");

              return (
                <>
                  <select
                    value={selectedModelId}
                    disabled={isSaving}
                    aria-label={t("selectAria", { useCase: formatModelTag(row.useCase) })}
                    onChange={(event) => handleChange(row.useCase, event.target.value)}
                    className={cn(
                      "h-9 w-full min-w-0 rounded-[8px] border bg-card px-3 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 disabled:opacity-60",
                      isStranded ? "border-[#f59e0b]/50" : "border-border-dim"
                    )}
                  >
                    {/* Also the way to clear an override. There used to be a
                        second control beside this one doing the same thing. */}
                    <option value="">{t("followPlatform")}</option>
                    {strandedModel && (
                      <option value={strandedModel.modelId}>
                        {t("strandedOption", { name: formatModelDisplayName(strandedModel), reason: strandedReason })}
                      </option>
                    )}
                    {candidates.map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {formatModelDisplayName(model)} · {getProviderDisplayName(model.providerKey, providerNameByKey) ?? tShared("legacyProvider")}
                      </option>
                    ))}
                  </select>
                  {isStranded && (
                    <div className="mt-1 text-[11px] leading-relaxed text-[#f59e0b]">
                      {t("strandedWarning", { reason: strandedReason })}
                    </div>
                  )}
                </>
              );
            },
          },
          {
            key: "price",
            header: t("columnPrice"),
            align: "right",
            className: "w-[16%]",
            cell: (row) => {
              const candidates = activeModels.filter((model) =>
                modelSupportsUseCase(model, row.useCase)
                && canProviderServeUseCase(model.providerKey, row.useCase)
              );
              const selectedModelId = row.companyDefault?.modelId ?? "";
              const isStranded = Boolean(selectedModelId)
                && !candidates.some((model) => model.modelId === selectedModelId);
              // What this company will actually run: its own choice where it has
              // one, otherwise the platform's. A stranded override runs neither,
              // so the price belongs to the platform default it falls through to.
              const effectiveModelId = (isStranded ? undefined : row.companyDefault?.modelId)
                ?? row.globalDefault?.modelId
                ?? "";

              return action.isBusy(row.useCase) ? (
                <Loader2 className="inline-block h-4 w-4 animate-spin text-brand" />
              ) : effectiveModelId ? (
                <span className="text-[12px] text-secondary">{describeCost(effectiveModelId)}</span>
              ) : (
                // Only the exception is worth saying. A pill reading "Inherited"
                // on every row cost attention and carried no information the
                // dropdown beside it did not already give.
                <span className="text-[12px] text-[#f59e0b]">{t("notSet")}</span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
