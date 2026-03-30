"use client";

import { 
  ShieldCheck, 
  Users, 
  Activity,
  MessageSquare,
  TrendingUp,
  Loader2,
  PoundSterling
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const overview = useQuery(api.analytics.getPlatformOverview);

  return (
    <div className="flex flex-col gap-5 pb-8 antialiased">
      {/* Hero Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-brand" />
            Admin Dashboard
          </h1>
          <p className="text-[12px] text-secondary mt-0.5 tracking-wide">Be Prepared.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/20 bg-brand/5 text-brand text-[10px] font-bold tracking-widest uppercase shadow-sm">
          <Activity className="w-3 h-3 animate-pulse" />
          <span>Intercept Live</span>
        </div>
      </header>

      {overview === undefined ? (
        <div className="w-full h-[300px] flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           className="flex flex-col gap-5 w-full"
        >
          {/* Metric Cards Row */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Network Activation */}
            <div className="bg-card dark:bg-gradient-to-b dark:from-[#2e2e30] dark:to-[#222224] border border-border-dim rounded-[16px] px-5 py-4 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
              <div className="flex justify-between items-start mb-3 z-10 relative">
                <span className="text-secondary text-[12px] font-medium tracking-wide">Network Activation</span>
                <Users className="w-4 h-4 text-brand opacity-80" />
              </div>
              <div className="flex flex-col z-10 relative">
                <span className="text-[28px] font-bold text-foreground tracking-tight leading-none mb-2.5">{overview.totalUsers}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase">
                  <span className="text-brand font-bold bg-brand/10 px-1.5 py-0.5 rounded-[4px]">{overview.wauCount}</span>
                  <span className="text-secondary opacity-80">Weekly Active Users</span>
                </div>
              </div>
            </div>

            {/* Tactical Engagement */}
            <div className="bg-card dark:bg-gradient-to-b dark:from-[#2e2e30] dark:to-[#222224] border border-border-dim rounded-[16px] px-5 py-4 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
              <div className="flex justify-between items-start mb-3 z-10 relative">
                <span className="text-secondary text-[12px] font-medium tracking-wide">Tactical Engagement</span>
                <MessageSquare className="w-4 h-4 text-brand opacity-80" />
              </div>
              <div className="flex flex-col z-10 relative">
                <span className="text-[28px] font-bold text-foreground tracking-tight leading-none mb-2.5">{overview.totalThreads.toLocaleString()}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase">
                  <span className="text-[#10b981] font-bold bg-[#10b981]/10 px-1.5 py-0.5 rounded-[4px] border border-[#10b981]/20">{overview.avgInteractionDepth}x</span>
                  <span className="text-secondary opacity-80">Avg. Interaction Depth</span>
                </div>
              </div>
            </div>

            {/* Aggregate Burn */}
            <div className="bg-card dark:bg-gradient-to-b dark:from-[#2e2e30] dark:to-[#222224] border border-border-dim rounded-[16px] px-5 py-4 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
              <div className="flex justify-between items-start mb-3 z-10 relative">
                <span className="text-secondary text-[12px] font-medium tracking-wide">30-Day Burn Rate</span>
                <PoundSterling className="w-4 h-4 text-brand opacity-80" />
              </div>
              <div className="flex flex-col z-10 relative">
                <span className="text-[28px] font-bold text-foreground tracking-tight leading-none mb-2.5">£{(overview.cost30DGBP ?? 0).toFixed(4)}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase">
                  <span className="text-[#f43f5e] font-bold bg-[#f43f5e]/10 px-1.5 py-0.5 rounded-[4px] border border-[#f43f5e]/20">£{(overview.costPerActiveUserGBP ?? 0).toFixed(4)}</span>
                  <span className="text-secondary opacity-80">Avg. per active user</span>
                </div>
              </div>
            </div>
          </section>

          {/* Top Active Users Leaderboard */}
          <section className="bg-card/40 border border-border-dim rounded-[20px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl">
             <div className="px-6 py-5 border-b border-border-dim bg-background/50 flex flex-col gap-1.5 relative">
               <div className="absolute right-0 top-0 w-48 h-48 bg-brand/5 blur-[50px] rounded-full pointer-events-none -translate-y-24 translate-x-10" />
               <div className="flex items-center gap-2.5">
                 <div className="w-7 h-7 rounded-[6px] bg-brand/10 border border-brand/20 flex items-center justify-center">
                   <TrendingUp className="w-3.5 h-3.5 text-brand" />
                 </div>
                 <h2 className="text-[14px] font-bold text-foreground">Action Takers</h2>
               </div>
               <p className="text-[12px] text-secondary tracking-wide ml-9">
                 User accounts generating the highest volume of AI interactions over the trailing 30 days.
               </p>
             </div>

             <div className="flex flex-col bg-card/10">
               {overview.topUsers.length === 0 ? (
                 <div className="p-10 flex flex-col gap-2 items-center justify-center text-muted font-mono tracking-widest uppercase opacity-60">
                   <ShieldCheck className="w-6 h-6 mb-1" />
                   <span className="text-[12px]">No intelligence logs captured</span>
                 </div>
               ) : (
                 overview.topUsers.map((u, i) => (
                   <div key={u.userId} className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-border-dim/50 last:border-0 hover:bg-foreground/[0.02] transition-colors group">
                      
                      {/* Identity Graph */}
                      <div className="flex items-center gap-4 relative">
                        {/* Status Pulse on Top Earner */}
                        {i === 0 && <div className="absolute left-[28px] top-4 w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse shadow-[0_0_10px_#10b981]" />}
                        
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-6 text-center group-hover:text-brand transition-colors">#{i + 1}</span>
                        <img src={u.image} alt={u.name} className="w-8 h-8 rounded-full border border-border-dim object-cover shadow-sm bg-foreground/10" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-semibold text-foreground tracking-wide group-hover:text-brand transition-colors">{u.name}</span>
                          <span className="text-[10px] text-muted tracking-widest uppercase font-mono">{u.email}</span>
                        </div>
                      </div>

                      {/* Financial Telemetry */}
                      <div className="flex items-center gap-6 mt-3 md:mt-0 pl-[60px] md:pl-0">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] uppercase font-mono text-secondary/60 tracking-[0.2em] mb-1 flex items-center gap-1.5">
                            <MessageSquare className="w-[10px] h-[10px] text-brand/70" />
                            Messages
                          </span>
                          <span className="text-[14px] font-bold text-foreground bg-foreground/5 px-2.5 py-0.5 rounded-[6px] border border-border-dim/40 min-w-[50px] text-right">
                            {u.messageCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-px h-8 bg-border-dim/60 hidden md:block" />
                        <div className="flex flex-col items-end min-w-[80px]">
                          <span className="text-[9px] uppercase font-mono text-secondary/60 tracking-[0.2em] mb-1 flex items-center gap-1.5">
                            <PoundSterling className="w-[10px] h-[10px] text-[#f43f5e]/70" />
                            Est. Cost
                          </span>
                          <span className="text-[14px] font-bold text-[#f43f5e] tracking-tight">£{u.costGBP.toFixed(4)}</span>
                        </div>
                      </div>

                   </div>
                 ))
               )}
             </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
