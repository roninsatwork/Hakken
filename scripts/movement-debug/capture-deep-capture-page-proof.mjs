#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const DEFAULT_CLIPS = [
  "far-camera-2026-07-18T10-52-32Z.webm",
];
const clipRoot = path.join(root, "tmp/movement-replay-lab/dense-capture/clips");
const modelRoot = path.join(
  root,
  "tmp/movement-replay-lab/dense-capture/models/bodypix-mobilenet-v1-075-q2",
);
const TARGET_CAPTURE_MOMENTS = 120;

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function momentCount(text) {
  return Number(/(\d+)\s+moments?/i.exec(text)?.[1] ?? 0);
}

async function signIn(page, baseUrl, secret) {
  const redirectPath = "/demos/movement-capture/deep";
  const url = new URL("/local-test-auth", baseUrl);
  url.searchParams.set("role", "super-admin");
  url.searchParams.set("secret", secret);
  url.searchParams.set("redirectTo", redirectPath);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForURL((current) => current.pathname === redirectPath, { timeout: 45_000 });
}

async function main() {
  const baseUrl = argValue("--base-url", "http://localhost:3100");
  const secret = argValue("--secret", process.env.LOCAL_TEST_AUTH_SECRET ?? "hakken-local-test-auth");
  const saveRecording = process.argv.includes("--save-recording");
  const saveTitle = argValue("--title", "Automated Deep Capture Browser Proof");
  const clips = argValue("--clips", DEFAULT_CLIPS.join(",")).split(",").map((clip) => clip.trim()).filter(Boolean);
  // Gate-check mode: prove the armed start gate REFUSES to count down while
  // the supplied clip does not show a trustworthy whole body.
  const gateCheckSeconds = Number(argValue("--gate-check-seconds", "0"));
  const outDir = path.resolve(argValue(
    "--out",
    "tmp/movement-replay-lab/deep-capture-live-page-proof",
  ));
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--enable-webgl", "--ignore-gpu-blocklist"],
    headless: false,
  });
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      permissions: ["camera"],
      viewport: { height: 900, width: 1440 },
    });
    await context.route("**/__deep-capture-fixture-*.webm", async (route) => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname)
        .replace(/^\/__deep-capture-fixture-/, "");
      await route.fulfill({ contentType: "video/webm", path: path.join(clipRoot, name) });
    });
    await context.route(
      "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/model-stride16.json",
      (route) => route.fulfill({ contentType: "application/json", path: path.join(modelRoot, "model.json") }),
    );
    await context.route(
      "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/group1-shard1of1.bin",
      (route) => route.fulfill({ contentType: "application/octet-stream", path: path.join(modelRoot, "group1-shard1of1.bin") }),
    );
    await context.addInitScript((fixtureNames) => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.video) return originalGetUserMedia(constraints);
        const video = document.createElement("video");
        video.autoplay = true;
        video.loop = fixtureNames.length === 1;
        video.muted = true;
        video.playsInline = true;
        let fixtureIndex = 0;
        const playFixture = async () => {
          video.src = `/__deep-capture-fixture-${fixtureNames[fixtureIndex % fixtureNames.length]}`;
          fixtureIndex += 1;
          await video.play();
        };
        if (fixtureNames.length > 1) {
          video.addEventListener("ended", () => void playFixture());
        }
        await playFixture();
        window.__hakkenDeepCaptureFixture = { video };
        return video.captureStream();
      };
    }, clips);

    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    const pageErrors = [];
    const pageWarnings = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "warn") {
        pageWarnings.push(message.text());
      }
      if (
        message.type() === "error" &&
        !message.text().includes("Blocked attempt to show a 'beforeunload' confirmation panel")
      ) {
        pageErrors.push(message.text());
      }
    });
    await signIn(page, baseUrl, secret);
    const profileMarker = page.getByTestId("capture-profile-mode");
    await profileMarker.waitFor({ state: "attached" });
    const captureProfile = await profileMarker.getAttribute("data-capture-profile");
    if (captureProfile !== "schema-v3-deep-capture") {
      throw new Error(`Capture page is not in Deep Capture mode: ${captureProfile ?? "missing profile"}`);
    }

    if (gateCheckSeconds > 0) {
      const startButton = page.getByRole("button", { name: "Start posture capture" });
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (await startButton.isEnabled()) break;
        await page.waitForTimeout(1_000);
      }
      if (!(await startButton.isEnabled())) {
        throw new Error("Start button never became enabled for the gate check.");
      }
      await startButton.click();
      const lifecycleStatus = page.getByTestId("recording-lifecycle-status");
      let sawWalkBackMessage = false;
      for (let elapsed = 0; elapsed < gateCheckSeconds; elapsed += 1) {
        const lifecycleText = (await lifecycleStatus.innerText()).trim();
        // "ARMED — NOT RECORDING YET" is the correct blocked state; only a
        // leading RECORDING or GET READY label means the gate advanced.
        if (/^(RECORDING|GET READY)/i.test(lifecycleText)) {
          await page.screenshot({ path: path.join(outDir, "gate-check-false-start.png") });
          throw new Error(
            `Start gate incorrectly advanced to "${lifecycleText}" while the whole body was not visible.`,
          );
        }
        const bodyText = await page.locator("body").innerText();
        if (/walk back until/i.test(bodyText)) sawWalkBackMessage = true;
        await page.waitForTimeout(1_000);
      }
      if (!sawWalkBackMessage) {
        throw new Error("Gate check never showed a walk-back instruction while blocked.");
      }
      await page.screenshot({ path: path.join(outDir, "gate-check-blocked-visible.png") });
      await writeFile(path.join(outDir, "gate-check-report.json"), JSON.stringify({
        clips,
        gateCheckSeconds,
        passed: true,
        sawWalkBackMessage,
      }, null, 2));
      console.log(
        `Gate check passed: armed for ${gateCheckSeconds}s on ${clips.join(", ")} with no countdown and no recording.`,
      );
      return;
    }
    let denseCaptureReady = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const bodyText = await page.locator("body").innerText();
      const technicalFailure = /Deep Capture is not ready[^\n]*\n([^\n]+)/.exec(bodyText)?.[1];
      if (technicalFailure) throw new Error(`Deep Capture failed before recording: ${technicalFailure}`);
      const anchorCount = Number(/(\d+)\/200 persistent anchors/.exec(bodyText)?.[1] ?? 0);
      if (anchorCount >= 200) {
        denseCaptureReady = true;
        break;
      }
      if (attempt % 10 === 0) {
        const denseLine = bodyText.split("\n").find((line) => line.includes("persistent anchors"));
        console.log(`Waiting for dense capture: ${denseLine ?? "no anchor measurement yet"}`);
      }
      await page.waitForTimeout(1_000);
    }
    if (!denseCaptureReady) {
      await page.screenshot({ path: path.join(outDir, "deep-capture-preflight-failure.png") });
      throw new Error("Deep Capture did not produce a 200-anchor measurement within 120 seconds.");
    }

    const preflightBefore = await page.getByRole("region", { name: "Capture channel preflight" }).innerText();
    await page.getByRole("button", { name: "Start posture capture" }).click();
    const lifecycleStatus = page.getByTestId("recording-lifecycle-status");
    let recordingStarted = false;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const lifecycleText = await lifecycleStatus.innerText();
      if (/^RECORDING\s+—/i.test(lifecycleText.trim())) {
        recordingStarted = true;
        break;
      }
      if (attempt % 10 === 0) {
        const readinessText = (await page.locator("body").innerText())
          .split("\n")
          .filter((line) => /visible|missing|ready|recording will start/i.test(line))
          .slice(-8)
          .join(" | ");
        console.log(`Armed state: ${lifecycleText}; ${readinessText}`);
      }
      await page.waitForTimeout(1_000);
    }
    if (!recordingStarted) {
      await page.screenshot({ path: path.join(outDir, "deep-capture-armed-timeout.png") });
      throw new Error("Deep Capture stayed armed without reaching verified full-body readiness.");
    }
    console.log("Recording started after verified body readiness.");
    let retainedMoments = 0;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const lifecycleText = await lifecycleStatus.innerText();
      retainedMoments = momentCount(lifecycleText);
      if (retainedMoments >= TARGET_CAPTURE_MOMENTS) break;
      if (attempt % 10 === 0) console.log(`Capture progress: ${lifecycleText}`);
      await page.waitForTimeout(1_000);
    }
    if (retainedMoments < TARGET_CAPTURE_MOMENTS) {
      await page.screenshot({ path: path.join(outDir, "deep-capture-recording-timeout.png") });
      throw new Error(
        `Deep Capture retained only ${retainedMoments}/${TARGET_CAPTURE_MOMENTS} required moments.`,
      );
    }
    const captureText = await page.locator("body").innerText();
    const capturedMoments = momentCount(captureText);
    await page.screenshot({ path: path.join(outDir, "deep-capture-recording-visible.png") });
    await page.getByRole("button", { name: "Stop posture capture" }).click();
    const saveHeading = page.getByRole("heading", { name: "Save Practice" });
    const dialog = saveHeading.locator("..").locator("..");
    try {
      await saveHeading.waitFor({ timeout: 30_000 });
    } catch {
      await page.screenshot({ path: path.join(outDir, "deep-capture-stop-failure.png") });
      const lifecycleText = await lifecycleStatus.innerText();
      throw new Error(
        `Deep Capture did not open the save dialog after stop (${lifecycleText}). ` +
        `Browser errors: ${pageErrors.join(" | ") || "none"}`,
      );
    }
    await dialog.getByPlaceholder("e.g., Tall Spine Flow").fill(saveTitle);
    const backupButton = dialog.getByRole("button", { name: "Download local packet backup" });
    if (!(await backupButton.isEnabled())) {
      throw new Error(`Deep Capture packet was not proof-ready: ${await dialog.innerText()}`);
    }
    const downloadPromise = page.waitForEvent("download");
    await backupButton.click();
    const download = await downloadPromise;
    const packetPath = path.join(outDir, "deep-capture-packet.json");
    await download.saveAs(packetPath);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    let savedRecordingId = null;
    if (saveRecording) {
      const saveButton = dialog.getByRole("button", { name: "Save Practice" });
      if (!(await saveButton.isEnabled())) {
        throw new Error(`Deep Capture recording was not saveable: ${await dialog.innerText()}`);
      }
      await saveButton.click();
      const savedBanner = page.getByText("Proof-ready schema-v3 Deep Capture recording saved");
      await savedBanner.waitFor({ timeout: 90_000 });
      const savedCodes = await savedBanner.locator("..").locator("code").allTextContents();
      savedRecordingId = savedCodes[0]?.trim() || null;
      if (!savedRecordingId) throw new Error("Deep Capture save completed without a visible recording ID.");
      await page.screenshot({ path: path.join(outDir, "deep-capture-saved-visible.png") });
    }
    const mediaPipeMaskWarnings = pageWarnings.filter((warning) =>
      /MPMask/i.test(warning) && /not (?:been )?closed/i.test(warning)
    );
    const report = {
      capturedMoments,
      deepCaptureProfileId: packet.deepCaptureProfile?.id ?? null,
      denseBodyPresentFrames: packet.deepCaptureChannelSummary?.denseBody?.presentFrames ?? 0,
      failures: pageErrors,
      handPresentFrames: {
        left: packet.deepCaptureChannelSummary?.leftHand?.presentFrames ?? 0,
        right: packet.deepCaptureChannelSummary?.rightHand?.presentFrames ?? 0,
      },
      passed: pageErrors.length === 0 &&
        mediaPipeMaskWarnings.length === 0 &&
        packet.schemaVersion === 3 &&
        packet.deepCaptureProfile?.id === "movement-deep-capture-v1" &&
        (packet.deepCaptureChannelSummary?.denseBody?.presentFrames ?? 0) /
          Math.max(1, packet.frames.length) >= 0.8 &&
        packet.frames.every((frame) => frame.acquisitionProfileId === "movement-deep-capture-v1") &&
        packet.frames.every((frame) => {
          const dense = frame.deepCapture?.denseBody;
          return !dense || (dense.anchors.length >= 200 && dense.anchors.length <= 500);
        }) &&
        (!saveRecording || Boolean(savedRecordingId)),
      mediaPipeMaskWarnings,
      pageWarnings,
      preflightBefore,
      sampleCount: packet.frames.length,
      schemaVersion: packet.schemaVersion,
      savedRecordingId,
      sourcePacketHash: packet.sourcePacketHash,
    };
    await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) throw new Error(`Deep Capture browser proof failed: ${JSON.stringify(report)}`);
    console.log(
      `Deep Capture page proof passed: ${report.sampleCount} frame(s), ` +
      `${report.denseBodyPresentFrames} dense frame(s), hands ` +
      `${report.handPresentFrames.left}/${report.handPresentFrames.right}.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
