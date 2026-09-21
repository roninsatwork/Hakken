import { tmpdir } from "node:os";
import { join } from "node:path";

export function diagnoseReplayStudioBundleTempDir() {
  return join(tmpdir(), "hakken-movement-diagnose-");
}

export function diagnoseReplayStudioBundleFilename(processId = process.pid) {
  return `diagnose-replay-studio-cli.${processId}.bundle.mjs`;
}
