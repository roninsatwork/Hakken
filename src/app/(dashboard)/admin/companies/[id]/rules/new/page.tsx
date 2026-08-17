"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { BrainCircuit, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";

export default function NewCompanyRulePage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const createRule = useMutation(api.aiRules.createRule);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "CRITICAL">("NORMAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !trigger.trim() || !instruction.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createRule({
        companyId,
        name: name.trim(),
        trigger: trigger.trim(),
        instruction: instruction.trim(),
        priority,
        isActive: true,
      });
      router.push(`/admin/companies/${companyId}/ai/rules`);
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

  return (
    <div className="flex flex-col gap-4 w-full pb-8">
      <header className="flex flex-col gap-1">
        <Link 
          href={`/admin/companies/${companyId}/ai/rules`}
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to rules</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="w-6 h-6 text-brand" />
          Add a rule
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          Tell the assistant what to do when someone says something in particular.
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative max-w-4xl">
        
        {/* Name Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Name</span>
           </div>

           <div className="ml-1">
             <Field
               label="What to call this rule"
               autoFocus
               value={name}
               onChange={(e) => setName(e.target.value)}
               placeholder="For example: Office address"
             />
           </div>
        </section>

        {/* Trigger Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">When to use it</span>
           </div>

           <div className="ml-1">
             <Field
               label="Words or phrases that set it off"
               value={trigger}
               onChange={(e) => setTrigger(e.target.value)}
               placeholder="For example: where are you based, what is your address"
             />
           </div>
        </section>

        {/* Priority Block */}
        <section className="flex flex-col gap-3">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">3</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">How important it is</span>
           </div>
           
           <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-1">
              {(["LOW", "NORMAL", "HIGH", "CRITICAL"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-[10px] border transition-all text-left ${p === priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
                >
                  <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{p}</span>
                </button>
              ))}
           </div>
        </section>

        {/* Instruction Block */}
        <section className="flex flex-col gap-3 flex-1">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">4</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">What the assistant should do</span>
           </div>

           <div className="ml-1">
             <TextAreaField
               label="The instruction, in your own words"
               value={instruction}
               onChange={(e) => setInstruction(e.target.value)}
               placeholder="For example: Tell them our office is in London and offer to book a visit."
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
             disabled={!name.trim() || !trigger.trim() || !instruction.trim() || isSubmitting}
             className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
             <span>Create rule</span>
          </WriteButton>
        </div>
      </form>
    </div>
  );
}
