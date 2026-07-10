import type { Id } from "@/convex/_generated/dataModel";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import { formatNumber } from "../_lib/replayLabHelpers";
import type { AvatarFollowBatchStatus, ReplayLabRecording } from "../_lib/replayLabHelpers";

type ReplaySetupReviewItem = {
  analysis: MovementReplayAnalysis;
  recording: ReplayLabRecording;
  topMessage: MovementReplayAnalysis["gamePath"]["startReadinessMessageSummary"][number];
};

type ReplayAvatarFollowBatchItem = {
  analysis: MovementReplayAnalysis;
  issueCode: string;
  nextFixArea: string;
  recording: ReplayLabRecording;
  status: AvatarFollowBatchStatus;
  worstFrame: { frameIndex: number } | null | undefined;
};

type ReplayBatchReviewPanelsProps = {
  avatarFollowBatchBlockedCount: number;
  avatarFollowBatchItems: ReplayAvatarFollowBatchItem[];
  avatarFollowBatchReviewCount: number;
  hasRunBatch: boolean;
  onJumpToFrame: (recordingId: Id<"movements">, frameIndex: number) => void;
  setupReviewItems: ReplaySetupReviewItem[];
};

export default function ReplayBatchReviewPanels({
  avatarFollowBatchBlockedCount,
  avatarFollowBatchItems,
  avatarFollowBatchReviewCount,
  hasRunBatch,
  onJumpToFrame,
  setupReviewItems,
}: ReplayBatchReviewPanelsProps) {
  return (
    <>
  {hasRunBatch ? (
    <section
      className="rounded-[8px] border border-border-dim bg-sidebar/35 p-2"
      data-testid="movement-replay-setup-review"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Setup Review</h2>
        <span className="text-xs text-muted">
          {setupReviewItems.length > 0
            ? `${setupReviewItems.length} recording${setupReviewItems.length === 1 ? "" : "s"} need setup review`
            : "No setup blockers in selected recordings"}
        </span>
      </div>
      {setupReviewItems.length > 0 ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {setupReviewItems.slice(0, 4).map(({ analysis: setupAnalysis, recording, topMessage }) => (
            <button
              key={recording._id}
              type="button"
              onClick={() => onJumpToFrame(recording._id, topMessage.firstFrameIndex)}
              className="rounded-[8px] border border-[#f6ccbe]/20 bg-[#f6ccbe]/10 p-2 text-left text-xs text-secondary transition-colors hover:border-[#f6ccbe]/40 hover:bg-[#f6ccbe]/15"
              data-blocked-frame-count={setupAnalysis.metrics.startReadinessBlockedFrameCount}
              data-first-frame-index={topMessage.firstFrameIndex}
              data-testid="movement-replay-setup-review-item"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-semibold text-foreground">{recording.title}</span>
                <span className="shrink-0 font-mono text-[#f6ccbe]">
                  {setupAnalysis.metrics.startReadinessBlockedFrameCount} blocked
                </span>
              </div>
              <div className="mt-1 truncate">
                {topMessage.message}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted">
                first frame {topMessage.firstFrameIndex} · {topMessage.count} message frame{topMessage.count === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-[8px] border border-[#a8d5ba]/20 bg-[#a8d5ba]/10 p-2 text-xs text-[#a8d5ba]">
          Selected recordings did not report start-gate blockers.
        </div>
      )}
    </section>
  ) : null}

  {hasRunBatch ? (
    <section
      className="rounded-[8px] border border-border-dim bg-sidebar/35 p-2"
      data-testid="movement-replay-avatar-follow-batch"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Avatar Follow Review</h2>
        <span className="text-xs text-muted">
          {avatarFollowBatchBlockedCount > 0
            ? `${avatarFollowBatchBlockedCount} blocked · ${avatarFollowBatchReviewCount} review`
            : avatarFollowBatchReviewCount > 0
              ? `${avatarFollowBatchReviewCount} review · no hard blockers`
              : `${avatarFollowBatchItems.length} recording${avatarFollowBatchItems.length === 1 ? "" : "s"} clean`}
        </span>
      </div>

      {avatarFollowBatchItems.length > 0 ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          {avatarFollowBatchItems.map((item) => {
            const worstFrameIndex = item.worstFrame?.frameIndex ?? 0;
            return (
              <button
                key={item.recording._id}
                type="button"
                onClick={() => onJumpToFrame(item.recording._id, worstFrameIndex)}
                className={`rounded-[8px] border p-2 text-left text-xs transition-colors ${
                  item.status === "blocked"
                    ? "border-[#ff8f8f]/25 bg-[#ff8f8f]/10 text-[#ffb0b0] hover:border-[#ff8f8f]/50"
                    : item.status === "review"
                      ? "border-[#f6ccbe]/20 bg-[#f6ccbe]/10 text-[#f6ccbe] hover:border-[#f6ccbe]/45"
                      : "border-[#a8d5ba]/20 bg-[#a8d5ba]/10 text-[#a8d5ba] hover:border-[#a8d5ba]/45"
                }`}
                data-avatar-follow-issue={item.issueCode}
                data-avatar-follow-status={item.status}
                data-avatar-follow-worst-frame={item.worstFrame?.frameIndex ?? ""}
                data-recording-id={item.recording._id}
                data-testid="movement-replay-avatar-follow-batch-item"
                title={item.nextFixArea}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-semibold text-foreground">{item.recording.title}</span>
                  <span className="shrink-0 font-mono uppercase">{item.status}</span>
                </div>
                <div className="mt-1 truncate font-mono">
                  {item.issueCode}
                  {item.worstFrame ? ` · frame ${item.worstFrame.frameIndex}` : ""}
                </div>
                <div className="mt-1 truncate text-secondary">
                  {item.nextFixArea}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  {Math.round(item.analysis.metrics.visualMatchScore * 100)}% match · lower{" "}
                  {formatNumber(item.analysis.metrics.averageAvatarLowerBodyDirectionError)} ·{" "}
                  {formatNumber(item.analysis.metrics.ownerTransitionsPerSecond)}/s owner
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 rounded-[8px] border border-border-dim bg-background/50 p-2 text-xs text-secondary">
          Run selected recordings to diagnose avatar-follow mismatches.
        </div>
      )}
    </section>
  ) : null}
    </>
  );
}
