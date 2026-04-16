"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppWindow, Plus, Loader2, Save, Terminal, Copy, CheckCircle2 } from "lucide-react";

export default function GlobalWidgetPage() {
  const widgets = useQuery(api.widgets.getGlobalWidgets);
  const saveWidget = useMutation(api.widgets.saveWidget);

  const widget = widgets && widgets.length > 0 ? widgets[0] : null;

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostOrigin, setHostOrigin] = useState("");

  useEffect(() => {
    setHostOrigin(window.location.origin);
  }, []);

  // Form State
  const [name, setName] = useState("Global System Bot");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [themeGreeting, setThemeGreeting] = useState("Hi! How can I help you today?");
  const [themePrimaryColor, setThemePrimaryColor] = useState("#000000");
  
  useEffect(() => {
    if (widget) {
      setName(widget.name);
      setAllowedDomains(widget.allowedDomains.join(", "));
      setThemeGreeting(widget.themeGreeting || "");
      setThemePrimaryColor(widget.themePrimaryColor || "#000000");
    }
  }, [widget]);

  const handleCreateOrUpdate = async () => {
    setIsSaving(true);
    try {
      const domains = allowedDomains.split(",").map(d => d.trim()).filter(Boolean);
      await saveWidget({
        widgetId: widget?._id,
        name,
        isActive: true,
        isGlobal: true,
        allowedDomains: domains,
        themeGreeting,
        themePrimaryColor,
      });
    } catch (error) {
      console.error(error);
      alert("Failed to save global widget settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const codeSnippet = widget ? `<script src="${hostOrigin}/embed.js" data-widget-id="${widget._id}"></script>` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="flex flex-col gap-6 w-full pb-12">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <AppWindow className="w-6 h-6 text-brand" />
              Global Widget
            </h1>
            <p className="text-[13px] text-secondary mt-1 tracking-wide">
              Configure the system-wide embeddable chat widget operated by the global AI protocol.
            </p>
          </div>
        </header>

        {widgets === undefined ? (
          <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
        ) : !widget ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
            <AppWindow className="w-10 h-10 text-brand mb-4 opacity-80" />
            <h3 className="text-sm font-medium text-foreground mb-1">No Global Widget Configured</h3>
            <p className="text-[13px] text-secondary max-w-sm mb-6">
              Create a secure embeddable widget to allow external users to interact with the global knowledge base and logic rules.
            </p>
            <button
              onClick={handleCreateOrUpdate}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Initialize Widget</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
              
            {/* Settings Form */}
            <div className="flex-1 flex flex-col gap-6 p-6 rounded-[16px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
              <h2 className="text-lg font-bold text-foreground mb-2">Configuration</h2>
              
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground tracking-wide">Widget Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors"
                  placeholder="e.g. Sonae Master Bot"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground tracking-wide">Allowed Domains</label>
                <p className="text-[12px] text-secondary">Comma separated list of domains authorized to run this widget. e.g. <span className="font-mono bg-foreground/5 px-1 py-0.5 rounded">https://example.com</span></p>
                <input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors font-mono"
                  placeholder="https://example.com, https://app.example.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground tracking-wide">Greeting Message</label>
                <textarea
                  value={themeGreeting}
                  onChange={(e) => setThemeGreeting(e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors"
                  placeholder="How can I help you today?"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground tracking-wide">Brand Color</label>
                <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themePrimaryColor}
                      onChange={(e) => setThemePrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded border border-border-dim bg-transparent cursor-pointer"
                    />
                    <span className="text-[13px] font-mono text-secondary uppercase">{themePrimaryColor}</span>
                </div>
              </div>

              <div className="mt-4 pt-6 border-t border-border-dim flex justify-end">
                  <button
                      onClick={handleCreateOrUpdate}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand text-white font-medium tracking-wide text-[13px] hover:bg-brand/90 shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)] transition-all"
                  >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Save Settings</span>
                  </button>
              </div>
            </div>

            {/* Integration Guide */}
            <div className="lg:w-[400px] flex flex-col gap-6">
                <div className="flex flex-col gap-4 p-6 rounded-[16px] bg-brand/5 border border-brand/20 shadow-sm backdrop-blur-xl">
                   <div className="flex items-center gap-3 mb-2">
                       <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                           <Terminal className="w-5 h-5 text-brand" />
                       </div>
                       <div>
                           <h3 className="font-bold text-foreground">Embed Script</h3>
                           <p className="text-[12px] text-secondary">Add this to the website's &lt;head&gt;</p>
                       </div>
                   </div>

                   <div className="relative group">
                      <pre className="bg-background border border-border-dim rounded-[8px] p-4 text-[12px] text-muted overflow-x-auto font-mono leading-relaxed">
                          {codeSnippet}
                      </pre>
                      <button 
                          onClick={handleCopy}
                          className="absolute top-2 right-2 p-2 rounded-[6px] bg-sidebar border border-border-dim text-secondary hover:text-foreground hover:border-brand/50 transition-all shadow-xl"
                      >
                          {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                   </div>

                   <div className="text-[12px] text-secondary bg-foreground/5 p-3 rounded-[8px] border border-border-dim/50 leading-relaxed mt-2">
                       <strong>Security Note:</strong> The widget will only successfully connect if it is embedded on a website matching the domains in your Allowed Domains list.
                   </div>

                   <div className="mt-2 pt-6 border-t border-border-dim border-dashed">
                       <p className="text-[13px] text-secondary mb-4 leading-relaxed">
                           Test your Widget configuration safely inside the Sonae Sandbox Environment.
                       </p>
                       <a 
                           href={`/sandbox/${widget._id}`} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-foreground text-background font-bold text-[13px] shadow-lg hover:scale-[1.02] transition-transform"
                       >
                           <AppWindow className="w-4 h-4" />
                           Test Widget Sandbox
                       </a>
                   </div>
                </div>
            </div>

          </div>
        )}
      </div>
    </>
  );
}
