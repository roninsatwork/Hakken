"use client";

import type { FormEvent } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  ModalField,
  ModalFormActions,
  ModalFormError,
  ModalFormField,
} from "@/src/ui/components/screens/ModalForm";
import { Select } from "@/src/ui/components/screens/Select";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "../_lib/movementSpineIntent";
import type { MovementDifficulty, MovementSpineGoal } from "../_lib/movementTypes";

export const MOVEMENT_DIFFICULTY_OPTIONS: MovementDifficulty[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

/** The dropdown value standing for a routine with no spine goal set. */
export const NO_SPINE_GOAL = "";

/**
 * The level as the dialog can offer it.
 *
 * A routine's level is stored as free text, so a recording made before the
 * three levels settled can hold something the dropdown has no option for — and
 * a select with no matching option shows blank, which reads as "no level" and
 * saves as one. Anything unrecognised opens on Beginner instead, visibly, for
 * the person who came here to set it.
 */
export function toMovementDifficulty(difficulty: string | undefined): MovementDifficulty {
  return (
    MOVEMENT_DIFFICULTY_OPTIONS.find(
      (option) => option.toLowerCase() === difficulty?.trim().toLowerCase(),
    ) ?? "Beginner"
  );
}

/**
 * The spine goal as the dialog can offer it.
 *
 * Unlike the level, having none is a real state a routine can be in — the
 * library lists those under "Spine awareness" — so an unrecognised or missing
 * goal opens on "Not set" rather than being quietly assigned one.
 */
export function toMovementSpineGoal(spineGoal: string | undefined): MovementSpineGoal | "" {
  return (
    MOVEMENT_SPINE_GOAL_OPTIONS.find((option) => option.value === spineGoal)?.value ?? NO_SPINE_GOAL
  );
}

type MovementEditDialogProps = {
  isOpen: boolean;
  title: string;
  difficulty: MovementDifficulty;
  spineGoal: MovementSpineGoal | "";
  primaryCue: string;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onDifficultyChange: (difficulty: MovementDifficulty) => void;
  onSpineGoalChange: (spineGoal: MovementSpineGoal | "") => void;
  onPrimaryCueChange: (primaryCue: string) => void;
  onSave: () => void;
};

/**
 * Changing a routine's details after it was recorded.
 *
 * All four were set once in the save dialog at the end of a capture and then
 * fixed for good — Anthony, on the library screen: *"how do i edit the name and
 * level in the posture studio"*. There was no answer but record it again.
 *
 * Held by the parent the way `MovementSaveDialog` is, rather than seeding its
 * own state from the row: the list re-renders whenever anything in it changes,
 * and a dialog that re-seeds on its own would wipe what was half-typed.
 */
export default function MovementEditDialog({
  isOpen,
  title,
  difficulty,
  spineGoal,
  primaryCue,
  isSaving,
  saveError,
  onClose,
  onTitleChange,
  onDifficultyChange,
  onSpineGoalChange,
  onPrimaryCueChange,
  onSave,
}: MovementEditDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    onSave();
  };

  const spineGoalDescription = MOVEMENT_SPINE_GOAL_OPTIONS.find(
    (option) => option.value === spineGoal,
  )?.description;

  return (
    <SonaeModal isOpen={isOpen} onClose={onClose} title="Edit Routine">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <ModalField
          label="Routine Name"
          required
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="e.g., Tall Spine Flow"
        />

        <ModalFormField label="Difficulty">
          <Select
            className="w-full"
            value={difficulty}
            onChange={(value) => onDifficultyChange(value as MovementDifficulty)}
            aria-label="Difficulty"
          >
            {MOVEMENT_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </ModalFormField>

        <ModalFormField label="Spine Goal">
          <Select
            className="w-full"
            value={spineGoal}
            onChange={(value) => onSpineGoalChange(value as MovementSpineGoal | "")}
            aria-label="Spine Goal"
          >
            <option value={NO_SPINE_GOAL}>Not set</option>
            {MOVEMENT_SPINE_GOAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {spineGoalDescription ? (
            <p className="text-xs text-secondary">{spineGoalDescription}</p>
          ) : null}
        </ModalFormField>

        <ModalField
          label="Instructor Cue"
          hint="Optional"
          value={primaryCue}
          onChange={(event) => onPrimaryCueChange(event.target.value)}
          placeholder="e.g., Keep ribs over hips"
        />

        <ModalFormError>{saveError}</ModalFormError>

        <ModalFormActions
          cancelLabel="Cancel"
          submitLabel={isSaving ? "Saving..." : "Save Changes"}
          isSubmitting={isSaving}
          onCancel={onClose}
        />
      </form>
    </SonaeModal>
  );
}
