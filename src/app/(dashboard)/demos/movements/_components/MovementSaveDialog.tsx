"use client";

import Typography from "@/src/ui/components/screens/typography";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ModalField } from "@/src/ui/components/screens/ModalForm";
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
import { summarizeMovementCommissioningFailures } from "../_lib/movementCommissioningFailurePresentation";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_SALMON,
} from "../_lib/movementPalette";

type MovementSaveDialogProps = {
  isOpen: boolean;
  title: string;
  difficulty: MovementDifficulty;
  spineGoal: MovementSpineGoal;
  primaryCue: string;
  bodyFocus: MovementBodyFocus[];
  frameCount: number;
  isSaving: boolean;
  isDownloadingBackup?: boolean;
  saveError: string | null;
  backupMessage?: string | null;
  backupCommand?: string | null;
  commissioningFailures?: string[];
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onDifficultyChange: (difficulty: MovementDifficulty) => void;
  onSpineGoalChange: (spineGoal: MovementSpineGoal) => void;
  onPrimaryCueChange: (primaryCue: string) => void;
  onBodyFocusChange: (bodyFocus: MovementBodyFocus[]) => void;
  onSave: () => void;
  onDownloadBackup?: () => void;
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
  isDownloadingBackup = false,
  saveError,
  backupMessage,
  backupCommand,
  commissioningFailures,
  onClose,
  onTitleChange,
  onDifficultyChange,
  onSpineGoalChange,
  onPrimaryCueChange,
  onBodyFocusChange,
  onSave,
  onDownloadBackup,
}: MovementSaveDialogProps) {
  const canSave = title.trim().length > 0 && !isSaving &&
    frameCount >= MIN_MOVEMENT_CAPTURE_FRAMES &&
    (!commissioningFailures || commissioningFailures.length === 0);
  const canDownloadBackup = title.trim().length > 0 && !isDownloadingBackup &&
    frameCount >= MIN_MOVEMENT_CAPTURE_FRAMES;
  const commissioningFailureSummaries = commissioningFailures
    ? summarizeMovementCommissioningFailures(commissioningFailures, frameCount)
    : [];
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
        <ModalField
          label="Practice Name"
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="e.g., Tall Spine Flow"
        />
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground tracking-wide uppercase">
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value as MovementDifficulty)}
            className={`bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[${MOVEMENT_SALMON}]/50 transition-all appearance-none`}
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
            className={`bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[${MOVEMENT_SALMON}]/50 transition-all appearance-none`}
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
        <ModalField
          label="Instructor Cue"
          type="text"
          value={primaryCue}
          onChange={(event) => onPrimaryCueChange(event.target.value)}
          placeholder="e.g., Keep ribs over hips"
        />
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
                    ? `border-[${MOVEMENT_SALMON}]/50 bg-[${MOVEMENT_SALMON}]/15 text-[${MOVEMENT_SALMON}]`
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
        {commissioningFailures && commissioningFailures.length > 0 && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
            <Typography className="text-sm font-medium text-amber-100">
              This commissioning take is not proof-ready yet:
            </Typography>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
              {commissioningFailureSummaries.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
            <Typography className="mt-3 text-xs text-amber-100/80">
              You can download a recovery packet below. It preserves this take without pretending missing evidence was captured.
            </Typography>
          </div>
        )}
        {saveError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <Typography className="text-sm font-medium text-red-200">{saveError}</Typography>
          </div>
        )}
        {backupMessage && (
          <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3">
            <Typography className="text-sm font-medium text-sky-100">{backupMessage}</Typography>
            {backupCommand && (
              <code className="mt-2 block select-all break-all rounded-lg bg-black/25 px-3 py-2 text-xs text-sky-100">
                {backupCommand}
              </code>
            )}
          </div>
        )}
        {onDownloadBackup && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <button
              type="button"
              onClick={onDownloadBackup}
              disabled={!canDownloadBackup}
              className="w-full rounded-xl border border-sky-200/25 bg-sky-300/10 px-4 py-3 font-semibold text-sky-100 transition-colors hover:bg-sky-300/15 disabled:opacity-50"
            >
              {isDownloadingBackup ? "Preparing local backup..." : "Download local packet backup"}
            </button>
            <Typography className="mt-2 text-xs text-secondary">
              Downloads derived tracking JSON only—no camera video or images. This does not add the recording to Studio Library.
            </Typography>
          </div>
        )}
        <button
          onClick={onSave}
          disabled={!canSave}
          className={`w-full mt-4 bg-[${MOVEMENT_SALMON}] hover:bg-[${MOVEMENT_CREAM}] text-[${MOVEMENT_INK}] font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_rgba(246,204,190,0.34)] transition-all disabled:opacity-50 disabled:shadow-none`}
        >
          {isSaving ? "Saving..." : "Save Practice"}
        </button>
      </div>
    </SonaeModal>
  );
}
