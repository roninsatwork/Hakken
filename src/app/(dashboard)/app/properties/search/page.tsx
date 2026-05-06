"use client";

import { useTranslations } from "next-intl";
import { Search, Loader2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PropertiesSearchPage() {
  const t = useTranslations('sidebar');
  const startScrape = useAction(api.apify.startRightmoveScrape);
  
  const [urls, setUrls] = useState("");
  const [maxProperties, setMaxProperties] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const urlArray = urls.split("\n").map(u => u.trim()).filter(u => u);
      if (urlArray.length === 0) throw new Error("Please enter at least one URL.");

      const runId = await startScrape({
        listUrls: urlArray,
        maxProperties: maxProperties,
      });

      setMessage(`Scraper started successfully! Run ID: ${runId}. You can view the results in the Scraped Data tab once it finishes.`);
      setUrls("");
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Search className="w-6 h-6 text-brand" />
              {t('propertiesSearch')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              Initialize the autonomous Rightmove agent to scrape market data.
            </p>
          </div>
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] p-8 backdrop-blur-xl shadow-sm max-w-3xl">
          <div className="mb-8">
            <h2 className="text-xl font-light tracking-[0.12em] text-foreground mb-2">Rightmove Target Definition</h2>
            <p className="text-secondary text-[13px] leading-relaxed">
              The scraper directly mirrors a Rightmove search query. To configure a scrape (e.g. Louth, £190k max, 3 beds, no auctions), go to <a href="https://rightmove.co.uk" target="_blank" className="text-brand hover:underline font-medium">rightmove.co.uk</a>, perform your exact search, and paste the resulting URL below. Qualitative AI filtering (like "no solar panels") will be run automatically after the raw data is ingested.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">Rightmove Search URLs</label>
              <textarea 
                value={urls}
                onChange={e => setUrls(e.target.value)}
                placeholder={"https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E87490\n(One URL per line)"}
                className="w-full bg-background border border-border-dim rounded-[12px] p-4 text-sm text-foreground focus:border-brand/50 outline-none transition-all min-h-[120px] font-mono"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">Maximum Properties to Scrape</label>
              <input 
                type="number"
                value={maxProperties}
                onChange={e => setMaxProperties(Number(e.target.value))}
                min={10}
                max={1000}
                className="w-full sm:w-1/3 bg-background border border-border-dim rounded-[12px] px-4 py-3 text-sm text-foreground focus:border-brand/50 outline-none transition-all"
                required
              />
              <p className="text-[11px] text-muted">Limits the total records fetched per URL. Apify caps at 1000 per search.</p>
            </div>

            {message && (
              <div className={`p-4 rounded-[12px] text-[13px] border ${message.startsWith('Error') ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-brand/10 border-brand/20 text-brand'}`}>
                {message}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-border-dim">
              <button 
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-3 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing Agent...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Dispatch Scraper
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
