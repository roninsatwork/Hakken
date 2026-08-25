#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { chromium } from "@playwright/test";

const roles = [
  { role: "super-admin", storageState: "super-admin.json", redirectTo: "/admin" },
  { role: "company-admin", storageState: "company-admin.json", redirectTo: "/app" },
  { role: "user", storageState: "user.json", redirectTo: "/app" },
];

function selectedRoles() {
  const requestedRoles = process.argv.slice(3);
  if (requestedRoles.length === 0) return roles;

  const requested = new Set(requestedRoles);
  const selected = roles.filter((role) => requested.has(role.role));
  if (selected.length !== requestedRoles.length) {
    throw new Error(`Unknown local test auth role. Expected one of: ${roles.map((role) => role.role).join(", ")}.`);
  }
  return selected;
}

function requireSecret() {
  const secret = process.env.LOCAL_TEST_AUTH_SECRET;
  if (!secret) {
    throw new Error("LOCAL_TEST_AUTH_SECRET is required.");
  }
  return secret;
}

async function readEnvLocalValue(key) {
  try {
    const envLocal = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
    const line = envLocal
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return undefined;
  }
}

async function getConvexUrl() {
  return (
    process.env.LOCAL_TEST_AUTH_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    (await readEnvLocalValue("NEXT_PUBLIC_CONVEX_URL")) ||
    "http://127.0.0.1:3210"
  );
}

function getBaseUrl() {
  return process.env.LOCAL_TEST_AUTH_BASE_URL || "http://localhost:3100";
}

async function seed() {
  const secret = requireSecret();
  const convexUrl = await getConvexUrl();
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.mutation(api.localTestAuth.seed, { secret });
  console.log(`Seeded ${result.users.length} local test users in ${result.companyName}.`);
  for (const user of result.users) {
    console.log(`- ${user.email}: ${user.action}`);
  }
}

async function cleanup() {
  const secret = requireSecret();
  const convexUrl = await getConvexUrl();
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.mutation(api.localTestAuth.cleanup, { secret });
  if (result.cleared.length === 0) {
    console.log(`No local test users found in ${result.companyName}; nothing to clear.`);
    return;
  }
  console.log(`Clearing data for ${result.cleared.length} local test users in ${result.companyName}.`);
  for (const email of result.cleared) {
    console.log(`- ${email}: queued`);
  }
}

async function state() {
  const secret = requireSecret();
  const baseUrl = getBaseUrl();
  const authDir = path.join(process.cwd(), "e2e/.auth");
  await mkdir(authDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const role of selectedRoles()) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const url = new URL("/local-test-auth", baseUrl);
      url.searchParams.set("role", role.role);
      url.searchParams.set("secret", secret);
      url.searchParams.set("redirectTo", role.redirectTo);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

      const authError = page.getByTestId("local-test-auth-error");
      await Promise.race([
        page.waitForURL((currentUrl) => currentUrl.pathname === role.redirectTo, { timeout: 30000 }),
        authError.waitFor({ state: "visible", timeout: 30000 }).then(async () => {
          const message = await authError.textContent();
          throw new Error(message || `Local test auth failed for ${role.role}.`);
        }),
      ]);

      await context.storageState({ path: path.join(authDir, role.storageState) });
      await context.close();
      console.log(`Saved ${role.role} storage state to e2e/.auth/${role.storageState}.`);
    }
  } finally {
    await browser.close();
  }
}

const command = process.argv[2];

try {
  if (command === "seed") {
    await seed();
  } else if (command === "state") {
    await state();
  } else if (command === "cleanup") {
    await cleanup();
  } else {
    console.error("Usage: node scripts/local-test-auth.mjs <seed|state|cleanup>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
