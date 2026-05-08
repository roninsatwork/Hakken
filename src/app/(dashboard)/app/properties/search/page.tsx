"use client";

import { useTranslations } from "next-intl";
import { Search, Loader2, Link2, Settings2, Activity, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PropertiesSearchPage() {
  const t = useTranslations();
  const startScrape = useAction(api.apify.startRightmoveScrape);
  
  const [baseRightmoveUrl, setBaseRightmoveUrl] = useState("");
  const [maxProperties, setMaxProperties] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleUrlPaste = (val: string) => {
    setBaseRightmoveUrl(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUrl = baseRightmoveUrl.trim();
    
    // Basic validation
    if (!trimmedUrl.includes("rightmove.co.uk")) {
      setMessage(t('properties.search.urlError'));
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      await startScrape({
        listUrls: [trimmedUrl],
        maxProperties: maxProperties,
      });

      setMessage(t('properties.search.searchSuccess'));
      setBaseRightmoveUrl("");
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Search className="w-6 h-6 text-brand" />
              {t('sidebar.propertiesSearch')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              Import property listings and market data directly from Rightmove.
            </p>
          </div>
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[32px] p-8 sm:p-10 backdrop-blur-xl shadow-xl max-w-4xl relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-brand/5 blur-[100px] pointer-events-none rounded-full" />

          <div className="mb-10 relative z-10 flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-light tracking-[0.08em] text-foreground mb-3">{t('properties.search.title')}</h2>
              <p className="text-secondary text-[14px] leading-relaxed max-w-2xl">
                {t('properties.search.description')}
              </p>
            </div>
            
            <div className="bg-brand/5 border border-brand/20 rounded-[16px] p-4 flex items-start gap-3 max-w-2xl">
              <div className="mt-0.5 text-brand flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[13px] text-foreground/80 leading-relaxed">
                <strong className="text-foreground font-medium">{t('properties.search.fetchingDetailsTitle')}:</strong> {t('properties.search.fetchingDetailsDesc')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-10 relative z-10">
            
            {/* Step 1: Base URL */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">1</div>
                <label className="text-[12px] font-semibold text-foreground uppercase tracking-widest">{t('properties.search.step1')}</label>
              </div>
              <div className="relative">
                <div className="absolute top-4 left-4 text-muted">
                  <Link2 className="w-5 h-5" />
                </div>
                <input 
                  type="url"
                  value={baseRightmoveUrl}
                  onChange={e => handleUrlPaste(e.target.value)}
                  placeholder={t('properties.search.urlPlaceholder')}
                  className="w-full bg-background border border-border-dim rounded-[16px] py-4 pl-12 pr-4 text-[14px] text-foreground focus:border-brand/50 focus:ring-1 focus:ring-brand/50 outline-none transition-all font-mono shadow-sm"
                  required
                />
              </div>
            </div>

            {/* Step 2: Limits & Submit */}
            <div className={`transition-all duration-500 flex flex-col sm:flex-row sm:items-end justify-between gap-6 pt-6 border-t border-border-dim ${baseRightmoveUrl ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
              
              <div className="flex flex-col gap-2 sm:w-1/3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">2</div>
                  <label className="text-[12px] font-semibold text-foreground uppercase tracking-widest">{t('properties.search.step2')}</label>
                </div>
                <input 
                  type="number"
                  value={maxProperties}
                  onChange={e => setMaxProperties(Number(e.target.value))}
                  min={10}
                  max={1000}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground focus:border-brand/50 outline-none hover:border-foreground/20 transition-colors"
                  required
                />
                <p className="text-[11px] text-muted">{t('properties.search.limitDesc')}</p>
              </div>

              <div className="flex flex-col gap-4 items-end flex-1">
                <button 
                  type="submit"
                  disabled={isSubmitting || !baseRightmoveUrl}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50 w-full sm:w-auto justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('properties.search.startingSearch')}
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      {t('properties.search.gatherButton')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {message && (
              <div className={`p-5 rounded-[16px] text-[14px] border ${message.startsWith('Error') ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-brand/10 border-brand/20 text-brand'} animate-in fade-in slide-in-from-bottom-2`}>
                {message}
              </div>
            )}

          </form>
        </div>

      </div>
    </>
  );
}
