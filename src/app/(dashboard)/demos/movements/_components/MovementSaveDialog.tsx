"use client";

import Typography from "@/src/ui/atoms/typography";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { MIN_MOVEMENT_CAPTURE_FRAMES } from "../_lib/saveMovementRecording";
import type { MovementDifficulty } from "../_lib/movementTypes";

type MovementSaveDialogProps = {
  isOpen: boolean;
  title: string;
  difficulty: MovementDifficulty;
  frameCount: number;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onDifficultyChange: (difficulty: MovementDifficulty) => void;
  onSave: () => void;
};

export default function MovementSaveDialog({
  isOpen,
  title,
  difficulty,
  frameCount,
  isSaving,
  saveError,
  onClose,
  onTitleChange,
  onDifficultyChange,
  onSave,
}: MovementSaveDialogProps) {
  const canSave = title.trim().length > 0 && !isSaving && frameCount >= MIN_MOVEMENT_CAPTURE_FRAMES;

  return (
    <SonaeModal isOpen={isOpen} onClose={onClose} title="Save Movement">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Routine Name
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g., Morning Squats"
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value as MovementDifficulty)}
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
          >
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
        <Typography className="text-sm text-secondary">
          {frameCount < MIN_MOVEMENT_CAPTURE_FRAMES
            ? `Capture at least ${MIN_MOVEMENT_CAPTURE_FRAMES} valid frames before saving. Current valid frames: ${frameCount}.`
            : `${frameCount} valid frames ready to save.`}
        </Typography>
        {saveError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <Typography className="text-sm font-medium text-red-200">{saveError}</Typography>
          </div>
        )}
        <button
          onClick={onSave}
          disabled={!canSave}
          className="w-full mt-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_#06b6d4] transition-all disabled:opacity-50 disabled:shadow-none"
        >
          {isSaving ? "Saving..." : "Save to Library"}
        </button>
      </div>
    </SonaeModal>
  );
}
