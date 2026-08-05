export type ScoreLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type ScoreBlendshape = {
  categoryName: string;
  score: number;
};

export type ScoreHandCapture = {
  landmarks?: ScoreLandmark[];
  worldLandmarks?: ScoreLandmark[] | null;
};

export type ScoreHandsPayload = Partial<Record<"left" | "right", ScoreHandCapture | null>>;

type TrackedAngle = {
  name: string;
  p: [number, number, number];
  i: [number, number, number];
};

const ANGLES_TO_TRACK: TrackedAngle[] = [
  { name: "L_Elbow", p: [12, 14, 16], i: [11, 13, 15] },
  { name: "R_Elbow", p: [11, 13, 15], i: [12, 14, 16] },
  { name: "L_Shoulder_Elev", p: [24, 12, 14], i: [23, 11, 13] },
  { name: "R_Shoulder_Elev", p: [23, 11, 13], i: [24, 12, 14] },
  { name: "L_Shoulder_Abd", p: [11, 12, 14], i: [12, 11, 13] },
  { name: "R_Shoulder_Abd", p: [12, 11, 13], i: [11, 12, 14] },
  { name: "L_Knee", p: [24, 26, 28], i: [23, 25, 27] },
  { name: "R_Knee", p: [23, 25, 27], i: [24, 26, 28] },
  { name: "L_Hip_Elev", p: [12, 24, 26], i: [11, 23, 25] },
  { name: "R_Hip_Elev", p: [11, 23, 25], i: [12, 24, 26] },
  { name: "L_Hip_Abd", p: [23, 24, 26], i: [24, 23, 25] },
  { name: "R_Hip_Abd", p: [24, 23, 25], i: [23, 24, 26] },
];

const MOTION_TRACKING_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;

function getAxis(value: number | undefined) {
  return value ?? 0;
}

export function calculateAngle(a?: ScoreLandmark, b?: ScoreLandmark, c?: ScoreLandmark) {
  if (!a || !b || !c || (a.visibility ?? 0) < 0.2 || (b.visibility ?? 0) < 0.2 || (c.visibility ?? 0) < 0.2) {
    return null;
  }

  const ba = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: getAxis(a.z) - getAxis(b.z),
  };
  const bc = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: getAxis(c.z) - getAxis(b.z),
  };
  const baLength = Math.hypot(ba.x, ba.y, ba.z);
  const bcLength = Math.hypot(bc.x, bc.y, bc.z);

  if (baLength <= 0.0001 || bcLength <= 0.0001) return null;

  const dot = (ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / (baLength * bcLength);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
}

export function calculateHandAperture(handLandmarks?: ScoreLandmark[] | null) {
  if (!handLandmarks || handLandmarks.length < 21) return null;

  const wrist = handLandmarks[0];
  const tips = [handLandmarks[8], handLandmarks[12], handLandmarks[16], handLandmarks[20]];
  const totalDistance = tips.reduce((sum, tip) => {
    return sum + Math.hypot(tip.x - wrist.x, tip.y - wrist.y, getAxis(tip.z) - getAxis(wrist.z));
  }, 0);

  return totalDistance / tips.length;
}

export function isZenExpressionActive(blendshapes?: ScoreBlendshape[]) {
  if (!blendshapes) return false;

  const smileLeft = blendshapes.find((shape) => shape.categoryName === "mouthSmileLeft")?.score ?? 0;
  const smileRight = blendshapes.find((shape) => shape.categoryName === "mouthSmileRight")?.score ?? 0;

  return (smileLeft + smileRight) / 2 > 0.4;
}

export function calculateMovementSync(args: {
  playerLandmarks: ScoreLandmark[];
  instructorLandmarks: ScoreLandmark[];
  playerHands?: ScoreHandsPayload;
  instructorHands?: ScoreHandsPayload;
  playerBlendshapes?: ScoreBlendshape[];
}) {
  let totalDiff = 0;
  let validAngles = 0;

  ANGLES_TO_TRACK.forEach((angle) => {
    const playerAngle = calculateAngle(
      args.playerLandmarks[angle.p[0]],
      args.playerLandmarks[angle.p[1]],
      args.playerLandmarks[angle.p[2]]
    );
    const instructorAngle = calculateAngle(
      args.instructorLandmarks[angle.i[0]],
      args.instructorLandmarks[angle.i[1]],
      args.instructorLandmarks[angle.i[2]]
    );

    if (playerAngle !== null && instructorAngle !== null) {
      totalDiff += Math.abs(playerAngle - instructorAngle);
      validAngles += 1;
    }
  });

  let sync = 0;
  if (validAngles > 0) {
    const avgDiff = totalDiff / validAngles;
    sync = avgDiff <= 15 ? 100 : Math.max(0, 100 * (1 - ((avgDiff - 15) / 30)));
  }

  const playerLeftHand = args.playerHands?.left?.worldLandmarks || args.playerHands?.left?.landmarks;
  const instructorRightHand = args.instructorHands?.right?.worldLandmarks || args.instructorHands?.right?.landmarks;
  const playerRightHand = args.playerHands?.right?.worldLandmarks || args.playerHands?.right?.landmarks;
  const instructorLeftHand = args.instructorHands?.left?.worldLandmarks || args.instructorHands?.left?.landmarks;

  const playerLeftAperture = calculateHandAperture(playerLeftHand);
  const instructorRightAperture = calculateHandAperture(instructorRightHand);
  const playerRightAperture = calculateHandAperture(playerRightHand);
  const instructorLeftAperture = calculateHandAperture(instructorLeftHand);

  let apertureBonus = 0;
  if (playerLeftAperture !== null && instructorRightAperture !== null && Math.abs(playerLeftAperture - instructorRightAperture) < 0.08) {
    apertureBonus += 2.5;
  }
  if (playerRightAperture !== null && instructorLeftAperture !== null && Math.abs(playerRightAperture - instructorLeftAperture) < 0.08) {
    apertureBonus += 2.5;
  }

  return {
    sync: Math.min(100, sync + apertureBonus),
    isZenActive: isZenExpressionActive(args.playerBlendshapes),
    validAngles,
  };
}

export function calculateLandmarkMotion(
  previousLandmarks: ScoreLandmark[] | null | undefined,
  currentLandmarks: ScoreLandmark[],
) {
  if (!previousLandmarks || previousLandmarks.length < 33 || currentLandmarks.length < 33) {
    return 0;
  }

  let totalMotion = 0;
  let validLandmarks = 0;

  MOTION_TRACKING_INDICES.forEach((index) => {
    const previous = previousLandmarks[index];
    const current = currentLandmarks[index];
    if (!previous || !current) return;
    if ((previous.visibility ?? 0.8) < 0.35 || (current.visibility ?? 0.8) < 0.35) return;

    totalMotion += Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      getAxis(current.z) - getAxis(previous.z),
    );
    validLandmarks += 1;
  });

  return validLandmarks > 0 ? totalMotion / validLandmarks : 0;
}
