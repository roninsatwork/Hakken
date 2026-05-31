"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useState, use } from "react";
import {
  Cpu,
  CheckCircle2,
  Plus,
  Trash2,
  Wrench
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type AgentTool = Doc<"aiTools"> & { bindingId: Id<"agentTools"> };
type ToolRole = Doc<"aiTools">["requiredRole"];

export default function AgentIntegrationsPage({ params }: { params: Promise<{ id: Id<"agents"> }> }) {
  const t = useTranslations("admin.agents.details.integrations");
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.id;

  // Retrieve global available integrations/tools
  const globalTools = (useQuery(api.aiTools.getTools) || []) as Doc<"aiTools">[];

  // Retrieve bindings for this specific agent
  const agentTools = (useQuery(api.aiTools.getAgentTools, { agentId }) || []) as AgentTool[];

  const toggleToolMutation = useMutation(api.aiTools.toggleAgentTool);
  const [processingId, setProcessingId] = useState<Id<"aiTools"> | null>(null);

  const handleToggleTool = async (toolId: Id<"aiTools">, isBound: boolean) => {
    if (processingId) return;
    setProcessingId(toolId);
    try {
      await toggleToolMutation({
        agentId,
        toolId,
        action: isBound ? "UNBIND" : "BIND"
      });
    } catch {
      alert(t("errors.assignFailed"));
    } finally {
      setProcessingId(null);
    }
  };

  const getRoleColor = (role: ToolRole) => {
    if (role === "SUPER_ADMIN") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (role === "ADMIN") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased pb-12">
      <div className="flex flex-col gap-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground tracking-wide flex items-center gap-2">
              <Cpu className="w-5 h-5 text-brand" />
              {t("title")}
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-[14px] font-semibold text-foreground">{t("sectionTitle")}</h3>

          {globalTools.length === 0 ? (
            <div className="w-full py-12 text-center text-muted text-[13px] font-mono border border-dashed border-border-dim/50 rounded-[12px] flex flex-col items-center justify-center gap-3">
              <Wrench className="w-6 h-6 opacity-30" />
              <span>{t("empty")}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {globalTools.map((tool, idx) => {
                const isBound = agentTools.some(at => at._id === tool._id);
                const isProcessing = processingId === tool._id;

                return (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    key={tool._id}
                    className={`flex flex-col p-5 rounded-[16px] border backdrop-blur-xl transition-all ${isBound
                      ? "bg-brand/5 border-brand/30 shadow-md"
                      : "bg-card border-border-dim opacity-70 hover:opacity-100"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4 w-full">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${getRoleColor(tool.requiredRole)}`}>
                            {tool.requiredRole}
                          </div>
                          <h3 className="text-[15px] font-semibold text-foreground truncate">
                            {tool.name}
                          </h3>
                        </div>
                        <p className="text-[12px] text-secondary line-clamp-2 mt-1">
                          {tool.description}
                        </p>
                      </div>

                      <button
                        onClick={() => handleToggleTool(tool._id, isBound)}
                        disabled={isProcessing}
                        className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all border ${isBound
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20"
                          : "bg-foreground text-background border-transparent hover:opacity-90"
                          } disabled:opacity-50`}
                      >
                        {isBound ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-dim/50 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-muted truncate">
                        ID: {tool.handlerMapping}
                      </span>
                      {isBound && (
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t("card.assigned")}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
