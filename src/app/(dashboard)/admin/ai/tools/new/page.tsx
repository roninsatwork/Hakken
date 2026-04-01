"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RegisterToolPage() {
  const router = useRouter();
  const createTool = useMutation(api.aiTools.createTool);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handlerMapping, setHandlerMapping] = useState("");
  const [requiredRole, setRequiredRole] = useState<"ADMIN" | "SUPER_ADMIN">("ADMIN");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !handlerMapping.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createTool({
        name: name.trim(),
        description: description.trim(),
        handlerMapping: handlerMapping.trim(),
        requiredRole,
      });
      router.push("/admin/ai/tools");
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const roleClasses = {
    ADMIN: "hover:bg-orange-500/10 hover:border-orange-500/20 hover:text-orange-500",
    SUPER_ADMIN: "hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-500",
  };
  
  const selectedRoleClasses = {
    ADMIN: "bg-orange-500/20 border-orange-500/50 text-orange-500",
    SUPER_ADMIN: "bg-rose-500/20 border-rose-500/50 text-rose-500",
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
          <Wrench className="w-6 h-6 text-brand" />
          Register Hook
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          Map internal server mutations to a generic AI tool configuration.
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-10 flex-1 relative max-w-4xl">
        
        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-[#10b981]/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Interface Definition</span>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Global Tool Name</label>
             <input
               autoFocus
               value={name}
               onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
               placeholder="e.g. check_inventory_status"
               className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-[#10b981]/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
             />
             <p className="text-[11px] text-muted mt-1 px-1">Must be strictly snake_case with no spaces. This is the exact name the LLM will see.</p>
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-amber-500/20">2</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">API Specification</span>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1 h-[150px]">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Semantic Description</label>
             <textarea
               value={description}
               onChange={(e) => setDescription(e.target.value)}
               placeholder="Tell the LLM exactly what this tool does and when to use it..."
               className="w-full h-full resize-none bg-transparent border border-border-dim rounded-[10px] p-5 text-[13px] text-foreground/90 placeholder:text-muted/40 outline-none transition-colors focus:border-amber-500/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide leading-relaxed custom-scrollbar"
               spellCheck={false}
             />
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">3</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Server Mapping</span>
           </div>
           
           <div className="flex flex-col gap-2 relative group ml-1">
             <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Internal Convex Mutation/Action</label>
             <input
               value={handlerMapping}
               onChange={(e) => setHandlerMapping(e.target.value)}
               placeholder="e.g. api.integrations.stripe.createCharge"
               className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-indigo-500/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide"
             />
           </div>
        </section>

        <section className="flex flex-col gap-4">
           <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-rose-500/20">4</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Security Clearance</span>
           </div>
           
           <div className="grid grid-cols-2 gap-3 ml-1">
              {(["ADMIN", "SUPER_ADMIN"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRequiredRole(p)}
                  className={`flex flex-col items-start gap-1 p-4 rounded-[12px] border transition-all text-left ${p === requiredRole ? selectedRoleClasses[p] : `border-border-dim bg-transparent text-secondary ${roleClasses[p]}`}`}
                >
                  <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{p}</span>
                </button>
              ))}
           </div>
        </section>

        {/* Submit Actions */}
        <div className="flex justify-end pt-6 border-t border-border-dim mt-4">
          <button
            type="submit"
            disabled={!name.trim() || !description.trim() || !handlerMapping.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            <span>Register Hook</span>
          </button>
        </div>
      </form>
    </div>
  );
}
