"use client";

import { AnimatePresence, motion } from "framer-motion";

type MovementFeedbackOverlayProps = {
  feedbackMsg: { text: string; id: number } | null;
};

export default function MovementFeedbackOverlay({ feedbackMsg }: MovementFeedbackOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <AnimatePresence mode="wait">
        {feedbackMsg && (
          <motion.div
            key={feedbackMsg.id}
            initial={{ scale: 0.1, rotate: -20, opacity: 0 }}
            animate={{ scale: 1.5, rotate: 0, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="text-6xl font-black italic text-white drop-shadow-[0_0_30px_rgba(246,204,190,0.62)]"
            style={{ WebkitBackfaceVisibility: "hidden" }}
          >
            {feedbackMsg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
