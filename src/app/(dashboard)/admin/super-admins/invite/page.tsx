"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ShieldCheck, Loader2 } from "lucide-react";
import { InviteDispatchScreen } from "@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen";
import { useTranslations } from "next-intl";

/** Inviting a system super admin: same desk as the workspace one, fixed role. */
export default function InviteSuperAdminsPage() {
  const t = useTranslations("admin.invites");
  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Anyone who is not a super admin stays on the spinner, exactly as before:
  // the old page skipped its template query for them and so never left it.
  if (user === undefined || !isSuperAdmin) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <InviteDispatchScreen
      role="SUPER_ADMIN"
      roleSelector={
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-system-role" className="mt-1 flex items-center gap-2 text-[12px] font-medium text-secondary">
            {t("roleQuestion")} <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          </label>
          <select
            id="invite-system-role"
            value="SUPER_ADMIN"
            disabled
            className="h-[46px] w-full cursor-not-allowed rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground opacity-50 outline-none"
          >
            <option value="SUPER_ADMIN">{t("systemSuperAdmin")}</option>
          </select>
        </div>
      }
      previewCta={(label) => (
        /* Stays raw: an inert white-on-black mock inside the email preview — not a themed control. */
        <button type="button" className="bg-white text-black font-medium px-5 py-2.5 rounded-[10px] text-[13px] pointer-events-none">
          {label}
        </button>
      )}
    />
  );
}
