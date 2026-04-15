"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { Scale, BrainCircuit, Plus, Search, Power, PowerOff, RefreshCcw, Trash2, Edit2, AlertOctagon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";

export default function AgentRulesPage() {
  const t = useTranslations("admin.agents.details.rules");
  const params = useParams();
  const router = useRouter();
  const agentId = (params?.id as Id<"agents">) || undefined;

  const rules = useQuery(api.aiRules.getRules, agentId ? { agentId } : "skip");
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);

  const [searchTerm, setSearchTerm] = useState("");

  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredRules = rules?.filter(
    rule => (rule.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.trigger.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const getPriorityColor = (p: string) => {
    if (p === "CRITICAL") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (p === "HIGH") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    if (p === "NORMAL") return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            {t("subtitle")}
          </p>
        </div>

        <Link
          href={`/admin/agents/${agentId}/rules/new`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t("addButton")}</span>
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
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
          />
        </div>
      </div>

      {/* Listing Area */}
      <div className="flex flex-col gap-3">
        {rules === undefined ? (
          // Skeletons
          [1, 2, 3].map(i => (
            <div key={i} className="w-full h-[80px] bg-card/60 animate-pulse rounded-[14px] border border-border-dim/50" />
          ))
        ) : filteredRules.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-border-dim rounded-[14px]">
            <BrainCircuit className="w-8 h-8 text-muted/30" />
            <span className="text-muted text-[13px] font-medium tracking-widest uppercase">{t("empty")}</span>
          </div>
        ) : (
          filteredRules.map((rule, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={rule._id}
              className="flex flex-col gap-2 justify-center p-4 sm:p-5 rounded-[12px] bg-sidebar/40 border border-border-dim transition-all hover:bg-sidebar/60 group cursor-pointer"
              onClick={() => router.push(`/admin/agents/${agentId}/rules/${rule._id}`)}
            >
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
                      title={rule.isActive ? t("table.tooltips.deactivate") : t("table.tooltips.activate")}
                    >
                      <Power className={`w-4 h-4 ${rule.isActive ? 'text-orange-500' : 'opacity-40'}`} />
                    </button>
                    
                    <div className="h-4 w-px bg-border-dim" />
                    
                    <Link
                      href={`/admin/agents/${agentId}/rules/${rule._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground transition-colors"
                      title={t("table.tooltips.edit")}
                    >
                      <Edit2 className="w-4 h-4 opacity-70 hover:opacity-100" />
                    </Link>

                    <div className="h-4 w-px bg-border-dim" />

                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteId(rule._id); }}
                      className="transition-colors group/trash"
                      title={t("table.tooltips.delete")}
                    >
                      <Trash2 className="w-4 h-4 text-rose-500/60 group-hover/trash:text-rose-500" />
                    </button>
                 </div>
               </div>
               
               <p className={`text-[12.5px] line-clamp-1 font-mono tracking-wide opacity-50 ${rule.isActive ? 'text-muted' : 'text-muted/50'}`}>
                 {rule.instruction}
               </p>
            </motion.div>
          ))
        )}
      </div>

      {/* Restricted Deletion Sonae Modal */}
      <SonaeModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={t("deleteModal.title")}
        size="sm"
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
            <p className="text-[14px] text-secondary leading-relaxed">
              {t("deleteModal.description")}
            </p>
            <p className="text-[13px] font-bold text-foreground mt-2">
              {t("deleteModal.warning")}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
            <button
              onClick={() => setDeleteId(null)}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim"
            >
              {t("deleteModal.abort")}
            </button>
            <button
              onClick={handleDeleteRule}
              disabled={isDeleting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
            >
              {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{t("deleteModal.confirm")}</span>
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
