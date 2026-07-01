"use client";

import Typography from "@/src/ui/atoms/typography";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { MIN_MOVEMENT_CAPTURE_FRAMES } from "../_lib/saveMovementRecording";
import {
  MOVEMENT_BODY_FOCUS_OPTIONS,
  MOVEMENT_SPINE_GOAL_OPTIONS,
} from "../_lib/movementSpineIntent";
import type {
  MovementBodyFocus,
  MovementDifficulty,
  MovementSpineGoal,
} from "../_lib/movementTypes";

type MovementSaveDialogProps = {
  isOpen: boolean;
  title: string;
  difficulty: MovementDifficulty;
  spineGoal: MovementSpineGoal;
  primaryCue: string;
  bodyFocus: MovementBodyFocus[];
  frameCount: number;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onDifficultyChange: (difficulty: MovementDifficulty) => void;
  onSpineGoalChange: (spineGoal: MovementSpineGoal) => void;
  onPrimaryCueChange: (primaryCue: string) => void;
  onBodyFocusChange: (bodyFocus: MovementBodyFocus[]) => void;
  onSave: () => void;
};

export default function MovementSaveDialog({
  isOpen,
  title,
  difficulty,
  spineGoal,
  primaryCue,
  bodyFocus,
  frameCount,
  isSaving,
  saveError,
  onClose,
  onTitleChange,
  onDifficultyChange,
  onSpineGoalChange,
  onPrimaryCueChange,
  onBodyFocusChange,
  onSave,
}: MovementSaveDialogProps) {
  const canSave = title.trim().length > 0 && !isSaving && frameCount >= MIN_MOVEMENT_CAPTURE_FRAMES;
  const toggleBodyFocus = (focus: MovementBodyFocus) => {
    onBodyFocusChange(
      bodyFocus.includes(focus)
        ? bodyFocus.filter((item) => item !== focus)
        : [...bodyFocus, focus],
    );
  };

  return (
    <SonaeModal isOpen={isOpen} onClose={onClose} title="Save Practice">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Practice Name
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g., Tall Spine Flow"
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#f6ccbe]/50 focus:ring-1 focus:ring-[#f6ccbe]/50 transition-all"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value as MovementDifficulty)}
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f6ccbe]/50 transition-all appearance-none"
          >
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Spine Goal
          </label>
          <select
            value={spineGoal}
            onChange={(event) => onSpineGoalChange(event.target.value as MovementSpineGoal)}
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f6ccbe]/50 transition-all appearance-none"
          >
            {MOVEMENT_SPINE_GOAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Typography className="text-xs text-secondary">
            {MOVEMENT_SPINE_GOAL_OPTIONS.find((option) => option.value === spineGoal)?.description}
          </Typography>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Instructor Cue
          </label>
          <input
            type="text"
            value={primaryCue}
            onChange={(event) => onPrimaryCueChange(event.target.value)}
            placeholder="e.g., Keep ribs over hips"
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#f6ccbe]/50 focus:ring-1 focus:ring-[#f6ccbe]/50 transition-all"
          />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground tracking-wide uppercase">
            Body Focus
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOVEMENT_BODY_FOCUS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  bodyFocus.includes(option.value)
                    ? "border-[#f6ccbe]/50 bg-[#f6ccbe]/15 text-[#f6ccbe]"
                    : "border-white/10 bg-white/5 text-secondary hover:text-foreground"
                }`}
              >
                <input
                  type="checkbox"
                  checked={bodyFocus.includes(option.value)}
                  onChange={() => toggleBodyFocus(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Typography className="text-sm text-secondary">
          {frameCount < MIN_MOVEMENT_CAPTURE_FRAMES
            ? `Capture at least ${MIN_MOVEMENT_CAPTURE_FRAMES} posture moments before saving. Current moments: ${frameCount}.`
            : `${frameCount} posture moments ready to save.`}
        </Typography>
        {saveError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <Typography className="text-sm font-medium text-red-200">{saveError}</Typography>
          </div>
        )}
        <button
          onClick={onSave}
          disabled={!canSave}
          className="w-full mt-4 bg-[#f6ccbe] hover:bg-[#f7efe7] text-[#17131d] font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_rgba(246,204,190,0.34)] transition-all disabled:opacity-50 disabled:shadow-none"
        >
          {isSaving ? "Saving..." : "Save Practice"}
        </button>
      </div>
    </SonaeModal>
  );
}
