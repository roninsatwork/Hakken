"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Globe, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function AddMcpServerPage() {
  const router = useRouter();
  
  // Note: Assuming a generic insert function for now. The backend will need 'type: MCP' support.
  const createTool = useMutation(api.aiTools.createTool);

  const [name, setName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mcpUrl.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Stubbing the MCP insertion via the generic createTool until integrations backend is built
      await createTool({
        name: name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description: `MCP Server Endpoint: ${mcpUrl.trim()}`,
        handlerMapping: `mcp.proxy.${name.trim()}`,
        requiredRole: "SUPER_ADMIN", // MCP servers default to super admin
      });
      router.push("/admin/ai/tools");
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <header className="flex flex-col gap-1">
        <Link 
          href="/admin/ai/tools"
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Tools Library</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Globe className="w-6 h-6 text-brand" />
          Add custom connector (MCP)
        </h1>
        <p className="text-[13px] text-secondary tracking-wide max-w-2xl mt-1">
          Connect Sonae to your data and tools using the open Model Context Protocol. Once connected, all tools exposed by the remote server will automatically import into Sonae&apos;s library.
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-10 flex-1 relative max-w-4xl">
        
        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Server Details</span>
           </div>
           
           <div className="flex flex-col gap-4 relative ml-1">
             <div className="flex flex-col gap-1.5">
               <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Display Name</label>
               <input
                 autoFocus
                 value={name}
                 onChange={(e) => setName(e.target.value)}
                 placeholder="e.g. Day.ai"
                 className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
               />
             </div>

             <div className="flex flex-col gap-1.5 mt-2">
               <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Remote MCP Server URL</label>
               <input
                 value={mcpUrl}
                 onChange={(e) => setMcpUrl(e.target.value)}
                 placeholder="https://mcp.day.ai/v1/connect"
                 className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide"
               />
             </div>
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Delegation & Authentication</span>
           </div>
           
           <div className="flex flex-col gap-2 relative ml-1">
             <button 
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-max py-2"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced settings (OAuth)
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-col gap-4 mt-2 overflow-hidden"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">OAuth Client ID (optional)</label>
                      <input 
                        type="text" 
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="client_id_xxx" 
                        className="w-full bg-transparent border border-border-dim rounded-[10px] p-3 text-[14px] text-foreground placeholder:text-muted/50 outline-none transition-colors focus:border-indigo-500/40"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">OAuth Client Secret (optional)</label>
                      <input 
                        type="password" 
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="••••••••••••••••••••" 
                        className="w-full bg-transparent border border-border-dim rounded-[10px] p-3 text-[14px] text-foreground placeholder:text-muted/50 outline-none transition-colors focus:border-indigo-500/40"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
        </section>

        {/* Action Bar */}
        <div className="flex flex-col gap-4 pt-6 mt-4 border-t border-border-dim">
           <p className="text-[12px] text-secondary leading-relaxed bg-amber-500/5 p-4 rounded-[12px] border border-amber-500/10">
              <strong className="text-amber-500">Security Notice:</strong> Only use connectors from developers you trust. Sonae does not control which tools developers make available via the MCP URL and cannot verify that they will work as intended or that they will not automatically mutate backend data.
           </p>

           <div className="flex justify-end pt-2">
             <button
               type="submit"
               disabled={!name.trim() || !mcpUrl.trim() || isSubmitting}
               className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
             >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
               <span>Initialize Connection</span>
             </button>
           </div>
        </div>
      </form>
    </div>
  );
}
