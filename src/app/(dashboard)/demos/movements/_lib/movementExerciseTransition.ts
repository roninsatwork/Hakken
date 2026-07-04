import type {
  MovementExercisePoseDecision,
  MovementExercisePoseKey,
} from "./movementExercisePose";

export type MovementExercisePostureBand =
  | "floor"
  | "kneeling"
  | "quadruped"
  | "seated"
  | "unknown"
  | "upright";

export type MovementExerciseTransitionKey =
  | "down-dog-to-child-pose"
  | "floor-roll"
  | "floor-to-quadruped"
  | "floor-to-kneeling"
  | "floor-to-seated"
  | "floor-to-standing"
  | "floor-variation"
  | "kneeling-variation"
  | "kneeling-to-seated"
  | "kneeling-to-floor"
  | "plank-to-down-dog"
  | "quadruped-to-floor"
  | "quadruped-to-child-pose"
  | "quadruped-to-plank"
  | "quadruped-variation"
  | "seated-variation"
  | "seated-to-floor"
  | "seated-to-kneeling"
  | "seated-to-standing"
  | "standing-to-floor"
  | "stable-floor"
  | "stable-kneeling"
  | "stable-quadruped"
  | "stable-seated"
  | "stable-upright"
  | "standing-to-kneeling"
  | "standing-to-seated"
  | "unknown-transition";

export type MovementExerciseTransitionDecision = {
  confidence: number;
  fromBand: MovementExercisePostureBand | null;
  fromPoseKey: MovementExercisePoseKey | null;
  isTransition: boolean;
  key: MovementExerciseTransitionKey;
  label: string;
  summary: string;
  toBand: MovementExercisePostureBand;
  toPoseKey: MovementExercisePoseKey;
};

function postureBandForPose(poseKey: MovementExercisePoseKey): MovementExercisePostureBand {
  if (
    poseKey === "forward-lunge-prep" ||
    poseKey === "jumping-jack-prep" ||
    poseKey === "side-lunge-prep" ||
    poseKey === "standing-arm-raise" ||
    poseKey === "standing-neutral" ||
    poseKey === "standing-twist" ||
    poseKey === "yoga-chair-prep" ||
    poseKey === "yoga-forward-fold-prep" ||
    poseKey === "yoga-half-lift-prep" ||
    poseKey === "yoga-tree-prep" ||
    poseKey === "yoga-triangle-prep" ||
    poseKey === "yoga-warrior-one-prep" ||
    poseKey === "yoga-warrior-two-prep"
  ) return "upright";
  if (
    poseKey === "chair-seated" ||
    poseKey === "seated-forward-fold" ||
    poseKey === "seated-leg-lift" ||
    poseKey === "seated-twist"
  ) return "seated";
  if (
    poseKey === "half-kneeling-floor" ||
    poseKey === "kneeling-floor" ||
    poseKey === "low-lunge-floor"
  ) return "kneeling";
  if (
    poseKey === "bear-crawl-prep" ||
    poseKey === "quadruped-bird-dog-prep" ||
    poseKey === "tabletop-all-fours" ||
    poseKey === "yoga-cat-prep" ||
    poseKey === "yoga-child-pose-prep" ||
    poseKey === "yoga-cow-prep" ||
    poseKey === "yoga-down-dog-prep" ||
    poseKey === "yoga-plank-prep"
  ) return "quadruped";
	  if (
	    poseKey === "pilates-clam-prep" ||
	    poseKey === "pilates-dead-bug-prep" ||
	    poseKey === "pilates-double-leg-stretch-prep" ||
	    poseKey === "pilates-hollow-hold-prep" ||
	    poseKey === "pilates-hundred-prep" ||
	    poseKey === "pilates-bridge-prep" ||
	    poseKey === "pilates-single-leg-stretch-prep" ||
	    poseKey === "pilates-side-lying-leg-lift" ||
	    poseKey === "pilates-swimming-prep" ||
	    poseKey === "prone-back-extension-prep" ||
	    poseKey === "prone-mat" ||
	    poseKey === "side-lying-mat" ||
    poseKey === "supine-mat"
  ) return "floor";
  return "unknown";
}

function stableTransitionForBand(
  band: MovementExercisePostureBand,
): Pick<MovementExerciseTransitionDecision, "key" | "label" | "summary"> {
  if (band === "upright") {
    return {
      key: "stable-upright",
      label: "Stable upright",
      summary: "The current movement pose remains upright.",
    };
  }
  if (band === "seated") {
    return {
      key: "stable-seated",
      label: "Stable seated",
      summary: "The current movement pose remains seated.",
    };
  }
  if (band === "kneeling") {
    return {
      key: "stable-kneeling",
      label: "Stable kneeling",
      summary: "The current movement pose remains kneeling.",
    };
  }
  if (band === "quadruped") {
    return {
      key: "stable-quadruped",
      label: "Stable all-fours",
      summary: "The current movement pose remains on hands and knees.",
    };
  }
  if (band === "floor") {
    return {
      key: "stable-floor",
      label: "Stable floor",
      summary: "The current movement pose remains floor-supported.",
    };
  }
  return {
    key: "unknown-transition",
    label: "Unknown transition",
    summary: "No stable transition class is available for this pose.",
  };
}

function floorFacingGroup(poseKey: MovementExercisePoseKey) {
	  if (
	    poseKey === "pilates-bridge-prep" ||
	    poseKey === "pilates-double-leg-stretch-prep" ||
	    poseKey === "pilates-hundred-prep" ||
	    poseKey === "pilates-single-leg-stretch-prep" ||
	    poseKey === "supine-mat"
	  ) return "supine";
	  if (
	    poseKey === "pilates-swimming-prep" ||
	    poseKey === "prone-mat" ||
	    poseKey === "prone-back-extension-prep"
	  ) return "prone";
	  if (
	    poseKey === "pilates-clam-prep" ||
	    poseKey === "side-lying-mat" ||
	    poseKey === "pilates-side-lying-leg-lift"
	  ) return "side";
  return "other";
}

function isYogaPlankPose(poseKey: MovementExercisePoseKey) {
  return poseKey === "yoga-plank-prep";
}

function isYogaDownDogPose(poseKey: MovementExercisePoseKey) {
  return poseKey === "yoga-down-dog-prep";
}

function isYogaChildPose(poseKey: MovementExercisePoseKey) {
  return poseKey === "yoga-child-pose-prep";
}

function transitionForBands({
  fromBand,
  fromPoseKey,
  toBand,
  toPoseKey,
}: {
  fromBand: MovementExercisePostureBand;
  fromPoseKey: MovementExercisePoseKey;
  toBand: MovementExercisePostureBand;
  toPoseKey: MovementExercisePoseKey;
}): Pick<MovementExerciseTransitionDecision, "key" | "label" | "summary"> {
  if (fromBand === toBand) {
    if (fromPoseKey !== toPoseKey && toBand === "seated") {
      return {
        key: "seated-variation",
        label: "Seated variation",
        summary: "The body remains seat-supported while changing seated exercise pose.",
      };
    }

    if (fromPoseKey !== toPoseKey && toBand === "kneeling") {
      return {
        key: "kneeling-variation",
        label: "Kneeling variation",
        summary: "The body remains knee-supported while changing kneeling exercise pose.",
      };
    }

    if (fromPoseKey !== toPoseKey && toBand === "quadruped") {
      if (isYogaPlankPose(fromPoseKey) && isYogaDownDogPose(toPoseKey)) {
        return {
          key: "plank-to-down-dog",
          label: "Plank to down dog",
          summary: "The body changed from a plank-like hand-and-foot support into down dog.",
        };
      }

      if (isYogaDownDogPose(fromPoseKey) && isYogaChildPose(toPoseKey)) {
        return {
          key: "down-dog-to-child-pose",
          label: "Down dog to child pose",
          summary: "The body changed from down dog into a folded child-pose support pattern.",
        };
      }

      if (isYogaChildPose(toPoseKey)) {
        return {
          key: "quadruped-to-child-pose",
          label: "All-fours to child pose",
          summary: "The body changed from an all-fours support pattern into folded child pose.",
        };
      }

      if (isYogaPlankPose(toPoseKey)) {
        return {
          key: "quadruped-to-plank",
          label: "All-fours to plank",
          summary: "The body changed from hands-and-knees support into a plank-like hand-and-foot support.",
        };
      }

      return {
        key: "quadruped-variation",
        label: "All-fours variation",
        summary: "The body remains in an all-fours support family while changing exercise pose.",
      };
    }

    if (fromPoseKey !== toPoseKey && toBand === "floor") {
      if (floorFacingGroup(fromPoseKey) !== floorFacingGroup(toPoseKey)) {
        return {
          key: "floor-roll",
          label: "Floor roll",
          summary: "The body changed between floor-supported sides or facing directions.",
        };
      }

      return {
        key: "floor-variation",
        label: "Floor variation",
        summary: "The body remains floor-supported while changing mat-work pose.",
      };
    }

    return stableTransitionForBand(toBand);
  }

  if (fromBand === "upright" && toBand === "seated") {
    return {
      key: "standing-to-seated",
      label: "Standing to seated",
      summary: "The body changed from upright standing into a seated support pattern.",
    };
  }

  if (fromBand === "seated" && toBand === "upright") {
    return {
      key: "seated-to-standing",
      label: "Seated to standing",
      summary: "The body changed from seated support into upright standing.",
    };
  }

  if (fromBand === "upright" && (toBand === "floor" || toBand === "quadruped")) {
    return {
      key: "standing-to-floor",
      label: "Standing to floor",
      summary: "The body changed from upright standing into a floor-supported pose.",
    };
  }

  if ((fromBand === "floor" || fromBand === "quadruped") && toBand === "upright") {
    return {
      key: "floor-to-standing",
      label: "Floor to standing",
      summary: "The body changed from floor support back into upright standing.",
    };
  }

  if (fromBand === "seated" && (toBand === "floor" || toBand === "quadruped")) {
    return {
      key: "seated-to-floor",
      label: "Seated to floor",
      summary: "The body changed from seated support into a lower floor-supported pose.",
    };
  }

  if ((fromBand === "floor" || fromBand === "quadruped") && toBand === "seated") {
    return {
      key: "floor-to-seated",
      label: "Floor to seated",
      summary: "The body changed from floor support into seated support.",
    };
  }

  if (fromBand === "upright" && toBand === "kneeling") {
    return {
      key: "standing-to-kneeling",
      label: "Standing to kneeling",
      summary: "The body changed from upright standing into knee-supported floor work.",
    };
  }

  if (fromBand === "seated" && toBand === "kneeling") {
    return {
      key: "seated-to-kneeling",
      label: "Seated to kneeling",
      summary: "The body changed from seated support into a knee-supported floor setup.",
    };
  }

  if (fromBand === "kneeling" && toBand === "seated") {
    return {
      key: "kneeling-to-seated",
      label: "Kneeling to seated",
      summary: "The body changed from knee-supported floor work into seated support.",
    };
  }

  if (fromBand === "floor" && toBand === "quadruped") {
    return {
      key: "floor-to-quadruped",
      label: "Floor to all-fours",
      summary: "The body changed from low floor support into an all-fours support pattern.",
    };
  }

  if (fromBand === "quadruped" && toBand === "floor") {
    return {
      key: "quadruped-to-floor",
      label: "All-fours to floor",
      summary: "The body changed from an all-fours support pattern into lower floor support.",
    };
  }

  if (fromBand === "kneeling" && (toBand === "floor" || toBand === "quadruped")) {
    return {
      key: "kneeling-to-floor",
      label: "Kneeling to floor",
      summary: "The body changed from kneeling into a lower floor-supported pose.",
    };
  }

  if ((fromBand === "floor" || fromBand === "quadruped") && toBand === "kneeling") {
    return {
      key: "floor-to-kneeling",
      label: "Floor to kneeling",
      summary: "The body changed from floor support back toward kneeling.",
    };
  }

  if (fromBand === "floor" && toBand === "floor") {
    return {
      key: "floor-roll",
      label: "Floor roll",
      summary: "The body changed between floor-supported sides or facing directions.",
    };
  }

  return {
    key: "unknown-transition",
    label: "Unknown transition",
    summary: "This posture change is not classified as a supported transition yet.",
  };
}

export function resolveMovementExerciseTransition({
  currentPose,
  previousPose,
}: {
  currentPose: MovementExercisePoseDecision;
  previousPose?: MovementExercisePoseDecision | null;
}): MovementExerciseTransitionDecision {
  const toBand = postureBandForPose(currentPose.poseKey);
  const fromBand = previousPose ? postureBandForPose(previousPose.poseKey) : null;
  const transition = previousPose
    ? transitionForBands({
        fromBand: fromBand ?? "unknown",
        fromPoseKey: previousPose.poseKey,
        toBand,
        toPoseKey: currentPose.poseKey,
      })
    : stableTransitionForBand(toBand);

  return {
    confidence: previousPose
      ? Math.min(previousPose.confidence, currentPose.confidence)
      : currentPose.confidence,
    fromBand,
    fromPoseKey: previousPose?.poseKey ?? null,
    isTransition: transition.key.startsWith("stable-") ? false : transition.key !== "unknown-transition",
    key: transition.key,
    label: transition.label,
    summary: transition.summary,
    toBand,
    toPoseKey: currentPose.poseKey,
  };
}
