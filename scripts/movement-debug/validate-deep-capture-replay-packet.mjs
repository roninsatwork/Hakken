export const DEEP_CAPTURE_PROFILE_ID = "movement-deep-capture-v1";
export const DENSE_CAPTURE_ADAPTER_PROFILE_ID = "movement-dense-capture-adapter-v1";
export const DEEP_CAPTURE_REFINEMENT_PROFILE_ID = "movement-deep-capture-refinement-v1";
export const DENSE_CAPTURE_BROWSER_QUALITY_PROFILES = {
  high: { inputHeight: 540, inputWidth: 960, targetIntervalMs: 100 },
  medium: { inputHeight: 360, inputWidth: 640, targetIntervalMs: 180 },
  low: { inputHeight: 216, inputWidth: 384, targetIntervalMs: 300 },
};
export const DEEP_CAPTURE_REQUIRED_CHANNELS = [
  "leftHand",
  "rightHand",
  "palmWrist",
  "face",
  "eyesGaze",
  "segmentation",
  "denseBody",
];
export const DEEP_CAPTURE_REQUIRED_BODY_REGIONS = [
  "head",
  "chest",
  "back",
  "abdomen",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "pelvis",
  "leftThigh",
  "rightThigh",
  "leftCalf",
  "rightCalf",
  "leftShin",
  "rightShin",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
];
const DEEP_CAPTURE_CHANNEL_COVERAGE = {
  denseBody: { minimumFrames: 30, minimumRatio: 0.8 },
  eyesGaze: { minimumFrames: 30, minimumRatio: 0.5 },
  face: { minimumFrames: 30, minimumRatio: 0.5 },
  leftHand: { minimumFrames: 15, minimumRatio: 0.1 },
  palmWrist: { minimumFrames: 15, minimumRatio: 0.1 },
  rightHand: { minimumFrames: 15, minimumRatio: 0.1 },
  segmentation: { minimumFrames: 30, minimumRatio: 0.8 },
};

function requiredChannelFrameCount(channel, totalFrames) {
  const policy = DEEP_CAPTURE_CHANNEL_COVERAGE[channel];
  return Math.min(
    totalFrames,
    Math.max(policy.minimumFrames, Math.ceil(totalFrames * policy.minimumRatio)),
  );
}

function sampleHasDeepCaptureChannel(sample, channel) {
  const tracking = sample?.tracking;
  const deepCapture = tracking?.deepCapture;
  if (channel === "leftHand" || channel === "rightHand") {
    const side = channel === "leftHand" ? "left" : "right";
    return (tracking?.hands?.[side]?.landmarks?.length ?? 0) >= 21 &&
      Boolean(deepCapture?.hands?.[side]);
  }
  if (channel === "palmWrist") {
    return [deepCapture?.hands?.left, deepCapture?.hands?.right].every((hand) => (
      Boolean(hand?.orientation?.palmNormal) &&
      Boolean(hand?.orientation?.wristRotation) &&
      hand?.orientation?.facing !== "unknown"
    ));
  }
  if (channel === "face") {
    return (deepCapture?.face?.facialTransformationMatrix?.length ?? 0) === 16;
  }
  if (channel === "eyesGaze") {
    const gaze = deepCapture?.face?.gaze;
    return Boolean(gaze?.left || gaze?.right || gaze?.fused);
  }
  if (channel === "segmentation") return Boolean(deepCapture?.denseBody?.segmentation);
  return (deepCapture?.denseBody?.anchors?.length ?? 0) >= 200;
}

function isFiniteUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateAnchor(anchor, index, frameIndex, failures) {
  if (!anchor || typeof anchor.id !== "string" || !anchor.id.trim()) {
    failures.push(`Frame ${frameIndex} anchor ${index} has no persistent id.`);
    return;
  }
  if (!isFiniteUnit(anchor.image?.x) || !isFiniteUnit(anchor.image?.y)) {
    failures.push(`Frame ${frameIndex} anchor ${anchor.id} has invalid image coordinates.`);
  }
  if (
    !isFiniteUnit(anchor.provenance?.confidence) ||
    !Number.isFinite(anchor.provenance?.sourceTimestampMs) ||
    !Number.isFinite(anchor.provenance?.inferenceTimestampMs) ||
    !Number.isFinite(anchor.provenance?.ageMs) ||
    anchor.provenance.ageMs < 0
  ) {
    failures.push(`Frame ${frameIndex} anchor ${anchor.id} has invalid provenance.`);
  }
}

function validateDenseBody(denseBody, frameIndex, expectedModel, failures) {
  if (denseBody?.adapter?.profileId !== DENSE_CAPTURE_ADAPTER_PROFILE_ID) {
    failures.push(`Frame ${frameIndex} has no versioned dense-body adapter evidence.`);
  }
  const qualityProfile = DENSE_CAPTURE_BROWSER_QUALITY_PROFILES[denseBody?.adapter?.qualityTier];
  if (
    !["webgl", "webgpu", "wasm"].includes(denseBody?.adapter?.runtime) ||
    !Number.isFinite(denseBody?.adapter?.inferenceDurationMs) ||
    denseBody.adapter.inferenceDurationMs < 0 ||
    !Number.isFinite(denseBody?.adapter?.inputWidth) ||
    denseBody.adapter.inputWidth <= 0 ||
    !Number.isFinite(denseBody?.adapter?.inputHeight) ||
    denseBody.adapter.inputHeight <= 0 ||
    !qualityProfile ||
    denseBody.adapter.inputWidth !== qualityProfile?.inputWidth ||
    denseBody.adapter.inputHeight !== qualityProfile?.inputHeight ||
    denseBody.adapter.targetIntervalMs !== qualityProfile?.targetIntervalMs
  ) {
    failures.push(`Frame ${frameIndex} has invalid browser runtime, quality tier, input, or timing evidence.`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(denseBody?.modelHash ?? "")) {
    failures.push(`Frame ${frameIndex} is missing an immutable dense-model SHA-256 identity.`);
  }
  if (typeof denseBody?.modelId !== "string" || !denseBody.modelId.trim()) {
    failures.push(`Frame ${frameIndex} is missing a dense-model id.`);
  }
  if (
    expectedModel &&
    (denseBody?.modelHash !== expectedModel.modelHash || denseBody?.modelId !== expectedModel.modelId)
  ) {
    failures.push(`Frame ${frameIndex} changes dense-model identity within the packet.`);
  }

  const anchors = Array.isArray(denseBody?.anchors) ? denseBody.anchors : [];
  if (anchors.length < 200 || anchors.length > 500) {
    failures.push(`Frame ${frameIndex} must contain 200-500 dense-body anchors.`);
  }
  const anchorIds = anchors.map((anchor) => anchor?.id).filter((id) => typeof id === "string").sort();
  if (new Set(anchorIds).size !== anchors.length) {
    failures.push(`Frame ${frameIndex} contains missing or duplicate dense-body anchor ids.`);
  }
  anchors.forEach((anchor, index) => validateAnchor(anchor, index, frameIndex, failures));

  const fusion = denseBody?.fusion;
  const invalidFusionRegions = DEEP_CAPTURE_REQUIRED_BODY_REGIONS.filter((region) => {
    const coverage = fusion?.regionCoverage?.[region];
    if (!coverage || !["current", "tracked", "occluded", "missing"].includes(coverage.state)) {
      return true;
    }
    if (!Number.isFinite(coverage.anchorCount) || coverage.anchorCount < 0) return true;
    return coverage.anchorCount === 0
      ? coverage.state !== "missing"
      : coverage.state === "missing";
  });
  if (
    fusion?.profileId !== "movement-dense-capture-fusion-v1" ||
    fusion?.skeleton?.poseLandmarkCount !== 33 ||
    fusion?.skeleton?.worldPoseLandmarkCount !== 33 ||
    invalidFusionRegions.length > 0
  ) {
    failures.push(`Frame ${frameIndex} has invalid dense-body skeleton-fusion evidence.`);
  }

  const segmentation = denseBody?.segmentation;
  if (
    !segmentation ||
    !Number.isFinite(segmentation.frameWidth) || segmentation.frameWidth <= 0 ||
    !Number.isFinite(segmentation.frameHeight) || segmentation.frameHeight <= 0 ||
    !Number.isFinite(segmentation.maskWidth) || segmentation.maskWidth <= 0 ||
    !Number.isFinite(segmentation.maskHeight) || segmentation.maskHeight <= 0 ||
    !(Array.isArray(segmentation.payload) || (
      typeof segmentation.payload === "string" && segmentation.payload.length > 0
    ))
  ) {
    failures.push(`Frame ${frameIndex} has invalid segmentation evidence.`);
  }

  return {
    modelHash: denseBody?.modelHash,
    modelId: denseBody?.modelId,
  };
}

function validateHands(sample, frameIndex, failures) {
  for (const side of ["left", "right"]) {
    const hand = sample?.tracking?.hands?.[side];
    const evidence = sample?.tracking?.deepCapture?.hands?.[side];
    if (!hand && !evidence) continue;
    if (!Array.isArray(hand?.landmarks) || hand.landmarks.length < 21 ||
        !Array.isArray(hand?.worldLandmarks) || hand.worldLandmarks.length < 21) {
      failures.push(`Frame ${frameIndex} ${side} hand requires 21 image and world landmarks.`);
    }
    if (
      !evidence ||
      evidence.detectorHandedness?.label === "Unknown" ||
      !Number.isFinite(evidence.detectorHandedness?.score) ||
      evidence.detectorHandedness.score <= 0 ||
      evidence.refinement?.profileId !== DEEP_CAPTURE_REFINEMENT_PROFILE_ID ||
      Object.keys(evidence.fingerJointAngles ?? {}).length < 15 ||
      evidence.orientation?.provenance?.origin !== "derived" ||
      !["observed", "temporally-carried", "reacquired"].includes(evidence.tracking?.state) ||
      (evidence.tracking?.state === "observed" && evidence.tracking?.occluded)
    ) {
      failures.push(`Frame ${frameIndex} ${side} hand evidence is incomplete or ambiguous.`);
    }
  }
}

function validateFace(sample, frameIndex, failures) {
  const face = sample?.tracking?.deepCapture?.face;
  if (!face && !sample?.tracking?.face) return;
  if (
    !Array.isArray(sample?.tracking?.face) || sample.tracking.face.length < 478 ||
    face?.refinement?.profileId !== DEEP_CAPTURE_REFINEMENT_PROFILE_ID ||
    !Array.isArray(face?.facialTransformationMatrix) || face.facialTransformationMatrix.length !== 16 ||
    !Number.isFinite(face?.irisLandmarkCount) || face.irisLandmarkCount < 10 ||
    !face?.gaze?.left || !face.gaze.right || !face.gaze.fused ||
    face.gaze.provenance?.origin !== "derived" ||
    face.eyeVisibility?.left !== "visible" ||
    face.eyeVisibility?.right !== "visible" ||
    face.eyeVisibility?.eyewear !== "unknown" ||
    !["observed", "temporally-carried", "reacquired"].includes(face.tracking?.state) ||
    (face.tracking?.state === "observed" && face.tracking?.occluded)
  ) {
    failures.push(`Frame ${frameIndex} face, iris, transform, or gaze evidence is incomplete.`);
  }
}

export function validateDeepCaptureReplayPacket(packet) {
  const failures = [];
  const samples = Array.isArray(packet?.samples) ? packet.samples : [];
  if (packet?.schemaVersion !== 3) failures.push("recording schemaVersion must be 3 for Deep Capture");
  if (packet?.deepCaptureProfile?.id !== DEEP_CAPTURE_PROFILE_ID) {
    failures.push(`Deep Capture profile must be ${DEEP_CAPTURE_PROFILE_ID}`);
  }
  if (packet?.deepCaptureProfile?.schemaVersion !== 3) {
    failures.push("Deep Capture profile schemaVersion must be 3");
  }
  if (packet?.deepCaptureProfile?.privacy?.persistRawRgbByDefault !== false) {
    failures.push("Deep Capture must not persist raw RGB by default");
  }
  if (packet?.deepCaptureProfile?.privacy?.persistRawVideoByDefault !== false) {
    failures.push("Deep Capture must not persist raw video by default");
  }
  if (
    packet?.deepCaptureProfile?.refinement?.id !== DEEP_CAPTURE_REFINEMENT_PROFILE_ID ||
    packet?.deepCaptureProfile?.denseAdapter?.id !== DENSE_CAPTURE_ADAPTER_PROFILE_ID
  ) {
    failures.push("Deep Capture refinement or dense-adapter profile is missing");
  }
  const packetQualityProfiles = packet?.deepCaptureProfile?.denseAdapter?.qualityProfiles;
  if (Object.entries(DENSE_CAPTURE_BROWSER_QUALITY_PROFILES).some(([tier, expected]) => {
    const actual = packetQualityProfiles?.[tier];
    return !actual ||
      actual.inputWidth !== expected.inputWidth ||
      actual.inputHeight !== expected.inputHeight ||
      actual.targetIntervalMs !== expected.targetIntervalMs;
  })) {
    failures.push("Deep Capture browser quality profiles are missing or changed");
  }
  for (const channel of DEEP_CAPTURE_REQUIRED_CHANNELS) {
    const summary = packet?.deepCaptureChannelSummary?.[channel];
    const measuredFrames = samples.filter((sample) => (
      sampleHasDeepCaptureChannel(sample, channel)
    )).length;
    const requiredFrames = requiredChannelFrameCount(channel, samples.length);
    if (
      !summary ||
      summary.complete !== true ||
      measuredFrames < requiredFrames
    ) {
      failures.push(`${channel} Deep Capture evidence is incomplete`);
      continue;
    }
    if (
      summary.presentFrames !== measuredFrames ||
      summary.totalFrames !== samples.length
    ) {
      failures.push(`${channel} Deep Capture frame accounting does not match sampleCount`);
    }
  }

  let expectedModel = null;
  let cameraDeviceFingerprint = null;
  samples.forEach((sample, frameIndex) => {
    if (sample?.acquisitionProfileId !== DEEP_CAPTURE_PROFILE_ID) {
      failures.push(`Frame ${frameIndex} has the wrong Deep Capture acquisition profile.`);
    }
    if (sample?.tracking?.deepCapture?.profileId !== DEEP_CAPTURE_PROFILE_ID) {
      failures.push(`Frame ${frameIndex} is missing Deep Capture profile evidence.`);
    }
    const frameCameraFingerprint = sample?.camera?.deviceFingerprint;
    if (!/^fnv1a32:[a-f0-9]{8}$/.test(frameCameraFingerprint ?? "")) {
      failures.push(`Frame ${frameIndex} is missing an opaque physical-camera fingerprint.`);
    } else if (cameraDeviceFingerprint === null) {
      cameraDeviceFingerprint = frameCameraFingerprint;
    } else if (frameCameraFingerprint !== cameraDeviceFingerprint) {
      failures.push(`Frame ${frameIndex} changes physical-camera identity within the packet.`);
    }
    const denseBody = sample?.tracking?.deepCapture?.denseBody;
    if (denseBody) {
      const identity = validateDenseBody(denseBody, frameIndex, expectedModel, failures);
      expectedModel ??= { modelHash: identity.modelHash, modelId: identity.modelId };
    }
    validateHands(sample, frameIndex, failures);
    validateFace(sample, frameIndex, failures);
  });

  return Array.from(new Set(failures));
}
