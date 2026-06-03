import type { MovementHandSide } from "./movementTypes";

type Point2D = {
  x: number;
  y: number;
};

type ResolveHandSideInput = {
  handWrist?: Point2D | null;
  leftWrist?: Point2D | null;
  rightWrist?: Point2D | null;
  fallback?: MovementHandSide;
};

function distanceBetween(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function resolveHandSideByWrist({
  handWrist,
  leftWrist,
  rightWrist,
  fallback = "right",
}: ResolveHandSideInput): MovementHandSide {
  if (!handWrist) return fallback;

  if (leftWrist && rightWrist) {
    return distanceBetween(handWrist, leftWrist) < distanceBetween(handWrist, rightWrist)
      ? "left"
      : "right";
  }

  if (leftWrist) return "left";
  if (rightWrist) return "right";

  return fallback;
}
