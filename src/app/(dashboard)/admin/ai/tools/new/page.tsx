"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";

type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

export default function RegisterToolPage() {
  const router = useRouter();
  const t = useTranslations("admin.aiTools.new");
  const createTool = useMutation(api.aiTools.createTool);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handlerMapping, setHandlerMapping] = useState("");
  const [requiredRole, setRequiredRole] = useState<"ADMIN" | "SUPER_ADMIN">("ADMIN");
  const [sideEffectLevel, setSideEffectLevel] = useState<ToolSideEffectLevel>("READ");
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [inputSchema, setInputSchema] = useState('{\n  "type": "object",\n  "properties": {}\n}');
  const [outputSchema, setOutputSchema] = useState("");
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
        sideEffectLevel,
        confirmationRequired,
        isActive,
        inputSchema: inputSchema.trim() || undefined,
        outputSchema: outputSchema.trim() || undefined,
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
            <Field
              label={t("fields.name.label")}
              hint={t("fields.name.help")}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder={t("fields.name.placeholder")}
            />

            <Field
              label={t("fields.handler.label")}
              value={handlerMapping}
              onChange={(e) => setHandlerMapping(e.target.value)}
              placeholder={t("fields.handler.placeholder")}
              className="font-mono"
            />

            <div className="flex flex-col gap-2 relative group">
              <span className="mt-1 text-[12px] font-medium text-secondary">{t("fields.role.label")}</span>
              <div className="grid grid-cols-2 gap-3">
                 {(["ADMIN", "SUPER_ADMIN"] as const).map(p => (
                   // Stays raw: a selected-state role card with per-role colours — matches no variant.
                   <button
                     key={p}
                     type="button"
                     onClick={() => setRequiredRole(p)}
                     className={`flex flex-col items-start gap-1 p-3.5 rounded-[10px] border transition-all text-left ${p === requiredRole ? selectedRoleClasses[p] : `border-border-dim bg-transparent text-secondary ${roleClasses[p]}`}`}
                   >
                     <span className="text-[13px] font-bold tracking-wide">{p === "ADMIN" ? "Admin" : "System admin"}</span>
                   </button>
                 ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="tool-side-effect" className="mt-1 text-[12px] font-medium text-secondary">What it can do</label>
                <select
                  id="tool-side-effect"
                  value={sideEffectLevel}
                  onChange={(e) => setSideEffectLevel(e.target.value as ToolSideEffectLevel)}
                  className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
                >
                  <option value="READ">Read</option>
                  <option value="WRITE">Write</option>
                  <option value="DESTRUCTIVE">Destructive</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>

              <div className="flex flex-col gap-3">
                <span className="mt-1 text-[12px] font-medium text-secondary">Before it runs</span>
                <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
                  <input
                    type="checkbox"
                    checked={confirmationRequired}
                    onChange={(e) => setConfirmationRequired(e.target.checked)}
                  />
                  Require approval
                </label>
                <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-5 relative group h-full">
            <TextAreaField
              label={t("fields.description.label")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fields.description.placeholder")}
              className="min-h-[150px] resize-y"
              spellCheck={false}
            />

            <div className="grid grid-cols-1 gap-5">
              <TextAreaField
                label="What it needs (JSON)"
                value={inputSchema}
                onChange={(e) => setInputSchema(e.target.value)}
                className="min-h-[130px] resize-y font-mono text-[12px]"
                spellCheck={false}
              />
              <TextAreaField
                label="What it gives back (JSON)"
                value={outputSchema}
                onChange={(e) => setOutputSchema(e.target.value)}
                placeholder='Optional: {"type":"object","properties":{}}'
                className="min-h-[110px] resize-y font-mono text-[12px]"
                spellCheck={false}
              />
            </div>
          </div>

        </div>

        {/* Submit Actions */}
        <div className="flex justify-end pt-6 border-t border-border-dim mt-2">
          <WriteButton
            type="submit"
            disabled={!name.trim() || !description.trim() || !handlerMapping.trim() || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
             {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            <span>{t("submit")}</span>
          </WriteButton>
        </div>
      </form>
    </div>
  );
}
