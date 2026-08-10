"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { BrainCircuit, Loader2, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { useTranslations } from "next-intl";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type RulePriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

type RuleDraft = {
  name: string;
  trigger: string;
  instruction: string;
  priority: RulePriority;
  isActive: boolean;
};

function createRuleDraft(rule: Doc<"aiRules">): RuleDraft {
  return {
    name: rule.name || "",
    trigger: rule.trigger,
    instruction: rule.instruction,
    priority: rule.priority,
    isActive: rule.isActive,
  };
}

export default function EditAgentRulePage({ params }: { params: Promise<{ id: Id<"agents">, ruleId: Id<"aiRules"> }> }) {
  const t = useTranslations("admin.agents.details.rules.form");
  const router = useRouter();
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.id;
  const ruleId = unwrappedParams.ruleId;

  const rule = useQuery(api.aiRules.getRuleById, { id: ruleId });
  const updateRule = useMutation(api.aiRules.updateRule);

  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateDraft = (updates: Partial<RuleDraft>) => {
    if (!rule) return;
    setDraft((current) => ({ ...(current ?? createRuleDraft(rule)), ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rule) return;
    const form = draft ?? createRuleDraft(rule);
    if (!form.name.trim() || !form.trigger.trim() || !form.instruction.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateRule({
        id: ruleId,
        name: form.name.trim(),
        trigger: form.trigger.trim(),
        instruction: form.instruction.trim(),
        priority: form.priority,
        isActive: form.isActive,
      });
      router.push(`/admin/agents/${agentId}/rules`);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const priorityClasses = {
    LOW: "hover:bg-foreground/5 hover:border-border-dim",
    NORMAL: "hover:bg-info/10 hover:border-info/20 hover:text-info",
    HIGH: "hover:bg-warning/10 hover:border-warning/20 hover:text-warning",
    CRITICAL: "hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive",
  };

  const selectedClasses = {
    LOW: "bg-foreground/10 border-foreground/30 text-foreground",
    NORMAL: "bg-info/20 border-info/50 text-info",
    HIGH: "bg-warning/20 border-warning/50 text-warning",
    CRITICAL: "bg-destructive/20 border-destructive/50 text-destructive",
  };

  if (rule === undefined) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!rule) {
    return null;
  }

  const form = draft ?? createRuleDraft(rule);

  return (
    <div className="flex flex-col gap-4 w-full pb-8">
      <header className="flex flex-col gap-1">
        <Link
          href={`/admin/agents/${agentId}/rules`}
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("back")}</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="w-6 h-6 text-brand" />
          {t("edit.title")}
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          {t("edit.subtitle")}
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative max-w-4xl">

        {/* Name Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">1</div>
               <span className="text-foreground text-[14px] font-bold tracking-wide">Rule Name</span>
             </div>
             
             {/* Read-Only Identity Tag */}
             <div className="px-3 py-1 rounded-full border border-border-dim bg-foreground/5 text-muted text-[10px] uppercase font-mono tracking-widest">
               {t("edit.idLabel", { id: ruleId.slice(0, 8) })}...
             </div>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Friendly Label</label>
             <input
               autoFocus
	               value={form.name}
	               onChange={(e) => updateDraft({ name: e.target.value })}
               placeholder="e.g. 'Geography Extraction'"
               className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-3 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-indigo-500/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
             />
           </div>
        </section>

        {/* Trigger Block */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">2</div>
              <span className="text-foreground text-[14px] font-bold tracking-wide">{t("trigger.label")}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 relative group ml-1">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("trigger.entity")}</label>
            <input
	              value={form.trigger}
	              onChange={(e) => updateDraft({ trigger: e.target.value })}
              placeholder={t("trigger.placeholder")}
              className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-3 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
            />
          </div>
        </section>

        {/* Priority Block */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">3</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("priority.label")}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-1">
            {(["LOW", "NORMAL", "HIGH", "CRITICAL"] as const).map(p => (
              <AdminWriteButton
                key={p}
                type="button"
	                onClick={() => updateDraft({ priority: p })}
	                className={`flex flex-col items-start gap-1 p-3 rounded-[10px] border transition-all text-left ${p === form.priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
              >
                <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{t(`priority.levels.${p}`)}</span>
              </AdminWriteButton>
            ))}
          </div>
        </section>

        {/* Instruction Block */}
        <section className="flex flex-col gap-3 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">4</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("instruction.label")}</span>
          </div>
          <div className="flex flex-col gap-2 relative group ml-1 min-h-[160px] flex-1">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("instruction.context")}</label>
            <textarea
	              value={form.instruction}
	              onChange={(e) => updateDraft({ instruction: e.target.value })}
              placeholder={t("instruction.placeholder.edit")}
              className="w-full h-full resize-y min-h-[160px] bg-transparent border border-border-dim rounded-[10px] px-4 py-3 text-[13px] text-foreground/90 placeholder:text-muted/40 outline-none transition-colors focus:border-brand/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide leading-relaxed custom-scrollbar"
              spellCheck={false}
            />
          </div>
        </section>

        <AiRuleSafetyWarningPanel trigger={form.trigger} instruction={form.instruction} />

        {/* Submit Actions */}
        <div className="flex justify-end pt-4 border-t border-border-dim mt-2">
          <AdminWriteButton
            type="submit"
	            disabled={!form.name.trim() || !form.trigger.trim() || !form.instruction.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{t("edit.submit")}</span>
          </AdminWriteButton>
        </div>
      </form>
    </div>
  );
}
