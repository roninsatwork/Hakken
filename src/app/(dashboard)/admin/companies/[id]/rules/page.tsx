"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Loader2, Play, Pause, Trash2, Edit2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function CompanyAiRulesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  
  const rules = useQuery(api.aiRules.getRules, { companyId });
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">AI Protocol Rules</h2>
          <p className="text-secondary text-[13px] mt-1">Define strict behavioral rules for the AI when interacting with the company's data.</p>
        </div>
        <Link 
          href={`/admin/companies/${companyId}/rules/new`}
          className="h-9 px-4 rounded-[10px] bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:bg-foreground/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Rule
        </Link>
      </div>
      
      {rules === undefined ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
          <BrainCircuit className="w-10 h-10 text-brand mb-4 opacity-80" />
          <h3 className="text-sm font-medium text-foreground mb-1">No Active Protocols</h3>
          <p className="text-[13px] text-secondary max-w-sm">
            Create custom triggers to override the AI's default behavior or inject specific operational knowledge dynamically.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rules.map((rule) => (
            <div key={rule._id} className="p-5 rounded-[12px] bg-sidebar/50 border border-border-dim flex flex-col gap-3 relative group">
               <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-[#10b981]">{rule.priority} Priority</span>
                    <h4 className="text-[14px] font-bold mt-1 text-foreground">IF USER MENTIONS: <span className="text-secondary ml-1 font-mono text-[12px] bg-foreground/5 px-2 py-0.5 rounded">{rule.trigger}</span></h4>
                  </div>
                  <div className="flex items-center gap-2">
                     <button
                        onClick={() => toggleActive({ id: rule._id, isActive: !rule.isActive })}
                        className={`p-2 rounded-lg border flex items-center gap-2 text-[12px] font-bold transition-all ${rule.isActive ? "border-[#10b981]/30 text-[#10b981] bg-[#10b981]/10 hover:bg-[#10b981]/20" : "border-border-dim text-secondary hover:text-foreground"}`}
                      >
                        {rule.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {rule.isActive ? "ACTIVE" : "PAUSED"}
                      </button>
                      
                      <Link
                        href={`/admin/companies/${companyId}/rules/${rule._id}`}
                        className="p-2 rounded-lg border border-border-dim text-secondary hover:text-foreground transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>

                      <button
                        onClick={() => deleteRuleMutation({ id: rule._id })}
                        className="p-2 rounded-lg border border-border-dim text-secondary hover:text-red-500 hover:border-red-500/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                  </div>
               </div>
               <div className="bg-[#111111]/40 border border-white/5 p-4 rounded-lg font-mono text-[13px] text-secondary leading-relaxed mt-2 hidden sm:block">
                 THEN: {rule.instruction}
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
