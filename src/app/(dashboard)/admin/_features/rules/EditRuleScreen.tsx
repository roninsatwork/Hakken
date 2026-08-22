"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrainCircuit, Loader2, Save } from "lucide-react";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";

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

/** Editing a rule, at both heights: the global AI's own, or one company's. */
export function EditRuleScreen({
  ruleId,
  companyId,
}: {
  ruleId: Id<"aiRules">;
  companyId?: Id<"companies">;
}) {
  const t = useTranslations("ai.rules.form");
  const router = useRouter();
  const rulesHref = companyId ? `/admin/companies/${companyId}/ai/rules` : "/admin/ai/rules";

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
      router.push(rulesHref);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const priorityLabels: Record<RulePriority, string> = {
    LOW: t("priority.LOW"),
    NORMAL: t("priority.NORMAL"),
    HIGH: t("priority.HIGH"),
    CRITICAL: t("priority.CRITICAL"),
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
      <DetailHeader
        back={{ label: t("back"), href: rulesHref }}
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative max-w-4xl">

        {/* Name Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">1</div>
               <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionName")}</span>
             </div>

             {/* Read-Only Identity Tag */}
             <div className="px-3 py-1 rounded-full border border-border-dim bg-foreground/5 text-muted text-[10px] uppercase font-mono tracking-widest">
               {t("idTag", { id: ruleId.slice(0, 8) })}
             </div>
           </div>

           <div className="ml-1">
             <Field
               label={t("nameLabel")}
               autoFocus
               value={form.name}
               onChange={(e) => updateDraft({ name: e.target.value })}
               placeholder={t("namePlaceholder")}
             />
           </div>
        </section>

        {/* Trigger Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">2</div>
               <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionTrigger")}</span>
             </div>

           </div>

           <div className="ml-1">
             <Field
               label={t("triggerLabel")}
               value={form.trigger}
               onChange={(e) => updateDraft({ trigger: e.target.value })}
               placeholder={t("triggerPlaceholder")}
             />
           </div>
        </section>

        {/* Priority Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">3</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionPriority")}</span>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-1">
              {(["LOW", "NORMAL", "HIGH", "CRITICAL"] as const).map(p => (
                <WriteButton
                  key={p}
                  type="button"
                  onClick={() => updateDraft({ priority: p })}
                  className={`flex flex-col items-start gap-1 p-3 rounded-[10px] border transition-all text-left ${p === form.priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
                >
                  <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{priorityLabels[p]}</span>
                </WriteButton>
              ))}
           </div>
        </section>

        {/* Instruction Block */}
        <section className="flex flex-col gap-3 flex-1">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">4</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionInstruction")}</span>
           </div>

           <div className="ml-1">
             <TextAreaField
               label={t("instructionLabel")}
               value={form.instruction}
               onChange={(e) => updateDraft({ instruction: e.target.value })}
               placeholder={t("instructionPlaceholder")}
               className="min-h-[300px] resize-y"
               spellCheck={false}
             />
           </div>
        </section>

        <AiRuleSafetyWarningPanel trigger={form.trigger} instruction={form.instruction} />

        {/* Submit Actions */}
        <div className="flex justify-end pt-4 border-t border-border-dim mt-2">
          <WriteButton
            type="submit"
            disabled={!form.name.trim() || !form.trigger.trim() || !form.instruction.trim() || isSubmitting}
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
