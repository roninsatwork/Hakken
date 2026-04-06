"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, Target, XCircle } from "lucide-react";

export default function SwarmStatusCard({ threadId }: { threadId: Id<"threads"> }) {
  const logs = useQuery(api.swarmRuntime.getSwarmLogs, { threadId });

  if (logs === undefined) return null; // loading
  if (logs.length === 0) return null; // no active swarm context

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex justify-center mb-6"
    >
      <div className="max-w-[95%] lg:max-w-[92%] w-full bg-sidebar/50 border border-border-dim backdrop-blur-3xl rounded-[24px] overflow-hidden shadow-lg shadow-black/5 divide-y divide-border-dim/50">
        
        {/* Header Section */}
        <div className="px-5 py-4 bg-foreground/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
             <Target className="w-4 h-4 text-brand" />
          </div>
          <div className="flex flex-col">
             <span className="text-[14px] font-medium text-foreground tracking-wide">Autonomous Agent Execution</span>
             <span className="text-[12px] text-muted font-light">Autonomous multi-agent orchestration</span>
          </div>
        </div>

        {/* Steps List */}
        <div className="px-5 py-3 flex flex-col gap-1">
          <AnimatePresence>
            {logs.map((log) => (
              <motion.div 
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: "auto", scale: 1 }}
                key={log._id}
                className={`flex items-start gap-3 py-2 ${log.isHeading ? "mt-2 mb-1" : ""}`}
              >
                <div className="mt-[2px] flex-shrink-0">
                   {log.status === "pending" && <CircleDashed className="w-4 h-4 text-muted/50" />}
                   {log.status === "running" && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
                   {log.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                   {log.status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex flex-col">
                   <span className={`text-[13px] ${log.isHeading ? "font-medium text-foreground" : "font-light text-foreground/80"} leading-relaxed`}>
                     {log.message}
                   </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
