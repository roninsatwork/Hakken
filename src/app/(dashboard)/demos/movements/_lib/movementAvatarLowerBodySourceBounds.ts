export type MovementAvatarLowerBodySourceBounds = {
  lowerOutOfFrameCount: number;
  maxY: number;
  reliable: boolean;
};

const LOWER_BODY_SOURCE_LANDMARKS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const LOWER_BODY_CORE_SOURCE_LANDMARKS = [23, 24, 25, 26];

export function getMovementAvatarLowerBodySourceBounds(
  landmarks: Array<{ x: number; y: number } | undefined>,
): MovementAvatarLowerBodySourceBounds {
  let lowerOutOfFrameCount = 0;
  let coreOutOfFrameCount = 0;
  let maxY = 0;

  LOWER_BODY_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    maxY = Math.max(maxY, landmark.y);
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      lowerOutOfFrameCount += 1;
    }
  });
  LOWER_BODY_CORE_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      coreOutOfFrameCount += 1;
    }
  });

  return {
    lowerOutOfFrameCount,
    maxY,
    reliable: coreOutOfFrameCount === 0,
  };
}
