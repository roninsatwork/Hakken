"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Loader2, ShieldCheck, Cpu, LayoutTemplate, Activity } from "lucide-react";

export default function WidgetSandboxPage() {
  const params = useParams();
  const widgetId = params.widgetId as Id<"widgets">;
  
  const widget = useQuery(api.widgets.getWidgetById, { widgetId });
  const scriptMountedRef = useRef(false);

  useEffect(() => {
    // We strictly wait for the widget data to resolve before injecting
    if (widget && !scriptMountedRef.current) {
      scriptMountedRef.current = true;
      const script = document.createElement("script");
      script.src = `/embed.js?t=${new Date().getTime()}`;
      // To mimic a client environment, we pass the data attribute
      script.setAttribute("data-widget-id", widgetId);
      script.async = true;
      document.body.appendChild(script);

      return () => {
        scriptMountedRef.current = false;
        // Clean up the script and widget DOM elements if navigating away
        if (script.parentNode) script.parentNode.removeChild(script);
        const widgetContainer = document.getElementById("sonae-widget-container");
        if (widgetContainer) widgetContainer.remove();
        (window as typeof window & { SonaeWidgetInitialized?: boolean }).SonaeWidgetInitialized = false;
      };
    }
  }, [widget, widgetId]);

  if (widget === undefined) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="mt-4 text-sm text-secondary tracking-widest font-mono uppercase">Initializing Sandbox...</p>
      </div>
    );
  }

  if (widget === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md p-8 border border-destructive/20 rounded-[20px] bg-destructive/5 text-center shadow-lg">
           <ShieldCheck className="w-12 h-12 text-destructive mx-auto mb-4" />
           <h1 className="text-xl font-bold text-foreground mb-2">Sandbox Unavailable</h1>
           <p className="text-[14px] text-secondary">
             The requested widget payload could not be found or has been disabled. The simulation cannot proceed.
           </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0a0a0b] text-[#111] dark:text-[#eaeaea] font-sans relative overflow-hidden transition-colors">
        
       {/* Fake Navigation Bar */}
       <header className="sticky top-0 w-full h-16 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-black/5 dark:border-white/5 z-40 px-8 flex items-center justify-between">
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
       <main className="max-w-6xl mx-auto px-8 pt-32 pb-24 relative z-10">
           
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
                   This is a simulated Sandbox Environment hosted safely inside Sonae. The external widget loader script has been automatically injected into this page&apos;s DOM.
               </p>
               
               <div className="flex items-center gap-4 mt-8">
                   <button className="px-8 py-4 bg-foreground text-background font-bold rounded-full text-[14px] shadow-xl hover:scale-105 transition-transform pointer-events-none">
                       Start Building 
                   </button>
                   <button className="px-8 py-4 bg-transparent border border-black/10 dark:border-white/10 font-bold rounded-full text-[14px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors pointer-events-none">
                       Read Documentation
                   </button>
               </div>
           </div>

           {/* Metrics Grid (Dummy Data) */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32">
               <div className="p-8 rounded-[24px] bg-white dark:bg-card border border-black/5 dark:border-white/5 shadow-sm flex flex-col gap-4">
                   <Activity className="w-6 h-6 text-brand" />
                   <h3 className="font-bold text-lg">Real-time Synchronization</h3>
                   <p className="text-[14px] text-[#666] dark:text-[#999] leading-relaxed">
                       Observe how the Sonae widget handles immediate websocket upgrades without disrupting the host thread.
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
