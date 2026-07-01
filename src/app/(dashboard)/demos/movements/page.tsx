"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Activity, Plus, Search } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MovementDeleteDialog from "./_components/MovementDeleteDialog";
import MovementLibraryTable from "./_components/MovementLibraryTable";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "./_lib/movementSpineIntent";
import type { MovementSpineGoal } from "./_lib/movementTypes";

export default function MovementsLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [spineGoalFilter, setSpineGoalFilter] = useState<MovementSpineGoal | "all">("all");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<Doc<"movements"> | null>(null);
  const router = useRouter();
  const itemsPerPage = 15;
  
  const {
    results: movements,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.movements.getPaginated,
    { searchTerm },
    { initialNumItems: itemsPerPage }
  );
  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const removeMovement = useMutation(api.movements.remove);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const confirmDelete = (m: Doc<"movements">) => {
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
            Posture Studio Library
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            Prepare guided posture routines for student and coach demos.
          </p>
        </div>

        <Link
          href="/demos/movement-capture"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>New Routine</span>
        </Link>
      </div>



      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input
            type="text"
            placeholder="Search routines..."
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSpineGoalFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            spineGoalFilter === "all"
              ? "border-[#f6ccbe]/50 bg-[#f6ccbe]/15 text-[#f6ccbe]"
              : "border-border-dim bg-sidebar/40 text-secondary hover:text-foreground"
          }`}
        >
          All spine goals
        </button>
        {MOVEMENT_SPINE_GOAL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSpineGoalFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              spineGoalFilter === option.value
                ? "border-[#f6ccbe]/50 bg-[#f6ccbe]/15 text-[#f6ccbe]"
                : "border-border-dim bg-sidebar/40 text-secondary hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <MovementLibraryTable
        movements={(movements ?? []).filter((movement) =>
          spineGoalFilter === "all" ? true : movement.spineGoal === spineGoalFilter
        )}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        canLoadMore={canLoadMore}
        searchTerm={searchTerm}
        itemsPerPage={itemsPerPage}
        onLoadMore={loadMore}
        onPlay={(movement) => router.push(`/demos/movements/${movement._id}/play`)}
        onView={(movement) => router.push(`/demos/movements/${movement._id}`)}
        onDelete={confirmDelete}
      />
      
      <MovementDeleteDialog
        isOpen={deleteModalOpen}
        movement={movementToDelete}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={executeDelete}
      />
    </div>
    </>
  );
}
