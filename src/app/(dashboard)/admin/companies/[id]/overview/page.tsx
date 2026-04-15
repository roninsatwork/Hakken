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
  const updateProfile = useMutation(api.companies.updateCompanyProfile);

  const [nameVal, setNameVal] = useState("");
  const [descVal, setDescVal] = useState("");
  const [overviewVal, setOverviewVal] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (company) {
      setNameVal(company.name || "");
      setDescVal(company.description || "");
      setOverviewVal(company.overview || "");
    }
  }, [company]);

  const handleSave = async () => {
    if (!company) return;
    setIsSaving(true);
    setSaveMessage({ text: "", type: "" });
    try {
      await updateProfile({ 
          id: companyId, 
          name: nameVal,
          description: descVal,
          overview: overviewVal
      });
      setSaveMessage({ text: "Profile successfully updated.", type: "success" });
      setTimeout(() => setSaveMessage({ text: "", type: "" }), 3000);
    } catch (e: any) {
      setSaveMessage({ text: e.message || "Failed to save profile", type: "error" });
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

  const isPristine = (company.name || "") === nameVal && 
                     (company.description || "") === descVal && 
                     (company.overview || "") === overviewVal;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl p-6 shadow-sm flex flex-col gap-6">

        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2.5">
                <label className="text-[12px] font-medium text-secondary tracking-widest uppercase">Company Name</label>
                <input 
                  type="text"
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className="w-full py-2.5 px-4 bg-background/50 border border-border-dim rounded-[10px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all"
                  placeholder="e.g. ACME Inc"
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="text-[12px] font-medium text-secondary tracking-widest uppercase">Company Tagline</label>
                <input 
                  type="text"
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  className="w-full py-2.5 px-4 bg-background/50 border border-border-dim rounded-[10px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all"
                  placeholder="e.g. Manage workspace settings."
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-secondary tracking-widest uppercase">Detailed Profile Overview</label>
                <span className="text-[11px] text-secondary/60">Visible to team members for business context</span>
              </div>
              <textarea 
                value={overviewVal}
                onChange={(e) => setOverviewVal(e.target.value)}
                className="w-full h-auto min-h-[220px] p-4 bg-background/50 border border-border-dim rounded-[12px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all resize-y font-mono custom-scrollbar"
                placeholder="Enter the company description, mission, structure, or massive background knowledge here..."
              />
            </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border-dim/50 mt-0">
          <div className="text-[13px] font-medium">
            {saveMessage.text && (
              <span className={saveMessage.type === "success" ? "text-brand" : "text-red-500"}>
                {saveMessage.text}
              </span>
            )}
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving || isPristine || !nameVal.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-brand text-white font-bold tracking-wide hover:bg-brand/90 transition-all text-[13px] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(var(--brand-rgb),0.2)]"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
