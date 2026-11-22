import { readFileSync } from "node:fs";
import { test, expect } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const dockerignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");

test("cloud auth files stay outside every Docker build layer", () => {
  expect(dockerignore).toMatch(/^gha-creds-\*\.json$/m);
});

test("Cloud Run deploys the image digest emitted by this build", () => {
  expect(workflow).toMatch(/--metadata-file\s+"\$RUNNER_TEMP\/hakken-image\.json"/);
  expect(workflow).toMatch(/containerimage\.digest/);
  expect(workflow).toMatch(/image=\$IMAGE_BASE@\$digest/);
  expect(workflow).toMatch(/image: \$\{\{ steps\.build\.outputs\.image \}\}/);
});
