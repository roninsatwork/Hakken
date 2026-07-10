import type { Id } from "@/convex/_generated/dataModel";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import {
  countFailures,
  formatDuration,
  formatTime,
  getRecordingLabel,
} from "../_lib/replayLabHelpers";
import type { LoadedReplayRecording, ReplayLabRecording } from "../_lib/replayLabHelpers";

type ReplayRecordingListProps = {
  activeRecordingId: Id<"movements"> | null;
  analysisByRecordingId: Map<string, MovementReplayAnalysis>;
  debugReplayError: string | null;
  loadedRecordings: Record<string, LoadedReplayRecording | undefined>;
  onSelectRecording: (recordingId: Id<"movements">) => void;
  onToggleRecordingSelection: (recordingId: Id<"movements">) => void;
  replayRecordings: ReplayLabRecording[] | undefined;
  selectedCount: number;
  selectedRecordingIds: Array<Id<"movements">>;
};

export default function ReplayRecordingList({
  activeRecordingId,
  analysisByRecordingId,
  debugReplayError,
  loadedRecordings,
  onSelectRecording,
  onToggleRecordingSelection,
  replayRecordings,
  selectedCount,
  selectedRecordingIds,
}: ReplayRecordingListProps) {
  return (
    <section className="rounded-[8px] border border-border-dim bg-sidebar/35 p-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Recordings</h2>
        <span className="text-xs text-muted">{selectedCount} selected</span>
      </div>

      <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
        {!replayRecordings ? (
          <div className="min-w-[260px] rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
            {debugReplayError ?? "Loading saved recordings..."}
          </div>
        ) : replayRecordings.length === 0 ? (
          <div className="min-w-[260px] rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
            {debugReplayError ?? "No saved movement recordings found."}
          </div>
        ) : replayRecordings.map((recording) => {
          const selected = recording._id === activeRecordingId;
          const included = selectedRecordingIds.includes(recording._id);
          const recordingAnalysis = analysisByRecordingId.get(recording._id);
          const loaded = loadedRecordings[recording._id];
          const frameTotal = loaded?.session?.sampleCount ?? recording.frameCount ?? 0;
          const recordingTopStartMessage = recordingAnalysis?.gamePath.startReadinessMessageSummary[0];
          const recordingSetupLine = recordingAnalysis
            ? recordingTopStartMessage
              ? `Setup ${recordingAnalysis.metrics.startReadinessReadyFrameCount}/${frameTotal} ready, ${recordingAnalysis.metrics.startReadinessBlockedFrameCount} blocked, top: ${recordingTopStartMessage.message}`
              : `Setup ${recordingAnalysis.metrics.startReadinessReadyFrameCount}/${frameTotal} ready, ${recordingAnalysis.metrics.startReadinessBlockedFrameCount} blocked`
            : null;
          return (
            <div
              key={recording._id}
              className={`grid min-w-[230px] max-w-[250px] grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-[8px] border p-2 transition-colors ${
                selected
                  ? "border-[#f6ccbe]/60 bg-[#f6ccbe]/10 text-foreground"
                  : "border-border-dim bg-background/50 text-secondary hover:border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={included}
                onChange={() => onToggleRecordingSelection(recording._id)}
                aria-label={`Select recording ${recording.title}`}
                className="mt-0.5 h-4 w-4 accent-[#f6ccbe]"
              />
              <button
                type="button"
                onClick={() => onSelectRecording(recording._id)}
                className="min-w-0 text-left"
                data-session-id={recording._id}
                data-testid="movement-replay-session"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-foreground">{recording.title}</span>
                  <span className="shrink-0 font-mono text-[11px]">{frameTotal}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-muted">
                    {formatTime(recording.createdAt)} · {formatDuration(recording.durationMs)}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    recordingAnalysis?.pass && countFailures(recordingAnalysis, "warning") === 0
                      ? "bg-[#a8d5ba]/15 text-[#a8d5ba]"
                      : recordingAnalysis
                        ? "bg-[#f6ccbe]/15 text-[#f6ccbe]"
                        : "bg-white/5 text-muted"
                  }`}
                  >
                    {loaded?.isLoading ? "Loading" : loaded?.error ? "Load failed" : getRecordingLabel(recordingAnalysis)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-secondary">
                  {recordingAnalysis
                    ? `${Math.round(recordingAnalysis.metrics.visualMatchScore * 100)}% match, ${recordingAnalysis.metrics.strongFullBodyFrameCount} strong, ${recordingAnalysis.metrics.supportConstraintPartialFrameCount} partial support`
                    : loaded?.error ?? `${recording.difficulty} · ${recording.spineGoal ?? "uncategorized"}`}
                </div>
                {recordingSetupLine ? (
                  <div
                    className="mt-0.5 truncate text-[11px] text-muted"
                    data-testid="movement-replay-session-setup-summary"
                    title={recordingSetupLine}
                  >
                    {recordingSetupLine}
                  </div>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
