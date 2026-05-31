"use client";

import { useTranslations } from "next-intl";

import { Database, Search, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useRouter } from "next/navigation";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import Image from "next/image";
import type { Doc } from "@/convex/_generated/dataModel";

export default function ScrapedDataPage() {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const [deletingProperty, setDeletingProperty] = useState<Doc<"properties"> | null>(null);
  const deleteProperty = useMutation(api.properties.deleteProperty);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.listProperties,
    { searchTerm },
    { initialNumItems: 15 }
  );

  const propertiesCount = useQuery(api.properties.getPropertiesCount, { searchTerm }) || 0;
  const totalItems = Math.max(results.length, propertiesCount);
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

  const confirmDelete = async () => {
    if (deletingProperty) {
      await deleteProperty({ id: deletingProperty._id });
      setDeletingProperty(null);
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
              <Database className="w-6 h-6 text-brand" />
              {t('propertiesScrapedData')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">View and manage properties scraped from Rightmove.</p>
          </div>
        </div>

        {/* Control Bar */}
        <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl flex-shrink-0">
          <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
            <Search className="w-[18px] h-[18px]" />
            <input
              type="text"
              placeholder="Search properties by address..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
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
                  {paginatedItems.length === 0 && status !== "LoadingFirstPage" ? (
                    <tr>
                      <td colSpan={4} className="p-0 border-none">
                        <SonaeEmptyState 
                          title="No Results" 
                          description={searchTerm.length > 0 ? "Your search query did not match any properties." : "No scraped properties found. Run a new search to populate data."} 
                        />
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((property) => (
                      <motion.tr 
                        key={property._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            {property.imageUrl ? (
                              <Image src={property.imageUrl} alt="Property" width={48} height={48} unoptimized className="w-12 h-12 rounded-[8px] object-cover border border-border-dim" />
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
                          <div className="flex items-center justify-end gap-2">
                             <button 
                               onClick={() => router.push(`/app/properties/scraped-data/${property._id}`)}
                               className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-brand/10 text-brand text-[12px] font-medium hover:bg-brand/20 transition-colors"
                             >
                               View Details
                             </button>
                             <button 
                               onClick={() => setDeletingProperty(property)}
                               className="p-1.5 rounded-[8px] bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                               title="Delete Property"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
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
                <span>properties</span>
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

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingProperty}
        onClose={() => setDeletingProperty(null)}
        title="Delete Property"
      >
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">
          Are you sure you want to delete <strong className="text-foreground">{deletingProperty?.address}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingProperty(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20"
          >
            Delete
          </button>
        </div>
      </SonaeModal>
    </>
  );
}
