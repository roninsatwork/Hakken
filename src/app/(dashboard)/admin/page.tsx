"use client";

import { 
  ShieldCheck, 
  Cpu, 
  Users, 
  Activity,
  Zap,
  Lock
} from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="flex flex-col gap-10 pb-12">
      {/* Hero Header */}
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-5xl font-bold text-foreground tracking-tighter">Admin Intelligence</h1>
          <p className="text-secondary text-[14px] font-medium opacity-70">Sonae System Protocol: Alpha-7</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 rounded-full border border-brand/20 bg-brand/5 text-brand text-[12px] font-bold tracking-widest uppercase">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>Systems Nominal</span>
        </div>
      </header>

      {/* Metric Cards Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Active Admins Card */}
        <div className="bg-card dark:bg-gradient-to-b dark:from-[#1c1c1c] dark:to-[#121212] border border-border-dim rounded-[16px] p-6 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
          <div className="flex justify-between items-start mb-6 z-10 relative">
            <span className="text-secondary text-[13px] font-medium tracking-wide">Active Administrators</span>
            <Lock className="w-4 h-4 text-muted" />
          </div>
          <div className="flex flex-col z-10 relative">
            <span className="text-[44px] font-semibold text-foreground tracking-tight leading-none mb-3">04</span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
              <span className="text-[#10b981] font-bold">Online Now</span>
            </div>
          </div>
        </div>

        {/* AI Performance Card */}
        <div className="bg-card dark:bg-gradient-to-b dark:from-[#1c1c1c] dark:to-[#121212] border border-border-dim rounded-[16px] p-6 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
          <div className="flex justify-between items-start mb-6 z-10 relative">
            <span className="text-secondary text-[13px] font-medium tracking-wide">AI Engine Load</span>
            <Cpu className="w-4 h-4 text-brand" />
          </div>
          <div className="flex flex-col z-10 relative">
            <span className="text-[44px] font-semibold text-foreground tracking-tight leading-none mb-3">12.4%</span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
              <span className="text-[#10b981] font-bold">-2.1%</span>
              <span className="text-secondary">vs peak</span>
            </div>
          </div>
        </div>

        {/* Global Users Card */}
        <div className="bg-card dark:bg-gradient-to-b dark:from-[#1c1c1c] dark:to-[#121212] border border-border-dim rounded-[16px] p-6 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all hover:border-brand/30">
          <div className="flex justify-between items-start mb-6 z-10 relative">
            <span className="text-secondary text-[13px] font-medium tracking-wide">Global Users</span>
            <Users className="w-4 h-4 text-muted" />
          </div>
          <div className="flex flex-col z-10 relative">
            <span className="text-[44px] font-semibold text-foreground tracking-tight leading-none mb-3">1,284</span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
              <span className="text-brand font-bold">+122</span>
              <span className="text-secondary">this week</span>
            </div>
          </div>
        </div>
      </section>

      {/* System Health Section */}
      <section className="bg-card dark:bg-gradient-to-b dark:from-[#161616] dark:to-[#0f0f0f] border border-border-dim rounded-[16px] p-7 flex flex-col gap-8 shadow-md dark:shadow-2xl overflow-hidden relative">
        <div className="flex flex-col gap-1 z-10 relative">
          <div className="flex items-center gap-2 mb-1">
             <Zap className="w-4 h-4 text-brand" />
             <span className="text-secondary text-[13px] font-medium tracking-wide">System Health Index</span>
          </div>
          <span className="text-[34px] font-semibold text-foreground tracking-tight leading-none mt-1">99.98%</span>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider mt-2">
            <span className="text-[#10b981] font-bold">Stable</span>
            <span className="text-secondary">last 30 days</span>
          </div>
        </div>

        {/* Visual Graph Mock */}
        <div className="h-[140px] w-full flex items-end gap-1 px-2 pb-2 opacity-50">
          {Array.from({ length: 40 }).map((_, i) => (
            <div 
              key={i} 
              className="flex-1 bg-brand/20 rounded-t-[2px] transition-all hover:bg-brand/40"
              style={{ height: `${Math.random() * 40 + 60}%` }}
            />
          ))}
        </div>
        
        {/* Tactical Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
      </section>
    </div>
  );
}
