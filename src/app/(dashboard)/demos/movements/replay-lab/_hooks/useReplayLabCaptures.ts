"use client";

import { useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { MovementDebugReplaySession } from "../../_lib/movementDebugReplay";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import type { ReplayStudioRepairPacket } from "../../_lib/movementReplayStudioRepairPacket";
import { drawMovementSkeleton } from "../../_lib/movementSkeleton";
import {
  captureFileName,
  compactCaptureLabel,
  downloadDataUrl,
  frameLandmarks,
  selectStripFrameIndexes,
} from "../_lib/replayLabHelpers";

export function buildReplayStudioFixLog({
  analysis,
  currentReplayStudioFrameVerdict,
  repairPacket,
}: {
  analysis: MovementReplayAnalysis;
  currentReplayStudioFrameVerdict: MovementReplayAnalysis["replayStudio"]["frames"][number] | undefined;
  repairPacket: ReplayStudioRepairPacket;
}) {
  return {
    currentFrame: currentReplayStudioFrameVerdict ?? null,
    failures: analysis.failures,
    generatedAt: repairPacket.generatedAt,
    recordingId: repairPacket.recording.id,
    repairPacket,
    replayStudio: analysis.replayStudio.session,
  };
}

export function useReplayLabCaptures({
  activeRecordingId,
  analysis,
  currentReplayStudioFrameVerdict,
  frameCount,
  repairPacket,
  replaySession,
  safeFrameIndex,
  setIsPlaying,
}: {
  activeRecordingId: Id<"movements"> | null;
  analysis: MovementReplayAnalysis | null;
  currentReplayStudioFrameVerdict: MovementReplayAnalysis["replayStudio"]["frames"][number] | undefined;
  frameCount: number;
  repairPacket: ReplayStudioRepairPacket | null;
  replaySession: MovementDebugReplaySession | null;
  safeFrameIndex: number;
  setIsPlaying: (isPlaying: boolean) => void;
}) {
  const replaySceneRef = useRef<HTMLElement | null>(null);
  const [captureMode, setCaptureMode] = useState<"scene" | "strip" | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);

  const captureDisabled = frameCount === 0 || captureMode !== null;
  const captureAvatarFrame = async () => {
    if (!replaySceneRef.current || !replaySession) return;

    setIsPlaying(false);
    setCaptureMode("scene");
    setCaptureStatus("Capturing avatar replay frame...");

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(replaySceneRef.current, {
        backgroundColor: "#07070b",
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      });

      downloadDataUrl(
        captureFileName(activeRecordingId, `avatar-frame-${safeFrameIndex}.png`),
        canvas.toDataURL("image/png"),
      );
      setCaptureStatus(`Captured avatar frame ${safeFrameIndex}.`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Avatar capture failed.");
    } finally {
      setCaptureMode(null);
    }
  };

  const captureSourceStrip = () => {
    if (!replaySession) return;

    setIsPlaying(false);
    setCaptureMode("strip");
    setCaptureStatus("Capturing source skeleton strip...");

    try {
      const indexes = selectStripFrameIndexes(frameCount, safeFrameIndex, analysis?.failures ?? []);
      const panelWidth = 420;
      const panelHeight = 260;
      const labelHeight = 64;
      const stripCanvas = document.createElement("canvas");
      const tempCanvas = document.createElement("canvas");
      const stripContext = stripCanvas.getContext("2d");
      const tempContext = tempCanvas.getContext("2d");

      if (!stripContext || !tempContext || indexes.length === 0) {
        setCaptureStatus("Source strip capture failed.");
        return;
      }

      tempCanvas.width = panelWidth;
      tempCanvas.height = panelHeight;
      stripCanvas.width = panelWidth * indexes.length;
      stripCanvas.height = panelHeight + labelHeight;

      stripContext.fillStyle = "#07070b";
      stripContext.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
      stripContext.textBaseline = "top";

      indexes.forEach((index, stripIndex) => {
        const frame = replaySession.samples[index];
        const x = stripIndex * panelWidth;
        const sourceFrame = analysis?.gamePath.sourceFrames.find((source) => source.frameIndex === index);
        const startGateLabel = sourceFrame
          ? `${sourceFrame.canStartGame ? "ready" : sourceFrame.startReadinessState}: ${sourceFrame.startReadinessMessage}`
          : "start gate: pending";
        drawMovementSkeleton(tempContext, frameLandmarks(frame), panelWidth, panelHeight);
        stripContext.fillStyle = "#111118";
        stripContext.fillRect(x, 0, panelWidth, labelHeight);
        stripContext.fillStyle = index === safeFrameIndex ? "#f6ccbe" : "#d7d7dd";
        stripContext.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
        stripContext.fillText(`frame ${index}`, x + 14, 10);
        stripContext.fillStyle = sourceFrame?.canStartGame ? "#a8d5ba" : "#f6ccbe";
        stripContext.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
        stripContext.fillText(compactCaptureLabel(startGateLabel), x + 14, 36);
        stripContext.drawImage(tempCanvas, x, labelHeight);
      });

      downloadDataUrl(
        captureFileName(activeRecordingId, "source-strip.png"),
        stripCanvas.toDataURL("image/png"),
      );
      setCaptureStatus(`Captured source strip with setup labels: ${indexes.join(", ")}.`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Source strip capture failed.");
    } finally {
      setCaptureMode(null);
    }
  };

  const exportReplayStudioFixLog = () => {
    if (!analysis || !repairPacket) return;
    if (repairPacket.recording.sourceHash === "sha256:pending") {
      setCaptureStatus("Source identity is still being calculated. Try the export again in a moment.");
      return;
    }

    const fixLog = buildReplayStudioFixLog({
      analysis,
      currentReplayStudioFrameVerdict,
      repairPacket,
    });
    downloadDataUrl(
      captureFileName(activeRecordingId, "replay-studio-fix-log.json"),
      `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(fixLog, null, 2))}`,
    );
    setCaptureStatus(
      `Exported Replay Studio fix log with ${analysis.replayStudio.session.worstFrames.length} worst frames.`,
    );
  };

  return {
    captureAvatarFrame,
    captureDisabled,
    captureMode,
    captureSourceStrip,
    captureStatus,
    exportReplayStudioFixLog,
    replaySceneRef,
  };
}
