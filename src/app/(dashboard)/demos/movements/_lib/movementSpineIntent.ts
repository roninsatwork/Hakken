import type { MovementBodyFocus, MovementSpineGoal } from "./movementTypes";

export const MOVEMENT_SPINE_GOAL_OPTIONS: Array<{
  value: MovementSpineGoal;
  label: string;
  description: string;
}> = [
  {
    value: "neutralStack",
    label: "Neutral stack",
    description: "Keep head, ribs, and pelvis organized.",
  },
  {
    value: "hipHinge",
    label: "Hip hinge",
    description: "Let the hips lead while the spine stays long.",
  },
  {
    value: "rollDown",
    label: "Roll down",
    description: "Move through the spine with control.",
  },
  {
    value: "thoracicRotation",
    label: "Thoracic rotation",
    description: "Rotate through the upper back while pelvis stays steady.",
  },
  {
    value: "sideBend",
    label: "Side bend",
    description: "Create a controlled side curve without collapsing.",
  },
  {
    value: "extension",
    label: "Extension",
    description: "Open the chest with a supported pelvis.",
  },
  {
    value: "squatWithStack",
    label: "Squat with stack",
    description: "Bend hips and knees while keeping tall posture.",
  },
];

export const MOVEMENT_BODY_FOCUS_OPTIONS: Array<{
  value: MovementBodyFocus;
  label: string;
}> = [
  { value: "neck", label: "Neck" },
  { value: "shoulders", label: "Shoulders" },
  { value: "ribcage", label: "Ribcage" },
  { value: "pelvis", label: "Pelvis" },
  { value: "hips", label: "Hips" },
  { value: "feet", label: "Feet" },
];

export function getMovementSpineGoalLabel(goal?: string | null) {
  return MOVEMENT_SPINE_GOAL_OPTIONS.find((option) => option.value === goal)?.label ?? "Spine awareness";
}

export function getMovementSpineGoalDescription(goal?: string | null) {
  return MOVEMENT_SPINE_GOAL_OPTIONS.find((option) => option.value === goal)?.description ?? "General posture quality and spinal organization.";
}

export function getMovementBodyFocusLabel(focus: string) {
  return MOVEMENT_BODY_FOCUS_OPTIONS.find((option) => option.value === focus)?.label ?? focus;
}
