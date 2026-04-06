import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Companies", () => {

  test("Unauthenticated requests are completely rejected", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Create a real company ID so we pass Convex's strong type validation
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Company", createdAt: Date.now() });
    });
    
    // Attempting to delete a company without being logged in at all
    await expect(
      t.mutation(api.companies.deleteCompany, { id: companyId }) 
    ).rejects.toThrow("Unauthenticated");
  });

  test("Logged-in standard USER cannot access company deletion", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Company", createdAt: Date.now() });
    });
    
    // 1. Create a fake standard user in our simulated database
    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Malicious Standard User",
        email: "hacker@test.com",
        role: "USER", // Explicitly NOT an Admin
        createdAt: Date.now()
      });
    });

    // 2. Attach this user's identity token to our test connection
    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    // 3. Actively attempt to hack the admin route
    // 4. Assert that Convex successfully defends and throws "Unauthorized"
    await expect(
      maliciousClient.mutation(api.companies.deleteCompany, { id: companyId })
    ).rejects.toThrow("Unauthorized");

    // Also assert they cannot edit the Tenant's Swarm Intelligence Context
    await expect(
      maliciousClient.mutation(api.companies.updateCompanyPrompt, { id: companyId, systemPrompt: "Hacked!" })
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.companies.updateCompanyDescription, { id: companyId, description: "Hacked!" })
    ).rejects.toThrow("Unauthorized");
  });

  test("Logged-in ADMIN cannot access system-level company deletion", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Company", createdAt: Date.now() });
    });

    // 1. Create a fake Admin user (not SUPER_ADMIN)
    const adminUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Standard Admin User",
        email: "admin@test.com",
        role: "ADMIN", // Expected to fail because deleteCompany requires SUPER_ADMIN
        createdAt: Date.now()
      });
    });

    const adminClient = t.withIdentity({ subject: adminUserId });

    await expect(
      adminClient.mutation(api.companies.deleteCompany, { id: companyId })
    ).rejects.toThrow("Unauthorized");
  });

});
