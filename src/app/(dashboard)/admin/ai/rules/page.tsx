"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  BrainCircuit,
  Plus,
  Search,
  Power,
  PowerOff,
  Edit3,
  Trash2,
  AlertOctagon,
  RefreshCcw
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export default function RulesDashboard() {
  const rules = useQuery(api.aiRules.getRules);
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Derived Filter State
  const filteredRules = rules?.filter(
    rule => rule.trigger.toLowerCase().includes(searchTerm.toLowerCase()) || 
            rule.instruction.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDeleteRule = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteRuleMutation({ id: deleteId });
      setDeleteId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    if (priority === "CRITICAL") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (priority === "HIGH") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    if (priority === "NORMAL") return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand" />
            AI Rules Engine
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Dynamic semantic routing triggers forcing strict LLM behavior branches.
          </p>
        </div>
        
        <Link 
          href="/admin/ai/rules/new"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Rule</span>
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

      {/* Listing Area */}
      <div className="flex flex-col gap-3">
        {rules === undefined ? (
          // Skeletons
          [1,2,3].map(i => (
             <div key={i} className="w-full h-[80px] bg-card/60 animate-pulse rounded-[14px] border border-border-dim/50" />
          ))
        ) : filteredRules.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-border-dim rounded-[14px]">
             <BrainCircuit className="w-8 h-8 text-muted/30" />
             <span className="text-muted text-[13px] font-medium tracking-widest uppercase">No Logic Branches Found</span>
          </div>
        ) : (
          filteredRules.map((rule, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={rule._id}
              className={`flex items-start sm:items-center justify-between gap-4 p-5 rounded-[16px] border backdrop-blur-xl transition-all ${
                rule.isActive 
                  ? "bg-card border-border-dim shadow-md dark:shadow-xl hover:border-brand/30" 
                  : "bg-background/50 border-border-dim/50 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
              }`}
            >
               {/* Metadata Tree */}
               <Link href={`/admin/ai/rules/${rule._id}`} className="flex flex-col gap-1.5 flex-1 min-w-0 group cursor-pointer pr-4">
                 <div className="flex items-center gap-3">
                   <div className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${getPriorityColor(rule.priority)}`}>
                     {rule.priority}
                   </div>
                   <h3 className="text-[15px] font-semibold text-foreground truncate group-hover:text-brand transition-colors">
                     "{rule.trigger}"
                   </h3>
                 </div>
                 <p className="text-[12px] text-muted line-clamp-1 pr-6 font-mono tracking-wide group-hover:text-foreground/80 transition-colors">
                   {rule.instruction}
                 </p>
               </Link>

               {/* Interaction Tools */}
               <div className="flex items-center gap-2 flex-shrink-0">
                 <button 
                  onClick={() => toggleActive({ id: rule._id, isActive: !rule.isActive })}
                  className="p-2 rounded-full border border-transparent hover:bg-foreground/5 hover:border-border-dim text-secondary transition-colors"
                  title={rule.isActive ? "Deactivate Rule" : "Activate Rule"}
                 >
                   {rule.isActive ? <Power className="w-4 h-4 text-brand" /> : <PowerOff className="w-4 h-4" />}
                 </button>

                 <div className="h-4 w-px bg-border-dim/50 mx-1" />

                 <Link 
                   href={`/admin/ai/rules/${rule._id}`}
                   className="p-2 rounded-full border border-transparent hover:bg-foreground/5 hover:border-border-dim text-secondary transition-colors"
                   title="Edit Implementation"
                 >
                   <Edit3 className="w-4 h-4" />
                 </Link>

                 <button 
                   onClick={() => setDeleteId(rule._id)}
                   className="p-2 rounded-full border border-transparent hover:bg-rose-500/10 hover:border-rose-500/20 text-rose-500/70 hover:text-rose-500 transition-colors"
                   title="Delete Protocol"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Restricted Deletion Sonae Modal */}
      <SonaeModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Sever Rule Protocol"
        size="sm"
      >
        <div className="flex flex-col gap-8">
           <div className="flex flex-col gap-2">
             <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
             <p className="text-[14px] text-secondary leading-relaxed">
               You are about to irreversibly sever this behavioral trigger from the central logic engine. The AI will no longer correlate or respond to this specific instruction matrix.
             </p>
             <p className="text-[13px] font-bold text-foreground mt-2">
               This action cannot be undone.
             </p>
           </div>
           
           <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
             <button 
                onClick={() => setDeleteId(null)}
                className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim"
             >
               Abort Deletion
             </button>
             <button 
                onClick={handleDeleteRule}
                disabled={isDeleting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
             >
               {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
               <span>Confirm Severance</span>
             </button>
           </div>
        </div>
      </SonaeModal>
    </div>
  );
}
