"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Bolt, ClipboardList, Globe, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDate } from "@/src/lib/dates";

/**
 * Every AI system running here, in one list.
 *
 * Nothing on this screen is filed by hand — it reads what exists, so a widget
 * published this morning is on it this morning. Anything nobody has described
 * or taken responsibility for sorts to the top and says so in a sentence,
 * because an incomplete record is the only thing here that needs a person.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function AiRegisterPage() {
  const t = useTranslations("admin.governance.register");
  const register = useQuery(api.governanceRegister.getAiRegister);

  const entries = register?.entries;
  const summary = register?.summary;

  const tiles = [
    { key: "total", value: summary?.total },
    { key: "incomplete", value: summary?.incomplete, needsAttention: true },
    { key: "publicFacing", value: summary?.publicFacing },
    { key: "unattended", value: summary?.unattended },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={<ClipboardList className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ key, value, needsAttention }) => (
          <div key={key} className="rounded-[12px] bg-sidebar/40 border border-border-dim p-4">
            <p className="text-[13px] text-secondary">{t(`summary.${key}`)}</p>
            <p
              className={`text-[24px] font-medium ${
                /* Amber rather than red: a count that needs a person, shown on
                   the blue/amber axis with the label beside it doing the work. */
                needsAttention && (value ?? 0) > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-foreground"
              }`}
            >
              {value ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <AdminTableShell minWidthClassName="min-w-[900px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>{t("table.system")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.kind")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.owner")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.oversight")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.lastActive")}</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {entries === undefined ? (
              <AdminTableLoadingRow colSpan={5} />
            ) : entries.length === 0 ? (
              <AdminTableEmptyRow
                colSpan={5}
                icon={<ClipboardList className="w-5 h-5" />}
                label={t("empty")}
              />
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-border-dim/50 last:border-0 ${
                    entry.missing.length > 0 ? "bg-[#fef3c7]/40 dark:bg-[#78350f]/20" : ""
                  }`}
                >
                  <td className="px-4 py-3 max-w-[320px]">
                    <p className="text-[14px] font-medium text-foreground">{entry.name}</p>
                    {entry.missing.length > 0 ? (
                      <p className="mt-1 flex items-start gap-1.5 text-[12px] text-[#b45309] dark:text-[#fbbf24]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{entry.missing.join(" ")}</span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-secondary line-clamp-2">{entry.purpose}</p>
                    )}
                    {entry.model ? (
                      <p className="mt-1 text-[11px] text-muted">{entry.model}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">
                    <span className="flex items-center gap-1.5">
                      {entry.facesPublic ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      {t(`kind.${entry.kind}`)}
                    </span>
                    {entry.facesPublic ? (
                      <span className="mt-0.5 block text-[11px] text-muted">{t("facesPublic")}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">
                    {entry.ownerName || <span className="text-[#b45309] dark:text-[#fbbf24]">{t("noOwner")}</span>}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">
                    <span className="flex items-center gap-1.5">
                      {entry.humanApproves ? (
                        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Bolt className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {entry.humanApproves ? t("oversight.human") : t("oversight.unattended")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">
                    {entry.lastActiveAt ? formatDate(entry.lastActiveAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableShell>
    </div>
  );
}
