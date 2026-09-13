import { expect, test, type Page } from "@playwright/test";
import { setE2ERole } from "../helpers/auth";
import { LEVELS } from "../../src/app/(dashboard)/app/arcade/ronins-run/engine/Levels";
import { navigationFor } from "../../src/app/(dashboard)/app/arcade/ronins-run/engine/Navigation";
import { ACTOR_RADIUS, clearPath, distance, type Point } from "../../src/app/(dashboard)/app/arcade/ronins-run/engine/MapData";
import { yawToward } from "../../src/app/(dashboard)/app/arcade/ronins-run-3d/engine/WorldLayout";

const routes = {
  courtyard: ["spirit", 1, 0, 2, "treasure"],
  market: ["spirit", 0, 1, 2, "treasure"],
  docks: ["spirit", 1, 0, "treasure", 2],
  gardens: [1, "spirit", 0, 2, "treasure"],
} as const;

// Observe the same SVG marker the player sees. Never access or mutate a game instance.
async function position(page: Page) {
  const transform = await page.getByRole("img", { name: /Birds-eye route map/ })
    .locator("g[transform]").getAttribute("transform");
  const values = transform!.match(/-?[\d.]+/g)!.map(Number);
  return { x: values[0], y: values[1], yaw: -values[2] * Math.PI / 180 };
}

test("Quiet graphics: two minutes of continuous rendering without resource growth", async ({ page }, info) => {
  test.setTimeout(180_000);
  await setE2ERole(page, "user");
  await page.goto("/app/arcade/ronins-run-3d");
  const canvas = page.getByTestId("first-person-canvas");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Enter the district", exact: true }).click({ timeout: 60_000 });
  const samples: Record<string, string>[] = [];
  for (let second = 0; second < 120; second++) {
    await expect(canvas).toHaveAttribute("data-status", "playing");
    await page.waitForTimeout(1000);
    if (second >= 10 && second % 5 === 0)
      samples.push(await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset })) as Record<string, string>);
  }
  await page.keyboard.press("Escape");
  await info.attach("quiet-two-minute-samples", { body: JSON.stringify(samples), contentType: "application/json" });
  expect(errors).toEqual([]);
  expect(samples.every((s) => Number(s.fps) >= 27 && Number(s.frameP95Ms) < 55 && Number(s.worstFrameMs) < 1000)).toBe(true);
  expect(new Set(samples.map((s) => s.shaderPrograms)).size).toBe(1);
  expect(new Set(samples.map((s) => s.textures)).size).toBe(1);
  expect(new Set(samples.map((s) => s.geometries)).size).toBe(1);
});

test("touch viewport: move, look, release and pause through real touch events", async ({ browser }, info) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await setE2ERole(page, "user");
    await page.goto("http://localhost:3100/app/arcade/ronins-run-3d");
    await page.getByRole("button", { name: "Enter the district", exact: true }).click({ timeout: 60_000 });
    const canvas = page.getByTestId("first-person-canvas");
    const before = await position(page);
    const move = page.getByRole("group", { name: "Drag to move", exact: true });
    const look = page.getByRole("group", { name: "Swipe to look", exact: true });
    await expect(move).toBeVisible();
    const control = (await move.boundingBox())!;
    const touch = await context.newCDPSession(page);
    const x = control.x + control.width / 2, y = control.y + control.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 34, id: 1 }] });
    await page.waitForTimeout(450);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    const moved = await position(page);
    expect(distance(before, moved)).toBeGreaterThan(20);
    await page.waitForTimeout(250);
    expect(distance(moved, await position(page))).toBeLessThan(1);
    const area = (await look.boundingBox())!;
    const lx = area.x + area.width / 2, ly = area.y + area.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: lx, y: ly, id: 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: lx + 45, y: ly, id: 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    expect(Math.abs((await position(page)).yaw - moved.yaw)).toBeGreaterThan(0.08);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach("touch-game", { body: await canvas.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: "Pause game", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-status", "paused");
  } finally {
    await context.close();
  }
});

test("art review: capture all four real district views", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
  const page = await context.newPage();
  try {
    await setE2ERole(page, "user");
    await page.goto("http://localhost:3100/app/arcade/ronins-run-3d");
    for (const [index, level] of LEVELS.entries()) {
      await page.getByRole("button", { name: new RegExp(`District ${index + 1} `) }).click();
      await page.getByRole("button", { name: "Enter the district", exact: true }).click({ timeout: 60_000 });
      const canvas = page.getByTestId("first-person-canvas");
      await expect(canvas).toHaveAttribute("data-status", "playing");
      await expect.poll(async () => Number(await canvas.getAttribute("data-render-frames"))).toBeGreaterThan(3);
      await info.attach(`${level.id}-art-review`, { body: await canvas.screenshot(), contentType: "image/png" });
      await page.getByRole("button", { name: "Pause game", exact: true }).click();
      await expect(canvas).toHaveAttribute("data-status", "paused");
    }
  } finally {
    await context.close();
  }
});

test("real-time flame pickup: moving and powering up keep the renderer responsive", async ({ page }, info) => {
  test.setTimeout(60_000);
  await setE2ERole(page, "user");
  await page.goto("/app/arcade/ronins-run-3d");
  const canvas = page.getByTestId("first-person-canvas");
  const enter = page.getByRole("button", { name: "Enter the district", exact: true });
  await expect(enter).toBeEnabled({ timeout: 60_000 });
  const button = (await enter.boundingBox())!;
  await enter.click();
  const rect = (await canvas.boundingBox())!;
  const cursor = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await page.waitForTimeout(1100);
  const before = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const deadline = Date.now() + 20_000;
  for (const target of navigationFor(LEVELS[0]).findPath(await position(page), LEVELS[0].spirit)) {
    while (Date.now() < deadline) {
      await expect(canvas).toHaveAttribute("data-status", "playing");
      const p = await position(page);
      if (distance(p, target) < 24) break;
      const delta = Math.atan2(Math.sin(yawToward(p, target) - p.yaw), Math.cos(yawToward(p, target) - p.yaw));
      if (Math.abs(delta) > 0.05) {
        await page.keyboard.up("w");
        const dx = Math.max(-rect.width * 0.35, Math.min(rect.width * 0.35, -delta / 0.0022));
        if (await page.evaluate(() => !!document.pointerLockElement)) {
          cursor.x += dx;
          await page.mouse.move(cursor.x, cursor.y);
        } else {
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          await page.mouse.move(x, y); await page.mouse.down();
          await page.mouse.move(x + dx, y); await page.mouse.up();
        }
      } else await page.keyboard.down("w");
      await page.waitForTimeout(105);
    }
    await page.keyboard.up("w");
    expect(Date.now()).toBeLessThan(deadline);
  }
  await expect(page.getByTestId("spirit-power-status")).toContainText(/\d+s/);
  await page.waitForTimeout(1100);
  const after = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  await info.attach("real-time-pickup", { body: JSON.stringify({ before, after }), contentType: "application/json" });
  expect(after.shaderPrograms).toBe(before.shaderPrograms);
  expect(after.geometries).toBe(before.geometries);
  expect(Number(after.fps)).toBeGreaterThanOrEqual(27);
  expect(Number(after.worstFrameMs)).toBeLessThan(1000);
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
});

for (const [index, level] of LEVELS.entries()) {
  test(`${level.id}: browser campaign, pickups, pause and retry`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Keep functional inputs independent of host/render latency. The separate
    // Quiet and touch checks retain the real browser clock.
    await page.clock.install();
    await setE2ERole(page, "user");
    await page.goto("/app/arcade/ronins-run-3d");
    await page.getByRole("button", { name: new RegExp(`District ${index + 1} `) }).click();
    const canvas = page.getByTestId("first-person-canvas");
    await expect(page.getByRole("button", { name: "Enter the district", exact: true })).toBeEnabled({ timeout: 60_000 });
    await expect.poll(() => canvas.getAttribute("data-render-frames")).not.toBeNull();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const idleFrames = await canvas.getAttribute("data-render-frames");
    await page.clock.runFor(200);
    expect(await canvas.getAttribute("data-render-frames")).toBe(idleFrames);
    const enter = page.getByRole("button", { name: "Enter the district", exact: true });
    const startButton = (await enter.boundingBox())!;
    await enter.click();
    await page.clock.runFor(112);
    await expect(canvas).toHaveAttribute("data-status", "playing");
    // The browser may decline pointer lock; drag-look is an equal supported control.
    const rect = (await canvas.boundingBox())!;
    const lockedAtStart = await page.evaluate(() => !!document.pointerLockElement);
    const anchor = lockedAtStart
      ? { x: startButton.x + startButton.width / 2, y: startButton.y + startButton.height / 2 }
      : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    let held = false;
    const setWalking = async (walking: boolean) => {
      if (walking === held) return;
      held = walking;
      if (walking) await page.keyboard.down("w");
      else await page.keyboard.up("w");
    };
    const aim = async (yaw: number, current: number) => {
      const delta = Math.atan2(Math.sin(yaw - current), Math.cos(yaw - current));
      if (Math.abs(delta) < 0.035) return;
      const locked = await page.evaluate(() => !!document.pointerLockElement);
      // Bound each drag to the canvas; large turns finish on the following iteration.
      const dx = Math.max(-rect.width * 0.35, Math.min(rect.width * 0.35, -delta / 0.0022));
      if (!locked) {
        await page.mouse.move(anchor.x, anchor.y);
        await page.mouse.down();
        await page.mouse.move(anchor.x + dx, anchor.y);
        await page.mouse.up();
      } else {
        await page.mouse.move(anchor.x + dx, anchor.y);
        // Pointer lock uses movement, not page coordinates; reset outside the next aim.
        anchor.x += dx;
      }
    };
    const goals: Point[] = routes[level.id].map((goal) => typeof goal === "number"
      ? level.seals[goal] : goal === "spirit" ? level.spirit : level.treasure);
    goals.push(level.exit);
    const samples: Record<string, string>[] = [];
    for (const target of goals) {
      let path = navigationFor(level).findPath(await position(page), target);
      let corrections = 0;
      for (let waypointIndex = 0; waypointIndex < path.length; waypointIndex++) {
        const point = path[waypointIndex];
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          const status = await canvas.getAttribute("data-status");
          expect(status, `Before ${point.x},${point.y}`).not.toBe("caught");
          if (status === "escaped") break;
          const p = await position(page), gap = distance(p, point);
          const next = path[waypointIndex + 1];
          if (gap < (next ? 28 : 24) && (!next || clearPath(p, next, ACTOR_RADIUS, level))) break;
          // Keyboard movement can drift off the courtyard's narrow corner.
          // Replan from the visible marker instead of holding W against a wall.
          if (level.id === "courtyard" && !clearPath(p, point, ACTOR_RADIUS, level)) {
            await setWalking(false);
            expect(++corrections, "Repeated route correction").toBeLessThan(20);
            path = navigationFor(level).findPath(p, target);
            expect(path.length).toBeGreaterThan(0);
            waypointIndex = -1;
            break;
          }
          const yaw = yawToward(p, point);
          const angle = Math.abs(Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)));
          if (angle > 0.035) {
            await setWalking(false);
            await aim(yaw, p.yaw);
            await page.clock.runFor(112);
            continue;
          }
          await setWalking(true);
          const threatened = await page.getByText(/You are being watched|Pursuit · Break/).isVisible();
          // Plan a decoy before blind patrol crossings; the automated
          // pilot cannot recognize an approaching guard in the rendered image.
          const blindCrossing =
            (gap < 350 && level.id === "gardens" && target === level.exit && point.x < 1000) ||
            (gap < 350 && level.id === "courtyard" && target === level.seals[2] &&
              point.x >= 350 && point.x < 610 && point.y > 350 && point.y < 550) ||
            (gap < 350 && level.id === "courtyard" && target === level.treasure &&
              point.x > 1100 && point.x < 1350 && point.y > 500 && point.y < 650);
          // Save a charge for these crossings. Spending it on an earlier
          // distant warning leaves the six-second cooldown active here.
          const reserveDecoy = level.id === "courtyard" || (level.id === "gardens" && target === level.exit);
          const useDecoy = blindCrossing || (!reserveDecoy && threatened);
          if (gap > 30 && angle < 0.15 && useDecoy && await page.getByText(/Decoy dash ready/).isVisible()) {
            await page.keyboard.press("Space");
            await page.clock.runFor(32);
            await expect(page.getByText(/^Decoy dash · \ds$/)).toBeVisible();
            console.info(level.id, "decoy", p.x, p.y, "towards", point);
          }
          await page.clock.runFor(112);
        }
        expect(Date.now(), `Stuck before ${point.x},${point.y}`).toBeLessThan(deadline);
      }
      await setWalking(false);
      samples.push(await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset })) as Record<string, string>);
      console.info(level.id, "goal", target, "position", await position(page));
    }
    await setWalking(false);
    await expect(canvas).toHaveAttribute("data-status", "escaped");
    // These frame intervals use a controlled clock. Real-time performance is
    // measured separately; do not report these as device benchmark results.
    expect(new Set(samples.map((sample) => sample.shaderPrograms)).size).toBe(1);
    expect(errors).toEqual([]);
    await info.attach(`${level.id}-moving-frame-samples`, { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
    await info.attach(`${level.id}-escaped`, { body: await canvas.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: /^(Play again|Restart this district)$/ }).click();
    await expect(canvas).toHaveAttribute("data-status", "playing");
    await expect(page.getByRole("img", { name: /Birds-eye route map/ }).locator("circle.fill-success")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-status", "paused");
    await page.clock.runFor(112);
    const paused = await position(page);
    const frames = await canvas.getAttribute("data-render-frames");
    await page.clock.runFor(350);
    expect(await position(page)).toEqual(paused);
    expect(await canvas.getAttribute("data-render-frames")).toBe(frames);
  });
}
