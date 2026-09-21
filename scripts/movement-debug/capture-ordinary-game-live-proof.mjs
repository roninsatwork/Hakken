#!/usr/bin/env node

// Reproduces the ordinary live Game session (webcam player + stored-recording
// instructor) in a real browser and captures screenshots. This is the lane the
// mounted packet proof deliberately bypasses, so visible defects here are
// input-door defects: stored-recording -> instructor, live camera -> player.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const clipRoot = path.join(root, "tmp/movement-replay-lab/dense-capture/clips");

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function main() {
  const baseUrl = argValue("--base-url", "http://localhost:3000");
  const secret = argValue("--secret", process.env.LOCAL_TEST_AUTH_SECRET ?? "hakken-local-test-auth");
  const recordingId = argValue("--recording-id", "");
  const clip = argValue("--clip", "far-camera-2026-07-18T10-52-32Z.webm");
  const watchSeconds = Number(argValue("--watch-seconds", "20"));
  const outDir = path.resolve(argValue("--out", "tmp/movement-replay-lab/ordinary-game-live-proof"));
  if (!recordingId) throw new Error("--recording-id is required.");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--enable-webgl", "--ignore-gpu-blocklist"],
    headless: false,
  });
  try {
    const context = await browser.newContext({
      permissions: ["camera"],
      viewport: { height: 900, width: 1440 },
    });
    await context.route("**/__game-live-fixture-*.webm", async (route) => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname)
        .replace(/^\/__game-live-fixture-/, "");
      await route.fulfill({ contentType: "video/webm", path: path.join(clipRoot, name) });
    });
    await context.addInitScript((fixtureName) => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.video) return originalGetUserMedia(constraints);
        const video = document.createElement("video");
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.src = `/__game-live-fixture-${fixtureName}`;
        await video.play();
        return video.captureStream();
      };
    }, clip);

    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });

    const signInUrl = new URL("/local-test-auth", baseUrl);
    signInUrl.searchParams.set("role", "super-admin");
    signInUrl.searchParams.set("secret", secret);
    signInUrl.searchParams.set("redirectTo", `/demos/movements/${recordingId}/play`);
    await page.goto(signInUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.endsWith("/play"), { timeout: 60_000 });

    await page.waitForTimeout(4_000);
    await page.screenshot({ path: path.join(outDir, "01-entry.png"), fullPage: false });

    // Click through whatever entry controls exist (lobby "Begin Practice",
    // then any Start/Begin), each with a SHORT timeout so a missing control
    // never blocks on the 90s default. After that the game runs its own
    // readiness gate + countdown on the fake full-body camera feed.
    const clickIfPresent = async (name) => {
      const button = page.getByRole("button", { name }).first();
      try {
        await button.waitFor({ state: "visible", timeout: 6_000 });
        await button.click({ timeout: 4_000 });
        return true;
      } catch {
        return false;
      }
    };
    const clickedBeginPractice = await clickIfPresent(/begin practice/i);
    await page.waitForTimeout(2_000);
    const clickedStart = await clickIfPresent(/^(start|begin)/i);
    console.log(`Entry controls: beginPractice=${clickedBeginPractice} start=${clickedStart}`);
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: path.join(outDir, "02-armed.png"), fullPage: false });

    const shots = [];
    for (let elapsed = 0; elapsed < watchSeconds; elapsed += 4) {
      await page.waitForTimeout(4_000);
      const shot = path.join(outDir, `play-${String(elapsed + 4).padStart(2, "0")}s.png`);
      await page.screenshot({ path: shot, fullPage: false });
      shots.push(shot);
    }

    await writeFile(path.join(outDir, "report.json"), JSON.stringify({
      baseUrl,
      clip,
      errors: pageErrors.slice(0, 40),
      recordingId,
      screenshots: shots,
      watchSeconds,
    }, null, 2));
    console.log(`Ordinary game live proof captured ${shots.length + 2} screenshots. Errors: ${pageErrors.length}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
