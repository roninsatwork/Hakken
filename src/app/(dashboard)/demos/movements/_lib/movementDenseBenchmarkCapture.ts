export const MOVEMENT_DENSE_BENCHMARK_CAPTURE_COUNTDOWN_MS = 5_000;
export const MOVEMENT_DENSE_BENCHMARK_CAPTURE_DURATION_MS = 10_000;

export const MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS = [
  {
    id: "near-camera",
    instruction: "Keep your upper body, face, hands, fingers and wrists close enough to remain detailed. Turn both palms towards and away from the camera.",
    label: "Near camera detail",
  },
  {
    id: "far-camera",
    instruction: "Show your complete body from head to feet and move your arms, hands, knees and feet through the frame.",
    label: "Far camera full body",
  },
  {
    id: "front-back-turn",
    instruction: "Start facing the camera, rotate through both side views, show your back, and return to the front.",
    label: "Front and back turn",
  },
  {
    id: "floor-work",
    instruction: "Move safely from standing towards the floor and demonstrate a supported floor or hands-and-knees movement.",
    label: "Floor work",
  },
  {
    id: "body-occlusion",
    instruction: "Cross your arms and hands in front of your torso, briefly hide one limb, then separate and reacquire it.",
    label: "Body occlusion",
  },
  {
    id: "loose-clothing",
    instruction: "Wear or hold a loose outer layer while turning so silhouette and surface correspondence can be assessed honestly.",
    label: "Loose clothing",
  },
] as const;

export type MovementDenseBenchmarkCaptureScenarioId =
  typeof MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS[number]["id"];

const MEDIA_RECORDER_FORMATS = [
  { extension: "webm", mimeType: "video/webm;codecs=vp9" },
  { extension: "webm", mimeType: "video/webm;codecs=vp8" },
  { extension: "webm", mimeType: "video/webm" },
  { extension: "mp4", mimeType: "video/mp4" },
] as const;

export function resolveMovementDenseBenchmarkCaptureFormat(
  isTypeSupported: (mimeType: string) => boolean,
) {
  return MEDIA_RECORDER_FORMATS.find(({ mimeType }) => isTypeSupported(mimeType)) ?? null;
}

export function buildMovementDenseBenchmarkCaptureFilename({
  capturedAt,
  extension,
  scenario,
}: {
  capturedAt: Date;
  extension: string;
  scenario: MovementDenseBenchmarkCaptureScenarioId;
}) {
  const timestamp = capturedAt.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return `${scenario}-${timestamp}.${extension}`;
}
