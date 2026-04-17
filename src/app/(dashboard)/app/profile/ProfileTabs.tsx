"use client";

import React, { useState, useEffect } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, Loader2, MonitorSmartphone, Shield, MapPin, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ProfileTabs() {
  const t = useTranslations('user.logins');
  const tCommon = useTranslations('common');
  const [activeTab, setActiveTab] = useState("logins");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const { results, status, loadMore } = usePaginatedQuery(
    api.users.getLogins,
    { searchTerm },
    { initialNumItems: 15 }
  );

  const loginCount = useQuery(api.users.getMyLoginsCount, { searchTerm }) || 0;
  const totalItems = Math.max(results.length, loginCount);
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedItems = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const next = currentPage + 1;
      setCurrentPage(next);
      if (next * itemsPerPage > results.length && status === "CanLoadMore") {
         loadMore(15);
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => Math.max(1, prev - 1));
    }
  };

  React.useEffect(() => {
     setCurrentPage(1);
  }, [searchTerm]);

  const parseUserAgent = (ua: string) => {
    if (ua.includes("Mac OS")) return t('devices.macos');
    if (ua.includes("Windows")) return t('devices.windows');
    if (ua.includes("iPhone")) return t('devices.iphone');
    if (ua.includes("Android")) return t('devices.android');
    return t('devices.unknown');
  };

  return (
    <div className="w-full mt-2 flex flex-col gap-5">

      {/* Tab Navigation */}
      <div className="flex items-center gap-6 border-b border-border-dim/50 px-2">
        <button
          onClick={() => setActiveTab("logins")}
          className={`pb-3 text-[13px] font-medium transition-all relative ${activeTab === "logins" ? "text-foreground" : "text-secondary hover:text-foreground"}`}
        >
          {t('tabs.security')}
          {activeTab === "logins" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10_px_rgba(var(--brand),0.5)]" />
          )}
        </button>
      </div>

      {/* Tab Content: Logins */}
      {activeTab === "logins" && (
        <div className="flex flex-col gap-4">

          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-medium text-foreground tracking-wide">{t('header.title')}</h3>
              <p className="text-[12px] text-secondary mt-0.5">{t('header.description')}</p>
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
                className="w-full pl-9 pr-4 py-2 bg-sidebar/40 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="w-full bg-background/30 border border-border-dim/50 rounded-[12px] overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-dim/50 bg-sidebar/20">
                    <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.device')}</th>
                    <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.location')}</th>
                    <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest">{t('table.status')}</th>
                    <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest text-right">{t('table.timestamp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/30">
                  {(status === "LoadingFirstPage" || status === "LoadingMore") && paginatedItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
                      </td>
                    </tr>
                  )}

                  {paginatedItems.length === 0 && status === "CanLoadMore" && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                        {t('table.empty')}
                      </td>
                    </tr>
                  )}

                  {paginatedItems.map((login, idx) => (
                    <tr key={login._id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-foreground/5 border border-white/5 flex items-center justify-center">
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
                          {new Date(login.timestamp).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalItems > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span>Showing</span>
                    <span className="font-medium text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
                    <span>to</span>
                    <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                    <span>of</span>
                    <span className="font-medium text-foreground">{totalItems}</span>
                    <span>logins</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                      disabled={currentPage === 1}
                      onClick={handlePrevPage}
                      className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button 
                      disabled={currentPage >= totalPages}
                      onClick={handleNextPage}
                      className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
