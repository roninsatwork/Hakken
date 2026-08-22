"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, User, ShieldCheck, ShieldAlert, Loader2, MessageSquare, MonitorSmartphone, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { describeDevice } from "@/src/lib/devices";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as Id<"users">;

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"logins" | "costs">("logins");
  const t = useTranslations('admin.users.profilePage');
  const tCommon = useTranslations('common');

  const { results: logins, status, loadMore } = usePaginatedQuery(
    api.users.getUserLogins,
    { userId, searchTerm },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const pagedLogins = usePagedRows(logins, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  // Assume user exists for the deep link
  const user = useQuery(api.users.getUserById, { id: userId });

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-t-2 border-brand animate-spin" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <ShieldAlert className="w-12 h-12 text-red-500/50" />
        <h2 className="text-xl font-medium text-foreground">{t('userNotFound')}</h2>
        <Link href="/admin/users" className="text-sm text-secondary hover:text-foreground">
          &larr; {t('returnToDirectory')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8 relative z-10">

      {/* Header Section */}
      <PageHeader
        icon={<User className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex items-center gap-4">
            <Link
              href="/admin/users"
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('backToDirectory')}
            </Link>
          </div>
        }
      />

      {/* Profile Info Grid */}
      <div className="w-full mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-8 w-full">

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('fields.fullName')}</label>
            <div className="text-[15px] font-medium text-foreground flex items-center">
              {user.name || t('fields.unnamed')}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest flex items-center justify-between">
              <span>{t('fields.communications')}</span>
              <span className="text-[9px] bg-foreground/10 px-2 py-0.5 rounded-sm text-foreground/70 tracking-normal">{t('fields.verified')}</span>
            </label>
            <div className="text-[15px] text-foreground flex items-center">
              {user.email || t('fields.noEmail')}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('fields.systemRole')}</label>
            <div className="flex items-center gap-2 text-foreground">
              {user.role === 'ADMIN' ? <ShieldCheck className="w-4 h-4 text-brand" /> : <User className="w-4 h-4 text-foreground/70" />}
              <span className="text-[13px] font-mono font-medium tracking-wide">{user.role || 'USER'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('fields.profilePhoto')}</label>
            <div className="flex items-center gap-4 w-full h-full">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? user.email ?? t('fields.profilePhoto')}
                  width={44}
                  height={44}
                  unoptimized
                  className="w-11 h-11 rounded-full object-cover border border-border-dim shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-11 h-11 rounded-full border border-dashed border-border-dim flex items-center justify-center bg-foreground/5 shrink-0">
                  <User className="w-5 h-5 text-muted" />
                </div>
              )}
              <div className="flex flex-col items-start gap-1">
                <span className="text-[13px] font-medium text-foreground">{t('fields.currentAvatar')}</span>
                <p className="text-[11px] text-secondary">{t('fields.avatarDesc')}</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Advanced Details tabs */}
      <div className="w-full flex gap-6 border-b border-border-dim/50 pb-3 mt-6 relative z-10">
        {/* This pair stays raw: underline tabs that turn brand when active — matches no variant. */}
        <button
          onClick={() => setActiveTab("logins")}
          className={`text-[13px] font-medium transition-colors relative ${activeTab === "logins" ? "text-brand" : "text-secondary hover:text-foreground"}`}
        >
          {t('tabs.security')}
          {activeTab === "logins" && <div className="absolute -bottom-[14px] left-0 right-0 h-0.5 bg-brand" />}
        </button>
        <button
          onClick={() => setActiveTab("costs")}
          className={`text-[13px] font-medium transition-colors relative ${activeTab === "costs" ? "text-brand" : "text-secondary hover:text-foreground"}`}
        >
          {t('tabs.aiCosts')}
          {activeTab === "costs" && <div className="absolute -bottom-[14px] left-0 right-0 h-0.5 bg-brand" />}
        </button>
      </div>

      {activeTab === "logins" && (
        <div className="w-full flex flex-col gap-4 mt-4">
          {/* Recent Login Activity */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-medium text-foreground tracking-wide">{t('logins.title')}</h3>
                <p className="text-[12px] text-secondary mt-0.5">{t('logins.description')}</p>
              </div>

              <div className="w-full sm:w-[260px] flex">
                <TableSearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder={t('logins.searchPlaceholder')}
                  clearLabel={tCommon('clearSearch')}
                />
              </div>
            </div>

            <DataTable
              rows={status === "LoadingFirstPage" ? undefined : pagedLogins.pageRows}
              rowKey={(login) => login._id}
              variant="panel"
              headerVariant="strip"
              empty={{ icon: <MonitorSmartphone className="w-8 h-8 text-muted/30" />, label: t('logins.empty') }}
              footer={{
                mode: "paged",
                page: pagedLogins.page,
                totalPages: pagedLogins.totalPages,
                totalCount: pagedLogins.loadedCount,
                pageSize: pagedLogins.pageSize,
                isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
                onPageChange: pagedLogins.goToPage,
                labels: { empty: t('logins.empty') },
              }}
              columns={[
                {
                  key: "device",
                  header: t('logins.table.device'),
                  cell: (login) => (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-foreground/5 border border-border-dim flex items-center justify-center">
                        <MonitorSmartphone className="w-4 h-4 text-foreground/70" />
                      </div>
                      {/* The raw browser string stays in the tooltip as evidence;
                          the row shows what a person can read. */}
                      <span
                        className="text-[13px] font-medium text-foreground tracking-wide"
                        title={login.device}
                      >
                        {describeDevice(login.device)}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "location",
                  header: t('logins.table.location'),
                  cell: (login) => (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-secondary" />
                      <div className="flex flex-col">
                        <span className="text-[13px] text-foreground">{login.location}</span>
                        <span className="text-[11px] font-mono text-muted">{login.ip}</span>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: t('logins.table.status'),
                  cell: (login) => (
                    <div className="flex items-center gap-1.5">
                      {/* Blue for a sign-in that worked, amber for one that did
                          not. Green against red is the one pairing this platform
                          does not use, and the word beside it carries the answer
                          regardless. */}
                      <div className={`w-1.5 h-1.5 rounded-full ${login.status === 'SUCCESS' ? 'bg-info' : 'bg-warning'}`} />
                      <span className="text-[12px] text-secondary font-medium tracking-wide">
                        {login.status}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "timestamp",
                  header: t('logins.table.timestamp'),
                  align: "right",
                  cell: (login) => (
                    <span className="text-[12px] text-secondary tracking-wide">
                      {formatDateTime(login.timestamp, {
                        options: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                      })}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {activeTab === "costs" && (
        <AIUserCosts userId={userId} />
      )}

    </div>
  );
}

function AIUserCosts({ userId }: { userId: Id<"users"> }) {
  const [searchTerm, setSearchTerm] = useState("");
  const t = useTranslations("admin.users.profilePage.costs");
  const tCommon = useTranslations("common");

  const costs = useQuery(api.analytics.getUserCostOverview, { userId });
  const { results: costThreads, status: costThreadStatus, loadMore: loadMoreCostThreads } = usePaginatedQuery(
    api.analytics.getUserCostThreads,
    { userId },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const filteredThreads = costThreads.filter((thread) =>
    thread.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Above the early return: a hook cannot sit behind a condition, or React
  // loses track of which state belongs to which call between renders.
  const pagedThreads = usePagedRows(filteredThreads, {
    canLoadMore: costThreadStatus === "CanLoadMore",
    loadMore: loadMoreCostThreads,
    resetKey: searchTerm,
  });

  if (costs === undefined || costThreadStatus === "LoadingFirstPage") {
    return (
      <div className="flex justify-center p-8 w-full mt-4">
        <Loader2 className="w-5 h-5 animate-spin text-secondary opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 mt-4 w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 border border-border-dim/50 rounded-[12px] bg-background/30 flex flex-col gap-2">
          <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('grossCost')}</span>
          <span className="text-3xl font-medium text-foreground tracking-tight leading-none mt-1">${costs.totalCostGBP.toFixed(4)}</span>
        </div>
        <div className="p-5 border border-border-dim/50 rounded-[12px] bg-background/30 flex flex-col gap-2">
          <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('totalTokens')}</span>
          <div className="flex items-end justify-between w-full mt-1">
            <span className="text-3xl font-medium text-foreground leading-none tracking-tight">{costs.totalTokens.toLocaleString()}</span>
            
            <div className="flex items-center gap-3 bg-black/40 py-1.5 px-3.5 rounded-[8px] border border-white/5 shadow-inner">
                <div className="flex items-center gap-2">
                   <span className="text-[9px] text-muted uppercase tracking-widest font-bold">IN</span>
                   <span className="text-[13px] font-mono text-secondary font-medium">{costs.totalInputTokens?.toLocaleString() || 0}</span>
                </div>
                <div className="w-[1px] h-3 bg-border-dim/50" />
                <div className="flex items-center gap-2">
                   <span className="text-[9px] text-muted uppercase tracking-widest font-bold">OUT</span>
                   <span className="text-[13px] font-mono text-brand font-medium">{costs.totalOutputTokens?.toLocaleString() || 0}</span>
                </div>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        rows={pagedThreads.pageRows}
        rowKey={(thread) => thread.threadId}
        variant="panel"
        headerVariant="strip"
        className="mt-2"
        cardHeader={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-dim/50 bg-background/50">
            <div>
              <h3 className="text-[14px] font-medium text-foreground tracking-wide">{t('usageLog')}</h3>
              <p className="text-[12px] text-secondary mt-0.5">{t('usageLogDesc')}</p>
            </div>

            <div className="w-full sm:w-[260px] flex">
              <TableSearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={t('searchPlaceholder')}
                clearLabel={tCommon('clearSearch')}
              />
            </div>
          </div>
        }
        empty={{
          icon: <MessageSquare className="w-8 h-8 text-muted/30" />,
          label: costThreads.length === 0 ? t('empty') : t('noMatch'),
        }}
        footer={{
          mode: "paged",
          page: pagedThreads.page,
          totalPages: pagedThreads.totalPages,
          totalCount: pagedThreads.loadedCount,
          pageSize: pagedThreads.pageSize,
          isLoading: costThreadStatus === "LoadingMore",
          onPageChange: pagedThreads.goToPage,
          labels: { next: t('pagination.next') },
        }}
        columns={[
          {
            key: "conversation",
            header: t('table.conversation'),
            cell: (thread) => (
              <span className="text-[13px] font-medium text-foreground">{thread.title}</span>
            ),
          },
          {
            key: "date",
            header: t('table.date'),
            cell: (thread) => (
              <span className="text-[13px] text-secondary">
                {formatDate(thread.createdAt, { options: { month: 'short', day: 'numeric', year: 'numeric' } })}
              </span>
            ),
          },
          {
            key: "messages",
            header: t('table.messages'),
            cell: (thread) => <span className="text-[13px] text-secondary">{thread.messageCount}</span>,
          },
          {
            key: "tokens",
            header: t('table.tokens'),
            cell: (thread) => (
              <span className="text-[13px] text-secondary">{thread.threadTokens.toLocaleString()}</span>
            ),
          },
          {
            key: "cost",
            header: t('table.cost'),
            align: "right",
            cell: (thread) => (
              <span className="text-[13px] font-medium text-brand">${thread.costGBP.toFixed(4)}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
