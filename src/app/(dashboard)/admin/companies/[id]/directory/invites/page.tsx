"use client";

import { use, useState } from "react";
import { ShieldCheck, User as UserIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import { InviteDispatchScreen } from "@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen";

/** Inviting people into this company's workspace. */
export default function InviteUsersPage({
  params,
}: {
  params: Promise<{ id: Id<"companies"> }>;
}) {
  const t = useTranslations("admin.invites");
  const { id: companyId } = use(params);
  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN" | "SUPER_ADMIN">("USER");

  return (
    <InviteDispatchScreen
      companyId={companyId}
      role={inviteRole}
      roleSelector={
        <div className="flex flex-col gap-2">
          <span className="mt-1 text-[12px] font-medium text-secondary">{t("roleQuestion")}</span>
          <div className="grid grid-cols-2 gap-3 h-[46px]">
            {/* This pair stays raw: selected-state role cards whose fills swap with selection — matches no variant. */}
            <button
              type="button"
              onClick={() => setInviteRole("USER")}
              className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "USER" ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
            >
              <UserIcon className="w-4 h-4" /> {t("standardUser")}
            </button>
            <button
              type="button"
              onClick={() => setInviteRole("ADMIN")}
              className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "ADMIN" ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
            >
              <ShieldCheck className="w-4 h-4" /> {t("companyAdmin")}
            </button>
          </div>
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
