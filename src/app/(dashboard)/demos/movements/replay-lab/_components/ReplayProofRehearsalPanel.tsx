import { MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS } from "../_lib/movementNextProofRehearsal";
import {
  getMovementProofRehearsalBatchEvidence,
  getMovementProofRehearsalRequirement,
  getMovementProofRehearsalScoreSummary,
} from "../_lib/movementProofRehearsalEvidence";
import type { getProofRehearsalReadiness } from "../_lib/replayLabHelpers";

type ReplayProofRehearsalPanelProps = {
  onJumpToEvidence: (recordingId: string, frameIndex: number) => void;
  proofRehearsalCandidateSummary: {
    belowThresholdCount: number;
    meetsThresholdCount: number;
    missingCount: number;
    total: number;
  };
  proofRehearsalEvidenceEntries: Parameters<typeof getMovementProofRehearsalBatchEvidence>[1];
  proofRehearsalReadiness: ReturnType<typeof getProofRehearsalReadiness>;
};

export default function ReplayProofRehearsalPanel({
  onJumpToEvidence,
  proofRehearsalCandidateSummary,
  proofRehearsalEvidenceEntries,
  proofRehearsalReadiness,
}: ReplayProofRehearsalPanelProps) {
  return (
    <section
      className="rounded-[8px] border border-border-dim bg-sidebar/35 p-2"
      data-testid="movement-replay-proof-rehearsal"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Proof Rehearsal</h2>
          <div className="mt-0.5 text-[11px] text-muted">
            {MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.length} blocker recordings queued before promotion
          </div>
        </div>
        <span className="rounded-full border border-[#f6ccbe]/25 bg-[#f6ccbe]/10 px-2 py-1 font-mono text-[11px] text-[#f6ccbe]">
          no-recording prep
        </span>
      </div>
      <div
        className="mt-2 rounded-[8px] border border-border-dim bg-background/45 p-2 text-xs text-secondary"
        data-state={proofRehearsalReadiness.state}
        data-testid="movement-replay-proof-rehearsal-readiness"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-foreground">Ready to record?</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-muted">
            {proofRehearsalReadiness.state}
          </span>
        </div>
        <div className="mt-1 font-semibold text-[#f6ccbe]">{proofRehearsalReadiness.label}</div>
        <div className="mt-0.5 leading-snug">{proofRehearsalReadiness.detail}</div>
      </div>
      <div
        className="mt-2 rounded-[8px] border border-border-dim bg-background/45 p-2 text-xs text-secondary"
        data-below-threshold-count={proofRehearsalCandidateSummary.belowThresholdCount}
        data-meets-threshold-count={proofRehearsalCandidateSummary.meetsThresholdCount}
        data-missing-count={proofRehearsalCandidateSummary.missingCount}
        data-testid="movement-replay-proof-rehearsal-candidate-summary"
        data-total-count={proofRehearsalCandidateSummary.total}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-foreground">Candidate coverage</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-muted">
            {proofRehearsalCandidateSummary.meetsThresholdCount}/{proofRehearsalCandidateSummary.total} at threshold
          </span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-secondary">
          {proofRehearsalCandidateSummary.belowThresholdCount} below threshold · {proofRehearsalCandidateSummary.missingCount} missing
        </div>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.map((item) => {
          const evidence = getMovementProofRehearsalBatchEvidence(item, proofRehearsalEvidenceEntries);
          const requirement = getMovementProofRehearsalRequirement(item);
          const score = evidence?.score ?? 0;
          const scoreSummary = requirement
            ? getMovementProofRehearsalScoreSummary(score, requirement)
            : null;
          return (
            <div
              key={item.freshRecordingLabel}
              className="rounded-[8px] border border-border-dim bg-background/45 p-2 text-xs text-secondary"
              data-evidence-frame-index={evidence?.frameIndex ?? ""}
              data-evidence-recording-id={evidence?.recordingId ?? ""}
              data-evidence-recording-title={evidence?.recordingTitle ?? ""}
              data-evidence-required-score={requirement?.requiredScore ?? ""}
              data-evidence-score={evidence?.score ?? ""}
              data-evidence-score-percent={scoreSummary?.scorePercent ?? ""}
              data-evidence-score-state={scoreSummary?.scoreState ?? "missing"}
              data-evidence-state={evidence ? "available" : "missing"}
              data-families={item.families.join(",")}
              data-proof-cases={item.proofCases.join(",")}
              data-testid="movement-replay-proof-rehearsal-item"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{item.freshRecordingLabel}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {item.families.join(" + ")} · {item.proofCases.join(", ")}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                  {item.quickValidationScriptCommand.replace("npm run ", "")}
                </span>
              </div>
              <div
                className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border-dim bg-black/15 p-2"
                data-testid="movement-replay-proof-rehearsal-evidence"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Evidence</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-secondary">
                    {evidence
                      ? `${evidence.recordingTitle} · ${evidence.label} · frame ${evidence.frameIndex} · ${evidence.detail}`
                      : "No matching frame in the selected recordings"}
                  </div>
                  {requirement && scoreSummary ? (
                    <div
                      className={`mt-1 font-mono text-[11px] ${
                        scoreSummary.scoreState === "meets-threshold"
                          ? "text-[#a8d5ba]"
                          : scoreSummary.scoreState === "below-threshold"
                            ? "text-[#f6ccbe]"
                            : "text-muted"
                      }`}
                      data-testid="movement-replay-proof-rehearsal-score"
                    >
                      {requirement.label}: {scoreSummary.scoreSummary}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={!evidence}
                  onClick={() => {
                    if (!evidence) return;
                    onJumpToEvidence(evidence.recordingId, evidence.frameIndex);
                  }}
                  className="h-7 rounded-[8px] border border-border-dim px-2 text-[11px] font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Jump Evidence
                </button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {([
                  ["Setup", item.rehearsal.setupChecks],
                  ["Motion", item.rehearsal.motionChecks],
                  ["Validate", item.rehearsal.validationChecks],
                  ["Stop", item.rehearsal.stopIf],
                ] as Array<[string, string[]]>).map(([label, checks]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</div>
                    <ul className="mt-1 space-y-1">
                      {checks.slice(0, 2).map((check) => (
                        <li key={check} className="line-clamp-2 leading-snug">
                          {check}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
