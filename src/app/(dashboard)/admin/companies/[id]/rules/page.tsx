"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Loader2, Power, Trash2, Edit2, Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function CompanyAiRulesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  
  const rules = useQuery(api.aiRules.getRules, { companyId });
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRules = rules?.filter(
    rule => (rule.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.trigger.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.instruction.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getPriorityColor = (p: string) => {
    if (p === "CRITICAL") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (p === "HIGH") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    if (p === "NORMAL") return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand" />
            AI Rules
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Set rules for how the AI responds to users.
          </p>
        </div>

        <Link
          href={`/admin/companies/${companyId}/rules/new`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create Rule</span>
        </Link>
      </header>
      
      {/* Control Bar */}
      <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
        <div className="flex items-center gap-2 px-3 flex-1">
          <Search className="w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search triggers or instructions..."
            className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
          />
        </div>
      </div>
      
      {rules === undefined ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
          <BrainCircuit className="w-10 h-10 text-brand mb-4 opacity-80" />
          <h3 className="text-sm font-medium text-foreground mb-1">No Rules Yet</h3>
          <p className="text-[13px] text-secondary max-w-sm">
            Create rules to customize how the AI responds to specific questions or topics.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredRules.map((rule) => (
            <div key={rule._id} className="flex flex-col gap-2 justify-center p-4 sm:p-5 rounded-[12px] bg-sidebar/40 border border-border-dim transition-all hover:bg-sidebar/60 group cursor-pointer" onClick={() => router.push(`/admin/companies/${companyId}/rules/${rule._id}`)}>
               <div className="flex items-center justify-between gap-4 w-full">
                 <div className="flex items-center gap-3 min-w-0 pr-4">
                   <div className={`mt-[1px] px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-[0.1em] uppercase border flex-shrink-0 ${getPriorityColor(rule.priority)}`}>
                     {rule.priority}
                   </div>
                   <h3 className="text-[14px] font-bold text-foreground truncate group-hover:text-brand transition-colors">
                     {rule.name || `"${rule.trigger}"`}
                   </h3>
                 </div>
                 
                 <div className="flex items-center gap-4 flex-shrink-0 text-secondary ml-4 pr-1">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleActive({ id: rule._id, isActive: !rule.isActive }); }}
                      className="hover:text-foreground transition-colors"
                    >
                      <Power className={`w-4 h-4 ${rule.isActive ? 'text-orange-500' : 'opacity-40'}`} />
                    </button>
                    
                    <div className="h-4 w-px bg-border-dim" />
                    
                    <Link
                      href={`/admin/companies/${companyId}/rules/${rule._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground transition-colors"
                    >
                      <Edit2 className="w-4 h-4 opacity-70 hover:opacity-100" />
                    </Link>

                    <div className="h-4 w-px bg-border-dim" />

                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteRuleMutation({ id: rule._id }); }}
                      className="transition-colors group/trash"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500/60 group-hover/trash:text-rose-500" />
                    </button>
                 </div>
               </div>
               
               <p className={`text-[12.5px] line-clamp-1 font-mono tracking-wide opacity-50 ${rule.isActive ? 'text-muted' : 'text-muted/50'}`}>
                 {rule.instruction}
               </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
