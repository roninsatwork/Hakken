"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown, Gamepad2, Play, Trash2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";

type MovementLibraryTableProps = {
  movements: Doc<"movements">[];
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  searchTerm: string;
  itemsPerPage: number;
  onLoadMore: (numItems: number) => void;
  onPlay: (movement: Doc<"movements">) => void;
  onView: (movement: Doc<"movements">) => void;
  onDelete: (movement: Doc<"movements">) => void;
};

export default function MovementLibraryTable({
  movements,
  isLoading,
  isLoadingMore,
  canLoadMore,
  searchTerm,
  itemsPerPage,
  onLoadMore,
  onPlay,
  onView,
  onDelete,
}: MovementLibraryTableProps) {
  return (
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
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-secondary">
                    Loading movement library...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-0 border-none">
                    <SonaeEmptyState
                      title="No Movements Recorded"
                      description={
                        searchTerm
                          ? "No recordings match your search."
                          : "Click 'New Capture' to record your first motion data."
                      }
                    />
                  </td>
                </tr>
              ) : (
                <>
                  {movements.map((movement) => (
                    <motion.tr
                      key={movement._id}
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
                              {movement.title}
                            </span>
                            <span className="text-[12px] text-secondary">Raw AI Coordinates</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                          <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                            {movement.difficulty}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-secondary">
                        {new Date(movement.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onPlay(movement)}
                            className="p-2 rounded-full hover:bg-brand/10 text-brand transition-colors"
                            title="Play Match"
                            aria-label={`Play ${movement.title}`}
                          >
                            <Gamepad2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onView(movement)}
                            className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors"
                            title="View Data Details"
                            aria-label={`View ${movement.title}`}
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(movement)}
                            className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors"
                            title="Delete"
                            aria-label={`Delete ${movement.title}`}
                          >
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

      <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span>Showing</span>
          <span className="font-medium text-foreground">{movements.length}</span>
          <span>items</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!canLoadMore || isLoadingMore}
            onClick={() => onLoadMore(itemsPerPage)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[12px] font-medium"
          >
            {isLoadingMore ? "Loading..." : "Load more"}
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
