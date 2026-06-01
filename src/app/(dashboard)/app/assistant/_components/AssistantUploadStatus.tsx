import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

type AssistantUploadStatusProps = {
  status: string | null;
};

export function AssistantUploadStatus({ status }: AssistantUploadStatusProps) {
  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex w-full justify-end mb-6 max-w-4xl"
        >
          <div className="px-4 py-2 rounded-full bg-brand/10 border border-brand/20 flex items-center gap-2 self-end shadow-sm">
            <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
            <span className="text-[12px] font-semibold tracking-wide text-brand uppercase">{status}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
