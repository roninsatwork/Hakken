"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Activity, Plus, Search, Trash2, Play, ChevronLeft, ChevronRight, Gamepad2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function MovementsLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<any>(null);
  const router = useRouter();
  const itemsPerPage = 15;
  
  const movements = useQuery(api.movements.list) || [];

  const removeMovement = useMutation(api.movements.remove);

  const filteredMovements = movements.filter(m => m.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalItems = filteredMovements.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedMovements = filteredMovements.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const confirmDelete = (m: any) => {
    setMovementToDelete(m);
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (movementToDelete) {
      await removeMovement({ id: movementToDelete._id });
      setDeleteModalOpen(false);
      setMovementToDelete(null);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-5">
        {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Activity className="w-6 h-6 text-brand" />
            Movement Library
          </h1>
          <p className="text-[13px] text-secondary mt-1">Manage your captured motion data for the Pilates Demo.</p>
        </div>

        <Link
          href="/demos/movement-capture"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>New Capture</span>
        </Link>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input
            type="text"
            placeholder="Search movements..."
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Routine Title</th>
                <th className="px-4 py-3 font-medium">Difficulty</th>
                <th className="px-4 py-3 font-medium">Recorded</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0 border-none">
                      <SonaeEmptyState 
                        title="No Movements Recorded" 
                        description="Click 'New Capture' to record your first motion data." 
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedMovements.map((m: any) => (
                      <motion.tr
                        key={m._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center">
                              <Activity className="w-4 h-4 text-brand" />
                            </div>
                            <div>
                              <span className="font-medium text-[13px] text-foreground block leading-tight">
                                {m.title}
                              </span>
                              <span className="text-[12px] text-secondary">Raw AI Coordinates</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {m.difficulty}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-secondary">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => router.push(`/demos/movements/${m._id}/play`)} className="p-2 rounded-full hover:bg-brand/10 text-brand transition-colors" title="Play Match">
                              <Gamepad2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => router.push(`/demos/movements/${m._id}`)} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors" title="View Data Details">
                              <Play className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmDelete(m)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span>Showing</span>
            <span className="font-medium text-foreground">{totalItems === 0 ? 0 : Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
            <span>to</span>
            <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
            <span>of</span>
            <span className="font-medium text-foreground">{totalItems}</span>
            <span>items</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      <SonaeModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Routine">
        <div className="flex flex-col gap-6">
          <p className="text-secondary text-sm">
            Are you sure you want to delete <strong className="text-foreground">{movementToDelete?.title}</strong>? This action cannot be undone.
          </p>
          <div className="flex items-center gap-3 w-full mt-2">
            <button 
              onClick={() => setDeleteModalOpen(false)}
              className="flex-1 bg-foreground/5 hover:bg-foreground/10 text-foreground py-3 rounded-xl transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button 
              onClick={executeDelete}
              className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-3 rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Routine
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
    </>
  );
}
