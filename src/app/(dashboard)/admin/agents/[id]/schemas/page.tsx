"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, use } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Save,
  CheckCircle2,
  Code2
} from "lucide-react";
import JsonSchemaBuilder from "@/src/ui/components/settings/JsonSchemaBuilder";
import { useTranslations } from "next-intl";

export default function AgentSchemasPage({ params }: { params: Promise<{ id: Id<"agents"> }> }) {
  const t = useTranslations("admin.agents.details.schemas");
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.id;

  const agent = useQuery(api.agents.get, { id: agentId });
  const updateAgent = useMutation(api.agents.updateAgent);

  const [inputSchema, setInputSchema] = useState<string>("");
  const [outputSchema, setOutputSchema] = useState<string>("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    if (agent && initialLoad) {
      setInputSchema(agent.inputSchema || "");
      setOutputSchema(agent.outputSchema || "");
      setInitialLoad(false);
    }
  }, [agent, initialLoad]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateAgent({
        id: agentId,
        inputSchema: inputSchema.trim() === "" ? undefined : inputSchema,
        outputSchema: outputSchema.trim() === "" ? undefined : outputSchema,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      alert(t("errors.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (agent === undefined) return <div className="p-8 text-secondary">{t("loading")}</div>;
  if (agent === null) return <div className="p-8 text-red-500">{t("notFound")}</div>;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased pb-12">
      <div className="flex flex-col gap-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground tracking-wide flex items-center gap-2">
              <Code2 className="w-5 h-5 text-brand" />
              {t("title")}
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {saveSuccess && <span className="text-[#10b981] text-[12px] font-medium flex items-center gap-1.5 animate-in fade-in"><CheckCircle2 className="w-3.5 h-3.5" /> {t("saveSuccess")}</span>}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/5 hover:bg-white/10 text-foreground text-[12px] font-medium border border-white/5 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? t("savingButton") : t("saveButton")}
            </button>
          </div>
        </div>

        {/* Input Context Schema */}
        <div className="flex flex-col gap-4">
          <JsonSchemaBuilder
            title={t("input.title")}
            subtitle={t("input.subtitle")}
            initialSchemaJson={agent.inputSchema}
            onChange={setInputSchema}
          />
        </div>

        <div className="w-full h-[1px] bg-border-dim/30 my-2" />

        {/* Output Response Schema */}
        <div className="flex flex-col gap-4">
          <JsonSchemaBuilder
            title={t("output.title")}
            subtitle={t("output.subtitle")}
            initialSchemaJson={agent.outputSchema}
            onChange={setOutputSchema}
          />
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-4 mx-1">
            <p className="text-[12px] text-amber-500/80 leading-relaxed font-mono">
              <span className="font-bold text-amber-500">{t("output.warning.label")}</span> {t("output.warning.text")}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
