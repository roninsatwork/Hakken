"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Blocks, Loader2, Save } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { getErrorMessage } from "@/src/lib/errors";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

/**
 * What this workspace can reach.
 *
 * Lived as a card at the bottom of the company's Overview screen until
 * 2026-08-18, where Anthony found it: *"this needs to be on its own screen in
 * the company"*. It had outgrown the spot. When it was written it offered one
 * bespoke module and read as a footnote to the profile; it now decides whether
 * a workspace has Tasks, Calls, Reception, a Wiki and the rest, which is not
 * a footnote to anything.
 *
 * Saves on its own, as it always did. Editing the company's details and
 * granting it a section are different kinds of change, and coupling them would
 * mean a half-finished profile edit blocks switching a feature on.
 *
 * Super admin only, matching the plan override: a workspace admin choosing
 * which features their own workspace holds would defeat the point of the flag.
 */
export default function CompanyFeaturesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const t = useTranslations("admin.companies");
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const currentUser = useQuery(api.users.getMe);
  const planGrants = useQuery(api.companies.getPlanGrantsForCompany, { id: companyId });
  const setCompanyModules = useMutation(api.companies.setCompanyModules);

  const enabled = company?.enabledModules;
  const [selected, setSelected] = useState<string[]>([]);
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
      setMessage({ text: "Features updated.", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "" }), 3000);
    } catch (e: unknown) {
      setMessage({ text: getErrorMessage(e, "Failed to update features"), type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  // Nothing at all until the answer arrives, rather than a screen that says
  // "not allowed" for a moment to the person who is allowed.
  if (currentUser === undefined || company === undefined) return null;

  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <p className="text-[13px] text-secondary">
        Only a platform administrator can change which features a workspace has.
      </p>
    );
  }

  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl flex flex-col shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <Blocks className="w-5 h-5 text-brand opacity-80" />
          <h2 className="text-[15px] font-bold text-foreground tracking-wide">{t("featuresTitle")}</h2>
        </div>
        <p className="text-[13px] text-secondary">
          What this workspace can reach. Switching one off removes it from their menu
          and closes the section — typing the address will not get them in. Nobody
          else is affected.
        </p>
        {planGrants && (
          <p className="text-[13px] text-secondary">
            <span className="font-medium text-foreground">{planGrants.planName}</span>{" "}
            already switches on{" "}
            <span className="text-foreground">
              {planGrants.grantedModules.map((key) => t(`modules.${key}.name`)).join(", ")}
            </span>
            {" — those stay on whatever the boxes below say. To switch one off, move the"}
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
                {/* Same keys the provisioning modal and the plans screen use, so
                    the three cannot drift apart in how they describe a feature. */}
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
          Save Features
        </WriteButton>
      </div>
    </div>
  );
}
