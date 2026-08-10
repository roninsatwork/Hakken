"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { MovementSessionScoreResult } from "../../../_lib/movementSessionScore";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_MINT,
  MOVEMENT_PANEL_BG,
  MOVEMENT_SALMON,
  MOVEMENT_SCENE_BG,
} from "../../../_lib/movementPalette";

type MovementCompletionDialogProps = {
  isOpen: boolean;
  finalScore: number;
  finalSessionResult?: MovementSessionScoreResult | null;
  finalSpineScore?: number;
  finalSpineCue?: string;
  isPreviewMode?: boolean;
  onExitMatch: () => void;
  onRematch: () => void;
};

function ResultStat({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left">
      <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/[0.48]">
        {label}
      </span>
      <span className={`mt-1 block text-2xl font-black text-[${MOVEMENT_MINT}]`}>{value}</span>
      <span className="mt-1 block text-xs leading-5 text-white/[0.45]">{description}</span>
    </div>
  );
}

export default function MovementCompletionDialog({
  isOpen,
  finalScore,
  finalSessionResult = null,
  finalSpineScore = 0,
  finalSpineCue = "Review the spine guide and try one calmer pass.",
  isPreviewMode = false,
  onExitMatch,
  onRematch,
}: MovementCompletionDialogProps) {
  const spinePercent = finalSessionResult?.spinePercent ?? finalSpineScore;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`absolute inset-0 z-50 flex items-center justify-center bg-[${MOVEMENT_SCENE_BG}] backdrop-blur-3xl`}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
            className={`relative flex w-full max-w-[480px] flex-col items-center overflow-hidden rounded-[32px] border border-white/10 bg-[${MOVEMENT_PANEL_BG}]/[0.86] p-10 shadow-[0_40px_120px_rgba(246,204,190,0.10)]`}
          >
            <div className={`pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[${MOVEMENT_SALMON}]/[0.12] blur-[80px]`} />

            <h2 className={`relative z-10 mb-3 text-sm font-light uppercase tracking-[0.16em] text-[${MOVEMENT_SALMON}]`}>
              Practice Complete
            </h2>
            <h1 className="relative z-10 mb-10 text-xl font-bold uppercase tracking-widest text-white">
              Posture Studio
            </h1>

            <div className={`relative z-10 mb-10 flex w-full flex-col items-center rounded-[24px] border border-white/10 bg-[${MOVEMENT_SCENE_BG}] p-10 shadow-inner`}>
              {isPreviewMode ? (
                <>
                  <span className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/[0.48]">
                    Guided Preview
                  </span>
                  <span className={`text-center text-2xl font-black uppercase leading-tight tracking-[0.1em] text-[${MOVEMENT_SALMON}]`}>
                    Studio Ready
                  </span>
                  <p className="mt-4 max-w-[280px] text-center text-sm leading-6 text-white/55">
                    The coach and student flow is ready for a live posture check.
                  </p>
                </>
              ) : (
                <>
                  <span className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/[0.48]">
                    Practice score
                  </span>
                  <span
                    className={`text-5xl font-black tracking-tight text-[${MOVEMENT_SALMON}]`}
                    data-testid="movement-result-overall"
                  >
                    {finalSessionResult ? `${finalSessionResult.overallPercent}%` : finalScore}
                  </span>
                  {finalSessionResult ? (
                    <>
                      <span className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
                        {finalSessionResult.grade}
                      </span>
                      <span className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.4]">
                        {finalSessionResult.points} points
                      </span>
                      <div className="mt-8 grid w-full grid-cols-2 gap-3">
                        <ResultStat
                          description="Full movements you finished"
                          label="Moves completed"
                          value={String(finalSessionResult.repCount)}
                        />
                        <ResultStat
                          description="How closely you matched them"
                          label="Stayed with your coach"
                          value={
                            finalSessionResult.coachMatchPercent === null
                              ? "—"
                              : `${finalSessionResult.coachMatchPercent}%`
                          }
                        />
                        <ResultStat
                          description="How tall you stayed throughout"
                          label="Posture"
                          value={`${spinePercent}%`}
                        />
                        <ResultStat
                          description="How much of each movement you reached"
                          label="How far you moved"
                          value={`${finalSessionResult.movementQualityPercent}%`}
                        />
                      </div>
                      <p className="mt-4 w-full text-left text-sm leading-6 text-white/60">
                        {finalSessionResult.spineCue ?? finalSpineCue}
                      </p>
                      <p className="mt-2 w-full text-left text-xs leading-5 text-white/[0.4]">
                        You were in full view for {finalSessionResult.trackingPercent}% of the practice.
                      </p>
                    </>
                  ) : (
                    <div className="mt-8 grid w-full grid-cols-[96px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/[0.48]">
                          Posture
                        </span>
                        <span className={`mt-1 block text-2xl font-black text-[${MOVEMENT_MINT}]`}>
                          {spinePercent}%
                        </span>
                      </div>
                      <p className="self-center text-sm leading-6 text-white/60">
                        {finalSpineCue}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="relative z-10 flex w-full gap-4">
              <button
                onClick={onExitMatch}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-5 text-sm font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-white/10"
              >
                Leave Studio
              </button>
              <button
                onClick={onRematch}
                className={`flex-1 rounded-2xl bg-[${MOVEMENT_CREAM}] py-5 text-sm font-black uppercase tracking-widest text-[${MOVEMENT_INK}] shadow-[0_20px_60px_rgba(246,204,190,0.12)] transition-all duration-300 hover:bg-[${MOVEMENT_SALMON}]`}
              >
                Practice Again
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
