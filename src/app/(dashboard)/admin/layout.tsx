"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
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
 * `AUDITOR` is deliberately absent until the Governance section exists. An
 * auditor sees the governance surfaces only, which is narrower than this
 * section, so letting them in here now would grant more than the role is meant
 * to carry. See docs/plans/active/governance-and-trust-plan.md.
 */
const ADMIN_SECTION_ROLES = ["SUPER_ADMIN", "READ_ONLY"];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useQuery(api.users.getMe);
  const t = useTranslations('admin.access');

  const isAllowed = Boolean(user?.role && ADMIN_SECTION_ROLES.includes(user.role));

  useEffect(() => {
    if (user !== undefined && !isAllowed) {
      router.push("/app");
    }
  }, [user, isAllowed, router]);

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
            <p>
              <span className="text-foreground font-medium">{t('readOnlyTitle')}</span>{" "}
              {t('readOnlyDescription')}
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
