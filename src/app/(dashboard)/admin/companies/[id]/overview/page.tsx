"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Save, Loader2, PoundSterling } from "lucide-react";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { useTranslations } from "next-intl";


export default function CompanyOverviewPage() {
  const t = useTranslations("admin.companyDetails.profile");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const updateProfile = useMutation(api.companies.updateCompanyProfile);
  const assignPlanToCompany = useMutation(api.companies.assignPlanToCompany);

  const planStatus = useQuery(api.plans.getCompanyPlanStatus, { companyId });

  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const activePlans = (useQuery(api.plans.getActivePlans) || []) as Doc<"plans">[];

  const [nameVal, setNameVal] = useState("");
  const [descVal, setDescVal] = useState("");
  const [overviewVal, setOverviewVal] = useState("");
  const [planIdVal, setPlanIdVal] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (company) {
      setNameVal(company.name || "");
      setDescVal(company.description || "");
      setOverviewVal(company.overview || "");
      setPlanIdVal(company.planId || "");
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
      if (isSuperAdmin) {
         if (planIdVal) await assignPlanToCompany({ id: companyId, planId: planIdVal as Id<"plans"> });
         else await assignPlanToCompany({ id: companyId, planId: undefined });
      }
      setSaveMessage({ text: t("saveSuccess"), type: "success" });
      setTimeout(() => setSaveMessage({ text: "", type: "" }), 3000);
    } catch (e: unknown) {
      setSaveMessage({ text: getErrorMessage(e, t("saveFailed")), type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!company) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  const isPristine = (company.name || "") === nameVal && 
                     (company.description || "") === descVal && 
                     (company.overview || "") === overviewVal &&
                     (!isSuperAdmin || (company.planId || "") === planIdVal);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl p-6 shadow-sm flex flex-col gap-6">

        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field
                label={t("nameLabel")}
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder={t("namePlaceholder")}
              />

              <Field
                label={t("descriptionLabel")}
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>

            <TextAreaField
              label={t("aboutLabel")}
              hint={t("aboutHint")}
              value={overviewVal}
              onChange={(e) => setOverviewVal(e.target.value)}
              className="min-h-[220px] resize-y"
              placeholder={t("aboutPlaceholder")}
            />

            {isSuperAdmin && (
              <div className="flex flex-col gap-2.5 mt-2 pt-4 border-t border-border-dim/50">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-secondary tracking-widest uppercase">{t("planOverride")}</label>
                  <span className="text-[11px] text-brand/80 font-mono tracking-widest uppercase">{t("superAdminOnly")}</span>
                </div>
                <select
                   value={planIdVal}
                   onChange={e => setPlanIdVal(e.target.value)}
                   className="w-full py-2.5 px-4 bg-background/50 border border-border-dim rounded-[10px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all appearance-none cursor-pointer"
                >
                    <option value="">{t("noPlanOption")}</option>
                    {activePlans.map((plan) => (
                       <option key={plan._id} value={plan._id}>
                           {plan.messageLimit === -1 ? t("planOptionUnlimited", { name: plan.name, price: plan.priceGBP }) : t("planOption", { name: plan.name, limit: plan.messageLimit, price: plan.priceGBP })}
                       </option>
                    ))}
                </select>
              </div>
            )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border-dim/50 mt-0">
          <div className="text-[13px] font-medium">
            {saveMessage.text && (
              <span className={saveMessage.type === "success" ? "text-brand" : "text-red-500"}>
                {saveMessage.text}
              </span>
            )}
          </div>
          <WriteButton

            onClick={handleSave}
            disabled={isSaving || isPristine || !nameVal.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-brand text-white font-bold tracking-wide hover:bg-brand/90 transition-all text-[13px] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(var(--brand-rgb),0.2)]"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("saveProfile")}
          </WriteButton>
        </div>
      </div>

      {/* Subscription & Billing Section */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl flex flex-col shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <PoundSterling className="w-5 h-5 text-brand opacity-80" />
            <h2 className="text-[15px] font-bold text-foreground tracking-wide">{t("billingTitle")}</h2>
          </div>
          <p className="text-[13px] text-secondary">{t("billingSubtitle")}</p>
        </div>
        <div className="p-6 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-background/50 rounded-[16px] border border-border-dim p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none -translate-y-10 translate-x-10" />
            <h3 className="text-[11px] font-semibold text-muted mb-4 uppercase tracking-widest">{t("currentPlan")}</h3>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">{planStatus?.planName || t("loading")}</span>
            </div>
            <p className="text-sm font-mono text-secondary">
              {planStatus ? t("usage", { used: planStatus.messagesUsed.toLocaleString(), limit: planStatus.messageLimit === -1 ? t("unlimited") : planStatus.messageLimit.toLocaleString() }) : ""}
            </p>
          </div>
          
          <div className="flex-[2] flex flex-col justify-center gap-4">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{t("availableTiers")}</h3>
            <div className="flex flex-wrap gap-4">
              {activePlans?.map((p) => (
                <div key={p._id} className={`flex flex-col gap-1 p-4 rounded-[16px] border ${p.name === planStatus?.planName ? 'border-brand/40 bg-brand/5' : 'border-border-dim bg-background/30'} min-w-[160px] cursor-default transition-all hover:border-brand/20`}>
                  <span className="text-[14px] font-bold tracking-wide text-foreground">{p.name} {p.name === planStatus?.planName && <span className="text-[10px] ml-2 text-brand uppercase tracking-widest rounded-full bg-brand/10 px-2 py-0.5">{t("active")}</span>}</span>
                  <span className="text-[13px] font-medium text-secondary">{t("pricePerMonth", { price: p.priceGBP })}</span>
                  <span className="text-[11px] font-mono mt-1 text-muted">{p.messageLimit === -1 ? t("unlimitedActions") : t("actions", { count: p.messageLimit.toLocaleString() })}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {/* `inline-block`, not `inline-flex`: a flex container makes each
                  run of text its own item and drops the spaces between them, so
                  this sentence read "Contact Supportto safely execute". The
                  `ml-1` on the bold words was a patch for the gap on one side of
                  that; with normal inline layout both sides space themselves. */}
              <span className="bg-foreground/5 py-2 px-4 rounded-full border border-border-dim inline-block">
                {t.rich("askUs", {
                  b: (chunks) => <strong className="text-foreground">{chunks}</strong>,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
