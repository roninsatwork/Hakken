"use client";

import { useParams } from "next/navigation";
import { BrainCircuit, Activity } from "lucide-react";

export default function CompanyOverviewPage() {
  
  return (
     <div className="flex flex-col gap-8">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="p-6 rounded-[24px] bg-sidebar/40 border border-border-dim backdrop-blur-xl flex flex-col gap-2 relative overflow-hidden group">
            <h3 className="text-[11px] font-mono tracking-widest text-muted uppercase z-10">Gross Execution Cost</h3>
            <p className="text-3xl font-light tracking-tight text-brand z-10">£0.00</p>
            <BrainCircuit className="absolute -right-4 -bottom-4 w-32 h-32 text-brand/[0.03] group-hover:text-brand/[0.08] transition-colors" />
         </div>

         <div className="p-6 rounded-[24px] bg-sidebar/40 border border-border-dim backdrop-blur-xl flex flex-col gap-2 relative overflow-hidden group">
            <h3 className="text-[11px] font-mono tracking-widest text-muted uppercase z-10">Token Volume</h3>
            <p className="text-3xl font-light tracking-tight text-foreground z-10">0</p>
            <Activity className="absolute -right-4 -bottom-4 w-32 h-32 text-foreground/[0.02] group-hover:text-foreground/[0.05] transition-colors" />
         </div>
       </div>
       
       <div className="flex items-center justify-center p-12 border border-border-dim/50 border-dashed rounded-[24px] bg-sidebar/20">
          <p className="text-secondary text-[13px] text-center max-w-sm">
             The global AI Cost analytics pipeline is being retrofitted to aggregate these specific tenant threads.
          </p>
       </div>
     </div>
  );
}
