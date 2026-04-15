"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function RegisterToolPage() {
  const router = useRouter();
  const t = useTranslations("admin.aiTools.new");
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
          <span>{t("back")}</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Wrench className="w-6 h-6 text-brand" />
          {t("title")}
        </h1>
        <p className="text-[13px] text-secondary tracking-wide">
          {t("subtitle")}
        </p>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative max-w-[1200px]">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          
          {/* Left Column */}
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 relative group">
              <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("fields.name.label")}</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder={t("fields.name.placeholder")}
                className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-brand/40 shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
              />
              <p className="text-[11px] text-muted mt-1 px-1">{t("fields.name.help")}</p>
            </div>

            <div className="flex flex-col gap-2 relative group">
              <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("fields.handler.label")}</label>
              <input
                value={handlerMapping}
                onChange={(e) => setHandlerMapping(e.target.value)}
                placeholder={t("fields.handler.placeholder")}
                className="w-full bg-transparent border border-border-dim rounded-[10px] p-4 text-[14px] text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-brand/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide"
              />
            </div>

            <div className="flex flex-col gap-2 relative group">
              <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("fields.role.label")}</label>
              <div className="grid grid-cols-2 gap-3">
                 {(["ADMIN", "SUPER_ADMIN"] as const).map(p => (
                   <button
                     key={p}
                     type="button"
                     onClick={() => setRequiredRole(p)}
                     className={`flex flex-col items-start gap-1 p-3.5 rounded-[10px] border transition-all text-left ${p === requiredRole ? selectedRoleClasses[p] : `border-border-dim bg-transparent text-secondary ${roleClasses[p]}`}`}
                   >
                     <span className="text-[12px] font-bold tracking-widest uppercase font-mono">{p}</span>
                   </button>
                 ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-2 relative group h-full">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t("fields.description.label")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fields.description.placeholder")}
              className="w-full h-full min-h-[300px] resize-none bg-transparent border border-border-dim rounded-[10px] p-5 text-[13px] text-foreground/90 placeholder:text-muted/40 outline-none transition-colors focus:border-brand/40 shadow-sm dark:bg-[#111111]/30 font-mono tracking-wide leading-relaxed custom-scrollbar"
              spellCheck={false}
            />
          </div>

        </div>

        {/* Submit Actions */}
        <div className="flex justify-end pt-6 border-t border-border-dim mt-2">
          <button
            type="submit"
            disabled={!name.trim() || !description.trim() || !handlerMapping.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            <span>{t("submit")}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
