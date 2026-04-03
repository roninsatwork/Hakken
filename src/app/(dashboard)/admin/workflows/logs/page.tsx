"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Search,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export default function WorkflowLogsPage() {
  const router = useRouter();
  const executions = useQuery((api as any).scheduler.getWorkflowExecutions) || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filteredLogs = executions.filter((exec: any) => 
    (exec.workflowName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (exec.status || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (exec.triggerType || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex flex-col justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Activity className="w-6 h-6 text-brand" />
            Execution Logs
          </h1>
          <p className="text-[13px] text-secondary mt-1">Real-time audit log of all autonomous and manually invoked workflow executions.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search logs by workflow name, status, or trigger..." 
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Workflow</th>
                <th className="px-4 py-3 font-medium">Triggered By</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                      No logs match your search or no logs collected yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedLogs.map((exec: any) => (
                      <motion.tr 
                        key={exec._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/workflows/logs/${exec._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
                      >
                        
                        <td className="px-4 py-3">
                            {exec.status === "SUCCESS" && <span className="flex items-center gap-1.5 text-green-500 font-medium text-[12px] uppercase"><CheckCircle2 className="w-4 h-4" /> SUCCESS</span>}
                            {exec.status === "FAILED" && <span className="flex items-center gap-1.5 text-red-500 font-medium text-[12px] uppercase"><XCircle className="w-4 h-4" /> FAILED</span>}
                            {exec.status === "RUNNING" && <span className="flex items-center gap-1.5 text-blue-500 font-medium text-[12px] uppercase"><Loader2 className="w-4 h-4 animate-spin" /> RUNNING</span>}
                        </td>
                        
                        <td className="px-4 py-3">
                           <span className="truncate text-[13px] text-foreground/80 font-medium">
                                {exec.workflowName}
                           </span>
                           {exec.state && <p className="text-[11px] text-muted mt-0.5 max-w-[300px] truncate">{exec.state}</p>}
                        </td>
                        
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                              <Play className="w-3 h-3 text-muted" />
                              <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                                {exec.triggerType}
                              </span>
                            </div>
                        </td>

                        <td className="px-4 py-3">
                            <span className="text-[12px] text-muted">
                                {new Date(exec.startedAt).toLocaleString()}
                            </span>
                        </td>
                        
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
            <div className="flex items-center gap-2 text-[12px] text-muted">
                <span>Showing</span>
                <span className="font-medium text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
                <span>to</span>
                <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                <span>of</span>
                <span className="font-medium text-foreground">{totalItems}</span>
                <span>logs</span>
            </div>
            <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
