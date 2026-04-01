"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Loader2,
  Workflow
} from "lucide-react";

export default function AgentLogsDashboard() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on new searches
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const queryParams = { 
     agentId, 
     searchTerm: debouncedSearch, 
     page, 
     pageSize 
  };
  
  const logData = useQuery(api.agentLogs.getOffsetPaginated, queryParams);
  const seedMutation = useMutation(api.agentLogs.seedForAgent);

  const handleSeed = async () => {
    try {
      await seedMutation({ agentId });
    } catch (e) {
      console.error("Failed to seed dummy logs", e);
    }
  };

  const isLoading = logData === undefined;
  const logs = logData?.data || [];
  const totalCount = logData?.totalCount || 0;
  const totalPages = logData?.totalPages || 1;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 pb-12 w-full max-w-[1400px]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-dim/50 pb-6 w-full mt-2">
        <div className="flex flex-col gap-2">
           <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
             <FileText className="w-5 h-5 text-indigo-500" />
             AI Execution Logs
           </h2>
           <p className="text-[14px] text-secondary max-w-2xl">
             Raw debugging feed of internal logic loops, tool dispatches, and natural language outputs autonomously executed by the agent.
           </p>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3 relative w-full md:w-[350px]">
          <Search className="w-4 h-4 text-muted absolute left-4" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search prompts and logs..."
            className="w-full bg-sidebar/50 border border-border-dim rounded-full py-2.5 pl-11 pr-4 text-[13px] text-foreground placeholder:text-muted outline-none transition-all focus:border-indigo-500/50 focus:bg-sidebar shadow-sm"
          />
        </div>
      </header>

      {/* Logs Table Container */}
      <div className="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-border-dim/50 bg-sidebar/40">
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[180px]">Timestamp</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[220px]">Interaction Phase</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase">Prompt / Input Payload</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase">Execution Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-secondary">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 opacity-80" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 w-full">
                       <DatabaseZap className="w-8 h-8 text-muted/30" />
                       <div className="flex flex-col gap-1 items-center">
                          <span className="text-[14px] font-medium text-foreground tracking-wide">
                            {debouncedSearch ? "No logs match your search." : "Log index is empty"}
                          </span>
                          <span className="text-muted text-[12px]">
                            {debouncedSearch ? "Try a different string." : "The tracking server has not intercepted any AI logic iterations yet."}
                          </span>
                       </div>
                       
                       {!debouncedSearch && (
                         <button 
                           onClick={handleSeed}
                           className="mt-4 px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500 hover:text-white rounded-[8px] text-[12px] font-bold tracking-widest uppercase transition-colors"
                         >
                            Seed Mock I/O Traces
                         </button>
                       )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="group hover:bg-white/[0.02] transition-colors items-start">
                    <td className="px-5 py-5 align-top">
                      <div className="flex flex-col gap-0.5 mt-0.5">
                         <span className="text-[13px] font-medium text-foreground tracking-wide">
                           {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}
                         </span>
                         <span className="text-[11px] font-mono text-muted">
                           {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                         </span>
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="flex items-center gap-2 text-[11px] font-mono font-medium tracking-wide w-max px-2.5 py-1 rounded-[6px] border bg-foreground/[0.03] border-border-dim/60">
                         {log.interactionType.includes("TOOL") ? (
                            <Workflow className="w-3.5 h-3.5 text-brand" />
                         ) : log.interactionType.includes("ERROR") ? (
                            <DatabaseZap className="w-3.5 h-3.5 text-rose-500" />
                         ) : (
                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                         )}
                         <span className="text-foreground/80">{log.interactionType}</span>
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top max-w-[300px]">
                       <div className="text-[13px] leading-relaxed text-secondary/90 bg-black/20 p-3 rounded-[8px] border border-white/5 font-mono whitespace-pre-wrap">
                          {log.promptContent}
                       </div>
                    </td>
                    <td className="px-5 py-5 align-top max-w-[300px]">
                       <div className="text-[13px] leading-relaxed text-foreground/90 bg-foreground/5 p-3 rounded-[8px] border border-white/5 font-mono whitespace-pre-wrap">
                          {log.responseContent}
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Numbered Pagination Footer */}
        <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
           <div className="text-[12px] font-medium text-secondary">
             {totalCount > 0 ? (
               <span>Showing <strong className="text-foreground">{(page - 1) * pageSize + 1}</strong> to <strong className="text-foreground">{Math.min(page * pageSize, totalCount)}</strong> of <strong className="text-foreground">{totalCount}</strong> logs</span>
             ) : (
               <span>No logs available</span>
             )}
           </div>

           <div className="flex items-center gap-3">
             <button 
               onClick={() => setPage(p => Math.max(1, p - 1))}
               disabled={page === 1 || isLoading}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
             >
                <ChevronLeft className="w-4 h-4" />
                Prev
             </button>
             
             <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
                Page <span className="text-foreground mx-1">{page}</span> of <span className="text-foreground ml-1">{totalPages}</span>
             </div>

             <button 
               onClick={() => setPage(p => Math.min(totalPages, p + 1))}
               disabled={page >= totalPages || isLoading}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
             >
                Next
                <ChevronRight className="w-4 h-4" />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
