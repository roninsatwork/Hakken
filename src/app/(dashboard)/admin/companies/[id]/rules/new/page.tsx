"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { BrainCircuit, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewCompanyRulePage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const createRule = useMutation(api.aiRules.createRule);

  const [trigger, setTrigger] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "CRITICAL">("NORMAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger.trim() || !instruction.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createRule({
        companyId,
        trigger: trigger.trim(),
        instruction: instruction.trim(),
        priority,
        isActive: true,
      });
      router.push(`/admin/companies/${companyId}/rules`);
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

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <header className="flex flex-col gap-1">
        <Link 
          href={`/admin/companies/${companyId}/rules`}
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Company Rules</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="w-6 h-6 text-brand" />
          Construct Semantic Rule
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          Map explicit user behavioral triggers to rigorous framework instructions for this company.
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-10 flex-1 relative max-w-4xl">
        
        {/* Trigger Block */}
        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Semantic Trigger Vector</span>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Keyword Correlation Entity</label>
             <input
               autoFocus
               value={trigger}
               onChange={(e) => setTrigger(e.target.value)}
               placeholder="e.g. 'book a meeting' or 'refund'"
               className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
             />
           </div>
        </section>

        {/* Priority Block */}
        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Behavioral Priority Tier</span>
           </div>
           
           <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-1">
              {(["LOW", "NORMAL", "HIGH", "CRITICAL"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex flex-col items-start gap-1 p-4 rounded-[12px] border transition-all text-left ${p === priority ? selectedClasses[p] : `border-border-dim bg-transparent text-secondary ${priorityClasses[p]}`}`}
                >
                  <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{p}</span>
                </button>
              ))}
           </div>
        </section>

        {/* Instruction Block */}
        <section className="flex flex-col gap-4 flex-1">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">3</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Execution Framework Instructions</span>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1 h-[300px]">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">LLM Execution Context</label>
             <textarea
               value={instruction}
               onChange={(e) => setInstruction(e.target.value)}
               placeholder="e.g. Inform the user that Sonae does not handle refunds..."
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
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
             <span>Compile New Logic Branch</span>
          </button>
        </div>
      </form>
    </div>
  );
}
