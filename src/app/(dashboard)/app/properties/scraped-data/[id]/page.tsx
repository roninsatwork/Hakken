"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPin, Bed, Bath, Home, User, Phone, ExternalLink, Loader2, Zap, LayoutTemplate, CheckCircle2, Map, Clock, TrendingDown, Tag, Maximize2 } from "lucide-react";
import { motion } from "framer-motion";
import { use } from "react";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import Header from "@/src/ui/components/layout/Header";
import PropertyDescription from "./PropertyDescription";

export default function PropertyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const property = useQuery(api.properties.getProperty, { id: id as Id<"properties"> });

  if (property === undefined) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 h-[calc(100vh-100px)] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand/50" />
        </div>
      </>
    );
  }

  if (property === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 h-[calc(100vh-100px)] items-center justify-center">
          <SonaeEmptyState 
            title="Property Not Found" 
            description="The requested property could not be found or you do not have permission to view it." 
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        {/* Hero Layout */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full bg-sidebar/40 border border-border-dim rounded-[32px] overflow-hidden backdrop-blur-xl shadow-xl"
        >
          {/* Top Image Section */}
          <div className="relative h-[360px] sm:h-[480px] w-full bg-background flex-shrink-0">
            {property.imageUrl ? (
              <img src={property.imageUrl} alt="Property" className="w-full h-full object-cover opacity-90" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-background/50">
                <span className="text-secondary font-mono tracking-widest text-sm uppercase">No Image Available</span>
              </div>
            )}
            
            {/* Top Gradient for Back Button */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
            
            {/* Back Button */}
            <div className="absolute top-6 left-6 z-10">
              <button 
                onClick={() => router.back()}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[13px] font-medium tracking-wide">Back</span>
              </button>
            </div>

            {/* Bottom Gradient for Text Readability */}
            <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-sidebar/95 to-transparent pointer-events-none" />
            
            {/* Top Badges */}
            <div className="absolute top-6 right-6 z-10 flex gap-2">
              {property.productLabel && (
                <span className="px-3 py-1.5 rounded-full bg-brand/90 backdrop-blur-md text-white text-[11px] font-semibold tracking-widest uppercase shadow-lg">
                  {property.productLabel}
                </span>
              )}
              {property.listingUpdateReason === 'price_reduced' && (
                <span className="px-3 py-1.5 rounded-full bg-red-500/90 backdrop-blur-md text-white text-[11px] font-semibold tracking-widest uppercase shadow-lg flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3" /> Price Reduced
                </span>
              )}
            </div>

            <div className="absolute bottom-8 left-8 right-8">
              <h1 className="text-3xl sm:text-4xl font-light tracking-[0.08em] text-white drop-shadow-lg line-clamp-2">
                {property.address}
              </h1>
              <div className="flex items-center gap-2 mt-4">
                 <span className="text-2xl font-medium text-brand drop-shadow-md">
                   {property.price ? `£${property.price.toLocaleString()}` : 'POA'}
                 </span>
              </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-8 sm:p-10 flex flex-col gap-10">
            
            {/* Market Intelligence Panel */}
            {(property.firstVisibleDate || property.addedOn || property.sizeSqFeetMax) && (
              <div className="flex flex-col gap-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary border-b border-border-dim pb-3">
                  Market Intelligence
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {property.firstVisibleDate && (
                    <div className="flex items-start gap-3 p-4 rounded-[16px] bg-background border border-border-dim/50 shadow-sm">
                      <Clock className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-[11px] uppercase tracking-wider text-secondary">Listed On</span>
                        <span className="block text-[14px] text-foreground font-medium mt-1">
                          {new Date(property.firstVisibleDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  )}
                  {property.addedOn && (
                    <div className="flex items-start gap-3 p-4 rounded-[16px] bg-background border border-border-dim/50 shadow-sm">
                      <Tag className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-[11px] uppercase tracking-wider text-secondary">Status</span>
                        <span className="block text-[14px] text-foreground font-medium mt-1">{property.addedOn}</span>
                      </div>
                    </div>
                  )}
                  {property.sizeSqFeetMax && (
                    <div className="flex items-start gap-3 p-4 rounded-[16px] bg-background border border-border-dim/50 shadow-sm">
                      <Maximize2 className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-[11px] uppercase tracking-wider text-secondary">Est. Size</span>
                        <span className="block text-[14px] text-foreground font-medium mt-1">
                          {property.sizeSqFeetMin && property.sizeSqFeetMin !== property.sizeSqFeetMax 
                            ? `${property.sizeSqFeetMin} - ${property.sizeSqFeetMax}` 
                            : property.sizeSqFeetMax} sq ft
                        </span>
                      </div>
                    </div>
                  )}
                  {property.price && property.sizeSqFeetMax && !isNaN(parseInt(property.sizeSqFeetMax)) && (
                    <div className="flex items-start gap-3 p-4 rounded-[16px] bg-background border border-border-dim/50 shadow-sm">
                      <TrendingDown className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-[11px] uppercase tracking-wider text-secondary">Price per SqFt</span>
                        <span className="block text-[14px] text-foreground font-medium mt-1">
                          £{Math.round(property.price / parseInt(property.sizeSqFeetMax)).toLocaleString()}/sqft
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Specs Row */}
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col bg-background/40 rounded-[20px] p-6 flex-1 min-w-[140px] border border-border-dim/50 shadow-sm">
                <span className="text-[11px] uppercase tracking-widest text-secondary mb-1.5">Property Type</span>
                <div className="flex items-center gap-3 mt-1">
                  <Home className="w-5 h-5 text-brand" />
                  <span className="text-[15px] text-foreground font-medium">{property.propertyType || 'Unknown'}</span>
                </div>
              </div>
              <div className="flex flex-col bg-background/40 rounded-[20px] p-6 flex-1 min-w-[140px] border border-border-dim/50 shadow-sm">
                <span className="text-[11px] uppercase tracking-widest text-secondary mb-1.5">Bedrooms</span>
                <div className="flex items-center gap-3 mt-1">
                  <Bed className="w-5 h-5 text-brand" />
                  <span className="text-[15px] text-foreground font-medium">{property.bedrooms || 0}</span>
                </div>
              </div>
              <div className="flex flex-col bg-background/40 rounded-[20px] p-6 flex-1 min-w-[140px] border border-border-dim/50 shadow-sm">
                <span className="text-[11px] uppercase tracking-widest text-secondary mb-1.5">Bathrooms</span>
                <div className="flex items-center gap-3 mt-1">
                  <Bath className="w-5 h-5 text-brand" />
                  <span className="text-[15px] text-foreground font-medium">{property.bathrooms || 0}</span>
                </div>
              </div>
              {property.epcRating && (
                <div className="flex flex-col bg-background/40 rounded-[20px] p-6 flex-1 min-w-[140px] border border-border-dim/50 shadow-sm">
                  <span className="text-[11px] uppercase tracking-widest text-secondary mb-1.5">EPC Rating</span>
                  <div className="flex items-center gap-3 mt-1">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <span className="text-[15px] text-foreground font-medium">{property.epcRating}</span>
                  </div>
                </div>
              )}
              {property.latitude && property.longitude && (
                <div className="flex flex-col bg-background/40 rounded-[20px] p-6 flex-1 min-w-[140px] border border-border-dim/50 shadow-sm">
                  <span className="text-[11px] uppercase tracking-widest text-secondary mb-1.5">Location</span>
                  <a 
                    href={`https://www.google.com/maps?q=${property.latitude},${property.longitude}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 mt-1 hover:text-brand transition-colors"
                  >
                    <Map className="w-5 h-5 text-brand" />
                    <span className="text-[15px] text-foreground font-medium hover:underline">View Map</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-10">
              {/* Description Section */}
              <div className="flex-1 flex flex-col gap-10">
                <div className="bg-sidebar/40 border border-border-dim rounded-[24px] p-6 sm:p-8 backdrop-blur-md shadow-sm">
                  <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary mb-6 border-b border-border-dim pb-3">
                    Property Description
                  </h3>
                  <PropertyDescription rawText={property.description || ""} />
                </div>

                {property.features && property.features.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary mb-5 border-b border-border-dim pb-3">
                      Key Features
                    </h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {property.features.map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                          <span className="text-[14px] text-foreground/80">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {property.floorplans && property.floorplans.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary mb-5 border-b border-border-dim pb-3">
                      Floorplans
                    </h3>
                    <div className="flex flex-wrap gap-4">
                      {property.floorplans.map((fp: string, idx: number) => (
                        <a key={idx} href={fp} target="_blank" rel="noopener noreferrer" className="block relative group rounded-[16px] overflow-hidden border border-border-dim hover:border-brand/50 transition-colors bg-background/50 p-2">
                          <div className="w-full sm:w-48 aspect-[4/3] flex items-center justify-center bg-white rounded-[10px] overflow-hidden">
                             <img src={fp} alt="Floorplan" className="w-full h-full object-contain" />
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[16px]">
                            <LayoutTemplate className="w-8 h-8 text-white" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {property.images && property.images.length > 1 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary mb-5 border-b border-border-dim pb-3">
                      Image Gallery
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {property.images.slice(1).map((img: string, idx: number) => (
                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="block relative group rounded-[16px] overflow-hidden border border-border-dim aspect-[4/3]">
                          <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Agent Sidebar */}
              <div className="w-full lg:w-[320px] flex flex-col gap-6 flex-shrink-0">
                <h3 className="text-[12px] font-semibold uppercase tracking-widest text-secondary mb-1 border-b border-border-dim pb-3">
                  Listing Agent
                </h3>
                <div className="flex flex-col gap-4 p-6 rounded-[24px] bg-brand/5 border border-brand/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-brand" />
                    </div>
                    <div>
                      <span className="block text-[15px] font-medium text-foreground">{property.agentName || "Unknown Agent"}</span>
                      <span className="block text-[12px] text-secondary mt-0.5">Contact via Rightmove</span>
                    </div>
                  </div>
                  {property.agentPhone && (
                    <div className="flex items-center gap-3 px-4 py-3 mt-2 rounded-[12px] bg-background border border-border-dim">
                      <Phone className="w-4 h-4 text-muted" />
                      <span className="text-[14px] font-medium text-foreground">{property.agentPhone}</span>
                    </div>
                  )}
                  
                  <a 
                    href={property.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-2 flex items-center justify-center gap-2 w-full px-5 py-3 rounded-[12px] bg-brand text-white text-[13px] font-medium shadow-lg shadow-brand/20 hover:bg-brand/90 transition-all"
                  >
                    View Original Listing <ExternalLink className="w-4 h-4" />
                  </a>
                  {property.agentProfileUrl && (
                    <a 
                      href={property.agentProfileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-[12px] bg-background border border-border-dim text-foreground text-[13px] font-medium hover:bg-foreground/5 transition-all"
                    >
                      Agent Profile <User className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
