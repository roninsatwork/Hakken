"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bug, ClipboardList, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { TableShell, TableHeaderRow, TableHeaderCell, TableLoadingRow, LoadMoreFooter } from "@/src/ui/components/screens/Table";
import { getStudioRoutineTitle } from "../_lib/movementPresentation";
import { getMovementSpineGoalLabel } from "../_lib/movementSpineIntent";
import {
  MOVEMENT_MINT,
  MOVEMENT_PANEL_BG,
} from "../_lib/movementPalette";

type MovementLibraryTableProps = {
  movements: Doc<"movements">[];
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  searchTerm: string;
  itemsPerPage: number;
  onLoadMore: (numItems: number) => void;
  onPlay: (movement: Doc<"movements">) => void;
  onDebugAutoBaseline: (movement: Doc<"movements">) => void;
  onView: (movement: Doc<"movements">) => void;
  onDelete: (movement: Doc<"movements">) => void;
};

type MovementActionButtonProps = {
  label: string;
  tooltip: string;
  icon: ReactNode;
  tone?: "primary" | "debug" | "neutral" | "danger";
  onClick: () => void;
};

function MovementActionButton({
  label,
  tooltip,
  icon,
  tone = "neutral",
  onClick,
}: MovementActionButtonProps) {
  const toneClass =
    tone === "primary"
      ? "bg-brand/15 text-brand hover:bg-brand/20"
      : tone === "debug"
        ? `bg-[${MOVEMENT_MINT}]/10 text-[${MOVEMENT_MINT}] hover:bg-[${MOVEMENT_MINT}]/15 hover:text-white`
      : tone === "danger"
        ? "text-secondary hover:bg-red-500/10 hover:text-red-500"
        : "text-secondary hover:bg-foreground/5 hover:text-foreground";

  return (
    <span className="group/action relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={tooltip}
        className={`p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${toneClass}`}
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[${MOVEMENT_PANEL_BG}] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl group-hover/action:block group-focus-within/action:block`}
      >
        {tooltip}
      </span>
    </span>
  );
}

export default function MovementLibraryTable({
  movements,
  isLoading,
  isLoadingMore,
  canLoadMore,
  searchTerm,
  itemsPerPage,
  onLoadMore,
  onPlay,
  onDebugAutoBaseline,
  onView,
  onDelete,
}: MovementLibraryTableProps) {
  return (
    <TableShell
      footer={
        <LoadMoreFooter
          visibleCount={movements.length}
          canLoadMore={canLoadMore}
          isLoading={isLoadingMore}
          onLoadMore={() => onLoadMore(itemsPerPage)}
          labels={{ empty: "No routines recorded", showing: (count) => `Showing ${count} routines` }}
        />
      }
    >
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>Routine Title</TableHeaderCell>
              <TableHeaderCell>Difficulty</TableHeaderCell>
              <TableHeaderCell>Recorded</TableHeaderCell>
              <TableHeaderCell align="right">Actions</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            <AnimatePresence>
              {isLoading ? (
                /* The kit's spinner rather than the words "Loading posture
                   studio...". Every other list in the app spins here, and a
                   sentence that reads like a row is the thing a reader tries
                   to click. */
                <TableLoadingRow colSpan={4} />
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-0 border-none">
                    <SonaeEmptyState
                      title="No Routines Recorded"
                      description={
                        searchTerm
                          ? "No routines match your search."
                          : "Use 'New Routine' to record the first guided posture sequence."
                      }
                    />
                  </td>
                </tr>
              ) : (
                <>
                  {movements.map((movement) => {
                    const routineTitle = getStudioRoutineTitle(movement.title);

                    return (
                      <motion.tr
                        key={movement._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                      >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center">
                            <Activity className="w-4 h-4 text-brand" />
                          </div>
                          <div>
                            <span className="font-medium text-[13px] text-foreground block leading-tight">
                              {routineTitle}
                            </span>
                            <span className="text-[12px] text-secondary">
                              {getMovementSpineGoalLabel(movement.spineGoal)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                          <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                            {movement.difficulty}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-secondary">
                        {new Date(movement.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <MovementActionButton
                            label={`Start practice ${routineTitle}`}
                            tooltip="Start live practice"
                            onClick={() => onPlay(movement)}
                            icon={<Play className="w-4 h-4" />}
                            tone="primary"
                          />
                          <MovementActionButton
                            label={`Debug auto baseline ${routineTitle}`}
                            tooltip="Debug auto baseline"
                            onClick={() => onDebugAutoBaseline(movement)}
                            icon={<Bug className="w-4 h-4" />}
                            tone="debug"
                          />
                          <MovementActionButton
                            label={`Review routine ${routineTitle}`}
                            tooltip="Review recording"
                            onClick={() => onView(movement)}
                            icon={<ClipboardList className="w-4 h-4" />}
                          />
                          <MovementActionButton
                            label={`Delete routine ${routineTitle}`}
                            tooltip="Delete routine"
                            onClick={() => onDelete(movement)}
                            icon={<Trash2 className="w-4 h-4" />}
                            tone="danger"
                          />
                        </div>
                      </td>
                      </motion.tr>
                    );
                  })}
                </>
              )}
            </AnimatePresence>
          </tbody>
    </TableShell>
  );
}
