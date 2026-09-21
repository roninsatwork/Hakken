import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES,
  auditDenseCaptureDeviceReport,
} from "./review-dense-capture-device-reports.mjs";

const REPORT_NAME = /^hakken-dense-device-(ipad|older-laptop)-[0-9]+\.json$/;

export function planDenseCaptureDeviceReportIngest({ entries }) {
  const failures = [];
  const selected = [];
  for (const deviceClass of DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES) {
    const matches = entries
      .filter((entry) => entry.isFile && entry.size > 0)
      .filter((entry) => REPORT_NAME.exec(entry.name)?.[1] === deviceClass)
      .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || left.name.localeCompare(right.name));
    if (matches.length === 0) {
      failures.push(`No downloaded ${deviceClass} device report was found.`);
      continue;
    }
    selected.push({ ...matches[0], deviceClass });
  }
  return { failures, passed: failures.length === 0, selected };
}

function sha256(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

export function ingestDenseCaptureDeviceReports({
  confirmLocalDeviceReportCopy,
  destinationDir,
  sourceDir,
}) {
  if (!confirmLocalDeviceReportCopy) {
    return {
      copied: [],
      failures: ["Explicit --confirm-local-device-report-copy is required before copying device reports into the private workspace."],
      passed: false,
    };
  }
  if (!fs.existsSync(sourceDir)) {
    return {
      copied: [],
      failures: [`Device report download source does not exist: ${sourceDir}.`],
      passed: false,
    };
  }
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).map((entry) => {
    const filePath = path.join(sourceDir, entry.name);
    const stats = entry.isFile() ? fs.statSync(filePath) : null;
    return {
      isFile: entry.isFile(),
      modifiedAtMs: stats?.mtimeMs ?? 0,
      name: entry.name,
      size: stats?.size ?? 0,
    };
  });
  const plan = planDenseCaptureDeviceReportIngest({ entries });
  if (!plan.passed) return { copied: [], failures: plan.failures, passed: false };

  const prepared = plan.selected.map((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    let report;
    try {
      report = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    } catch {
      return { entry, failures: [`${entry.name} is not valid JSON.`], report: null, sourcePath };
    }
    const audit = auditDenseCaptureDeviceReport(report, { expectedDeviceClass: entry.deviceClass });
    return {
      entry,
      failures: audit.failures.map((failure) => `${entry.name}: ${failure}`),
      report,
      sourcePath,
    };
  });
  const failures = prepared.flatMap((item) => item.failures);
  const modelIds = new Set(prepared.map((item) => item.report?.model?.modelId).filter(Boolean));
  const modelHashes = new Set(prepared.map((item) => item.report?.model?.modelHash).filter(Boolean));
  if (modelIds.size > 1 || modelHashes.size > 1) {
    failures.push("iPad and older-laptop reports use different dense-model identities.");
  }
  const destinations = prepared.map((item) => path.join(destinationDir, `${item.entry.deviceClass}-report.json`));
  const manifestPath = path.join(destinationDir, "device-report-ingest.json");
  [...destinations, manifestPath].forEach((destinationPath) => {
    if (fs.existsSync(destinationPath)) failures.push(`Destination already exists and will not be overwritten: ${destinationPath}.`);
  });
  if (failures.length > 0) return { copied: [], failures: Array.from(new Set(failures)), passed: false };

  fs.mkdirSync(destinationDir, { recursive: true });
  const copied = prepared.map((item, index) => {
    const destinationPath = destinations[index];
    fs.copyFileSync(item.sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    return {
      bytes: item.entry.size,
      destinationPath,
      deviceClass: item.entry.deviceClass,
      hash: sha256(destinationPath),
      preservedSourceName: item.entry.name,
    };
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ copied, schemaVersion: 1 }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { copied, failures: [], manifestPath, passed: true };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const report = ingestDenseCaptureDeviceReports({
    confirmLocalDeviceReportCopy: process.argv.includes("--confirm-local-device-report-copy"),
    destinationDir: path.resolve(
      rootDir,
      argValue("--destination-dir") ?? "tmp/movement-replay-lab/dense-capture/device-reports",
    ),
    sourceDir: path.resolve(argValue("--source-dir") ?? path.join(os.homedir(), "Downloads")),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
