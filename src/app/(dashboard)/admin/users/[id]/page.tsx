"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, User, ShieldCheck, ShieldAlert, Search, Loader2, MonitorSmartphone, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDate, formatDateTime } from "@/src/lib/dates";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as Id<"users">;

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"logins" | "costs">("logins");
  const t = useTranslations('admin.users.profilePage');

  const { results: logins, status, loadMore } = usePaginatedQuery(
    api.users.getUserLogins,
    { userId, searchTerm },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const parseUserAgent = (ua: string) => {
    if (ua.includes("Mac OS")) return t('devices.macOS');
    if (ua.includes("Windows")) return t('devices.windows');
    if (ua.includes("iPhone")) return t('devices.iPhone');
    if (ua.includes("Android")) return t('devices.android');
    return t('devices.unknown');
  };

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
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <User className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/admin/users"
            className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('backToDirectory')}
          </Link>
        </div>
      </header>

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

              <div className="relative w-full sm:w-[260px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-muted" />
                </div>
                <input
                  type="text"
                  placeholder={t('logins.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background/50 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
                />
              </div>
            </div>

            <div className="w-full bg-background/30 border border-border-dim/50 rounded-[12px] overflow-hidden">
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-dim/50 bg-sidebar/20">
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('logins.table.device')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('logins.table.location')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('logins.table.status')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest text-right">{t('logins.table.timestamp')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/30">
                    {status === "LoadingFirstPage" && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-secondary">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
                        </td>
                      </tr>
                    )}

                    {logins.length === 0 && status === "CanLoadMore" && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                          {t('logins.empty')}
                        </td>
                      </tr>
                    )}

                    {logins.map((login) => (
                      <tr key={login._id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-foreground/5 border border-border-dim flex items-center justify-center">
                              <MonitorSmartphone className="w-4 h-4 text-foreground/70" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[13px] font-medium text-foreground tracking-wide">{parseUserAgent(login.device)}</span>
                              <span className="text-[11px] text-muted truncate max-w-[200px]" title={login.device}>{login.device}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-secondary" />
                            <div className="flex flex-col">
                              <span className="text-[13px] text-foreground">{login.location}</span>
                              <span className="text-[11px] font-mono text-muted">{login.ip}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${login.status === 'SUCCESS' ? 'bg-[#10b981]' : 'bg-red-500'}`} />
                            <span className="text-[12px] text-secondary font-medium tracking-wide">
                              {login.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-[12px] text-secondary tracking-wide">
                            {formatDateTime(login.timestamp, {
                              options: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="w-full p-3 border-t border-border-dim/50 flex items-center justify-between bg-sidebar/10 px-5">
                <span className="text-[12px] text-secondary">
                  {logins.length > 0 ? t('logins.showing', { count: logins.length }) : ''}
                </span>
                {status === "CanLoadMore" && (
                  <button
                    onClick={() => loadMore(ADMIN_PAGE_SIZE)}
                    className="px-4 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/5 rounded-full transition-all"
                  >
                    {t('logins.loadMore')}
                  </button>
                )}
              </div>
            </div>
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
  const t = useTranslations('admin.users.profilePage.costs');

  const costs = useQuery(api.analytics.getUserCostOverview, { userId });
  const { results: costThreads, status: costThreadStatus, loadMore: loadMoreCostThreads } = usePaginatedQuery(
    api.analytics.getUserCostThreads,
    { userId },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  if (costs === undefined || costThreadStatus === "LoadingFirstPage") {
    return (
      <div className="flex justify-center p-8 w-full mt-4">
        <Loader2 className="w-5 h-5 animate-spin text-secondary opacity-50" />
      </div>
    );
  }

  const filteredThreads = costThreads.filter((thread) =>
    thread.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 mt-4 w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 border border-border-dim/50 rounded-[12px] bg-background/30 flex flex-col gap-2">
          <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t('grossCost')}</span>
          <span className="text-3xl font-medium text-foreground tracking-tight leading-none mt-1">£{costs.totalCostGBP.toFixed(4)}</span>
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

      <div className="w-full bg-background/30 border border-border-dim/50 rounded-[12px] overflow-hidden mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-dim/50 bg-background/50">
          <div>
            <h3 className="text-[14px] font-medium text-foreground tracking-wide">{t('usageLog')}</h3>
            <p className="text-[12px] text-secondary mt-0.5">{t('usageLogDesc')}</p>
          </div>

          <div className="relative w-full sm:w-[260px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-muted" />
            </div>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background/10 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
            />
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim/50 bg-sidebar/20">
                <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.conversation')}</th>
                <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.date')}</th>
                <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.messages')}</th>
                <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.tokens')}</th>
                <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest text-right">{t('table.cost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/30">
              {filteredThreads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-secondary text-[13px]">
                    {costThreads.length === 0 ? t('empty') : t('noMatch')}
                  </td>
                </tr>
              ) : (
                filteredThreads.map((thread) => (
                  <tr key={thread.threadId} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <span className="text-[13px] font-medium text-foreground">{thread.title}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-secondary">
                        {formatDate(thread.createdAt, { options: { month: 'short', day: 'numeric', year: 'numeric' } })}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-secondary">{thread.messageCount}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-secondary">{thread.threadTokens.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-[13px] font-medium text-brand">£{thread.costGBP.toFixed(4)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="w-full p-3 border-t border-border-dim/50 flex items-center justify-between bg-sidebar/10 px-5">
          <span className="text-[12px] text-secondary">
            {costThreads.length > 0 ? (
              <>{t('pagination.showing')} 1 {t('pagination.to')} {filteredThreads.length} {t('pagination.of')} {costThreads.length} {t('pagination.entries')}</>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadMoreCostThreads(ADMIN_PAGE_SIZE)}
              disabled={costThreadStatus !== "CanLoadMore"}
              className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              {t('pagination.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
