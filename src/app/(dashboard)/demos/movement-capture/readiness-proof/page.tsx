import Link from "next/link";
import MovementCapturePreflightPanel from "../../movements/_components/MovementCapturePreflightPanel";
import { buildMovementCapturePreflight } from "../../movements/_lib/movementCapturePreflight";
import type { MovementAcquisitionFrame } from "../../movements/_lib/movementPlayerInputContract";
import { buildLiveMovementSourceFrame } from "../../movements/_lib/movementSourceFrame";

const VISIBILITY_QUALIFIED_INDEXES = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 23, 24,
]);

function buildReadinessRecoveryFixture(): MovementAcquisitionFrame {
  const landmarks = Array.from({ length: 33 }, (_, index) => ({
    visibility: VISIBILITY_QUALIFIED_INDEXES.has(index) ? 0.9 : 0.05,
    x: 0.25 + (index % 6) * 0.1,
    y: 0.2 + Math.floor(index / 6) * 0.12,
    z: index * -0.005,
  }));

  return {
    acquisitionProfileId: "movement-player-input-v1",
    camera: {
      facingMode: "user",
      frameHeight: 960,
      frameWidth: 1280,
    },
    capturedAt: 1_000,
    landmarks,
    sourceTimestampMs: 1_000,
    worldLandmarks: landmarks.map((landmark, index) => ({
      ...landmark,
      x: (index % 6) * 0.08,
      y: Math.floor(index / 6) * -0.12,
      z: index * -0.01,
    })),
  };
}

export default function MovementCaptureReadinessProofPage() {
  const frame = buildReadinessRecoveryFixture();
  const sourceFrame = buildLiveMovementSourceFrame({
    capturedAt: frame.capturedAt,
    poseLandmarks: frame.landmarks ?? [],
    requirements: { mode: "full-body" },
    sourceStatus: "smoothed",
    worldPoseLandmarks: frame.worldLandmarks ?? [],
  });
  const preflight = buildMovementCapturePreflight({
    frame,
    readiness: sourceFrame.startReadiness,
    retainedFrameCount: 0,
  });

  return (
    <main className="min-h-screen bg-[#07070b] px-5 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f6ccbe]">
              Synthetic browser capture lane
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Recording readiness recovery proof</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              This immutable fixture reproduces the reported contradiction: all 33 image coordinates
              and all 33 world points exist, but only 13 image points clear the visibility threshold.
              Recording acquisition must start; Game entry and final Deep Capture coverage remain strict.
            </p>
          </div>
          <Link
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            href="/demos/movement-capture?deepCapture=1"
          >
            Return to capture
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Readiness proof assertions">
          {[
            ["Image coordinates", "33 / 33"],
            ["Visibility-qualified", "13 / 33"],
            ["World coordinates", "33 / 33"],
            ["Recording decision", sourceFrame.startReadiness.canStartRecording ? "READY" : "BLOCKED"],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={label}>
              <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
              <p className="mt-2 text-xl font-semibold text-white" data-proof-value={label}>{value}</p>
            </div>
          ))}
        </section>

        <div
          className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100"
          data-can-start-game={String(sourceFrame.startReadiness.canStartGame)}
          data-can-start-recording={String(sourceFrame.startReadiness.canStartRecording)}
          data-testid="readiness-boundary-proof"
        >
          Recording acquisition: <strong>ready</strong>. Live Game entry: <strong>blocked</strong>.
          Missing hands, dense regions, or final coverage remain visible and cannot be invented.
        </div>

        <MovementCapturePreflightPanel capturePreflight={preflight} />
      </div>
    </main>
  );
}
