"use client";

import React, { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, Loader2, MonitorSmartphone, Shield, MapPin, Activity } from "lucide-react";

export default function ProfileTabs() {
  const [activeTab, setActiveTab] = useState("logins");
  const [searchTerm, setSearchTerm] = useState("");

  const { results, status, loadMore } = usePaginatedQuery(
    api.users.getLogins,
    { searchTerm },
    { initialNumItems: 20 }
  );

  const parseUserAgent = (ua: string) => {
    if (ua.includes("Mac OS")) return "macOS Device";
    if (ua.includes("Windows")) return "Windows PC";
    if (ua.includes("iPhone")) return "iPhone";
    if (ua.includes("Android")) return "Android Device";
    return "Unknown Device";
  };

  return (
    <div className="w-full mt-2 flex flex-col gap-5">
      
      {/* Tab Navigation */}
      <div className="flex items-center gap-6 border-b border-border-dim/50 px-2">
        <button 
          onClick={() => setActiveTab("logins")}
          className={`pb-3 text-[13px] font-medium transition-all relative ${activeTab === "logins" ? "text-foreground" : "text-secondary hover:text-foreground"}`}
        >
          Security & Logins
          {activeTab === "logins" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
          )}
        </button>
      </div>

      {/* Tab Content: Logins */}
      {activeTab === "logins" && (
        <div className="flex flex-col gap-4">
          
          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-medium text-foreground tracking-wide">Recent Login Activity</h3>
              <p className="text-[12px] text-secondary mt-0.5">Track devices and geographic locations assessing your account.</p>
            </div>
            
            <div className="relative w-full sm:w-[260px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-muted" />
              </div>
              <input
                type="text"
                placeholder="Search devices or locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-sidebar/40 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="w-full bg-sidebar/20 border border-border-dim/50 rounded-[16px] overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-dim/50 bg-sidebar/40">
                    <th className="px-5 py-3 text-[11px] font-mono tracking-widest text-muted uppercase">Device</th>
                    <th className="px-5 py-3 text-[11px] font-mono tracking-widest text-muted uppercase">Location & IP</th>
                    <th className="px-5 py-3 text-[11px] font-mono tracking-widest text-muted uppercase">Status</th>
                    <th className="px-5 py-3 text-[11px] font-mono tracking-widest text-muted uppercase text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {status === "LoadingFirstPage" && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
                      </td>
                    </tr>
                  )}
                  
                  {results.length === 0 && status === "CanLoadMore" && (
                     <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                        No login records found. Log in again to record footprints.
                      </td>
                    </tr>
                  )}

                  {results.map((login, idx) => (
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
            
            {/* Pagination Bound */}
            {status === "CanLoadMore" && (
              <div className="w-full p-3 border-t border-border-dim/50 flex justify-center bg-sidebar/20">
                <button 
                  onClick={() => loadMore(20)}
                  className="px-4 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/5 rounded-full transition-all"
                >
                  Load More History
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
