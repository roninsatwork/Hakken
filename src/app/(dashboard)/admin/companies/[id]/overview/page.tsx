"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Save, Loader2, Info } from "lucide-react";

export default function CompanyOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const updateDescription = useMutation(api.companies.updateCompanyDescription);

  const [descriptionValue, setDescriptionValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (company && company.description !== undefined) {
      setDescriptionValue(company.description);
    }
  }, [company]);

  const handleSave = async () => {
    if (!company) return;
    setIsSaving(true);
    setSaveMessage({ text: "", type: "" });
    try {
      await updateDescription({ id: companyId, description: descriptionValue });
      setSaveMessage({ text: "Overview successfully updated.", type: "success" });
      setTimeout(() => setSaveMessage({ text: "", type: "" }), 3000);
    } catch (e: any) {
      setSaveMessage({ text: e.message || "Failed to save overview", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  if (company === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Company Overview</h2>
        <p className="text-[13px] text-secondary leading-relaxed">
          Provide a general description of this company. Use this space for context, mission statements, or general administrative notes.
        </p>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex items-start gap-3 p-4 bg-brand/5 border border-brand/20 rounded-[12px]">
          <Info className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <p className="text-[13px] text-foreground/80 leading-relaxed font-medium">
            While the Prompt tab is used to write strict instructions for your AI agents, this Overview field is for your own team. Store the company's background, market position, and general profile here for easy reference.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[13px] font-medium text-secondary tracking-widest uppercase">Company Profile Overview</label>
          <textarea 
            value={descriptionValue}
            onChange={(e) => setDescriptionValue(e.target.value)}
            className="w-full h-auto min-h-[350px] p-5 bg-background/50 border border-border-dim rounded-[16px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all resize-y font-mono custom-scrollbar"
            placeholder="Enter the company description, mission, structure, or basic overview here..."
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border-dim/50">
          <div className="text-[13px] font-medium">
            {saveMessage.text && (
              <span className={saveMessage.type === "success" ? "text-brand" : "text-red-500"}>
                {saveMessage.text}
              </span>
            )}
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving || descriptionValue === (company?.description || "")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[12px] bg-brand text-white font-medium hover:bg-brand/90 transition-all text-[13px] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(var(--brand-rgb),0.2)]"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Overview
          </button>
        </div>
      </div>
    </div>
  );
}
