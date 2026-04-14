"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, RefreshCw, Loader2, Star, ShieldCheck, Power, PowerOff, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { Id } from "@/convex/_generated/dataModel";

export default function AIModelsPage() {
  const router = useRouter();
  const t = useTranslations("ai.models");
  const models = useQuery(api.aiModels.getModels, {});
  const syncVertexModels = useAction(api.aiModelsActions.syncVertexModels);
  const toggleModelEnforcement = useMutation(api.aiModels.toggleModelEnforcement);
  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [isSyncing, setIsSyncing] = useState(false);

  const fetchModels = async () => {
    setIsSyncing(true);
    try {
      await syncVertexModels();
    } catch (err) {
      console.error(err);
      alert("Failed to sync models: " + err);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleStatus = async (modelId: Id<"aiModels">, currentState: boolean) => {
    await toggleModelEnforcement({ modelId, isEnabled: !currentState });
  };

  const makeDefault = async (modelId: Id<"aiModels">) => {
    await setDefaultModel({ modelId });
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
        <button
          onClick={fetchModels}
          disabled={isSyncing}
          className="h-9 px-4 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
        >
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {isSyncing ? t("syncButton.syncing") : t("syncButton.idle")}
        </button>
      </div>

      {models === undefined ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
          <Bot className="w-10 h-10 text-brand mb-4 opacity-80" />
          <h3 className="text-sm font-medium text-foreground mb-1">{t("empty.title")}</h3>
          <p className="text-[13px] text-secondary max-w-sm mb-6">
            {t("empty.description")}
          </p>
          <button
            onClick={fetchModels}
            disabled={isSyncing}
            className="h-10 px-6 rounded-full bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncing ? t("empty.button.syncing") : t("empty.button.idle")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {models.map((model) => (
            <div
              key={model._id}
              onClick={() => router.push(`/admin/ai/models/${model._id}`)}
              className={cn(
                "p-4 rounded-[12px] border flex items-center justify-between group transition-all duration-300 cursor-pointer",
                model.isDefault
                  ? "bg-brand/5 border-brand/30"
                  : model.isEnabled
                    ? "bg-sidebar/50 border-border"
                    : "bg-sidebar/20 border-border-dim opacity-70"
              )}
            >
              <div className="flex items-center gap-5">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                  model.isDefault ? "bg-brand text-white" : model.isEnabled ? "bg-foreground/10 text-foreground" : "bg-foreground/5 text-muted"
                )}>
                  <Bot className="w-6 h-6" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-[15px] font-bold text-foreground tracking-tight flex items-center gap-2">
                    {model.displayName}
                    {model.isDefault && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-brand uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand/10">
                        <Star className="w-3 h-3 fill-brand" /> {t("model.default")}
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-2 text-[12px] font-mono tracking-wide">
                    <span className="text-secondary">{model.modelId}</span>
                    <span className="text-muted">•</span>
                    <span className={cn(
                      "font-bold px-2 py-0.5 rounded-full uppercase tracking-wider text-[10px]",
                      model.isEnabled ? "text-[#10b981] bg-[#10b981]/10" : "text-muted bg-foreground/5"
                    )}>
                      {model.isEnabled ? t("model.active") : t("model.disabled")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Make Default Button */}
                {model.isEnabled && !model.isDefault && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      makeDefault(model._id);
                    }}
                    className="px-4 py-2 border border-border-dim rounded-[8px] text-[12px] font-bold tracking-wide text-secondary hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-all opacity-0 group-hover:opacity-100"
                  >
                    {t("model.makeDefault")}
                  </button>
                )}

                {/* Enable / Disable Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(model._id, model.isEnabled);
                  }}
                  className={cn(
                    "w-[70px] h-9 rounded-[8px] flex items-center justify-center gap-2 text-[12px] font-bold tracking-wide transition-all",
                    model.isEnabled
                      ? "bg-foreground/5 text-foreground hover:bg-red-500/10 hover:text-red-500"
                      : "bg-brand/10 text-brand border border-brand/20 hover:bg-brand hover:text-white"
                  )}
                >
                  {model.isEnabled ? t("model.disable") : t("model.enable")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
