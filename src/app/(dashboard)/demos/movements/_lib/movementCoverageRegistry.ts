export type MovementSupportStatus =
  | "supported"
  | "approximate"
  | "diagnostic-only"
  | "unsupported";

export type MovementCoverageProofLevel =
  | "diagnostic"
  | "explicitly-unsupported"
  | "full"
  | "synthetic";

export type MovementCoverageProofLayer =
  | "unit contract"
  | "synthetic visual proof"
  | "recorded replay analyzer proof"
  | "recorded replay visual capture"
  | "Game Studio parity proof";

export type MovementCoverageFamily =
  | "upright"
  | "upper-body-standing"
  | "squat-knee-lift"
  | "facing-occlusion"
  | "root-turn"
  | "root-travel"
  | "walking"
  | "pivot-weight-transfer"
  | "jump-hop"
  | "lunges"
  | "sitting"
  | "kneeling"
  | "lying-floor-work"
  | "quadruped"
  | "rolling-crawling"
  | "yoga"
  | "pilates"
  | "props-contact";

export type MovementCoverageEntry = {
  demoReady: boolean;
  family: MovementCoverageFamily;
  label: string;
  proofLevel: MovementCoverageProofLevel;
  remainingGaps: string[];
  status: MovementSupportStatus;
  summary: string;
};

export type MovementCoverageMissingProof = {
  code: "missing-proof";
  family: MovementCoverageFamily;
  label: string;
  missingLayers: MovementCoverageProofLayer[];
  proofLevel: MovementCoverageProofLevel;
};

export type MovementCoverageSummary = {
  approximateCount: number;
  blockedFamilies: MovementCoverageFamily[];
  demoReadyCount: number;
  demoReadyFamilies: MovementCoverageFamily[];
  demoReadyPercent: number;
  diagnosticOnlyCount: number;
  explicitStatusCount: number;
  familyCount: number;
  implementedCount: number;
  implementedFamilies: MovementCoverageFamily[];
  implementedPercent: number;
  internalDemoOnlyCount: number;
  internalDemoOnlyFamilies: MovementCoverageFamily[];
  missingProofCount: number;
  missingProofFamilies: MovementCoverageFamily[];
  phaseComplete: boolean;
  remainingGapCount: number;
  supportedCount: number;
  unsupportedCount: number;
  unsupportedFamilies: MovementCoverageFamily[];
  userFacingCount: number;
  userFacingFamilies: MovementCoverageFamily[];
};

export const MOVEMENT_COVERAGE_FAMILIES: MovementCoverageFamily[] = [
  "upright",
  "upper-body-standing",
  "squat-knee-lift",
  "facing-occlusion",
  "root-turn",
  "root-travel",
  "walking",
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "sitting",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];

export const MOVEMENT_COVERAGE_REGISTRY: Record<MovementCoverageFamily, MovementCoverageEntry> = {
  upright: {
    demoReady: true,
    family: "upright",
    label: "Neutral upright",
    proofLevel: "full",
    remainingGaps: [],
    status: "supported",
    summary: "Standing posture, posture check-in, and neutral upright calibration.",
  },
  "upper-body-standing": {
    demoReady: true,
    family: "upper-body-standing",
    label: "Upper-body standing",
    proofLevel: "synthetic",
    remainingGaps: ["shoulder/scapula IK is approximate", "standing weight pressure is not solved"],
    status: "approximate",
    summary: "Standing upper-body bends, twists, overhead arm raises, reaches, and head/arm motion with upright assumptions.",
  },
  "squat-knee-lift": {
    demoReady: true,
    family: "squat-knee-lift",
    label: "Squat and knee lift",
    proofLevel: "synthetic",
    remainingGaps: ["knee tracking is approximate", "foot pressure and balance recovery are not solved"],
    status: "approximate",
    summary: "Standing squat and single-knee lift diagnostics with conservative avatar presentation.",
  },
  "facing-occlusion": {
    demoReady: false,
    family: "facing-occlusion",
    label: "Facing and occlusion",
    proofLevel: "diagnostic",
    remainingGaps: ["side-swap recovery is conservative", "self-occlusion correction remains approximate"],
    status: "diagnostic-only",
    summary: "Root heading, away-body, source-limited, mirror-side ownership, and confidence gates provide approximate facing/occlusion handling; robust side-swap/self-occlusion recovery remains polish.",
  },
  "root-turn": {
    demoReady: true,
    family: "root-turn",
    label: "Root turn",
    proofLevel: "synthetic",
    remainingGaps: ["fast turn side ownership can still degrade", "planted-foot twist IK is approximate"],
    status: "approximate",
    summary: "Root heading groundwork for turn proof modes when world landmarks are usable.",
  },
  "root-travel": {
    demoReady: true,
    family: "root-travel",
    label: "Root travel",
    proofLevel: "synthetic",
    remainingGaps: ["world-landmark quality gates limit physical path proof", "foot replant arcs are not fully solved"],
    status: "approximate",
    summary: "Root X/Z path groundwork for simple travel proof modes when world landmarks are usable.",
  },
  walking: {
    demoReady: false,
    family: "walking",
    label: "Walking and stepping",
    proofLevel: "diagnostic",
    remainingGaps: ["full gait IK is missing", "swing arcs and replant response are conservative"],
    status: "diagnostic-only",
    summary: "World-landmark root intent labels travel direction plus foot release and landing phases, with conservative swing-foot lift and landing response; full gait IK is still missing.",
  },
  "pivot-weight-transfer": {
    demoReady: false,
    family: "pivot-weight-transfer",
    label: "Pivot and weight transfer",
    proofLevel: "diagnostic",
    remainingGaps: ["exact foot-plant pivot IK is missing", "center-of-pressure transfer is approximate"],
    status: "diagnostic-only",
    summary: "World-landmark root intent labels planted-foot pivots, on-the-spot turns, turn-and-travel, small planted weight shifts, and side-lunge prep with conservative avatar/root response; exact foot-plant pivot IK is still missing.",
  },
  "jump-hop": {
    demoReady: false,
    family: "jump-hop",
    label: "Jump and hop",
    proofLevel: "diagnostic",
    remainingGaps: ["jump flight/landing response is conservative", "impact and balance recovery are not solved"],
    status: "diagnostic-only",
    summary: "World-landmark root intent labels both-feet airborne and landing phases, applies conservative avatar lift/compression response, and includes grounded jumping-jack/star prep presentation; full impact and balance recovery are still missing.",
  },
  lunges: {
    demoReady: false,
    family: "lunges",
    label: "Lunges",
    proofLevel: "diagnostic",
    remainingGaps: ["travelling lunge steps are conservative", "balance recovery remains approximate"],
    status: "diagnostic-only",
    summary: "Low-lunge setup, forward-lunge prep, side-lunge prep, and yoga warrior lunges are detected with approximate presentation plus conservative foot release/landing response; travelling lunge balance recovery is still missing.",
  },
  sitting: {
    demoReady: false,
    family: "sitting",
    label: "Sitting",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "chair geometry is virtual", "pelvis-chair IK is conservative"],
    status: "approximate",
    summary: "Seated body orientation, twist, forward fold, leg lift presentation, and conservative pelvis/foot contact correction are implemented for internal synthetic proof; recorded replay and exact chair geometry are still missing before user-facing support.",
  },
  kneeling: {
    demoReady: false,
    family: "kneeling",
    label: "Kneeling",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "knee contact locks are conservative", "shin/foot rest state is approximate"],
    status: "approximate",
    summary: "Kneeling body orientation, presentation, and conservative knee/foot floor correction are implemented for internal synthetic proof; recorded replay and full shin/foot rest solve are still missing before user-facing support.",
  },
  "lying-floor-work": {
    demoReady: false,
    family: "lying-floor-work",
    label: "Lying and floor work",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "full body-plane contact IK is missing", "floor limb solve remains approximate"],
    status: "approximate",
    summary: "Lying/floor orientation, presentation, and body-anchor floor correction are implemented for internal synthetic proof; recorded replay and full body-plane contact are still missing before user-facing support.",
  },
  quadruped: {
    demoReady: false,
    family: "quadruped",
    label: "Quadruped",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "hand/knee locks are conservative", "continuous crawl sequencing is not solved"],
    status: "approximate",
    summary: "Hands-and-knees orientation, presentation, and conservative hand/knee floor correction are implemented for internal synthetic proof; recorded replay and continuous crawl sequencing are still missing before user-facing support.",
  },
  "rolling-crawling": {
    demoReady: false,
    family: "rolling-crawling",
    label: "Rolling and crawling",
    proofLevel: "diagnostic",
    remainingGaps: ["continuous rolling locomotion is missing", "crawl limb sequencing is conservative"],
    status: "diagnostic-only",
    summary: "Floor-roll transitions, quadruped setup, and bear-crawl prep are detected with approximate presentation/contact response; continuous rolling/crawling locomotion and full limb sequencing are still missing.",
  },
  yoga: {
    demoReady: false,
    family: "yoga",
    label: "Yoga",
    proofLevel: "diagnostic",
    remainingGaps: ["full yoga library is not complete", "pose scoring remains diagnostic for many variants"],
    status: "diagnostic-only",
    summary: "A growing proof set covers standing half lift, forward fold, chair, warrior I/II, triangle, tree, seated twist, half-kneel/low-lunge setup, child pose, cat/cow, plank prep, down-dog prep, bridge prep, bird dog prep, and prone extension/cobra prep with diagnostic scoring plus approximate presentation/contact correction; the full yoga library is not implemented yet.",
  },
  pilates: {
    demoReady: false,
    family: "pilates",
    label: "Pilates",
    proofLevel: "diagnostic",
    remainingGaps: ["full Pilates mat/reformer libraries are not complete", "equipment-specific constraints are not modeled"],
    status: "diagnostic-only",
    summary: "A growing proof set covers bridge prep, hundred prep, single-leg stretch, dead bug, hollow hold, double-leg stretch, plank setup, all-fours reach, side-lying leg lift, clam prep, and swimming prep with diagnostic scoring plus approximate presentation/contact correction; full Pilates mat/reformer libraries are not implemented yet.",
  },
  "props-contact": {
    demoReady: false,
    family: "props-contact",
    label: "Props and contact",
    proofLevel: "diagnostic",
    remainingGaps: ["wall/ball/reformer geometry is not modeled", "prop calibration and full prop contact IK are missing"],
    status: "diagnostic-only",
    summary: "Virtual chair contact is detected and corrected through seated proof poses; wall, ball, reformer, and explicit prop calibration are still missing.",
  },
};

export function getMovementCoverageEntry(family: MovementCoverageFamily) {
  return MOVEMENT_COVERAGE_REGISTRY[family];
}

export function getMovementCoverageEntries() {
  return MOVEMENT_COVERAGE_FAMILIES.map(getMovementCoverageEntry);
}

export function getMovementCoverageMissingProofs(): MovementCoverageMissingProof[] {
  return getMovementCoverageEntries()
    .map((entry): MovementCoverageMissingProof | null => {
      if (entry.proofLevel === "full" || entry.proofLevel === "explicitly-unsupported") {
        return null;
      }

      const missingLayers: MovementCoverageProofLayer[] = entry.proofLevel === "synthetic"
        ? [
            "recorded replay analyzer proof",
            "recorded replay visual capture",
            "Game Studio parity proof",
          ]
        : [
            "synthetic visual proof",
            "recorded replay analyzer proof",
            "recorded replay visual capture",
            "Game Studio parity proof",
          ];

      return {
        code: "missing-proof",
        family: entry.family,
        label: entry.label,
        missingLayers,
        proofLevel: entry.proofLevel,
      };
    })
    .filter((proof): proof is MovementCoverageMissingProof => Boolean(proof));
}

export function summarizeMovementCoverageRegistry(): MovementCoverageSummary {
  const entries = getMovementCoverageEntries();
  const missingProofs = getMovementCoverageMissingProofs();
  const unsupportedFamilies = entries
    .filter((entry) => entry.status === "unsupported")
    .map((entry) => entry.family);
  const demoReadyFamilies = entries
    .filter((entry) => entry.demoReady)
    .map((entry) => entry.family);
  const implementedFamilies = entries
    .filter((entry) => entry.status === "supported" || entry.status === "approximate")
    .map((entry) => entry.family);
  const userFacingFamilies = entries
    .filter((entry) => entry.status === "supported" && entry.proofLevel === "full")
    .map((entry) => entry.family);
  const internalDemoOnlyFamilies = entries
    .filter((entry) => entry.demoReady && !userFacingFamilies.includes(entry.family))
    .map((entry) => entry.family);
  const blockedFamilies = entries
    .filter((entry) => !entry.demoReady)
    .map((entry) => entry.family);

  return {
    approximateCount: entries.filter((entry) => entry.status === "approximate").length,
    blockedFamilies,
    demoReadyCount: demoReadyFamilies.length,
    demoReadyFamilies,
    demoReadyPercent: Math.round((demoReadyFamilies.length / Math.max(entries.length, 1)) * 100),
    diagnosticOnlyCount: entries.filter((entry) => entry.status === "diagnostic-only").length,
    explicitStatusCount: entries.length,
    familyCount: entries.length,
    implementedCount: implementedFamilies.length,
    implementedFamilies,
    implementedPercent: Math.round((implementedFamilies.length / Math.max(entries.length, 1)) * 100),
    internalDemoOnlyCount: internalDemoOnlyFamilies.length,
    internalDemoOnlyFamilies,
    missingProofCount: missingProofs.length,
    missingProofFamilies: missingProofs.map((proof) => proof.family),
    phaseComplete: entries.every((entry) => (
      Boolean(entry.summary) &&
      Boolean(entry.status) &&
      Boolean(entry.proofLevel) &&
      Array.isArray(entry.remainingGaps)
    )),
    remainingGapCount: entries.reduce((count, entry) => count + entry.remainingGaps.length, 0),
    supportedCount: entries.filter((entry) => entry.status === "supported").length,
    unsupportedCount: unsupportedFamilies.length,
    unsupportedFamilies,
    userFacingCount: userFacingFamilies.length,
    userFacingFamilies,
  };
}
