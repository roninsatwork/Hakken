import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";

const originalEnabled = process.env.LOCAL_DEMO_SEED_ENABLED;
const originalSecret = process.env.LOCAL_DEMO_SEED_SECRET;
const originalEnvironment = process.env.LOCAL_DEMO_SEED_ENVIRONMENT;

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

function enableLocalDemoSeed() {
  process.env.LOCAL_DEMO_SEED_ENABLED = "1";
  process.env.LOCAL_DEMO_SEED_SECRET = "demo-secret";
  delete process.env.LOCAL_DEMO_SEED_ENVIRONMENT;
}

function restoreEnv() {
  process.env.LOCAL_DEMO_SEED_ENABLED = originalEnabled;
  process.env.LOCAL_DEMO_SEED_SECRET = originalSecret;
  process.env.LOCAL_DEMO_SEED_ENVIRONMENT = originalEnvironment;
}

describe("local demo seed", () => {
  beforeEach(() => {
    enableLocalDemoSeed();
  });

  afterEach(() => {
    restoreEnv();
  });

  test("seeds an idempotent local demo tenant and draft agent foundation", async () => {
    const t = setup();

    const firstSeed = await t.mutation(api.localDemoSeed.seed, { secret: "demo-secret" });
    const secondSeed = await t.mutation(api.localDemoSeed.seed, { secret: "demo-secret" });

    expect(firstSeed.company).toMatchObject({ name: "Sonae Demo Company", action: "created" });
    expect(secondSeed.company).toMatchObject({ name: "Sonae Demo Company", action: "updated" });
    expect(firstSeed.users.map((user) => user.action)).toEqual(["created", "created"]);
    expect(secondSeed.users.map((user) => user.action)).toEqual(["updated", "updated"]);
    expect(firstSeed.agent).toMatchObject({
      name: "Demo Knowledge Assistant",
      templateId: "internal-knowledge-assistant",
      action: "created",
    });
    expect(secondSeed.agent).toMatchObject({
      name: "Demo Knowledge Assistant",
      templateId: "internal-knowledge-assistant",
      action: "updated",
    });
    expect(firstSeed.evalFixtures.fixtureIds).toHaveLength(2);
    expect(secondSeed.evalFixtures.fixtureIds).toHaveLength(0);

    const snapshot = await t.run(async (ctx) => {
      const [company, superAdmin, companyAdmin, agent, knowledge, tools, defaults, fixtures] = await Promise.all([
        ctx.db
          .query("companies")
          .withIndex("by_name", (q) => q.eq("name", "Sonae Demo Company"))
          .first(),
        ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", "demo-super-admin@sonae.test"))
          .first(),
        ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", "demo-company-admin@sonae.test"))
          .first(),
        ctx.db
          .query("agents")
          .withIndex("by_name", (q) => q.eq("name", "Demo Knowledge Assistant"))
          .first(),
        ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_company", (q) => q.eq("agentId", firstSeed.agent.agentId).eq("companyId", firstSeed.company.companyId))
          .collect(),
        ctx.db.query("aiTools").withIndex("by_createdAt").collect(),
        ctx.db.query("aiModelDefaults").collect(),
        ctx.db
          .query("agentEvalFixtures")
          .withIndex("by_agent_status_created", (q) => q.eq("agentId", firstSeed.agent.agentId).eq("status", "ACTIVE"))
          .collect(),
      ]);
      return { company, superAdmin, companyAdmin, agent, knowledge, tools, defaults, fixtures };
    });

    expect(snapshot.company?._id).toBe(firstSeed.company.companyId);
    expect(snapshot.superAdmin).toMatchObject({ role: "SUPER_ADMIN" });
    expect(snapshot.companyAdmin).toMatchObject({ role: "ADMIN", companyId: firstSeed.company.companyId });
    expect(snapshot.agent).toMatchObject({
      isActive: false,
      modelId: SYSTEM_FAILSAFE_MODEL_ID,
      modelSelectionMode: "inherit",
      knowledgeDocumentIds: [firstSeed.knowledge.documentId],
    });
    expect(snapshot.knowledge).toHaveLength(1);
    expect(snapshot.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ handlerMapping: "knowledge.search", isActive: true }),
      ])
    );
    expect(snapshot.defaults.map((entry) => entry.useCase).sort()).toEqual([
      "agent",
      "chat",
      "embedding",
      "report",
      "workflow",
    ]);
    expect(snapshot.fixtures).toHaveLength(2);

    const client = t.withIdentity({ subject: firstSeed.users[0].userId });
    const readiness = await client.query(api.agents.getAgentReadiness, { id: firstSeed.agent.agentId });
    expect(readiness).toMatchObject({
      isActive: false,
      modelReadiness: { status: "PASS" },
      toolBindingCount: 1,
      knowledgeDocumentCount: 1,
      activeEvalFixtureCount: 2,
      successfulSmokeEvalRunCount: 0,
      activationWarnings: ["smokeEval"],
    });
  });

  test("fails closed when disabled, marked production, or given a wrong secret", async () => {
    const t = setup();

    process.env.LOCAL_DEMO_SEED_ENABLED = "0";
    await expect(t.mutation(api.localDemoSeed.seed, { secret: "demo-secret" })).rejects.toThrow(
      "Local demo seed is disabled"
    );

    process.env.LOCAL_DEMO_SEED_ENABLED = "1";
    process.env.LOCAL_DEMO_SEED_ENVIRONMENT = "production";
    await expect(t.mutation(api.localDemoSeed.seed, { secret: "demo-secret" })).rejects.toThrow(
      "Local demo seed is not available in production"
    );

    delete process.env.LOCAL_DEMO_SEED_ENVIRONMENT;
    await expect(t.mutation(api.localDemoSeed.seed, { secret: "wrong-secret" })).rejects.toThrow(
      "Invalid local demo seed secret"
    );
  });
});
