"use client";

import { lazy, Suspense, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Loader2, ShieldCheck } from "lucide-react";

const WidgetSandboxPresentation = lazy(() => import("./WidgetSandboxPresentation"));
const SANDBOX_LAYERS = {
  header: "z-40",
  content: "z-10",
} as const;

function SandboxInitializing() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
      <p className="mt-4 text-sm text-secondary tracking-widest font-mono uppercase">Initializing Sandbox...</p>
    </div>
  );
}

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
        const widgetContainer = document.getElementById("hakken-widget-container");
        if (widgetContainer) widgetContainer.remove();
        (window as typeof window & { HakkenWidgetInitialized?: boolean }).HakkenWidgetInitialized = false;
      };
    }
  }, [widget, widgetId]);

  if (widget === undefined) {
    return <SandboxInitializing />;
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
    <Suspense fallback={<SandboxInitializing />}>
      <WidgetSandboxPresentation
        headerLayer={SANDBOX_LAYERS.header}
        contentLayer={SANDBOX_LAYERS.content}
        actions={(
          <div className="flex items-center gap-4 mt-8">
            <button className="px-8 py-4 bg-foreground text-background font-bold rounded-full text-[14px] shadow-xl hover:scale-105 transition-transform pointer-events-none">
              Start Building
            </button>
            <button className="px-8 py-4 bg-transparent border border-black/10 dark:border-white/10 font-bold rounded-full text-[14px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors pointer-events-none">
              Read Documentation
            </button>
          </div>
        )}
      />
    </Suspense>
  );
}
