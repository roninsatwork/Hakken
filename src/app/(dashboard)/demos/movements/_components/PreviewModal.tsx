"use client";

import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Doc } from "@/convex/_generated/dataModel";
import { useMovementFrames } from "../_hooks/useMovementFrames";
import MovementFrameViewer from "./MovementFrameViewer";

interface PreviewModalProps {
  movement: Doc<"movements"> | null;
  onClose: () => void;
}

export default function PreviewModal({ movement, onClose }: PreviewModalProps) {
  const { frames, fps, isLoading, error } = useMovementFrames(movement);

  return (
    <SonaeModal isOpen={!!movement} onClose={onClose} title={`Preview: ${movement?.title}`}>
      <div className="flex flex-col items-center gap-6">
        <MovementFrameViewer
          frames={frames}
          fps={fps}
          isLoading={isLoading}
          error={error}
          controls="button"
        />
      </div>
    </SonaeModal>
  );
}
