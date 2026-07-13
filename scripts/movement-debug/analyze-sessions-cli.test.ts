import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRecordingExportPath } from "./analyze-sessions-cli";

const latestExportPointerPath = "tmp/movement-replay-lab/runs/latest-export-path.txt";
const touchedPaths = new Set<string>();

function argsForExport(createExport: boolean) {
  return {
    autoExport: true,
    createExport,
    exportPath: null,
    source: "recordings",
  } as Parameters<typeof resolveRecordingExportPath>[0];
}

function storageBackedRows() {
  return [
    {
      _id: "recording-1",
      poseData: "storage-id-1",
      poseDataFormat: "storage-json-v1",
    },
  ];
}

function withLatestExportPointer(exportPath: string, callback: () => void) {
  const pointerPath = resolve(latestExportPointerPath);
  const hadPointer = existsSync(pointerPath);
  const previousPointer = hadPointer ? readFileSync(pointerPath, "utf8") : null;
  mkdirSync(dirname(pointerPath), { recursive: true });
  writeFileSync(pointerPath, `${exportPath}\n`);

  try {
    callback();
  } finally {
    if (previousPointer !== null) {
      writeFileSync(pointerPath, previousPointer);
    } else if (existsSync(pointerPath)) {
      unlinkSync(pointerPath);
    }
  }
}

afterEach(() => {
  touchedPaths.forEach((filePath) => {
    if (existsSync(filePath)) unlinkSync(filePath);
  });
  touchedPaths.clear();
});

describe("resolveRecordingExportPath", () => {
  it("reuses the latest export pointer during normal auto-export reuse", () => {
    const existingExportPath = resolve(`tmp/movement-replay-lab/existing-export-${process.pid}.zip`);
    mkdirSync(dirname(existingExportPath), { recursive: true });
    writeFileSync(existingExportPath, "existing export");
    touchedPaths.add(existingExportPath);

    withLatestExportPointer(existingExportPath, () => {
      expect(resolveRecordingExportPath(argsForExport(false), storageBackedRows())).toBe(existingExportPath);
    });
  });

  it("creates a fresh timestamped export path when create-export is explicit", () => {
    const existingExportPath = resolve(`tmp/movement-replay-lab/existing-refresh-export-${process.pid}.zip`);
    mkdirSync(dirname(existingExportPath), { recursive: true });
    writeFileSync(existingExportPath, "existing export");
    touchedPaths.add(existingExportPath);

    withLatestExportPointer(existingExportPath, () => {
      const exportPath = resolveRecordingExportPath(argsForExport(true), storageBackedRows());

      expect(exportPath).not.toBe(existingExportPath);
      expect(exportPath).toContain(resolve("tmp/movement-replay-lab/runs"));
      expect(exportPath).toMatch(/-movement-recordings\.convex-export\.zip$/);
    });
  });
});
