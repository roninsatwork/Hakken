import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { RENDERED_FIDELITY_POLICY } from "@/src/lib/movements/renderedFidelityPolicy.mjs";
import type {
  MovementAvatarRetargetRestMap,
  MovementAvatarRigMeasurements,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame, MovementRetargetSourceModel } from "./movementRetargeting";
import type {
  MovementHeadAngles,
  MovementTrackingDebugState,
  TrackingLandmark,
} from "./movementTrackingCalibration";

const EPSILON = 0.000001;

function compactVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

function confidence(...landmarks: Array<TrackingLandmark | undefined>) {
  if (landmarks.some((landmark) => !landmark)) return 0;
  return landmarks.reduce((sum, landmark) => sum + (landmark?.visibility ?? 0.8), 0) / landmarks.length;
}

function evidenceConfidence(sourceQuality: number | undefined, ...landmarks: Array<TrackingLandmark | undefined>) {
  const landmarkConfidence = confidence(...landmarks);
  return Number(Math.min(sourceQuality ?? 1, landmarkConfidence).toFixed(4));
}

function midpoint(left: TrackingLandmark, right: TrackingLandmark) {
  return new THREE.Vector3(
    (left.x + right.x) / 2,
    -((left.y + right.y) / 2),
    -(((left.z ?? 0) + (right.z ?? 0)) / 2),
  );
}

function sourcePoint(landmark: TrackingLandmark) {
  return new THREE.Vector3(landmark.x, -landmark.y, -(landmark.z ?? 0));
}

function normalizedDirection(start: THREE.Vector3, end: THREE.Vector3) {
  const direction = end.clone().sub(start);
  return direction.lengthSq() > EPSILON ? direction.normalize() : null;
}

function worldPosition(vrm: VRM, boneName: Parameters<VRM["humanoid"]["getNormalizedBoneNode"]>[0]) {
  return vrm.humanoid.getNormalizedBoneNode(boneName)?.getWorldPosition(new THREE.Vector3()) ?? null;
}

function sourceSemanticDirection({
  end,
  neutralAvatar,
  neutralSource,
  renderedDirection,
  source,
  start,
}: {
  end: THREE.Vector3 | null;
  neutralAvatar?: THREE.Vector3;
  neutralSource?: { x: number; y: number; z: number };
  renderedDirection?: THREE.Vector3 | null;
  source: THREE.Vector3 | null;
  start: THREE.Vector3 | null;
}) {
  const rendered = renderedDirection ?? (start && end ? normalizedDirection(start, end) : null);
  const neutralSourceDirection = neutralSource
    ? new THREE.Vector3(neutralSource.x, neutralSource.y, neutralSource.z).normalize()
    : null;
  const expected = source && neutralSourceDirection && neutralAvatar
    ? neutralAvatar.clone().normalize().applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(neutralSourceDirection, source),
      ).normalize()
    : null;
  const sourceError = expected && rendered
    ? 1 - THREE.MathUtils.clamp(expected.dot(rendered), -1, 1)
    : undefined;
  return {
    renderedDirection: rendered ? compactVector(rendered) : undefined,
    sourceDirection: expected ? compactVector(expected) : undefined,
    sourceError: typeof sourceError === "number" ? Number(sourceError.toFixed(4)) : undefined,
  };
}

function directSemanticDirection(expected: THREE.Vector3 | null, rendered: THREE.Vector3 | null) {
  const sourceError = expected && rendered
    ? 1 - THREE.MathUtils.clamp(expected.dot(rendered), -1, 1)
    : undefined;
  return {
    renderedDirection: rendered ? compactVector(rendered) : undefined,
    sourceDirection: expected ? compactVector(expected) : undefined,
    sourceError: typeof sourceError === "number" ? Number(sourceError.toFixed(4)) : undefined,
  };
}

function buildFootContactTelemetry({
  floorY,
  foot,
  sourceFloorY,
  sourceContact,
  sourceQuality,
  sourceHeel,
  sourceToe,
  toe,
  torsoHeight,
  neutralFootDirection,
}: {
  floorY?: number;
  foot: THREE.Vector3 | null;
  sourceFloorY: number | null;
  sourceContact?: boolean;
  sourceQuality?: number;
  sourceHeel?: TrackingLandmark;
  sourceToe?: TrackingLandmark;
  toe: THREE.Vector3 | null;
  torsoHeight: number | null;
  neutralFootDirection?: THREE.Vector3;
}) {
  const sourceSoleY = sourceHeel && sourceToe ? Math.max(sourceHeel.y, sourceToe.y) : null;
  const sourceClearanceRatio = sourceFloorY !== null && sourceSoleY !== null && torsoHeight
    ? (sourceFloorY - sourceSoleY) / torsoHeight
    : null;
  const footAxis = foot && toe ? toe.clone().sub(foot) : null;
  const footClearance = typeof floorY === "number" && foot
    ? foot.y - floorY
    : null;
  const neutralAxis = footAxis && neutralFootDirection && neutralFootDirection.lengthSq() > EPSILON
    ? neutralFootDirection.clone().normalize().multiplyScalar(footAxis.length())
    : null;
  const contactClearance = (currentOffsetScale: number) => {
    if (footClearance === null || !footAxis || !neutralAxis) return undefined;
    return Number((footClearance + (
      footAxis.y * currentOffsetScale - neutralAxis.y * currentOffsetScale
    )).toFixed(4));
  };
  const heelClearance = contactClearance(-0.35);
  const toeBaseClearance = footClearance === null ? undefined : Number(footClearance.toFixed(4));
  const toeEndClearance = contactClearance(1);
  const soleValues = [heelClearance, toeBaseClearance, toeEndClearance]
    .filter((value): value is number => Number.isFinite(value));

  return {
    heelClearance,
    planeAngleRadians: footAxis && neutralAxis && footAxis.lengthSq() > EPSILON
      ? Number(footAxis.clone().normalize().angleTo(neutralAxis.clone().normalize()).toFixed(4))
      : undefined,
    soleClearance: soleValues.length ? Number(Math.min(...soleValues).toFixed(4)) : undefined,
    sourceClearanceRatio: sourceClearanceRatio === null
      ? undefined
      : Number(sourceClearanceRatio.toFixed(4)),
    sourceConfidence: evidenceConfidence(sourceQuality, sourceHeel, sourceToe),
    sourcePlanted: sourceClearanceRatio === null
      ? undefined
      : sourceContact !== false &&
        sourceClearanceRatio <= RENDERED_FIDELITY_POLICY.sourceContactMaxTorsoRatio,
    toeBaseClearance,
    toeEndClearance,
  };
}

export function buildMovementAvatarSemanticVisualTelemetry({
  avatarRestMap,
  floorY,
  retargetSourceModel,
  rigMeasurements,
  sourceImageLandmarks,
  sourceHeadAngles,
  sourceContacts,
  sourceQuality,
  sourceWorldLandmarks,
  vrm,
}: {
  avatarRestMap?: MovementAvatarRetargetRestMap | null;
  floorY?: number;
  retargetSourceModel?: MovementRetargetSourceModel | null;
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  sourceImageLandmarks?: TrackingLandmark[] | null;
  sourceHeadAngles?: MovementHeadAngles | null;
  sourceContacts?: MovementRetargetFrame["contacts"];
  sourceQuality?: number;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
  vrm: VRM;
}): NonNullable<MovementTrackingDebugState["avatarVisual"]>["semantic"] {
  vrm.scene.updateMatrixWorld(true);

  const leftShoulder = sourceWorldLandmarks?.[11];
  const rightShoulder = sourceWorldLandmarks?.[12];
  const leftHip = sourceWorldLandmarks?.[23];
  const rightHip = sourceWorldLandmarks?.[24];
  const imageNose = sourceImageLandmarks?.[0];
  const imageLeftEar = sourceImageLandmarks?.[7];
  const imageRightEar = sourceImageLandmarks?.[8];
  const hasTorso = Boolean(leftShoulder && rightShoulder && leftHip && rightHip);
  const shoulderCenter = hasTorso ? midpoint(leftShoulder!, rightShoulder!) : null;
  const hipCenter = hasTorso ? midpoint(leftHip!, rightHip!) : null;
  const sourceTorsoDirection = shoulderCenter && hipCenter
    ? normalizedDirection(hipCenter, shoulderCenter)
    : null;
  const sourceHeadForward = imageLeftEar && imageRightEar && imageNose
    ? normalizedDirection(midpoint(imageLeftEar, imageRightEar), sourcePoint(imageNose))
    : null;

  const hips = worldPosition(vrm, "hips");
  const chest = worldPosition(vrm, "chest") ?? worldPosition(vrm, "upperChest");
  const head = worldPosition(vrm, "head");
  const headBone = vrm.humanoid.getNormalizedBoneNode("head");
  const renderedHeadForward = headBone
    ? new THREE.Vector3(0, 0, 1).applyQuaternion(
        headBone.getWorldQuaternion(new THREE.Quaternion()),
      ).normalize()
    : null;
  const sourceHeadExpected = sourceHeadAngles && avatarRestMap?.semantic?.headForwardDirection
    ? avatarRestMap.semantic.headForwardDirection.clone().normalize().applyQuaternion(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(
          sourceHeadAngles.pitch,
          sourceHeadAngles.yaw,
          sourceHeadAngles.roll,
          "YXZ",
        )),
      ).normalize()
    : null;
  const leftFootPosition = worldPosition(vrm, "leftFoot");
  const rightFootPosition = worldPosition(vrm, "rightFoot");
  const sourceFeet = sourceWorldLandmarks
    ? [sourceWorldLandmarks[29], sourceWorldLandmarks[30], sourceWorldLandmarks[31], sourceWorldLandmarks[32]]
        .filter((landmark): landmark is TrackingLandmark => Boolean(landmark))
    : [];
  const sourceFloorY = sourceFeet.length ? Math.max(...sourceFeet.map((landmark) => landmark.y)) : null;
  const torsoHeight = shoulderCenter && hipCenter ? shoulderCenter.distanceTo(hipCenter) : null;
  const measuredAvatarScale = rigMeasurements?.legLength && rigMeasurements?.torsoLength
    ? rigMeasurements.legLength + rigMeasurements.torsoLength
    : null;
  const renderedAvatarScale = head
    ? Math.abs(head.y - Math.min(
        leftFootPosition?.y ?? head.y,
        rightFootPosition?.y ?? head.y,
      ))
    : null;
  const avatarScale = avatarRestMap?.semantic?.avatarScale && avatarRestMap.semantic.avatarScale > EPSILON
    ? avatarRestMap.semantic.avatarScale
    : measuredAvatarScale && measuredAvatarScale > EPSILON
    ? measuredAvatarScale
    : renderedAvatarScale && renderedAvatarScale > EPSILON
      ? renderedAvatarScale
      : null;

  return {
    avatarScale: avatarScale ? Number(avatarScale.toFixed(4)) : undefined,
    evidenceVersion: "2026-07-16.v3",
    feet: {
      left: buildFootContactTelemetry({
        floorY,
        foot: leftFootPosition,
        neutralFootDirection: avatarRestMap?.leftFoot?.worldDirection,
        sourceFloorY,
        sourceContact: sourceContacts?.leftFoot,
        sourceQuality,
        sourceHeel: sourceWorldLandmarks?.[29],
        sourceToe: sourceWorldLandmarks?.[31],
        toe: worldPosition(vrm, "leftToes"),
        torsoHeight,
      }),
      right: buildFootContactTelemetry({
        floorY,
        foot: rightFootPosition,
        neutralFootDirection: avatarRestMap?.rightFoot?.worldDirection,
        sourceFloorY,
        sourceContact: sourceContacts?.rightFoot,
        sourceQuality,
        sourceHeel: sourceWorldLandmarks?.[30],
        sourceToe: sourceWorldLandmarks?.[32],
        toe: worldPosition(vrm, "rightToes"),
        torsoHeight,
      }),
    },
    headChain: {
      confidence: sourceHeadAngles
        ? Number(Math.min(sourceQuality ?? 1, sourceHeadAngles.confidence).toFixed(4))
        : evidenceConfidence(sourceQuality, imageNose, imageLeftEar, imageRightEar),
      ...(sourceHeadExpected
        ? directSemanticDirection(sourceHeadExpected, renderedHeadForward)
        : sourceSemanticDirection({
            end: null,
            neutralAvatar: avatarRestMap?.semantic?.headForwardDirection,
            neutralSource: retargetSourceModel?.semanticNeutral?.headForwardImageDirection,
            renderedDirection: renderedHeadForward,
            source: sourceHeadForward,
            start: null,
          })),
    },
    torso: {
      confidence: evidenceConfidence(sourceQuality, leftShoulder, rightShoulder, leftHip, rightHip),
      sourceLeanRadians: sourceTorsoDirection
        ? Number(Math.acos(THREE.MathUtils.clamp(sourceTorsoDirection.y, -1, 1)).toFixed(4))
        : undefined,
      ...sourceSemanticDirection({
        end: chest,
        neutralAvatar: avatarRestMap?.semantic?.torsoDirection,
        neutralSource: retargetSourceModel?.semanticNeutral?.torsoDirection,
        source: sourceTorsoDirection,
        start: hips,
      }),
    },
  };
}
