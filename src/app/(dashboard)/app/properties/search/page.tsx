"use client";

import { useTranslations } from "next-intl";
import { Search, Loader2, Link2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Field } from "@/src/ui/components/screens/Field";

function isRightmoveSearchUrl(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isRightmoveHost = hostname === "rightmove.co.uk" || hostname.endsWith(".rightmove.co.uk");
    return parsed.protocol === "https:" && isRightmoveHost && parsed.pathname.includes("/property-for-sale/");
  } catch {
    return false;
  }
}

export default function PropertiesSearchPage() {
  const t = useTranslations();
  const startRightmoveCollection = useMutation(api.propertyAgents.startRightmoveCollection);
  const action = useAdminAction({ scope: "app-properties-search" });

  const [baseRightmoveUrl, setBaseRightmoveUrl] = useState("");
  const [maxProperties, setMaxProperties] = useState(100);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  const handleUrlPaste = (val: string) => {
    setBaseRightmoveUrl(val);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    const trimmedUrl = baseRightmoveUrl.trim();
    
    if (!isRightmoveSearchUrl(trimmedUrl)) {
      setMessage(t('properties.search.urlError'));
      setMessageIsError(true);
      return;
    }

    setMessage("");
    setMessageIsError(false);

    const outcome = await action.run(
      () => startRightmoveCollection({ rightmoveUrl: trimmedUrl, maxProperties }),
      { suppressErrorToast: true, fallbackMessage: t('properties.search.urlError') }
    );

    if (outcome.ok) {
      setMessage(t('properties.search.searchSuccess'));
      setBaseRightmoveUrl("");
    } else if (outcome.message) {
      setMessage(outcome.message);
      setMessageIsError(true);
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
              {t('properties.search.pageSubtitle')}
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
                <span className="text-[12px] font-semibold text-foreground uppercase tracking-widest">{t('properties.search.step1')}</span>
              </div>
              {/* The numbered step above names this box. */}
              <div className="relative">
                <div className="absolute top-1/2 left-4 -translate-y-1/2 text-muted pointer-events-none">
                  <Link2 className="w-5 h-5" />
                </div>
                <Field
                  label={t('properties.search.step1')}
                  labelHidden
                  type="url"
                  value={baseRightmoveUrl}
                  onChange={e => handleUrlPaste(e.target.value)}
                  placeholder={t('properties.search.urlPlaceholder')}
                  required
                  className="pl-12 font-mono"
                />
              </div>
            </div>

            {/* Step 2: Limits & Submit */}
            <div className={`transition-all duration-500 flex flex-col sm:flex-row sm:items-end justify-between gap-6 pt-6 border-t border-border-dim ${baseRightmoveUrl ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
              
              <div className="flex flex-col gap-2 sm:w-1/3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">2</div>
                  <span className="text-[12px] font-semibold text-foreground uppercase tracking-widest">{t('properties.search.step2')}</span>
                </div>
                <Field
                  label={t('properties.search.step2')}
                  labelHidden
                  type="number"
                  value={maxProperties}
                  onChange={e => setMaxProperties(Number(e.target.value))}
                  min={10}
                  max={1000}
                  required
                />
                <p className="text-[11px] text-muted">{t('properties.search.limitDesc')}</p>
              </div>

              <div className="flex flex-col gap-4 items-end flex-1">
                <button 
                  type="submit"
                  disabled={action.isBusy() || !baseRightmoveUrl}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50 w-full sm:w-auto justify-center"
                >
                  {action.isBusy() ? (
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
              <div className={`p-5 rounded-[16px] text-[14px] border ${messageIsError ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-brand/10 border-brand/20 text-brand'} animate-in fade-in slide-in-from-bottom-2`}>
                {message}
              </div>
            )}

          </form>
        </div>

      </div>
    </>
  );
}
