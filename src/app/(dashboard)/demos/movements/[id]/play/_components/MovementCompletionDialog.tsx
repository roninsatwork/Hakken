"use client";

import { AnimatePresence, motion } from "framer-motion";

type MovementCompletionDialogProps = {
  isOpen: boolean;
  finalScore: number;
  isPreviewMode?: boolean;
  onExitMatch: () => void;
  onRematch: () => void;
};

export default function MovementCompletionDialog({
  isOpen,
  finalScore,
  isPreviewMode = false,
  onExitMatch,
  onRematch,
}: MovementCompletionDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#07070b] backdrop-blur-3xl"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
            className="relative flex w-full max-w-[480px] flex-col items-center overflow-hidden rounded-[32px] border border-white/10 bg-[#111018]/[0.86] p-10 shadow-[0_40px_120px_rgba(246,204,190,0.10)]"
          >
            <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[#f6ccbe]/[0.12] blur-[80px]" />

            <h2 className="relative z-10 mb-3 text-sm font-light uppercase tracking-[0.16em] text-[#f6ccbe]">
              Practice Complete
            </h2>
            <h1 className="relative z-10 mb-10 text-xl font-bold uppercase tracking-widest text-white">
              Posture Studio
            </h1>

            <div className="relative z-10 mb-10 flex w-full flex-col items-center rounded-[24px] border border-white/10 bg-[#07070b] p-10 shadow-inner">
              {isPreviewMode ? (
                <>
                  <span className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/[0.48]">
                    Guided Preview
                  </span>
                  <span className="text-center text-2xl font-black uppercase leading-tight tracking-[0.1em] text-[#f6ccbe]">
                    Studio Ready
                  </span>
                  <p className="mt-4 max-w-[280px] text-center text-sm leading-6 text-white/55">
                    The coach and student flow is ready for a live posture check.
                  </p>
                </>
              ) : (
                <>
                  <span className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/[0.48]">
                    Alignment Result
                  </span>
                  <span className="text-5xl font-black tracking-tight text-[#f6ccbe]">{finalScore}</span>
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
                className="flex-1 rounded-2xl bg-[#f7efe7] py-5 text-sm font-black uppercase tracking-widest text-[#17131d] shadow-[0_20px_60px_rgba(246,204,190,0.12)] transition-all duration-300 hover:bg-[#f6ccbe]"
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
