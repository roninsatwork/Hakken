"use client";

import { useState, use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";

type ToolRole = "ADMIN" | "SUPER_ADMIN";
type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

type ToolDraft = {
  name: string;
  description: string;
  handlerMapping: string;
  requiredRole: ToolRole;
  inputSchema: string;
  outputSchema: string;
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
  isActive: boolean;
};

function createToolDraft(tool: Doc<"aiTools">): ToolDraft {
  return {
    name: tool.name,
    description: tool.description,
    handlerMapping: tool.handlerMapping,
    requiredRole: tool.requiredRole,
    inputSchema: tool.inputSchema || "",
    outputSchema: tool.outputSchema || "",
    sideEffectLevel: tool.sideEffectLevel || "READ",
    confirmationRequired: tool.confirmationRequired ?? false,
    isActive: tool.isActive ?? true,
  };
}

export default function EditToolPage({ params }: { params: Promise<{ id: Id<"aiTools"> }> }) {
  const t = useTranslations("admin.aiTools.edit");
  const tFields = useTranslations("admin.aiTools.new.fields");
  const router = useRouter();
  const unwrappedParams = use(params);
  const toolId = unwrappedParams.id;

  const tool = useQuery(api.aiTools.getToolById, { id: toolId });
  const updateTool = useMutation(api.aiTools.updateTool);

  const [draft, setDraft] = useState<ToolDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateDraft = (updates: Partial<ToolDraft>) => {
    if (!tool) return;
    setDraft((current) => ({ ...(current ?? createToolDraft(tool)), ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tool) return;
    const form = draft ?? createToolDraft(tool);
    if (!form.name.trim() || !form.description.trim() || !form.handlerMapping.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateTool({
        id: toolId,
        name: form.name.trim(),
        description: form.description.trim(),
        handlerMapping: form.handlerMapping.trim(),
        requiredRole: form.requiredRole,
        inputSchema: form.inputSchema.trim() || undefined,
        outputSchema: form.outputSchema.trim() || undefined,
        sideEffectLevel: form.sideEffectLevel,
        confirmationRequired: form.confirmationRequired,
        isActive: form.isActive,
      });
      router.push(`/admin/ai/tools`);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const roleClasses = {
    ADMIN: "hover:bg-warning/10 hover:border-warning/20 hover:text-warning",
    SUPER_ADMIN: "hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive",
  };

  const selectedRoleClasses = {
    ADMIN: "bg-warning/20 border-warning/50 text-warning",
    SUPER_ADMIN: "bg-destructive/20 border-destructive/50 text-destructive",
  };

  if (tool === undefined) {
     return (
        <div className="flex-1 w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
	     );
  }

  if (!tool) {
    return null;
  }

  const form = draft ?? createToolDraft(tool);

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <header className="flex flex-col gap-1">
        <Link 
          href="/admin/ai/tools"
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("back")}</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Wrench className="w-6 h-6 text-brand" />
          {t("title")}
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          {t("subtitle")}
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-10 flex-1 relative max-w-4xl">
        
        <section className="flex flex-col gap-4">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">1</div>
               <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionName")}</span>
             </div>
             
             {/* Read-Only Identity Tag */}
             <div className="px-3 py-1 rounded-full border border-border-dim bg-foreground/5 text-muted text-[10px] uppercase font-mono tracking-widest flex items-center gap-2">
               <span>{t("idTag", { id: toolId.slice(0, 8) })}</span>
               <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
             </div>
           </div>
           
           <div className="ml-1">
             <Field
               label={tFields("name.label")}
               hint={tFields("name.help")}
               value={form.name}
               onChange={(e) => updateDraft({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
               placeholder={tFields("name.placeholder")}
             />
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionDoes")}</span>
           </div>

           <div className="ml-1">
             <TextAreaField
               label={tFields("description.label")}
               value={form.description}
               onChange={(e) => updateDraft({ description: e.target.value })}
               placeholder={tFields("description.placeholder")}
               className="min-h-[150px] resize-y"
               spellCheck={false}
             />
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">3</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionRuns")}</span>
           </div>

           <div className="ml-1">
             <Field
               label={tFields("handler.label")}
               value={form.handlerMapping}
               onChange={(e) => updateDraft({ handlerMapping: e.target.value })}
               placeholder={tFields("handler.placeholder")}
               className="font-mono"
             />
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-rose-500/20">4</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionWho")}</span>
           </div>
           
           <div className="grid grid-cols-2 gap-3 ml-1">
              {(["ADMIN", "SUPER_ADMIN"] as const).map(p => (
                <WriteButton
                  key={p}
                  type="button"
	                  onClick={() => updateDraft({ requiredRole: p })}
	                  className={`flex flex-col items-start gap-1 p-4 rounded-[12px] border transition-all text-left ${p === form.requiredRole ? selectedRoleClasses[p] : `border-border-dim bg-transparent text-secondary ${roleClasses[p]}`}`}
                >
                  <span className="text-[13px] font-bold tracking-wide">{p === "ADMIN" ? t("roleAdmin") : t("roleSystemAdmin")}</span>
                </WriteButton>
              ))}
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-cyan-500/20">5</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionRules")}</span>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ml-1">
             <div className="flex flex-col gap-2">
               <label htmlFor="tool-side-effect" className="mt-1 text-[12px] font-medium text-secondary">{t("sideEffectLabel")}</label>
               <select
                 id="tool-side-effect"
                 value={form.sideEffectLevel}
                 onChange={(e) => updateDraft({ sideEffectLevel: e.target.value as ToolSideEffectLevel })}
                 className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
               >
                 <option value="READ">{t("sideEffectRead")}</option>
                 <option value="WRITE">{t("sideEffectWrite")}</option>
                 <option value="DESTRUCTIVE">{t("sideEffectDestructive")}</option>
                 <option value="EXTERNAL">{t("sideEffectExternal")}</option>
               </select>
             </div>

             <div className="flex flex-col gap-3">
               <span className="mt-1 text-[12px] font-medium text-secondary">{t("beforeRuns")}</span>
               <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
                 <input
                   type="checkbox"
                   checked={form.confirmationRequired}
                   onChange={(e) => updateDraft({ confirmationRequired: e.target.checked })}
                 />
                 {t("requireApproval")}
               </label>
               <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
                 <input
                   type="checkbox"
                   checked={form.isActive}
                   onChange={(e) => updateDraft({ isActive: e.target.checked })}
                 />
                 {t("active")}
               </label>
             </div>
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-sky-500/20">6</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionInOut")}</span>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 ml-1">
             <TextAreaField
               label={t("inputLabel")}
               value={form.inputSchema}
               onChange={(e) => updateDraft({ inputSchema: e.target.value })}
               placeholder='{"type":"object","properties":{}}'
               className="min-h-[180px] resize-y font-mono text-[12px]"
               spellCheck={false}
             />
             <TextAreaField
               label={t("outputLabel")}
               value={form.outputSchema}
               onChange={(e) => updateDraft({ outputSchema: e.target.value })}
               placeholder={t("outputPlaceholder")}
               className="min-h-[180px] resize-y font-mono text-[12px]"
               spellCheck={false}
             />
           </div>
        </section>

        {/* Submit Actions */}
        <div className="flex justify-end pt-6 border-t border-border-dim mt-4">
          <WriteButton
            type="submit"
	            disabled={!form.name.trim() || !form.description.trim() || !form.handlerMapping.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{t("save")}</span>
          </WriteButton>
        </div>
      </form>
    </div>
  );
}
