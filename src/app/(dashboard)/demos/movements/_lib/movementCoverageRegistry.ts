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
  | "standing-side-bend-head-direction"
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
  "standing-side-bend-head-direction",
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
    proofLevel: "full",
    remainingGaps: [],
    status: "supported",
    summary: "Reviewed broad standing upper-body support for arm raise, reach, twist, and shoulder/scapula proxy presentation with child-readable Game proof.",
  },
  "standing-side-bend-head-direction": {
    demoReady: true,
    family: "standing-side-bend-head-direction",
    label: "Standing side-bend and head direction",
    proofLevel: "full",
    remainingGaps: [],
    status: "supported",
    summary: "Reviewed standing side-bend and head-direction support with child-readable Game presentation.",
  },
  "squat-knee-lift": {
    demoReady: true,
    family: "squat-knee-lift",
    label: "Squat and knee lift",
    proofLevel: "full",
    remainingGaps: [],
    status: "supported",
    summary: "Reviewed standing squat and single-knee lift support with mirror-readable Game presentation.",
  },
  "facing-occlusion": {
    demoReady: true,
    family: "facing-occlusion",
    label: "Facing and occlusion",
    proofLevel: "diagnostic",
    remainingGaps: ["coverage product truth is still internal diagnostic", "promotion copy and guard expectations need a deliberate product decision before any user-facing claim"],
    status: "diagnostic-only",
    summary: "Root heading, away-body, source-limited, mirror-side ownership, and confidence gates are internally demo-ready as diagnostics with focused recorded Replay and Game proof closed; keep this non-user-facing until product truth is deliberately promoted.",
  },
  "root-turn": {
    demoReady: true,
    family: "root-turn",
    label: "Root turn",
    proofLevel: "full",
    remainingGaps: [],
    status: "supported",
    summary: "Reviewed standing root-turn support with recorded proof and child-readable Game presentation. This does not include root travel or walking support.",
  },
  "root-travel": {
    demoReady: true,
    family: "root-travel",
    label: "Root travel",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "world-landmark quality gates limit physical path proof", "foot replant arcs are not fully solved"],
    status: "approximate",
    summary: "Root X/Z path groundwork is available for internal simple-travel proof modes when world landmarks are usable, but root travel remains non-user-facing before recorded proof and Game visual proof.",
  },
  walking: {
    demoReady: true,
    family: "walking",
    label: "Walking and stepping",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "full gait IK is missing", "swing arcs and replant response are conservative"],
    status: "approximate",
    summary: "Alternating step release/landing and root-travel sequencing are internally previewable through shared root-motion proof; full gait IK and recorded walking proof are still missing before user-facing support.",
  },
  "pivot-weight-transfer": {
    demoReady: true,
    family: "pivot-weight-transfer",
    label: "Pivot and weight transfer",
    proofLevel: "synthetic",
    remainingGaps: ["exact foot-plant pivot IK is missing", "center-of-pressure transfer is approximate", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Side-lunge and wide-stance weight-transfer prep can be detected and presented in internal preview paths; exact planted-foot pivot IK and center-of-pressure transfer still need recorded proof.",
  },
  "jump-hop": {
    demoReady: true,
    family: "jump-hop",
    label: "Jump and hop",
    proofLevel: "synthetic",
    remainingGaps: ["jump flight/landing response is conservative", "impact and balance recovery are not solved", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Grounded jumping-jack/star-shape prep can be detected and presented for internal testing; true airborne jump/hop flight, impact, and balance recovery remain unproved.",
  },
  lunges: {
    demoReady: true,
    family: "lunges",
    label: "Lunges",
    proofLevel: "synthetic",
    remainingGaps: ["travelling lunge steps are conservative", "balance recovery remains approximate", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Forward-lunge, side-lunge, low-lunge, and warrior-lunge prep shapes can be detected and presented in internal preview paths; travelling lunge balance recovery still needs proof.",
  },
  sitting: {
    demoReady: true,
    family: "sitting",
    label: "Sitting",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "chair geometry is virtual", "pelvis-chair IK is conservative"],
    status: "approximate",
    summary: "Seated body orientation, twist, forward fold, leg lift presentation, and conservative pelvis/foot contact correction are implemented for internal synthetic proof; recorded replay and exact chair geometry are still missing before user-facing support.",
  },
  kneeling: {
    demoReady: true,
    family: "kneeling",
    label: "Kneeling",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "knee contact locks are conservative", "shin/foot rest state is approximate"],
    status: "approximate",
    summary: "Kneeling body orientation, presentation, and conservative knee/foot floor correction are implemented for internal synthetic proof; recorded replay and full shin/foot rest solve are still missing before user-facing support.",
  },
  "lying-floor-work": {
    demoReady: true,
    family: "lying-floor-work",
    label: "Lying and floor work",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "full body-plane contact IK is missing", "floor limb solve remains approximate"],
    status: "approximate",
    summary: "Lying/floor orientation, presentation, and body-anchor floor correction are implemented for internal synthetic proof; recorded replay and full body-plane contact are still missing before user-facing support.",
  },
  quadruped: {
    demoReady: true,
    family: "quadruped",
    label: "Quadruped",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "hand/knee locks are conservative", "continuous crawl sequencing is not solved"],
    status: "approximate",
    summary: "Hands-and-knees orientation, presentation, and conservative hand/knee floor correction are implemented for internal synthetic proof; recorded replay and continuous crawl sequencing are still missing before user-facing support.",
  },
  "rolling-crawling": {
    demoReady: true,
    family: "rolling-crawling",
    label: "Rolling and crawling",
    proofLevel: "synthetic",
    remainingGaps: ["continuous rolling locomotion is missing", "crawl limb sequencing is conservative", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Bear-crawl and floor-transition prep shapes can be detected and presented in internal preview paths; continuous rolling/crawling locomotion and limb sequencing remain unproved.",
  },
  yoga: {
    demoReady: true,
    family: "yoga",
    label: "Yoga",
    proofLevel: "synthetic",
    remainingGaps: ["full yoga library is not complete", "pose scoring remains diagnostic for many variants", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Standing, seated, kneeling, quadruped, supine, and prone yoga prep shapes can be detected and presented in internal preview paths; exact pose scoring and the full yoga library remain unproved.",
  },
  pilates: {
    demoReady: true,
    family: "pilates",
    label: "Pilates",
    proofLevel: "synthetic",
    remainingGaps: ["full Pilates mat/reformer libraries are not complete", "equipment-specific constraints are not modeled", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Pilates mat prep shapes including bridge, hundred, single-leg stretch, dead bug, hollow hold, double-leg stretch, plank, all-fours reach, side-lying leg lift, clam, and swimming can be detected and presented in internal preview paths; equipment-specific constraints remain unmodeled.",
  },
  "props-contact": {
    demoReady: true,
    family: "props-contact",
    label: "Props and contact",
    proofLevel: "synthetic",
    remainingGaps: ["wall/ball/reformer geometry is not modeled", "prop calibration and full prop contact IK are missing", "recorded replay proof is missing"],
    status: "approximate",
    summary: "Virtual chair contact is detected and corrected through seated preview poses; wall, ball, reformer, and explicit prop calibration remain missing.",
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
