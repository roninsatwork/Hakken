"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import {
  filterPolicies,
  isUnnamed,
  scopeOf,
  sortPolicies,
  type PolicyPriority,
  type PolicyScope,
} from "@/convex/governancePolicyService";
import { Button } from "@/src/ui/atoms/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";

/**
 * Every rule currently governing what the AI may do, as a record.
 *
 * Read-only on purpose, and the duplication with the AI Instructions screen is
 * the point rather than an oversight. A compliance officer needs to see what is
 * in force; an AI administrator needs to change it. They are different people
 * asking different questions, and a single screen serving both ends up serving
 * neither — so this one lists and the other one edits.
 *
 * It listed and did nothing else: no way to search it, narrow it or page
 * through it, and a second table built inside the standard shell's own, which
 * is why it never matched the rest of the section. Now it is the same table
 * every other admin screen uses.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const PRIORITIES: Array<PolicyPriority | "ALL"> = ["ALL", "CRITICAL", "HIGH", "NORMAL", "LOW"];
const SCOPES: Array<PolicyScope | "ALL"> = ["ALL", "EVERYWHERE", "WORKSPACE", "AGENT"];

export default function GovernancePoliciesPage() {
  const t = useTranslations("admin.governance.policies");
  const rules = useQuery(api.aiRules.getRules, {});

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<PolicyPriority | "ALL">("ALL");
  const [scope, setScope] = useState<PolicyScope | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const active = useMemo(() => rules?.filter((rule) => rule.isActive), [rules]);

  const visible = useMemo(
    () => (active ? sortPolicies(filterPolicies(active, { search, priority, scope })) : []),
    [active, search, priority, scope],
  );

  // Narrowing the list moves the reader back to the front of it.
  const narrow = <T,>(apply: () => T) => {
    setPage(1);
    return apply();
  };

  const paged = paginateItems(visible, page, TABLE_PAGE_SIZE);
  const filtering = search.trim() !== "" || priority !== "ALL" || scope !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ScrollText className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <DataTable
        rows={active === undefined ? undefined : paged.items}
        rowKey={(rule) => rule._id}
        minWidthClassName="min-w-[820px]"
        search={{
          value: search,
          onChange: (value) => narrow(() => setSearch(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            <Select
              id="policy-priority"
              value={priority}
              onChange={(next) => narrow(() => setPriority(next as PolicyPriority | "ALL"))}
              aria-label={t("filters.priorityLabel")}
              className="w-[160px]"
            >
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? t("filters.allPriorities") : t(`priority.${option}`)}
                </option>
              ))}
            </Select>

            <Select
              id="policy-scope"
              value={scope}
              onChange={(next) => narrow(() => setScope(next as PolicyScope | "ALL"))}
              aria-label={t("filters.scopeLabel")}
              className="w-[190px]"
            >
              {SCOPES.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? t("filters.allScopes") : t(`scope.${option}`)}
                </option>
              ))}
            </Select>

            {filtering ? (
              <Button
                variant="ghost"
                onClick={() =>
                  narrow(() => {
                    setSearch("");
                    setPriority("ALL");
                    setScope("ALL");
                  })
                }
                className="h-[38px] rounded-[10px] px-3 py-0 font-normal hover:bg-transparent"
              >
                {t("filters.clear")}
              </Button>
            ) : null}
          </>
        }
        /* Nothing matched and nothing exists are different answers. */
        empty={{
          icon: <ScrollText className="w-5 h-5" />,
          label: filtering ? t("noMatches") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: active === undefined,
          onPageChange: setPage,
          labels: {
            previous: t("pagination.previous"),
            next: t("pagination.next"),
            empty: filtering ? t("noMatches") : t("empty"),
            page: (current, total) => t("pagination.page", { page: current, total }),
            showing: (start, end, total) => t("pagination.showing", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            className: "max-w-[240px]",
            cell: (rule) => (
              <>
                {isUnnamed(rule) ? (
                  /* An unnamed rule is not a display problem to paper over — a
                     critical rule governing everything that nobody has named is
                     a small governance gap of its own. */
                  <span className="block text-[13px] font-medium text-[#b45309] dark:text-[#fbbf24]">
                    {t("table.unnamed")}
                  </span>
                ) : (
                  <span className="block text-[13px] font-medium text-foreground">{rule.name}</span>
                )}
                <span className="mt-0.5 block truncate text-[12px] text-muted">{rule.trigger}</span>
              </>
            ),
          },
          {
            key: "applies",
            header: t("table.applies"),
            /* Said in words rather than as a scope code, because the reader
               here is not the person who set it up. */
            cell: (rule) => (
              <span className="text-[12px] text-secondary">{t(`scope.${scopeOf(rule)}`)}</span>
            ),
          },
          {
            key: "priority",
            header: t("table.priority"),
            cell: (rule) => (
              <span
                className={`flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                  rule.priority === "CRITICAL"
                    ? "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#b45309] dark:text-[#fbbf24]"
                    : "border-border-dim bg-foreground/5 text-foreground/80"
                }`}
              >
                {t(`priority.${rule.priority}`)}
              </span>
            ),
          },
          {
            key: "instruction",
            header: t("table.instruction"),
            className: "max-w-[380px]",
            cell: (rule) => (
              <span className="line-clamp-2 text-[12px] text-secondary">{rule.instruction}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
