"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { canProviderServeUseCase, describeUseCaseProviderLimit } from "@/convex/aiModelService";
import { useMutation, useQuery } from "convex/react";
import { Cpu, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
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

function formatUseCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getModelLabel(model: Pick<Doc<"aiModels">, "friendlyName" | "displayName" | "modelId" | "providerKey">) {
  const provider = model.providerKey ? `${model.providerKey} / ` : "";
  return `${provider}${model.friendlyName || model.displayName || model.modelId}`;
}

function supportsUseCase(model: Pick<Doc<"aiModels">, "supportedUseCases">, useCase: string) {
  return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
}

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
  const setCompanyDefault = useMutation(api.aiModels.setCompanyModelDefault);
  const clearCompanyDefault = useMutation(api.aiModels.clearCompanyModelDefault);

  const activeModels = useMemo(
    () => (modelsData ?? []).filter((model) => model.isEnabled),
    [modelsData]
  );

  const [savingUseCase, setSavingUseCase] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChange = async (useCase: string, nextModelId: string) => {
    setSavingUseCase(useCase);
    setMessage(null);
    try {
      if (nextModelId) {
        await setCompanyDefault({ companyId, useCase, modelId: nextModelId });
      } else {
        await clearCompanyDefault({ companyId, useCase });
      }
      setMessage({ type: "success", text: "Company model defaults updated." });
      setTimeout(() => setMessage(null), 2500);
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error, "Failed to update model default.") });
    } finally {
      setSavingUseCase(null);
    }
  };

  if (!defaultsData || !modelsData) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <header className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight text-foreground">
          <Cpu className="h-5 w-5 text-brand" />
          Company AI Model Defaults
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-secondary">
          Set optional company-specific model defaults by use case. Rows left on inherit will use the platform default.
        </p>
      </header>

      {message && (
        <div className={`rounded-[12px] border px-4 py-3 text-[13px] font-medium ${
          message.type === "success"
            ? "border-brand/20 bg-brand/10 text-brand"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-[20px] border border-border-dim bg-sidebar/30 shadow-sm">
        <div className="grid grid-cols-[180px_1fr_1fr_80px] gap-4 border-b border-border-dim bg-foreground/[0.03] px-5 py-4 text-[11px] font-mono uppercase tracking-widest text-muted min-w-[900px]">
          <span>Use Case</span>
          <span>Platform Default</span>
          <span>Company Override</span>
          <span className="text-right">Status</span>
        </div>

        <div className="min-w-[900px] divide-y divide-border-dim/70">
          {defaultsData.defaults.map((row) => {
            // Same rule as the platform Defaults screen: a company can only
            // override a job with a model whose provider can actually do it.
            const candidates = activeModels.filter((model) =>
              supportsUseCase(model, row.useCase)
              && canProviderServeUseCase(model.providerKey, row.useCase)
            );
            const providerLimit = describeUseCaseProviderLimit(row.useCase);
            const isSaving = savingUseCase === row.useCase;

            return (
              <div key={row.useCase} className="grid grid-cols-[180px_1fr_1fr_80px] items-center gap-4 px-5 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold text-foreground">{formatUseCase(row.useCase)}</span>
                  {providerLimit && (
                    <span className="text-[11px] leading-relaxed text-muted">{providerLimit}</span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-foreground">
                    {row.globalDefault?.model?.displayName || row.globalDefault?.modelId || "No platform default"}
                  </span>
                  <span className="text-[11px] text-muted">
                    {row.globalDefault?.providerKey || "inherit"} {row.globalDefault?.modelId ? ` / ${row.globalDefault.modelId}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={row.companyDefault?.modelId || ""}
                    disabled={isSaving}
                    onChange={(event) => handleChange(row.useCase, event.target.value)}
                    className="min-w-0 flex-1 rounded-[12px] border border-border-dim bg-background/60 px-3 py-2.5 text-[13px] text-foreground outline-none transition-all focus:border-brand/50 disabled:opacity-60"
                  >
                    <option value="">Inherit platform default</option>
                    {candidates.map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {getModelLabel(model)}
                      </option>
                    ))}
                  </select>
                  {row.companyDefault && (
                    <button
                      type="button"
                      onClick={() => handleChange(row.useCase, "")}
                      disabled={isSaving}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-border-dim text-secondary transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-60"
                      title="Clear company override"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex justify-end">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${
                      row.companyDefault
                        ? "border-brand/20 bg-brand/10 text-brand"
                        : "border-border-dim bg-foreground/5 text-muted"
                    }`}>
                      <ShieldCheck className="h-3 w-3" />
                      {row.companyDefault ? "Override" : "Inherited"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
