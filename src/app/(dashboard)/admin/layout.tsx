"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { AdminAccessLevelProvider } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { canWrite } from "@/src/lib/userRoles";

/**
 * Who may open the admin section.
 *
 * It was super admins only. `READ_ONLY` joins them because that is the entire
 * point of the role — someone who needs to see how the platform is set up
 * without being able to alter it. Their write controls are removed by
 * `AdminAccessLevelProvider`, and the backend refuses the writes regardless, so
 * the two together mean a read-only account sees the same screens and can act
 * on none of them.
 *
 * `AUDITOR` reaches the Governance section and nothing else. It waited for that
 * section to exist, because admitting it to the whole admin area would have
 * granted far more than the role is meant to carry — an auditor's reach is the
 * register, the approvals, the audit trail, the policies in force and the
 * evidence pack, and that is the entire list.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
const ADMIN_SECTION_ROLES = ["SUPER_ADMIN", "READ_ONLY"];

/** The only part of the admin section an auditor may open. */
const GOVERNANCE_PATH = "/admin/governance";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(api.users.getMe);
  const t = useTranslations('admin.access');

  const isAuditor = user?.role === "AUDITOR";
  const inGovernance = pathname.startsWith(GOVERNANCE_PATH);
  const isAllowed = Boolean(user?.role)
    && (ADMIN_SECTION_ROLES.includes(user?.role ?? "") || (isAuditor && inGovernance));

  useEffect(() => {
    if (user === undefined || isAllowed) return;

    // An auditor who lands anywhere else in the admin section goes to the part
    // they are here for, rather than being bounced out of the platform.
    router.push(isAuditor ? GOVERNANCE_PATH : "/app");
  }, [user, isAllowed, isAuditor, router]);

  // Prevent UI flashing during auth checks and redirects.
  if (user === undefined || !isAllowed) return null;

  const readerOnly = !canWrite(user?.role);

  return (
    <AdminAccessLevelProvider role={user?.role}>
      <div className="flex flex-col flex-1 h-full min-h-[calc(100vh-64px)] w-full relative">
        <Header />
        {readerOnly ? (
          /**
           * Said once, at the top, rather than as a tooltip on each missing
           * button. Someone who cannot find the button they expected needs to
           * be told why before they go looking for it.
           */
          <div className="flex items-start gap-3 px-6 py-3 border-b border-border-dim bg-foreground/[0.03] text-[13px] text-secondary">
            <Eye className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            {/*
              Two roles reach this banner and they see different amounts, so it
              says which. Telling an auditor they "can see everything here" when
              Governance is all they can open is simply untrue.
            */}
            <p>
              <span className="text-foreground font-medium">
                {isAuditor ? t('auditorTitle') : t('readOnlyTitle')}
              </span>{" "}
              {isAuditor ? t('auditorDescription') : t('readOnlyDescription')}
            </p>
          </div>
        ) : null}
        <main className="flex-1 flex flex-col items-stretch relative">
          {children}
        </main>
      </div>
    </AdminAccessLevelProvider>
  );
}
