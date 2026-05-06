"use client";

import { useTranslations } from "next-intl";
import { Search, Loader2, Link2, Settings2, Activity, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PropertiesSearchPage() {
  const t = useTranslations('sidebar');
  const startScrape = useAction(api.apify.startRightmoveScrape);
  const latestRuns = useQuery(api.properties.getLatestRuns) || [];
  
  const [baseRightmoveUrl, setBaseRightmoveUrl] = useState("");
  
  // Parsed states
  const [locationName, setLocationName] = useState("");
  const [locationIdentifier, setLocationIdentifier] = useState("");
  const [radius, setRadius] = useState("0.0");
  const [maxPrice, setMaxPrice] = useState("");
  const [minBedrooms, setMinBedrooms] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [includeSSTC, setIncludeSSTC] = useState(false);

  const [maxProperties, setMaxProperties] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleUrlPaste = (val: string) => {
    setBaseRightmoveUrl(val);
    try {
      const url = new URL(val);
      if (url.hostname.includes("rightmove.co.uk")) {
        const params = new URLSearchParams(url.search);
        
        if (params.get("searchLocation")) setLocationName(params.get("searchLocation") || "");
        if (params.get("locationIdentifier")) setLocationIdentifier(params.get("locationIdentifier") || "");
        if (params.get("radius")) setRadius(params.get("radius") || "0.0");
        if (params.get("maxPrice")) setMaxPrice(params.get("maxPrice") || "");
        if (params.get("minBedrooms")) setMinBedrooms(params.get("minBedrooms") || "");
        if (params.get("_includeSSTC") === "on" || params.get("includeSSTC") === "true") setIncludeSSTC(true);
        else setIncludeSSTC(false);
        
        const pt = params.get("propertyTypes");
        if (pt) setPropertyTypes(pt.split(","));
        else setPropertyTypes([]);
      }
    } catch(e) {
      // invalid URL, ignore until valid
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationIdentifier) {
      setMessage("Error: Please paste a valid Rightmove search URL first.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      // Reconstruct the URL based on user inputs
      const url = new URL("https://www.rightmove.co.uk/property-for-sale/find.html");
      if (locationName) url.searchParams.set("searchLocation", locationName);
      url.searchParams.set("useLocationIdentifier", "true");
      url.searchParams.set("locationIdentifier", locationIdentifier);
      if (radius !== "0.0") url.searchParams.set("radius", radius);
      if (propertyTypes.length > 0) url.searchParams.set("propertyTypes", propertyTypes.join(","));
      if (maxPrice) url.searchParams.set("maxPrice", maxPrice);
      if (minBedrooms) url.searchParams.set("minBedrooms", minBedrooms);
      if (includeSSTC) url.searchParams.set("_includeSSTC", "on");

      const runId = await startScrape({
        listUrls: [url.toString()],
        maxProperties: maxProperties,
      });

      setMessage(`Search started successfully! Gathering the full property details can take up to 30 minutes. We recommend grabbing a coffee while you wait! You can track the progress in the Logs tab.`);
      setBaseRightmoveUrl("");
      setLocationIdentifier("");
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
              {t('propertiesSearch')}
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
              <h2 className="text-2xl font-light tracking-[0.08em] text-foreground mb-3">Choose Your Search Area</h2>
              <p className="text-secondary text-[14px] leading-relaxed max-w-2xl">
                To get started, simply go to Rightmove, run your desired search, and paste the web address (URL) below. Our system will automatically read your search criteria so you can easily review or adjust it before starting.
              </p>
            </div>
            
            <div className="bg-brand/5 border border-brand/20 rounded-[16px] p-4 flex items-start gap-3 max-w-2xl">
              <div className="mt-0.5 text-brand flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[13px] text-foreground/80 leading-relaxed">
                <strong className="text-foreground font-medium">Fetching Full Details:</strong> We don't just skim the search results—our system carefully opens every single property listing to gather the complete photo galleries, floorplans, and key features. To do this safely and ensure we get all the data, <strong className="text-foreground font-medium">this process can take up to 30 minutes.</strong> We recommend grabbing a coffee while you wait! You can watch the live progress in the <strong className="text-brand font-medium">Logs</strong> tab.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-10 relative z-10">
            
            {/* Step 1: Base URL */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">1</div>
                <label className="text-[12px] font-semibold text-foreground uppercase tracking-widest">Paste Source URL</label>
              </div>
              <div className="relative">
                <div className="absolute top-4 left-4 text-muted">
                  <Link2 className="w-5 h-5" />
                </div>
                <input 
                  type="url"
                  value={baseRightmoveUrl}
                  onChange={e => handleUrlPaste(e.target.value)}
                  placeholder="https://www.rightmove.co.uk/property-for-sale/find.html?..."
                  className="w-full bg-background border border-border-dim rounded-[16px] py-4 pl-12 pr-4 text-[14px] text-foreground focus:border-brand/50 focus:ring-1 focus:ring-brand/50 outline-none transition-all font-mono shadow-sm"
                  required
                />
              </div>
            </div>

            {/* Step 2: Parsed Parameters */}
            <div className={`transition-all duration-500 origin-top flex flex-col gap-6 ${locationIdentifier ? 'opacity-100 scale-100' : 'opacity-50 scale-[0.98] pointer-events-none grayscale'}`}>
              
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">2</div>
                <label className="text-[12px] font-semibold text-foreground uppercase tracking-widest flex items-center gap-2">
                  Review & Adjust Criteria <Settings2 className="w-4 h-4 text-brand" />
                </label>
              </div>

              <div className="bg-background/40 border border-border-dim rounded-[24px] p-6 sm:p-8 flex flex-col gap-8 shadow-sm">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                  {/* Location (Read-only) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] uppercase tracking-widest text-secondary">Target Location</label>
                    <input 
                      type="text"
                      value={locationName}
                      disabled
                      className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-muted cursor-not-allowed font-medium"
                    />
                  </div>
                  
                  {/* Radius */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] uppercase tracking-widest text-secondary">Search Radius</label>
                    <select 
                      value={radius}
                      onChange={e => setRadius(e.target.value)}
                      className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground focus:border-brand/50 outline-none appearance-none cursor-pointer hover:border-foreground/20 transition-colors"
                    >
                      <option value="0.0">This area only</option>
                      <option value="0.25">Within ¼ mile</option>
                      <option value="0.5">Within ½ mile</option>
                      <option value="1.0">Within 1 mile</option>
                      <option value="3.0">Within 3 miles</option>
                      <option value="5.0">Within 5 miles</option>
                      <option value="10.0">Within 10 miles</option>
                      <option value="15.0">Within 15 miles</option>
                      <option value="20.0">Within 20 miles</option>
                      <option value="30.0">Within 30 miles</option>
                      <option value="40.0">Within 40 miles</option>
                    </select>
                  </div>

                  {/* Max Price */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] uppercase tracking-widest text-secondary">Max Price (£)</label>
                    <input 
                      type="number"
                      value={maxPrice}
                      onChange={e => setMaxPrice(e.target.value)}
                      placeholder="No Maximum"
                      className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground focus:border-brand/50 outline-none hover:border-foreground/20 transition-colors"
                    />
                  </div>

                  {/* Min Bedrooms */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] uppercase tracking-widest text-secondary">Min Bedrooms</label>
                    <select 
                      value={minBedrooms}
                      onChange={e => setMinBedrooms(e.target.value)}
                      className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground focus:border-brand/50 outline-none appearance-none cursor-pointer hover:border-foreground/20 transition-colors"
                    >
                      <option value="">Any</option>
                      <option value="1">1 Bedroom</option>
                      <option value="2">2 Bedrooms</option>
                      <option value="3">3 Bedrooms</option>
                      <option value="4">4 Bedrooms</option>
                      <option value="5">5+ Bedrooms</option>
                    </select>
                  </div>
                </div>

                <div className="h-px w-full bg-border-dim" />

                {/* Property Types */}
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] uppercase tracking-widest text-secondary">Included Property Types</label>
                  <div className="flex flex-wrap gap-2.5">
                    {["detached", "semi-detached", "terraced", "flat", "bungalow", "land", "commercial"].map(type => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => {
                          if (propertyTypes.includes(type)) {
                            setPropertyTypes(propertyTypes.filter(t => t !== type));
                          } else {
                            setPropertyTypes([...propertyTypes, type]);
                          }
                        }}
                        className={`px-4 py-2 rounded-[10px] text-[13px] font-medium capitalize border transition-all ${
                          propertyTypes.includes(type) 
                            ? "bg-brand/10 border-brand/30 text-brand shadow-[0_0_10px_rgba(var(--brand),0.1)]" 
                            : "bg-background border-border-dim text-secondary hover:border-foreground/20 hover:text-foreground"
                        }`}
                      >
                        {type.replace("-", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Include SSTC */}
                <div className="flex items-center gap-3 pt-2">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox"
                      id="sstc"
                      checked={includeSSTC}
                      onChange={e => setIncludeSSTC(e.target.checked)}
                      className="w-5 h-5 rounded-[6px] border-border-dim text-brand focus:ring-brand/50 focus:ring-offset-background appearance-none checked:bg-brand checked:border-brand transition-colors cursor-pointer"
                    />
                    {includeSSTC && (
                      <svg className="absolute w-3.5 h-3.5 top-[3px] left-[3px] text-white pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <label htmlFor="sstc" className="text-[14px] text-foreground cursor-pointer font-medium select-none">
                    Include properties <span className="text-secondary">Sold Subject to Contract (SSTC)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Step 3: Limits & Submit */}
            <div className={`transition-all duration-500 flex flex-col sm:flex-row sm:items-end justify-between gap-6 pt-6 border-t border-border-dim ${locationIdentifier ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
              
              <div className="flex flex-col gap-2 sm:w-1/3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[12px] font-bold">3</div>
                  <label className="text-[12px] font-semibold text-foreground uppercase tracking-widest">Global Limit</label>
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
                <p className="text-[11px] text-muted">Choose how many properties to gather (Maximum 1000).</p>
              </div>

              <div className="flex flex-col gap-4 items-end flex-1">
                <button 
                  type="submit"
                  disabled={isSubmitting || !locationIdentifier}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50 w-full sm:w-auto justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting Search...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Gather Properties
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
