"use client";

import type { ReactNode } from "react";
import { Activity, Cpu, LayoutTemplate, ShieldCheck } from "lucide-react";

export default function WidgetSandboxPresentation({
  headerLayer,
  contentLayer,
  actions,
}: {
  headerLayer: string;
  contentLayer: string;
  actions: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0a0a0b] text-[#111] dark:text-[#eaeaea] font-sans relative overflow-hidden transition-colors">
      {/* Fake Navigation Bar */}
      <header className={`sticky top-0 w-full h-16 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-black/5 dark:border-white/5 ${headerLayer} px-8 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-[8px] flex items-center justify-center shadow-md">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[15px] tracking-tight">AcmeCorp System</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#666] dark:text-[#999]">
          <a href="#" className="hover:text-brand transition-colors">Platform</a>
          <a href="#" className="hover:text-brand transition-colors">Solutions</a>
          <a href="#" className="hover:text-brand transition-colors">Enterprise</a>
          <a href="#" className="hover:text-brand transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono tracking-widest uppercase py-1 px-2 rounded bg-black/5 dark:bg-white/10 text-[#666] dark:text-[#aaa]">
            Sandbox Mode
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <main className={`max-w-6xl mx-auto px-8 pt-32 pb-24 relative ${contentLayer}`}>
        <div className="absolute top-20 right-0 w-96 h-96 bg-brand/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span className="text-[13px] font-bold tracking-widest uppercase text-emerald-500">Security Verified</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
            The ultimate layer for <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-blue-500">enterprise orchestration.</span>
          </h1>
          <p className="text-lg text-[#666] dark:text-[#888] leading-relaxed mt-4">
            This is a simulated Sandbox Environment hosted safely inside Hakken. The external widget loader script has been automatically injected into this page&apos;s DOM.
          </p>

          {actions}
        </div>

        {/* Metrics Grid (Dummy Data) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32">
          <div className="p-8 rounded-[24px] bg-white dark:bg-card border border-black/5 dark:border-white/5 shadow-sm flex flex-col gap-4">
            <Activity className="w-6 h-6 text-brand" />
            <h3 className="font-bold text-lg">Real-time Synchronization</h3>
            <p className="text-[14px] text-[#666] dark:text-[#999] leading-relaxed">
              Observe how the Hakken widget handles immediate websocket upgrades without disrupting the host thread.
            </p>
          </div>
          <div className="p-8 rounded-[24px] bg-white dark:bg-card border border-black/5 dark:border-white/5 shadow-sm flex flex-col gap-4">
            <LayoutTemplate className="w-6 h-6 text-brand" />
            <h3 className="font-bold text-lg">Isolated Stylesheets</h3>
            <p className="text-[14px] text-[#666] dark:text-[#999] leading-relaxed">
              The target widget runs safely within its own iframe boundaries to guarantee CSS isolation from aggressive host stylesheets.
            </p>
          </div>
          <div className="p-8 rounded-[24px] bg-white dark:bg-card border border-black/5 dark:border-white/5 shadow-sm flex flex-col gap-4">
            <Cpu className="w-6 h-6 text-brand" />
            <h3 className="font-bold text-lg">Agnostic Integration</h3>
            <p className="text-[14px] text-[#666] dark:text-[#999] leading-relaxed">
              Test your agent&apos;s capability to understand varying user intent while inheriting the specific UI bindings.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
