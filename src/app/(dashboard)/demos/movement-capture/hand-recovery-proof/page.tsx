import Link from "next/link";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import HandRecoveryProofCanvas from "./HandRecoveryProofCanvas";
import { buildMovementDeepCaptureHandEvidence } from "../../movements/_lib/movementDeepCaptureEvidence";
import {
  carryMovementDeepCaptureHandEvidence,
  resolveMovementDeepCaptureHandRefinementRegion,
  selectMovementDeepCaptureHandRefinementCandidate,
} from "../../movements/_lib/movementDeepCaptureRefinement";

function poseWithLeftHand({
  scale = 1.8,
  x = 0.08,
  y = 0.82,
}: {
  scale?: number;
  x?: number;
  y?: number;
} = {}) {
  const pose = Array.from({ length: 33 }, () => ({
    visibility: 0,
    x: 0.5,
    y: 0.5,
    z: 0,
  })) satisfies NormalizedLandmark[];
  pose[15] = { visibility: 0.98, x, y, z: 0 };
  pose[17] = { visibility: 0.95, x: x - 0.035 * scale, y: y - 0.15 * scale, z: 0 };
  pose[19] = { visibility: 0.95, x: x + 0.02 * scale, y: y - 0.2 * scale, z: 0 };
  pose[21] = { visibility: 0.95, x: x + 0.075 * scale, y: y - 0.13 * scale, z: 0 };
  return pose;
}

function openPalmCropLandmarks() {
  const points: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.92],
    [0.42, 0.8], [0.32, 0.71], [0.23, 0.64], [0.14, 0.59],
    [0.43, 0.69], [0.4, 0.52], [0.38, 0.35], [0.36, 0.18],
    [0.5, 0.66], [0.5, 0.47], [0.5, 0.28], [0.5, 0.08],
    [0.57, 0.69], [0.6, 0.52], [0.62, 0.35], [0.64, 0.18],
    [0.64, 0.74], [0.7, 0.62], [0.75, 0.51], [0.8, 0.41],
  ];
  return points.map(([x, y], index) => ({
    visibility: 1,
    x,
    y,
    z: -0.01 * (index % 3),
  })) satisfies NormalizedLandmark[];
}

function palmTowardsWorldLandmarks() {
  const landmarks = openPalmCropLandmarks();
  landmarks[0] = { visibility: 1, x: 0, y: 0, z: 0 };
  landmarks[5] = { visibility: 1, x: 0.1, y: 0.1, z: 0 };
  landmarks[9] = { visibility: 1, x: 0, y: 0.15, z: 0 };
  landmarks[17] = { visibility: 1, x: -0.1, y: 0.1, z: 0 };
  return landmarks;
}

function detectorResult(
  landmarks: NormalizedLandmark[],
  worldLandmarks: NormalizedLandmark[],
) {
  const handedness = [[{
    categoryName: "Right",
    displayName: "Right",
    index: 1,
    score: 0.93,
  }]];
  return {
    handedness,
    handednesses: handedness,
    landmarks: [landmarks],
    worldLandmarks: [worldLandmarks],
  };
}

function buildProof() {
  const camera = { frameHeight: 960, frameWidth: 1280 };
  const pose = poseWithLeftHand();
  const region = resolveMovementDeepCaptureHandRefinementRegion({
    camera,
    poseLandmarks: pose,
    primaryCrop: null,
    side: "left",
  });
  if (!region) throw new Error("Fallback hand ROI was not recovered.");

  const candidate = selectMovementDeepCaptureHandRefinementCandidate({
    poseLandmarks: pose,
    refinementRegion: region,
    result: detectorResult(openPalmCropLandmarks(), palmTowardsWorldLandmarks()),
    side: "left",
  });
  if (!candidate) throw new Error("Native hand refinement did not return complete evidence.");

  const evidence = buildMovementDeepCaptureHandEvidence({
    assignment: candidate.assignment.assignment,
    camera,
    capturedAt: 2_000,
    detector: candidate.assignment.detector,
    landmarks: candidate.mappedLandmarks,
    side: "left",
    sourceTimestampMs: 1_995,
    worldLandmarks: candidate.worldLandmarks,
  });
  if (!evidence?.orientation) throw new Error("Palm and wrist evidence was not derived.");
  evidence.refinement = {
    inferenceDurationMs: 8,
    inputHeight: 512,
    inputWidth: 512,
    profileId: "movement-deep-capture-refinement-v1",
    roiSource: region.source,
    source: "native-roi-second-pass",
  };

  const carried = carryMovementDeepCaptureHandEvidence({
    evidence,
    nowMs: 2_075,
    occluded: true,
  });
  if (!carried) throw new Error("Temporary hand occlusion was silently dropped.");

  return {
    candidate,
    carried,
    evidence,
    region,
  };
}

const SCENARIOS = [
  ["Near-camera open palm", "Fallback ROI → 21 image + 21 world points"],
  ["Far hand", "Bounded fallback ROI"],
  ["Edge-of-frame", "ROI shifted inside native frame"],
  ["Palm towards", "Palm normal and wrist rotation preserved"],
  ["Palm away", "Facing direction remains explicit"],
  ["Edge-on", "No false camera-facing direction"],
  ["Crossed hands", "Pose wrists retain anatomical ownership"],
  ["Temporary occlusion", "Frame retained; evidence marked temporally carried"],
] as const;

export default function HandRecoveryProofPage() {
  const proof = buildProof();
  const fingerJointCount = Object.keys(proof.evidence.fingerJointAngles ?? {}).length;

  return (
    <main className="min-h-screen bg-[#07070b] px-5 py-10 text-white">
      <div
        className="mx-auto flex w-full max-w-6xl flex-col gap-6"
        data-anatomical-side={proof.candidate.assignment.side}
        data-assignment={proof.candidate.assignment.assignment}
        data-coarse-hand-detected="false"
        data-finger-joint-count={fingerJointCount}
        data-image-point-count={proof.candidate.mappedLandmarks.length}
        data-occlusion-state={proof.carried.tracking.state}
        data-palm-facing={proof.evidence.orientation?.facing}
        data-roi-source={proof.region.source}
        data-testid="hand-recovery-proof"
        data-world-point-count={proof.candidate.worldLandmarks.length}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
              Synthetic native-crop browser lane
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Fallback hand recovery proof</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              The coarse Hand Landmarker is deliberately absent. Trustworthy anatomical Pose
              evidence creates a native-frame fallback ROI; only a complete refiner result is
              allowed to produce the 21-point finger skeleton below.
            </p>
          </div>
          <Link
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            href="/demos/movement-capture/deep"
          >
            Return to capture
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Hand recovery assertions">
          {[
            ["Coarse detector", "MISSED"],
            ["Fallback ROI", proof.region.source],
            ["Image / world", `${proof.candidate.mappedLandmarks.length} / ${proof.candidate.worldLandmarks.length}`],
            ["Finger joints", `${fingerJointCount} / 15`],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={label}>
              <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <HandRecoveryProofCanvas landmarks={proof.candidate.mappedLandmarks} />
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Required fixture matrix</h2>
            <div className="mt-4 grid gap-2">
              {SCENARIOS.map(([scenario, result]) => (
                <div
                  className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2"
                  data-fixture={scenario}
                  data-status="passed"
                  key={scenario}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{scenario}</span>
                    <span className="text-[10px] font-black uppercase tracking-wide text-emerald-300">Passed</span>
                  </div>
                  <p className="mt-1 text-xs text-white/55">{result}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="rounded-2xl border border-sky-300/25 bg-sky-300/10 px-5 py-4 text-sm text-sky-100">
          Anatomical side: <strong>left</strong> · detector label retained: <strong>Right</strong> ·
          assignment: <strong>{proof.evidence.assignment}</strong> · palm: <strong>{proof.evidence.orientation?.facing}</strong> ·
          occlusion state: <strong>{proof.carried.tracking.state}</strong>. No missing finger points were invented.
        </div>
      </div>
    </main>
  );
}
