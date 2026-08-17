"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Cpu, Wrench } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import JsonSchemaBuilder from "@/src/ui/components/settings/JsonSchemaBuilder";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import {
  SaveAction,
  SaveError,
} from "@/src/ui/components/screens/SaveControls";
import { cn } from "@/src/ui/lib/utils";

type AgentTool = Doc<"aiTools"> & { bindingId: Id<"agentTools"> };

/**
 * One screen for what an agent can use and what it gives back.
 *
 * These were two pages behind a dropdown — Integrations and I/O Schemas — and
 * they are two halves of the same question. Neither name said what it was for,
 * and one of them was mostly decoration: the input schema was stored, versioned
 * and read by nothing, so it is gone.
 */
export default function AgentInterfacesPage() {
  const t = useTranslations("admin.agents.details.interfaces");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const globalTools = useQuery(api.aiTools.getTools) as Doc<"aiTools">[] | undefined;
  const agentTools = (useQuery(api.aiTools.getAgentTools, { agentId }) || []) as AgentTool[];

  const toggleToolMutation = useMutation(api.aiTools.toggleAgentTool);
  const updateAgent = useMutation(api.agents.updateAgent);

  const [processingId, setProcessingId] = useState<Id<"aiTools"> | null>(null);
  const [toolError, setToolError] = useState("");

  const [outputSchema, setOutputSchema] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleToggleTool = async (toolId: Id<"aiTools">, isBound: boolean) => {
    if (processingId) return;
    setProcessingId(toolId);
    setToolError("");
    try {
      await toggleToolMutation({ agentId, toolId, action: isBound ? "UNBIND" : "BIND" });
    } catch {
      setToolError(t("tools.errors.assignFailed"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveAnswer = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      // Null means the builder has not reported a change, so the stored shape
      // stands. Empty string means every field was removed, which has to clear it.
      const next = outputSchema ?? agent?.outputSchema ?? "";
      await updateAgent({
        id: agentId,
        outputSchema: next.trim() === "" ? undefined : next,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSaveError(t("answer.errors.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (agent === undefined) return <div className="p-8 text-secondary">{t("loading")}</div>;
  if (agent === null) return <div className="p-8 text-red-500">{t("notFound")}</div>;

  return (
    <div className="flex w-full flex-col gap-8 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        icon={<Cpu className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("tools.title")}</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            {t("tools.description")}
          </p>
        </div>
        <SaveError>{toolError}</SaveError>

        <TableShell minWidthClassName="min-w-[720px]">
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>{t("tools.columns.name")}</TableHeaderCell>
              <TableHeaderCell>{t("tools.columns.description")}</TableHeaderCell>
              <TableHeaderCell>{t("tools.columns.access")}</TableHeaderCell>
              <TableHeaderCell align="right">{t("tools.columns.state")}</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {globalTools === undefined ? (
              <TableLoadingRow colSpan={4} />
            ) : globalTools.length === 0 ? (
              /* The old message read "No tools or integrations mapped to this
                 unit", which says this agent has none. The truth is that none
                 exist anywhere yet, and the reader was given nowhere to go. */
              <TableEmptyRow
                colSpan={4}
                icon={<Wrench className="h-8 w-8 text-muted/30" />}
                label={t("tools.empty")}
                action={
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[13px] normal-case tracking-normal text-secondary">
                      {t("tools.emptyHint")}
                    </span>
                    <Link
                      href="/admin/ai/tools/new"
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                    >
                      {t("tools.emptyAction")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                }
              />
            ) : (
              globalTools.map((tool) => {
                const isBound = agentTools.some((bound) => bound._id === tool._id);
                return (
                  <tr key={tool._id} className="border-b border-border-dim/50">
                    <td className="px-4 py-3 align-top text-[13px] font-medium text-foreground">
                      {tool.name}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-secondary">
                      {tool.description}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] text-secondary">
                      {t(`tools.roles.${tool.requiredRole}`)}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isBound}
                        aria-label={tool.name}
                        disabled={processingId !== null}
                        onClick={() => handleToggleTool(tool._id, isBound)}
                        className="disabled:opacity-50"
                      >
                        <span
                          className={cn(
                            "relative block h-5 w-9 rounded-full transition-colors",
                            isBound ? "bg-brand" : "bg-foreground/15",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                              isBound ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t("answer.title")}</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              {t("answer.description")}
            </p>
          </div>
          <SaveAction
            isSaving={isSaving}
            label={t("answer.saveButton")}
            savingLabel={t("answer.savingButton")}
            successLabel={t("answer.saveSuccess")}
            showSuccess={saveSuccess}
            onClick={handleSaveAnswer}
          />
        </div>
        <SaveError>{saveError}</SaveError>

        <JsonSchemaBuilder
          title={t("answer.builderTitle")}
          subtitle={t("answer.builderSubtitle")}
          initialSchemaJson={agent.outputSchema}
          onChange={setOutputSchema}
        />

        {/* Only worth warning about once the reader has actually asked for
            fields. The old page showed this permanently, beside an empty
            builder, describing something that was not happening. */}
        {(outputSchema ?? agent.outputSchema ?? "").trim() !== "" && (
          <div className="flex items-start gap-3 rounded-[10px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("answer.warning")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
