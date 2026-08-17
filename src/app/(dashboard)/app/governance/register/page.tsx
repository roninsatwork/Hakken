"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, Bolt, ClipboardList, Globe, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import {
  filterRegister,
  sortRegisterBy,
  type AiSystemEntry,
  type AiSystemKind,
} from "@/convex/governanceRegisterService";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
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
 * **The same screen means the same controls.** This shipped with six summary
 * boxes and nothing else — no search, no filters, no page numbers — while the
 * platform's version of it had all three and had already learned that a count
 * nobody can press is decoration. Anthony, 2026-08-17, looking at them side by
 * side. The boxes are the filters now, as they are on the platform screen.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const KINDS: Array<AiSystemKind | "ALL"> = ["ALL", "ASSISTANT", "WIDGET", "WORKFLOW"];

type CountChip = {
  key: string;
  count: number | undefined;
  /** Whether a figure above nought is a problem, and should read as one. */
  needsAttention?: boolean;
  narrows: (entry: AiSystemEntry) => boolean;
};

export default function AiRegisterPage() {
  const t = useTranslations("admin.governance.register");
  const register = useQuery(api.governanceRegister.getAiRegister);

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("total");
  const [kind, setKind] = useState<AiSystemKind | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const entries = register?.entries;
  const summary = register?.summary;

  const chips: CountChip[] = [
    { key: "total", count: summary?.total, narrows: () => true },
    {
      key: "incomplete",
      count: summary?.incomplete,
      needsAttention: true,
      narrows: (entry) => entry.missing.length > 0,
    },
    {
      key: "unrated",
      count: summary?.unrated,
      needsAttention: true,
      narrows: (entry) => entry.risk === "UNRATED",
    },
    { key: "highRisk", count: summary?.highRisk, narrows: (entry) => entry.risk === "HIGH" },
    { key: "publicFacing", count: summary?.publicFacing, narrows: (entry) => entry.facesPublic },
    { key: "unattended", count: summary?.unattended, narrows: (entry) => !entry.humanApproves },
  ];

  const narrows = chips.find((option) => option.key === chip)?.narrows ?? (() => true);

  const visible = useMemo(() => {
    if (!entries) return [];
    return sortRegisterBy(
      filterRegister(entries, { search, risk: "ALL", kind, attentionOnly: false }).filter(narrows),
      "ATTENTION",
    );
    // `narrows` is derived from `chip`, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search, kind, chip]);

  // Narrowing the list moves the reader back to the front of it.
  const narrow = <T,>(apply: () => T) => {
    setPage(1);
    return apply();
  };

  const paged = paginateItems(visible, page, TABLE_PAGE_SIZE);
  const filtering = search.trim() !== "" || chip !== "total" || kind !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ClipboardList className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <DataTable
        rows={entries === undefined ? undefined : paged.items}
        rowKey={(entry) => entry.id}
        minWidthClassName="min-w-[900px]"
        search={{
          value: search,
          onChange: (value) => narrow(() => setSearch(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            {/* The counts are the filters. Six boxes across the top and a
                separate filter row underneath were two controls doing one job,
                and the boxes were the half that could not be pressed. */}
            {chips.map((option) => {
              const active = chip === option.key;
              const flagged = option.needsAttention && (option.count ?? 0) > 0;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => narrow(() => setChip(option.key))}
                  aria-pressed={active}
                  className={`flex h-[34px] items-center gap-2 rounded-full border px-3.5 text-[12px] transition-colors ${
                    active
                      ? "border-foreground/40 text-foreground"
                      : flagged
                        ? "border-[#fbbf24]/40 text-[#b45309] hover:border-[#fbbf24]/70 dark:text-[#fbbf24]"
                        : "border-border-dim text-secondary hover:border-foreground/20"
                  }`}
                >
                  {t(`summary.${option.key}`)}
                  <span className="tabular-nums font-medium">{option.count ?? "\u2014"}</span>
                </button>
              );
            })}

            <label className="sr-only" htmlFor="register-kind">
              {t("filters.kindLabel")}
            </label>
            <Select
              id="register-kind"
              value={kind}
              onChange={(next) => narrow(() => setKind(next as AiSystemKind | "ALL"))}
              className="w-[150px]"
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? t("filters.allKinds") : t(`kind.${option}`)}
                </option>
              ))}
            </Select>

            {filtering ? (
              <button
                type="button"
                onClick={() =>
                  narrow(() => {
                    setSearch("");
                    setChip("total");
                    setKind("ALL");
                  })
                }
                className="h-[34px] rounded-[10px] px-3 text-[13px] text-secondary transition-colors hover:text-foreground"
              >
                {t("filters.clear")}
              </button>
            ) : null}
          </>
        }
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: entries === undefined,
          onPageChange: setPage,
          labels: {
            previous: t("pagination.previous"),
            next: t("pagination.next"),
            empty: filtering ? t("pagination.noMatches") : t("pagination.empty"),
            page: (current, total) => t("pagination.page", { page: current, total }),
            showing: (start, end, total) => t("pagination.showing", { start, end, total }),
          },
        }}
        empty={{
          icon: <ClipboardList className="w-5 h-5" />,
          label: filtering ? t("noMatches") : t("empty"),
        }}
        rowClassName={(entry) =>
          entry.missing.length > 0 ? "bg-[#fef3c7]/40 dark:bg-[#78350f]/20" : ""
        }
        columns={[
          {
            key: "system",
            header: t("table.system"),
            className: "max-w-[320px]",
            cell: (entry) => (
              <>
                <p className="text-[14px] font-medium text-foreground">{entry.name}</p>
                {entry.missing.length > 0 ? (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] text-[#b45309] dark:text-[#fbbf24]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{entry.missing.join(" ")}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-secondary line-clamp-2">{entry.purpose}</p>
                )}
                {entry.model ? <p className="mt-1 text-[11px] text-muted">{entry.model}</p> : null}
              </>
            ),
          },
          {
            key: "kind",
            header: t("table.kind"),
            cell: (entry) => (
              <div className="text-[13px] text-secondary">
                <span className="flex items-center gap-1.5">
                  {entry.facesPublic ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {t(`kind.${entry.kind}`)}
                </span>
                {entry.facesPublic ? (
                  <span className="mt-0.5 block text-[11px] text-muted">{t("facesPublic")}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "risk",
            header: t("table.risk"),
            /*
              A text label always, with the amber reserved for the rating that
              actually restrains something. Colour on its own would be carrying
              meaning nobody can rely on.
            */
            cell: (entry) => (
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
            ),
          },
          {
            key: "owner",
            header: t("table.owner"),
            cell: (entry) => (
              <span className="text-[13px] text-secondary">
                {entry.ownerName || (
                  <span className="text-[#b45309] dark:text-[#fbbf24]">{t("noOwner")}</span>
                )}
              </span>
            ),
          },
          {
            key: "oversight",
            header: t("table.oversight"),
            cell: (entry) => (
              <span className="flex items-center gap-1.5 text-[13px] text-secondary">
                {entry.humanApproves ? (
                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Bolt className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {entry.humanApproves ? t("oversight.human") : t("oversight.unattended")}
              </span>
            ),
          },
          {
            key: "lastActive",
            header: t("table.lastActive"),
            cell: (entry) => (
              <span className="text-[13px] text-secondary">
                {entry.lastActiveAt ? formatDate(entry.lastActiveAt) : "—"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
