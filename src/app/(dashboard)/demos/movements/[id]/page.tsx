"use client";

import React, { useMemo, useState, use } from "react";
import Header from "@/src/ui/components/layout/Header";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Activity, CheckCircle2, Clock, Sparkles, Play } from "lucide-react";
import Typography from "@/src/ui/atoms/typography";
import { useMovementFrames } from "../_hooks/useMovementFrames";
import MovementDeleteDialog from "../_components/MovementDeleteDialog";
import MovementFrameViewer from "../_components/MovementFrameViewer";
import { getStudioRoutineTitle } from "../_lib/movementPresentation";
import {
  getMovementBodyFocusLabel,
  getMovementSpineGoalDescription,
  getMovementSpineGoalLabel,
} from "../_lib/movementSpineIntent";
import { analyzeMovementSpineFrames } from "../_lib/movementSpineReview";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
  MOVEMENT_SCENE_BG,
} from "../_lib/movementPalette";

export default function MovementDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const movementId = unwrappedParams.id as Id<"movements">;

  const movement = useQuery(api.movements.get, { id: movementId });
  const removeMovement = useMutation(api.movements.remove);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const { frames, fps, format, isLoading, error, reload } = useMovementFrames(movement);
  const routineTitle = getStudioRoutineTitle(movement?.title);
  const spineGoalLabel = getMovementSpineGoalLabel(movement?.spineGoal);
  const spineGoalDescription = getMovementSpineGoalDescription(movement?.spineGoal);
  const bodyFocus = movement?.bodyFocus ?? [];
  const spineReview = useMemo(() => analyzeMovementSpineFrames(frames), [frames]);
  const spineReviewMoments = [
    spineReview.bestStack,
    spineReview.deepestBend,
    spineReview.largestRotation,
    spineReview.largestAsymmetry,
  ].filter((moment): moment is NonNullable<typeof moment> => Boolean(moment));

  const confirmDelete = () => {
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    await removeMovement({ id: movementId });
    setDeleteModalOpen(false);
    router.push("/demos/movements");
  };

  if (movement === undefined) {
    return (
      <>
        <Header />
        <div className={`flex items-center justify-center py-24 text-[${MOVEMENT_SALMON}] animate-pulse font-medium`}>
          Loading practice data...
        </div>
      </>
    );
  }

  if (movement === null) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-red-500 font-medium">
          Practice not found.
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="w-full flex justify-start">
          <Link href="/demos/movements" className="flex items-center gap-2 text-[13px] font-medium text-secondary hover:text-foreground transition-colors px-4 py-2 bg-sidebar/50 rounded-[10px] border border-border-dim w-fit shadow-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Studio Library
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-7 h-7 text-brand" />
              {routineTitle}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
              movement.difficulty === 'Beginner' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              movement.difficulty === 'Intermediate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {movement.difficulty}
            </span>
          </div>
          <Typography className="text-muted-foreground text-sm mt-1">
            Recorded on {new Date(movement.createdAt).toLocaleDateString()} at {new Date(movement.createdAt).toLocaleTimeString()}
          </Typography>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className={`rounded-full border border-[${MOVEMENT_SALMON}]/25 bg-[${MOVEMENT_SALMON}]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[${MOVEMENT_SALMON}]`}>
              {spineGoalLabel}
            </span>
            {bodyFocus.map((focus) => (
              <span
                key={focus}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-secondary"
              >
                {getMovementBodyFocusLabel(focus)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              href={`/demos/movements/${movement._id}/play?guidedPreview=1`}
              className={`inline-flex items-center gap-2 rounded-[10px] bg-[${MOVEMENT_SALMON}] px-4 py-2 text-[13px] font-bold text-[${MOVEMENT_INK}] shadow-[0_0_20px_rgba(246,204,190,0.24)] transition-colors hover:bg-[${MOVEMENT_CREAM}]`}
            >
              <Sparkles className="h-4 w-4" />
              Guided Preview
            </Link>
            <Link
              href={`/demos/movements/${movement._id}/play`}
              className="inline-flex items-center gap-2 rounded-[10px] border border-border-dim bg-sidebar/50 px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-foreground"
            >
              <Play className="h-4 w-4" />
              Live Practice
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 w-full mt-4">
          {/* Left Column: Visualizer */}
          <div className="flex-1">
            <MovementFrameViewer
              frames={frames}
              fps={fps}
              isLoading={isLoading}
              error={error}
              onRetry={reload}
              controls="scrubber"
            />
          </div>

          {/* Right Column: Routine summary */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-sidebar/40 border border-border-dim rounded-3xl p-6 flex flex-col gap-6 shadow-sm backdrop-blur-xl">
              <div>
                <Typography className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Routine Summary</Typography>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className={`w-5 h-5 text-[${MOVEMENT_SALMON}] mt-0.5`} />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Recording</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {format === "legacy-inline-json" ? "Original studio format" : "Ready for guided preview"}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className={`w-5 h-5 text-[${MOVEMENT_SALMON}] mt-0.5`} />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Duration</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${(frames.length / fps).toFixed(1)} Seconds` : "Calculating..."}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Activity className={`w-5 h-5 text-[${MOVEMENT_SALMON}] mt-0.5`} />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Posture Moments</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${frames.length} moments` : "Loading..."}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Sparkles className={`w-5 h-5 text-[${MOVEMENT_SALMON}] mt-0.5`} />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Spine Goal</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {spineGoalDescription}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className={`w-5 h-5 text-[${MOVEMENT_SALMON}] mt-0.5`} />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Instructor Cue</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {movement.primaryCue?.trim() || "Use the spine guide to keep the routine calm and organized."}
                      </Typography>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-dim pt-6">
                <Typography className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
                  Spine Review
                </Typography>
                {spineReview.trackedFrameCount > 0 ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <Typography className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Avg stack
                        </Typography>
                        <Typography className={`mt-1 text-2xl font-black text-[${MOVEMENT_SALMON}]`}>
                          {spineReview.averageStackScore}%
                        </Typography>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <Typography className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Symmetry
                        </Typography>
                        <Typography className={`mt-1 text-2xl font-black text-[${MOVEMENT_MINT}]`}>
                          {spineReview.averageSymmetryScore}%
                        </Typography>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {spineReviewMoments.map((moment) => (
                        <div
                          key={moment.label}
                          className={`rounded-2xl border border-white/10 bg-[${MOVEMENT_SCENE_BG}]/60 p-3`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Typography className="text-xs font-bold text-foreground">
                              {moment.label}
                            </Typography>
                            <span className={`rounded-full bg-[${MOVEMENT_SALMON}]/10 px-2 py-1 text-[10px] font-bold text-[${MOVEMENT_SALMON}]`}>
                              Frame {moment.frameIndex}
                            </span>
                          </div>
                          <Typography className="mt-1 text-sm font-black text-white">
                            {moment.valueLabel}
                          </Typography>
                          <Typography className="mt-1 text-xs leading-5 text-muted-foreground">
                            {moment.cue}
                          </Typography>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Typography className="text-xs leading-5 text-muted-foreground">
                    Spine review appears after the recording frames finish loading.
                  </Typography>
                )}
              </div>

              <div className="border-t border-border-dim pt-6">
                <Typography className="text-xs font-bold text-red-500/80 uppercase tracking-widest mb-4">Danger Zone</Typography>
                <button 
                  onClick={confirmDelete}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-medium py-2.5 rounded-xl transition-all text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Routine
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MovementDeleteDialog
        isOpen={deleteModalOpen}
        movement={movement}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={executeDelete}
      />
    </>
  );
}
