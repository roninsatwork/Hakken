"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, PoundSterling, Blocks } from "lucide-react";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";


export default function CompanyOverviewPage() {
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
      setSaveMessage({ text: "Profile successfully updated.", type: "success" });
      setTimeout(() => setSaveMessage({ text: "", type: "" }), 3000);
    } catch (e: unknown) {
      setSaveMessage({ text: getErrorMessage(e, "Failed to save profile"), type: "error" });
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
                label="Company name"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder="For example: ACME Inc"
              />

              <Field
                label="One-line description"
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                placeholder="For example: Manage workspace settings."
              />
            </div>

            <TextAreaField
              label="About this company"
              hint="Your team can see this. It gives the assistant background to work from."
              value={overviewVal}
              onChange={(e) => setOverviewVal(e.target.value)}
              className="min-h-[220px] resize-y"
              placeholder="What the company does, who it serves, how it is organised — anything worth the assistant knowing."
            />

            {isSuperAdmin && (
              <div className="flex flex-col gap-2.5 mt-2 pt-4 border-t border-border-dim/50">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-secondary tracking-widest uppercase">Subscription Plan Override</label>
                  <span className="text-[11px] text-brand/80 font-mono tracking-widest uppercase">Super Admin Only</span>
                </div>
                <select
                   value={planIdVal}
                   onChange={e => setPlanIdVal(e.target.value)}
                   className="w-full py-2.5 px-4 bg-background/50 border border-border-dim rounded-[10px] text-[14px] text-foreground focus:border-brand/40 outline-none transition-all appearance-none cursor-pointer"
                >
                    <option value="">No Plan (Unlimited / System Default)</option>
                    {activePlans.map((plan) => (
                       <option key={plan._id} value={plan._id}>
                           {plan.name} {plan.messageLimit === -1 ? '(Unlimited)' : `(${plan.messageLimit} msgs)`} - £{plan.priceGBP}/mo
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
            Save Profile
          </WriteButton>
        </div>
      </div>

      {/* Subscription & Billing Section */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl flex flex-col shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <PoundSterling className="w-5 h-5 text-brand opacity-80" />
            <h2 className="text-[15px] font-bold text-foreground tracking-wide">Subscription & Billing</h2>
          </div>
          <p className="text-[13px] text-secondary">Manage your organization&apos;s subscription tier and monitor structural capacity limits.</p>
        </div>
        <div className="p-6 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-background/50 rounded-[16px] border border-border-dim p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none -translate-y-10 translate-x-10" />
            <h3 className="text-[11px] font-semibold text-muted mb-4 uppercase tracking-widest">Current Plan Assignment</h3>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">{planStatus?.planName || "Loading..."}</span>
            </div>
            <p className="text-sm font-mono text-secondary">
              {planStatus ? `Usage: ${planStatus.messagesUsed.toLocaleString()} / ${planStatus.messageLimit === -1 ? 'Unlimited' : planStatus.messageLimit.toLocaleString()}` : ""}
            </p>
          </div>
          
          <div className="flex-[2] flex flex-col justify-center gap-4">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Available Tier Upgrades</h3>
            <div className="flex flex-wrap gap-4">
              {activePlans?.map((p) => (
                <div key={p._id} className={`flex flex-col gap-1 p-4 rounded-[16px] border ${p.name === planStatus?.planName ? 'border-brand/40 bg-brand/5' : 'border-border-dim bg-background/30'} min-w-[160px] cursor-default transition-all hover:border-brand/20`}>
                  <span className="text-[14px] font-bold tracking-wide text-foreground">{p.name} {p.name === planStatus?.planName && <span className="text-[10px] ml-2 text-brand uppercase tracking-widest rounded-full bg-brand/10 px-2 py-0.5">Active</span>}</span>
                  <span className="text-[13px] font-medium text-secondary">£{p.priceGBP}/mo</span>
                  <span className="text-[11px] font-mono mt-1 text-muted">{p.messageLimit === -1 ? 'Unlimited actions' : `${p.messageLimit.toLocaleString()} actions`}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[12px] text-muted">
              <span className="bg-foreground/5 py-2 px-4 rounded-full border border-border-dim inline-flex">
                Need higher volume or custom knowledge limits? <strong className="text-foreground ml-1">Contact Support</strong> to safely execute a plan adjustment.
              </span>
            </div>
          </div>
        </div>
      </div>

      {isSuperAdmin && COMPANY_MODULES.length > 0 && (
        <CompanyModulesSection companyId={companyId} enabled={company.enabledModules} />
      )}

    </div>
  );
}

/**
 * Optional sections this workspace can see.
 *
 * Saves on its own rather than through Save Profile above. The two are
 * different kinds of change — one edits the company's own details, the other
 * grants access to a section — and coupling them would mean a half-finished
 * profile edit blocks switching a module on.
 *
 * Super admin only, matching the plan override: a workspace admin choosing
 * which modules their own workspace has would defeat the point of the flag.
 */
function CompanyModulesSection({
  companyId,
  enabled,
}: {
  companyId: Id<"companies">;
  enabled?: string[];
}) {
  const t = useTranslations("admin.companies");
  const setCompanyModules = useMutation(api.companies.setCompanyModules);
  const planGrants = useQuery(api.companies.getPlanGrantsForCompany, { id: companyId });

  const [selected, setSelected] = useState<string[]>(enabled ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // Follows the record when it changes underneath — a save elsewhere, or the
  // first load arriving after this mounted.
  useEffect(() => {
    setSelected(enabled ?? []);
  }, [enabled]);

  const toggle = (key: string) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((entry) => entry !== key)
        : [...previous, key]
    );
  };

  const isPristine =
    selected.length === (enabled ?? []).length &&
    selected.every((key) => (enabled ?? []).includes(key));

  const handleSave = async () => {
    setIsSaving(true);
    setMessage({ text: "", type: "" });
    try {
      await setCompanyModules({ id: companyId, enabledModules: selected });
      setMessage({ text: "Modules updated.", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "" }), 3000);
    } catch (e: unknown) {
      setMessage({ text: getErrorMessage(e, "Failed to update modules"), type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl flex flex-col shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Blocks className="w-5 h-5 text-brand opacity-80" />
            <h2 className="text-[15px] font-bold text-foreground tracking-wide">Optional Modules</h2>
          </div>
          <span className="text-[11px] text-brand/80 font-mono tracking-widest uppercase">Super Admin Only</span>
        </div>
        <p className="text-[13px] text-secondary">
          Extra sections only this workspace can see. Switching one on adds it to this
          workspace&apos;s navigation; nobody else is affected.
        </p>
        {planGrants && (
          <p className="text-[13px] text-secondary">
            <span className="font-medium text-foreground">{planGrants.planName}</span>{" "}
            already switches on{" "}
            <span className="text-foreground">
              {planGrants.grantedModules.map((key) => t(`modules.${key}.name`)).join(", ")}
            </span>
            {" — those stay on whatever the boxes below say. To withhold one, move the"}
            {" workspace to a plan without it."}
          </p>
        )}
      </div>

      <div className="p-6 flex flex-col gap-3">
        {COMPANY_MODULES.map((module) => {
          const isOn = selected.includes(module.key);
          return (
            <label
              key={module.key}
              className={`flex items-start gap-3 p-4 rounded-[16px] border cursor-pointer transition-all ${
                isOn
                  ? "border-brand/40 bg-brand/5"
                  : "border-border-dim bg-background/30 hover:border-brand/20"
              }`}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(module.key)}
                className="mt-0.5 accent-brand"
              />
              <span className="flex flex-col gap-1">
                {/* Same keys the provisioning modal uses, so the two screens
                    cannot drift apart in how they describe a module. */}
                <span className="text-[14px] font-bold tracking-wide text-foreground">
                  {t(`modules.${module.key}.name`)}
                </span>
                <span className="text-[13px] text-secondary">
                  {t(`modules.${module.key}.description`)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim/50">
        <div className="text-[13px] font-medium">
          {message.text && (
            <span className={message.type === "success" ? "text-brand" : "text-red-500"}>
              {message.text}
            </span>
          )}
        </div>
        <WriteButton
          onClick={handleSave}
          disabled={isSaving || isPristine}
          className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-brand text-white font-bold tracking-wide hover:bg-brand/90 transition-all text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Modules
        </WriteButton>
      </div>
    </div>
  );
}
