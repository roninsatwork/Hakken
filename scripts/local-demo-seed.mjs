#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

function requireSecret() {
  const secret = process.env.LOCAL_DEMO_SEED_SECRET;
  if (!secret) {
    throw new Error("LOCAL_DEMO_SEED_SECRET is required.");
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
    process.env.LOCAL_DEMO_SEED_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    (await readEnvLocalValue("NEXT_PUBLIC_CONVEX_URL")) ||
    "http://127.0.0.1:3210"
  );
}

async function seed() {
  const secret = requireSecret();
  const convexUrl = await getConvexUrl();
  const client = new ConvexHttpClient(convexUrl);
  const result = await client.mutation(api.localDemoSeed.seed, { secret });

  console.log(`Seeded local demo tenant: ${result.company.name} (${result.company.action})`);
  for (const user of result.users) {
    console.log(`- user ${user.email}: ${user.action}`);
  }
  for (const model of result.models) {
    console.log(`- model ${model.modelId}: ${model.action}`);
  }
  console.log(`- global defaults: ${result.defaults.map((entry) => `${entry.useCase}:${entry.action}`).join(", ")}`);
  console.log(`- tool ${result.tool.handlerMapping}: ${result.tool.action}`);
  console.log(`- agent ${result.agent.name}: ${result.agent.action}`);
  console.log(`- knowledge ${result.knowledge.title}: ${result.knowledge.action}`);
  console.log(`- eval fixtures: ${result.evalFixtures.action} (${result.evalFixtures.fixtureIds.length} new)`);
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
