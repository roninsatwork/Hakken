"use client";

import { useTranslations } from "next-intl";
import { Database, ExternalLink, X, MapPin, Bed, Bath, Home, User, Phone } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export default function ScrapedDataPage() {
  const t = useTranslations('sidebar');
  const [selectedProperty, setSelectedProperty] = useState<any>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.listProperties,
    {},
    { initialNumItems: 15 }
  );

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 h-full relative">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Database className="w-6 h-6 text-brand" />
              {t('propertiesScrapedData')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">View and manage properties scraped from Rightmove.</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="px-6 py-4 font-medium w-[40%]">Property Address</th>
                  <th className="px-6 py-4 font-medium">Price</th>
                  <th className="px-6 py-4 font-medium">Specs</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {results.length === 0 && status !== "LoadingFirstPage" ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                        No scraped properties found. Run a new search to populate data.
                      </td>
                    </tr>
                  ) : (
                    results.map((property: any) => (
                      <motion.tr 
                        key={property._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            {property.imageUrl ? (
                              <img src={property.imageUrl} alt="Property" className="w-12 h-12 rounded-[8px] object-cover border border-border-dim" />
                            ) : (
                              <div className="w-12 h-12 rounded-[8px] bg-background border border-border-dim flex items-center justify-center">
                                <span className="text-[9px] font-mono text-muted uppercase">No Img</span>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-[13px] text-foreground block line-clamp-1">
                                {property.address}
                              </span>
                              <span className="text-[12px] text-secondary block mt-0.5">{property.propertyType} • {property.agentName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[13px] font-medium text-brand">
                            {property.price ? `£${property.price.toLocaleString()}` : 'POA'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded bg-background border border-border-dim text-[11px] text-secondary">
                              {property.bedrooms} Beds
                            </span>
                            <span className="px-2 py-0.5 rounded bg-background border border-border-dim text-[11px] text-secondary">
                              {property.bathrooms} Baths
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button 
                             onClick={() => setSelectedProperty(property)}
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-brand/10 text-brand text-[12px] font-medium hover:bg-brand/20 transition-colors"
                           >
                             View Details
                           </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {status === "CanLoadMore" && (
            <div className="p-4 border-t border-border-dim flex justify-center bg-sidebar/10">
              <button
                onClick={() => loadMore(15)}
                className="px-6 py-2 rounded-full text-xs font-medium bg-foreground/5 hover:bg-foreground/10 text-foreground transition-all flex items-center gap-2"
              >
                Load More Properties
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sonae Modal - Property Details */}
      <AnimatePresence>
        {selectedProperty && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProperty(null)}
              className="fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm"
            />
            
            {/* Modal Container */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="pointer-events-auto w-full max-w-3xl max-h-[90vh] flex flex-col bg-sidebar/40 backdrop-blur-3xl rounded-[32px] shadow-[inset_1px_1px_0px_0px_rgba(255,255,255,0.05),0_20px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden"
              >
                {/* Modal Header / Hero Image */}
                <div className="relative h-64 w-full flex-shrink-0 bg-background/50">
                  {selectedProperty.imageUrl ? (
                    <img src={selectedProperty.imageUrl} alt="Property" className="w-full h-full object-cover opacity-90" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-secondary font-mono tracking-widest text-sm uppercase">No Image Available</span>
                    </div>
                  )}
                  
                  {/* Close Button overlay */}
                  <button 
                    onClick={() => setSelectedProperty(null)}
                    className="absolute top-6 right-6 p-2 rounded-full bg-background/40 backdrop-blur-md border border-white/10 text-white hover:bg-background/60 transition-colors z-10"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Gradient overlay for text readability */}
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-sidebar/90 to-transparent" />
                  
                  <div className="absolute bottom-6 left-8 right-8">
                    <h2 className="text-2xl font-light tracking-[0.12em] text-white drop-shadow-md line-clamp-2">
                      {selectedProperty.address}
                    </h2>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <div className="flex flex-col gap-8">
                    
                    {/* Key Specs Row */}
                    <div className="flex flex-wrap gap-4">
                      <div className="flex flex-col bg-background/20 rounded-[16px] px-6 py-4 flex-1 min-w-[120px]">
                        <span className="text-[11px] uppercase tracking-widest text-secondary mb-1">Price</span>
                        <span className="text-xl font-medium text-brand">
                          {selectedProperty.price ? `£${selectedProperty.price.toLocaleString()}` : 'POA'}
                        </span>
                      </div>
                      <div className="flex flex-col bg-background/20 rounded-[16px] px-6 py-4 flex-1 min-w-[120px]">
                        <span className="text-[11px] uppercase tracking-widest text-secondary mb-1">Type</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Home className="w-4 h-4 text-muted" />
                          <span className="text-sm text-foreground font-medium">{selectedProperty.propertyType}</span>
                        </div>
                      </div>
                      <div className="flex flex-col bg-background/20 rounded-[16px] px-6 py-4 flex-1 min-w-[120px]">
                        <span className="text-[11px] uppercase tracking-widest text-secondary mb-1">Rooms</span>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1.5">
                            <Bed className="w-4 h-4 text-muted" />
                            <span className="text-sm text-foreground font-medium">{selectedProperty.bedrooms || 0}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Bath className="w-4 h-4 text-muted" />
                            <span className="text-sm text-foreground font-medium">{selectedProperty.bathrooms || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Agent Section */}
                    <div className="flex items-center justify-between p-5 rounded-[20px] bg-brand/5 border border-brand/10">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-brand" />
                        </div>
                        <div>
                          <span className="block text-[13px] font-medium text-foreground">{selectedProperty.agentName || "Unknown Agent"}</span>
                          <span className="block text-[12px] text-secondary mt-0.5">Listing Agent</span>
                        </div>
                      </div>
                      {selectedProperty.agentPhone && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background border border-border-dim">
                          <Phone className="w-3.5 h-3.5 text-muted" />
                          <span className="text-[12px] font-medium text-foreground">{selectedProperty.agentPhone}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <h3 className="text-[11px] uppercase tracking-widest text-secondary mb-4">Property Description</h3>
                      <div className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {selectedProperty.description || "No description provided by the agent."}
                      </div>
                    </div>

                    {/* External Link */}
                    <div className="pt-6 flex justify-end">
                      <a 
                        href={selectedProperty.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-background border border-border-dim text-[13px] font-medium text-secondary hover:text-foreground hover:bg-foreground/5 transition-all"
                      >
                        View Original on Rightmove <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
