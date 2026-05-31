import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

describe("OWASP: Broken Access Control - Workflows", () => {
  test("Standard USER cannot execute any Workflow CRUD operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.workflows.list)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.workflows.createWorkflow, { name: "Rogue Workflow" })
    ).rejects.toThrow("Unauthorized");
  });

  test("Workflow Webhook Secret Generation & Access Controls", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN"
      });
    });

    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminAClient = t.withIdentity({ subject: adminAId });

    // 1. Create a workflow manually
    const workflowId = await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Webhook Integration Workflow",
    });

    // Verify webhookSecret is initially undefined/null
    const createdWorkflow = await t.run(async (ctx) => {
      return await ctx.db.get(workflowId);
    });
    expect(createdWorkflow?.webhookSecret).toBeUndefined();

    // 2. Update the workflow to triggerType: "WEBHOOK"
    await superAdminClient.mutation(api.workflows.updateWorkflow, {
      id: workflowId,
      triggerType: "WEBHOOK",
    });

    // Verify webhookSecret is now generated
    const updatedWorkflow = await t.run(async (ctx) => {
      return await ctx.db.get(workflowId);
    });
    const webhookSecret = updatedWorkflow?.webhookSecret;
    expect(typeof webhookSecret).toBe("string");
    if (typeof webhookSecret !== "string") {
      throw new Error("Expected webhook secret to be generated");
    }
    expect(webhookSecret.length).toBeGreaterThan(10);

    // 3. Test access controls on getWebhookSecret query
    // Super Admin should be allowed
    const secret = await superAdminClient.query(api.workflows.getWebhookSecret, { id: workflowId });
    expect(secret).toBe(updatedWorkflow?.webhookSecret);

    // Admin of Company A should be rejected
    await expect(
      adminAClient.query(api.workflows.getWebhookSecret, { id: workflowId })
    ).rejects.toThrow("Unauthorized");
  });

  test("BOLA and Sandboxing inside Workflow Database Operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Seed Companies
    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
    });

    // Seed Users
    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN"
      });
    });

    // Seed Properties for tenant boundary testing
    const propertyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "prop-A",
        address: "Address A",
        price: 100,
        url: "https://example.com/a",
        companyId: companyAId,
        scrapedAt: Date.now()
      });
    });

    const propertyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "prop-B",
        address: "Address B",
        price: 200,
        url: "https://example.com/b",
        companyId: companyBId,
        scrapedAt: Date.now()
      });
    });

    // Seed Workflows
    const adminAWorkflowId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflows", {
        name: "Admin A Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdBy: adminAId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    const superAdminWorkflowId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflows", {
        name: "Super Admin Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    // 🔒 SCENARIO 1: Workflow created by standard Admin A tries to access system tables (BOLA Shield)
    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "users",
        operation: "SELECT"
      })
    ).rejects.toThrow(/Unauthorized: Access to system table 'users' is strictly restricted./);

    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "auditLogs",
        operation: "INSERT",
        data: { actionType: "TEST" }
      })
    ).rejects.toThrow(/Unauthorized: Access to system table 'auditLogs' is strictly restricted./);

    // 🔒 SCENARIO 2: Workflow created by standard Admin A tries to access another tenant's records (BOLA boundary)
    // Try to SELECT foreign document directly by ID
    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "properties",
        operation: "SELECT",
        docId: propertyBId
      })
    ).rejects.toThrow(/Unauthorized: Access denied to foreign company document./);

    // Try to UPDATE foreign document directly
    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "properties",
        operation: "UPDATE",
        docId: propertyBId,
        data: { price: 999 }
      })
    ).rejects.toThrow(/Unauthorized: Cannot update a foreign company document./);

    // Try to DELETE foreign document directly
    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "properties",
        operation: "DELETE",
        docId: propertyBId
      })
    ).rejects.toThrow(/Unauthorized: Cannot delete a foreign company document./);

    // 🔒 SCENARIO 3: Workflow created by standard Admin A queries lists of properties
    // Verify it automatically filters out Company B's property and only returns Company A's property
    const filteredProps = await t.mutation(internal.workflowEngine.executeDatabaseOperation, {
      workflowId: adminAWorkflowId,
      tableName: "properties",
      operation: "SELECT"
    }) as Doc<"properties">[];
    expect(filteredProps.length).toBe(1);
    expect(filteredProps[0]._id).toBe(propertyAId);

    // 🔒 SCENARIO 4: Workflow created by standard Admin A inserts/modifies property
    // Verify it rejects spoofing attempts with foreign companyId
    await expect(
      t.mutation(internal.workflowEngine.executeDatabaseOperation, {
        workflowId: adminAWorkflowId,
        tableName: "properties",
        operation: "INSERT",
        data: {
          rightmoveId: "prop-spoof",
          address: "Spoofed Address",
          price: 300,
          url: "https://example.com/spoof",
          scrapedAt: Date.now(),
          companyId: companyBId // spoof attempt
        }
      })
    ).rejects.toThrow(/Unauthorized: Cannot insert records for a foreign company./);

    // Verify it enforces its own companyId when none is provided
    const insertedRes = await t.mutation(internal.workflowEngine.executeDatabaseOperation, {
      workflowId: adminAWorkflowId,
      tableName: "properties",
      operation: "INSERT",
      data: {
        rightmoveId: "prop-new",
        address: "Address New",
        price: 300,
        url: "https://example.com/new",
        scrapedAt: Date.now()
      }
    }) as { id: Id<"properties"> };

    const insertedProp = await t.run(async (ctx) => {
      return await ctx.db.get(insertedRes.id);
    }) as Doc<"properties"> | null;
    expect(insertedProp?.companyId).toBe(companyAId); // Automatically scoped to creator's company

    // 🔓 SCENARIO 5: SUPER_ADMIN workflow has unrestricted access
    // Can SELECT system tables
    const allUsers = await t.mutation(internal.workflowEngine.executeDatabaseOperation, {
      workflowId: superAdminWorkflowId,
      tableName: "users",
      operation: "SELECT"
    }) as Doc<"users">[];
    expect(allUsers.length).toBeGreaterThan(0);

    // Can SELECT foreign tenant documents
    const foreignDoc = await t.mutation(internal.workflowEngine.executeDatabaseOperation, {
      workflowId: superAdminWorkflowId,
      tableName: "properties",
      operation: "SELECT",
      docId: propertyBId
    }) as Doc<"properties">;
    expect(foreignDoc._id).toBe(propertyBId);
  });
});
