import {
  MOVEMENT_COVERAGE_FAMILIES,
  MOVEMENT_SUPPORT_STATUS,
  type MovementCoverageFamily,
  type MovementSupportStatusEntry,
} from "./movementSupportStatus";

export {
  MOVEMENT_COVERAGE_FAMILIES,
  MOVEMENT_SUPPORT_STATUS,
  getMovementSupportStatusEntry,
} from "./movementSupportStatus";
export type {
  MovementCoverageFamily,
  MovementSupportStatus,
  MovementSupportStatusEntry,
} from "./movementSupportStatus";

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

export type MovementCoverageEntry = MovementSupportStatusEntry & {
  demoReady: boolean;
  family: MovementCoverageFamily;
  label: string;
  proofLevel: MovementCoverageProofLevel;
  remainingGaps: string[];
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

type MovementCoverageBookkeeping = {
  demoReady: boolean;
  label: string;
  proofLevel: MovementCoverageProofLevel;
  remainingGaps: string[];
};

const MOVEMENT_COVERAGE_BOOKKEEPING: Record<MovementCoverageFamily, MovementCoverageBookkeeping> = {
  upright: {
    demoReady: true,
    label: "Neutral upright",
    proofLevel: "full",
    remainingGaps: [],
  },
  "upper-body-standing": {
    demoReady: true,
    label: "Upper-body standing",
    proofLevel: "full",
    remainingGaps: [],
  },
  "standing-side-bend-head-direction": {
    demoReady: true,
    label: "Standing side-bend and head direction",
    proofLevel: "full",
    remainingGaps: [],
  },
  "squat-knee-lift": {
    demoReady: true,
    label: "Squat and knee lift",
    proofLevel: "full",
    remainingGaps: [],
  },
  "facing-occlusion": {
    demoReady: true,
    label: "Facing and occlusion",
    proofLevel: "diagnostic",
    remainingGaps: ["coverage product truth is still internal diagnostic", "promotion copy and guard expectations need a deliberate product decision before any user-facing claim"],
  },
  "root-turn": {
    demoReady: true,
    label: "Root turn",
    proofLevel: "full",
    remainingGaps: [],
  },
  "root-travel": {
    demoReady: true,
    label: "Root travel",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "world-landmark quality gates limit physical path proof", "foot replant arcs are not fully solved"],
  },
  walking: {
    demoReady: true,
    label: "Walking and stepping",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "full gait IK is missing", "swing arcs and replant response are conservative"],
  },
  "pivot-weight-transfer": {
    demoReady: true,
    label: "Pivot and weight transfer",
    proofLevel: "synthetic",
    remainingGaps: ["exact foot-plant pivot IK is missing", "center-of-pressure transfer is approximate", "recorded replay proof is missing"],
  },
  "jump-hop": {
    demoReady: true,
    label: "Jump and hop",
    proofLevel: "synthetic",
    remainingGaps: ["jump flight/landing response is conservative", "impact and balance recovery are not solved", "recorded replay proof is missing"],
  },
  lunges: {
    demoReady: true,
    label: "Lunges",
    proofLevel: "synthetic",
    remainingGaps: ["travelling lunge steps are conservative", "balance recovery remains approximate", "recorded replay proof is missing"],
  },
  sitting: {
    demoReady: true,
    label: "Sitting",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "chair geometry is virtual", "pelvis-chair IK is conservative"],
  },
  kneeling: {
    demoReady: true,
    label: "Kneeling",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "knee contact locks are conservative", "shin/foot rest state is approximate"],
  },
  "lying-floor-work": {
    demoReady: true,
    label: "Lying and floor work",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "full body-plane contact IK is missing", "floor limb solve remains approximate"],
  },
  quadruped: {
    demoReady: true,
    label: "Quadruped",
    proofLevel: "synthetic",
    remainingGaps: ["recorded replay proof is missing", "hand/knee locks are conservative", "continuous crawl sequencing is not solved"],
  },
  "rolling-crawling": {
    demoReady: true,
    label: "Rolling and crawling",
    proofLevel: "synthetic",
    remainingGaps: ["continuous rolling locomotion is missing", "crawl limb sequencing is conservative", "recorded replay proof is missing"],
  },
  yoga: {
    demoReady: true,
    label: "Yoga",
    proofLevel: "synthetic",
    remainingGaps: ["full yoga library is not complete", "pose scoring remains diagnostic for many variants", "recorded replay proof is missing"],
  },
  pilates: {
    demoReady: true,
    label: "Pilates",
    proofLevel: "synthetic",
    remainingGaps: ["full Pilates mat/reformer libraries are not complete", "equipment-specific constraints are not modeled", "recorded replay proof is missing"],
  },
  "props-contact": {
    demoReady: true,
    label: "Props and contact",
    proofLevel: "synthetic",
    remainingGaps: ["wall/ball/reformer geometry is not modeled", "prop calibration and full prop contact IK are missing", "recorded replay proof is missing"],
  },
};

export const MOVEMENT_COVERAGE_REGISTRY: Record<MovementCoverageFamily, MovementCoverageEntry> =
  Object.fromEntries(
    MOVEMENT_COVERAGE_FAMILIES.map((family) => [
      family,
      {
        ...MOVEMENT_SUPPORT_STATUS[family],
        ...MOVEMENT_COVERAGE_BOOKKEEPING[family],
        family,
      },
    ]),
  ) as Record<MovementCoverageFamily, MovementCoverageEntry>;

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
