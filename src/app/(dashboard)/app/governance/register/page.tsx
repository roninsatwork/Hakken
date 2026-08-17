"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Bolt, ClipboardList, Globe, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { formatDate } from "@/src/lib/dates";

/**
 * The customer's own view of register.
 *
 * The same screen as the platform one, reaching only this workspace. That
 * split is the product: the pitch is that customers demonstrate *their*
 * compliance, and a customer's compliance officer is not a platform
 * administrator and never will be. Scoping happens in the query, so this
 * cannot show another tenant's records by forgetting a filter here.
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
    { key: "unrated", value: summary?.unrated, needsAttention: true },
    { key: "highRisk", value: summary?.highRisk },
    { key: "publicFacing", value: summary?.publicFacing },
    { key: "unattended", value: summary?.unattended },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
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

      {/* TableShell draws the table element itself — see the policies screen. */}
      <TableShell minWidthClassName="min-w-[900px]">
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>{t("table.system")}</TableHeaderCell>
              <TableHeaderCell>{t("table.kind")}</TableHeaderCell>
              <TableHeaderCell>{t("table.risk")}</TableHeaderCell>
              <TableHeaderCell>{t("table.owner")}</TableHeaderCell>
              <TableHeaderCell>{t("table.oversight")}</TableHeaderCell>
              <TableHeaderCell>{t("table.lastActive")}</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {entries === undefined ? (
              <TableLoadingRow colSpan={6} />
            ) : entries.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
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
                  <td className="px-4 py-3">
                    {/*
                      A text label always, with the amber reserved for the
                      rating that actually restrains something. Colour on its
                      own would be carrying meaning nobody can rely on.
                    */}
                    <span
                      className={`inline-block rounded-[6px] px-2 py-1 text-[11px] ${
                        entry.risk === "HIGH"
                          ? "bg-[#fef3c7] text-[#78350f] dark:bg-[#78350f] dark:text-[#fef3c7]"
                          : entry.risk === "UNRATED"
                            ? "text-[#b45309] dark:text-[#fbbf24]"
                            : "bg-sidebar/60 text-secondary"
                      }`}
                    >
                      {t(`risk.${entry.risk}`)}
                    </span>
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
      </TableShell>
    </div>
  );
}
