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
