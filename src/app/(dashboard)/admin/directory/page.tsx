"use client";

/**
 * The admin user directory — read-only.
 *
 * Governed by docs/plans/active/user-directory-plan.md.
 *
 * Anthony, 2026-07-31: *"i dont want to add / edit or delete users i want
 * observability."* There is deliberately no control on this page that mutates a
 * user; managing them stays on /admin/users. A test asserts that, because the
 * temptation on a screen like this is one "quick" toggle.
 */

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Users, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";

type RoleFilter = "any" | "USER" | "ADMIN";
type ActivityFilter = "any" | "active7" | "active30" | "dormant" | "never";
type SortBy = "lastLogin" | "loginCount";


/** Relative recency reads faster than a date when scanning for dormancy. */
function relativeDays(timestamp: number | null) {
  if (timestamp === null) return null;
  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted" title={title}>
      <span className="uppercase tracking-[0.1em]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="bg-card/40 border border-border-dim rounded-[10px] px-3 py-2 text-[13px] text-foreground outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function UserDirectoryPage() {
  const t = useTranslations("admin.directory");

  const [searchTerm, setSearchTerm] = useState("");
  const [companyId, setCompanyId] = useState<string>("any");
  const [role, setRole] = useState<RoleFilter>("any");
  const [activity, setActivity] = useState<ActivityFilter>("any");
  const [sortBy, setSortBy] = useState<SortBy>("lastLogin");

  const companies = useQuery(api.companies.getCompanies, { mode: "directoryOptions" });

  const searching = searchTerm.trim() !== "";

  const { results, status, loadMore } = usePaginatedQuery(
    api.users.listDirectoryUsers,
    {
      searchTerm: searching ? searchTerm.trim() : undefined,
      companyId: companyId === "any" ? undefined : (companyId as Id<"companies">),
      role: role === "any" ? undefined : role,
      activity,
      sortBy,
    },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const loading = status === "LoadingFirstPage";

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        divider
        icon={<Users className="w-5 h-5" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="flex flex-wrap items-center gap-4">
        <FilterSelect
          label={t("filters.company")}
          value={companyId}
          onChange={setCompanyId}
          options={[
            { value: "any", label: t("filters.allCompanies") },
            ...(companies ?? []).map((company: { _id: string; name: string }) => ({
              value: company._id,
              label: company.name,
            })),
          ]}
        />
        <FilterSelect
          label={t("filters.role")}
          value={role}
          onChange={(value) => setRole(value as RoleFilter)}
          options={[
            { value: "any", label: t("filters.allRoles") },
            { value: "USER", label: t("filters.roleUser") },
            { value: "ADMIN", label: t("filters.roleAdmin") },
          ]}
        />
        <FilterSelect
          label={t("filters.activity")}
          value={activity}
          onChange={(value) => setActivity(value as ActivityFilter)}
          options={[
            { value: "any", label: t("filters.anyActivity") },
            { value: "active7", label: t("filters.active7") },
            { value: "active30", label: t("filters.active30") },
            { value: "dormant", label: t("filters.dormant") },
            { value: "never", label: t("filters.never") },
          ]}
        />
        {/*
          Convex search indexes support equality filters only, never ranges, so
          a query cannot both full-text search and range-sort. The control is
          disabled with a reason rather than silently ignored.
        */}
        <FilterSelect
          label={t("filters.sortBy")}
          value={sortBy}
          disabled={searching}
          title={searching ? t("filters.sortUnavailable") : undefined}
          onChange={(value) => setSortBy(value as SortBy)}
          options={[
            { value: "lastLogin", label: t("filters.sortLastLogin") },
            { value: "loginCount", label: t("filters.sortLoginCount") },
          ]}
        />
        {searching && (
          <span className="text-[12px] text-muted italic">{t("filters.sortUnavailable")}</span>
        )}
      </div>

      <DataTable
        rows={loading ? undefined : results}
        rowKey={(person) => person._id}
        search={{ value: searchTerm, onChange: setSearchTerm, placeholder: t("searchPlaceholder") }}
        empty={{ icon: <UserRound className="w-6 h-6 text-muted" />, label: t("empty") }}
        /* Was a bare "load more" link centred in its own bar. The house footer
           says how many are showing as well as offering the next page. */
        footer={{
          mode: "loadMore",
          visibleCount: results.length,
          canLoadMore: status === "CanLoadMore",
          isLoading: status === "LoadingMore",
          onLoadMore: () => loadMore(TABLE_PAGE_SIZE),
          labels: { empty: t("empty"), loadMore: t("loadMore") },
        }}
        columns={[
          {
            key: "person",
            header: t("table.person"),
            cell: (person) => (
              <Link href={`/admin/users/${person._id}`} className="flex items-center gap-3">
                {person.image ? (
                  /*
                   * `unoptimized` because an avatar URL can be any host — a
                   * Google photo, a dicebear placeholder, an upload. Routing
                   * those through Next's optimiser means allowlisting every host
                   * a user might arrive with, which is unwinnable.
                   */
                  <Image
                    src={person.image}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="rounded-full w-8 h-8 object-cover"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-foreground/5 grid place-items-center text-[12px] text-muted">
                    {(person.name ?? person.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] text-foreground truncate">
                    {person.name ?? t("table.unnamed")}
                  </span>
                  <span className="text-[12px] text-muted truncate">{person.email}</span>
                </span>
              </Link>
            ),
          },
          {
            key: "company",
            header: t("table.company"),
            cell: (person) => (
              <span className="text-[13px] text-secondary">
                {person.companyName ?? t("table.noCompany")}
              </span>
            ),
          },
          {
            key: "role",
            header: t("table.role"),
            cell: (person) => <span className="text-[13px] text-secondary">{person.role}</span>,
          },
          {
            key: "lastLogin",
            header: t("table.lastLogin"),
            cell: (person) =>
              person.lastLoginAt === null ? (
                /*
                 * "Never" is its own state, not a very old date. Sorting nulls as
                 * ancient timestamps would read as "logged in long ago", which is
                 * a different and more reassuring claim.
                 */
                <span className="text-[11px] uppercase tracking-[0.08em] px-2 py-1 rounded-full bg-foreground/5 text-muted">
                  {t("table.never")}
                </span>
              ) : (
                <span className="text-[13px] text-secondary" title={formatDate(person.lastLoginAt)}>
                  {relativeDays(person.lastLoginAt)}
                </span>
              ),
          },
          {
            key: "logins30d",
            header: t("table.logins30d"),
            align: "right",
            cell: (person) => (
              <span className="text-[13px] text-secondary tabular-nums">{person.loginCount30d}</span>
            ),
          },
          {
            key: "joined",
            header: t("table.joined"),
            cell: (person) => (
              <span className="text-[13px] text-secondary">
                {person.createdAt ? formatDate(person.createdAt) : "—"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
