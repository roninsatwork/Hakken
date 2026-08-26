"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { useAdminAction } from "@/src/hooks/useAdminAction";

// Catalogue keys for the four priority tiers, relative to `ai.rules.form`.
const PRIORITY_LABEL_KEYS = {
  LOW: "priority.LOW",
  NORMAL: "priority.NORMAL",
  HIGH: "priority.HIGH",
  CRITICAL: "priority.CRITICAL",
} as const;

export default function NewCompanyRulePage() {
  const t = useTranslations("ai.rules.form");
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const createRule = useMutation(api.aiRules.createRule);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "CRITICAL">("NORMAL");
  const action = useAdminAction({ scope: "admin-company-rule-create" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !trigger.trim() || !instruction.trim()) return;

    await action.run(
      async () => {
        await createRule({
          companyId,
          name: name.trim(),
          trigger: trigger.trim(),
          instruction: instruction.trim(),
          priority,
          isActive: true,
        });
        router.push(`/admin/companies/${companyId}/ai/rules`);
      },
      { fallbackMessage: t("createFailed") },
    );
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

  return (
    <div className="flex flex-col gap-4 w-full pb-8">
      <DetailHeader
        back={{ label: t("back"), href: `/admin/companies/${companyId}/ai/rules` }}
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("newTitle")}
        description={t("newSubtitle")}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative max-w-4xl">
        
        {/* Name Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionName")}</span>
           </div>

           <div className="ml-1">
             <Field
               label={t("nameLabel")}
               autoFocus
               value={name}
               onChange={(e) => setName(e.target.value)}
               placeholder={t("namePlaceholder")}
             />
           </div>
        </section>

        {/* Trigger Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionTrigger")}</span>
           </div>

           <div className="ml-1">
             <Field
               label={t("triggerLabel")}
               value={trigger}
               onChange={(e) => setTrigger(e.target.value)}
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
                // Stays raw: a selected-state priority card with per-priority colours — matches no variant.
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-[10px] border transition-all text-left ${p === priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
                >
                  <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{t(PRIORITY_LABEL_KEYS[p])}</span>
                </button>
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
               value={instruction}
               onChange={(e) => setInstruction(e.target.value)}
               placeholder={t("instructionPlaceholder")}
               className="min-h-[300px] resize-y"
               spellCheck={false}
             />
           </div>
        </section>

        <AiRuleSafetyWarningPanel trigger={trigger} instruction={instruction} />

        {/* Submit Actions */}
        <div className="flex justify-end pt-4 border-t border-border-dim mt-2">
          <WriteButton
             type="submit"
             disabled={!name.trim() || !trigger.trim() || !instruction.trim() || action.isBusy()}
             className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {action.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
             <span>{t("create")}</span>
          </WriteButton>
        </div>
      </form>
    </div>
  );
}
