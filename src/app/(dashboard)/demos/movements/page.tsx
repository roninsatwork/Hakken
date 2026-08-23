"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Activity, Bug, Plus } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MovementDeleteDialog from "./_components/MovementDeleteDialog";
import MovementEditDialog, {
  toMovementDifficulty,
  toMovementSpineGoal,
} from "./_components/MovementEditDialog";
import MovementLibraryTable from "./_components/MovementLibraryTable";
import { getStudioRoutineTitle } from "./_lib/movementPresentation";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "./_lib/movementSpineIntent";
import type { MovementDifficulty, MovementSpineGoal } from "./_lib/movementTypes";
import {
  MOVEMENT_SALMON,
} from "./_lib/movementPalette";
import { SearchBar } from "@/src/ui/components/screens/Table";

export default function MovementsLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [spineGoalFilter, setSpineGoalFilter] = useState<MovementSpineGoal | "all">("all");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<Doc<"movements"> | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [movementToEdit, setMovementToEdit] = useState<Doc<"movements"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<MovementDifficulty>("Beginner");
  const [editSpineGoal, setEditSpineGoal] = useState<MovementSpineGoal | "">("");
  const [editPrimaryCue, setEditPrimaryCue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
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
  const updateMovement = useMutation(api.movements.update);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const confirmDelete = (m: Doc<"movements">) => {
    setMovementToDelete(m);
    setDeleteModalOpen(true);
  };

  const openEdit = (m: Doc<"movements">) => {
    setMovementToEdit(m);
    // The name the list shows, not the raw one — a legacy capture is listed
    // under a stand-in title, and the box should open on what was read there.
    setEditTitle(getStudioRoutineTitle(m.title));
    setEditDifficulty(toMovementDifficulty(m.difficulty));
    setEditSpineGoal(toMovementSpineGoal(m.spineGoal));
    setEditPrimaryCue(m.primaryCue ?? "");
    setEditError(null);
    setEditModalOpen(true);
  };

  const closeEdit = () => {
    setEditModalOpen(false);
    setMovementToEdit(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!movementToEdit) return;

    const title = editTitle.trim();
    if (title.length === 0) {
      setEditError("A routine needs a name.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await updateMovement({
        id: movementToEdit._id,
        title,
        difficulty: editDifficulty,
        spineGoal: editSpineGoal === "" ? undefined : editSpineGoal,
        primaryCue: editPrimaryCue.trim(),
      });
      closeEdit();
    } catch {
      setEditError("That did not save. Try again.");
    } finally {
      setIsSavingEdit(false);
    }
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

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/demos/movements/replay-lab"
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] border border-border-dim bg-sidebar/50 text-secondary font-medium hover:text-foreground transition-all"
          >
            <Bug className="w-4 h-4" />
            <span>Replay Lab</span>
          </Link>
          <Link
            href="/demos/movement-capture/deep"
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <Plus className="w-4 h-4" />
            <span>New Routine</span>
          </Link>
        </div>
      </div>



      {/* Control Bar */}
      <div className="flex items-center gap-4">
        <SearchBar value={searchTerm} onChange={handleSearch} placeholder="Search routines..." />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSpineGoalFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            spineGoalFilter === "all"
              ? `border-[${MOVEMENT_SALMON}]/50 bg-[${MOVEMENT_SALMON}]/15 text-[${MOVEMENT_SALMON}]`
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
                ? `border-[${MOVEMENT_SALMON}]/50 bg-[${MOVEMENT_SALMON}]/15 text-[${MOVEMENT_SALMON}]`
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
        onDebugAutoBaseline={(movement) =>
          router.push(`/demos/movements/${movement._id}/play?debugTracking=1&debugAutoBaseline=1`)
        }
        onView={(movement) => router.push(`/demos/movements/${movement._id}`)}
        onEdit={openEdit}
        onDelete={confirmDelete}
      />
      
      <MovementEditDialog
        isOpen={editModalOpen}
        title={editTitle}
        difficulty={editDifficulty}
        spineGoal={editSpineGoal}
        primaryCue={editPrimaryCue}
        isSaving={isSavingEdit}
        saveError={editError}
        onClose={closeEdit}
        onTitleChange={setEditTitle}
        onDifficultyChange={setEditDifficulty}
        onSpineGoalChange={setEditSpineGoal}
        onPrimaryCueChange={setEditPrimaryCue}
        onSave={saveEdit}
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
