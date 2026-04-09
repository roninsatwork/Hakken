"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { BrainCircuit, Loader2, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { useTranslations } from "next-intl";

export default function EditAgentRulePage({ params }: { params: Promise<{ id: Id<"agents">, ruleId: Id<"aiRules"> }> }) {
  const t = useTranslations("admin.agents.details.rules.form");
  const router = useRouter();
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.id;
  const ruleId = unwrappedParams.ruleId;

  const rule = useQuery(api.aiRules.getRuleById, { id: ruleId });
  const updateRule = useMutation(api.aiRules.updateRule);

  const [trigger, setTrigger] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "CRITICAL">("NORMAL");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync DB record to local UI state once it lands
  useEffect(() => {
    if (rule) {
      setTrigger(rule.trigger);
      setInstruction(rule.instruction);
      setPriority(rule.priority);
      setIsActive(rule.isActive);
    }
  }, [rule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger.trim() || !instruction.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateRule({
        id: ruleId,
        trigger: trigger.trim(),
        instruction: instruction.trim(),
        priority,
        isActive,
      });
      router.push(`/admin/agents/${agentId}/rules`);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const priorityClasses = {
    LOW: "hover:bg-foreground/5 hover:border-border-dim",
    NORMAL: "hover:bg-blue-500/10 hover:border-blue-500/20 hover:text-blue-500",
    HIGH: "hover:bg-orange-500/10 hover:border-orange-500/20 hover:text-orange-500",
    CRITICAL: "hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-500",
  };

  const selectedClasses = {
    LOW: "bg-foreground/10 border-foreground/30 text-foreground",
    NORMAL: "bg-blue-500/20 border-blue-500/50 text-blue-500",
    HIGH: "bg-orange-500/20 border-orange-500/50 text-orange-500",
    CRITICAL: "bg-rose-500/20 border-rose-500/50 text-rose-500",
  };

  if (rule === undefined) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-10 flex-1 relative max-w-4xl">

        {/* Trigger Block */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">1</div>
              <span className="text-foreground text-[14px] font-bold tracking-wide">{t("trigger.label")}</span>
            </div>
            {/* Read-Only Identity Tag */}
            <div className="px-3 py-1 rounded-full border border-border-dim bg-foreground/5 text-muted text-[10px] uppercase font-mono tracking-widest">
              {t("edit.idLabel", { id: ruleId.slice(0, 8) })}...
            </div>
          </div>
          <div className="flex flex-col gap-2 relative group ml-1">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("trigger.entity")}</label>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={t("trigger.placeholder")}
              className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
            />
          </div>
        </section>

        {/* Priority Block */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">2</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("priority.label")}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-1">
            {(["LOW", "NORMAL", "HIGH", "CRITICAL"] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex flex-col items-start gap-1 p-4 rounded-[12px] border transition-all text-left ${p === priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
              >
                <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{t(`priority.levels.${p}`)}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Instruction Block */}
        <section className="flex flex-col gap-4 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">3</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("instruction.label")}</span>
          </div>
          <div className="flex flex-col gap-2 relative group ml-1 h-[300px]">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("instruction.context")}</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("instruction.placeholder.edit")}
              className="w-full h-full resize-none bg-transparent border border-border-dim rounded-[10px] p-5 text-[13px] text-foreground/90 placeholder:text-muted/40 outline-none transition-colors focus:border-brand/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide leading-relaxed custom-scrollbar"
              spellCheck={false}
            />
          </div>
        </section>

        {/* Submit Actions */}
        <div className="flex justify-end pt-6 border-t border-border-dim mt-4">
          <button
            type="submit"
            disabled={!trigger.trim() || !instruction.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{t("edit.submit")}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
