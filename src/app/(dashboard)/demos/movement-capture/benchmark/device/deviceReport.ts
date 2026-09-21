import type {
  summarizeMovementDenseCaptureDeviceBenchmark,
  MovementDenseCaptureDeviceBenchmarkSample,
} from "../../../movements/_lib/movementDenseCaptureDeviceBenchmark";

export type DeviceBenchmarkReport = ReturnType<typeof summarizeMovementDenseCaptureDeviceBenchmark> & {
  device: {
    deviceMemoryGb: number | null;
    hardwareConcurrency: number | null;
    isIpad: boolean;
    userAgent: string;
  };
  generatedAt: string;
  memory: {
    endBytes: number | null;
    endTensorCount: number | null;
    growthBytes: number | null;
    peakBytes: number | null;
    startBytes: number | null;
    startTensorCount: number | null;
  };
  model: {
    loadMs: number;
    modelHash: string;
    modelId: string;
  };
  samples: MovementDenseCaptureDeviceBenchmarkSample[];
  schemaVersion: 1;
  source: {
    byteLength: number;
    mimeType: string;
  };
};

export type PhysicalDeviceObservation = {
  note: string;
  observedAt: string;
  outcome: "cool" | "warm-stable" | "hot-or-unstable";
};

export type DownloadedDeviceBenchmarkReport = DeviceBenchmarkReport & {
  physicalObservation: PhysicalDeviceObservation;
};

export function deviceReportFilename(report: DownloadedDeviceBenchmarkReport) {
  return `hakken-dense-device-${report.deviceClass}-${Date.parse(report.physicalObservation.observedAt)}.json`;
}

function deviceReportFile(report: DownloadedDeviceBenchmarkReport) {
  return new File(
    [JSON.stringify(report, null, 2)],
    deviceReportFilename(report),
    { type: "application/json" },
  );
}

export async function shareDeviceBenchmarkReport(
  report: DownloadedDeviceBenchmarkReport,
  navigatorApi: Pick<Navigator, "canShare" | "share"> = navigator,
) {
  const file = deviceReportFile(report);
  if (!navigatorApi.canShare({ files: [file] })) {
    throw new Error("This browser cannot share JSON report files. Use Download JSON report instead.");
  }
  await navigatorApi.share({
    files: [file],
    text: "Hakken browser Deep Capture device measurements. No video is included.",
    title: `Hakken ${report.deviceClass} Deep Capture report`,
  });
}
