"use client";

import { AnimatePresence, motion } from "framer-motion";

type MovementCompletionDialogProps = {
  isOpen: boolean;
  finalScore: number;
  onExitMatch: () => void;
  onRematch: () => void;
};

export default function MovementCompletionDialog({
  isOpen,
  finalScore,
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
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#0B0C10] backdrop-blur-3xl"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
            className="bg-[#13141C]/80 border border-white/5 rounded-[32px] p-10 overflow-hidden relative shadow-[0_0_100px_rgba(204,255,0,0.05)] w-full max-w-[480px] flex flex-col items-center"
          >
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#CCFF00]/10 rounded-full blur-[80px] pointer-events-none" />

            <h2 className="text-[#CCFF00] font-light tracking-[0.12em] text-sm mb-3 relative z-10">
              SESSION COMPLETE
            </h2>
            <h1 className="text-white font-bold text-xl mb-10 relative z-10 uppercase tracking-widest">
              FULL BODY CAPTURE
            </h1>

            <div className="bg-[#0B0C10] border border-white/5 rounded-[24px] p-10 w-full flex flex-col items-center mb-10 relative z-10 shadow-inner">
              <span className="text-gray-400 font-semibold tracking-[0.2em] text-xs uppercase mb-4">FINAL SCORE</span>
              <span className="text-5xl font-black text-[#FF3300] tracking-tight">{finalScore}</span>
            </div>

            <div className="flex w-full gap-4 relative z-10">
              <button
                onClick={onExitMatch}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold tracking-widest text-sm py-5 rounded-[16px] transition-all duration-300 border border-white/5"
              >
                EXIT MATCH
              </button>
              <button
                onClick={onRematch}
                className="flex-1 bg-[#CCFF00] hover:bg-[#b3ff00] text-black font-black tracking-widest text-sm py-5 rounded-[16px] transition-all duration-300 shadow-[0_0_20px_rgba(204,255,0,0.2)] hover:shadow-[0_0_30px_rgba(204,255,0,0.4)]"
              >
                REMATCH
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
