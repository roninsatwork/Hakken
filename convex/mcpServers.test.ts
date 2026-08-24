import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";

/**
 * Tenant isolation for connected tool servers.
 *
 * This is the proof phase 1 of the tool-server plan exists to produce. A tool
 * server is somebody's account reached with somebody's credential, so the
 * question "can one workspace see another's" has to be answered by a test
 * rather than by reading the code and believing it.
 *
 * It matters more here than for most tables. Agents are global by design, so
 * the separation cannot come from an agent belonging to a company — it has to
 * come from the connection, which is what these tests pin down.
 */

async function twoCompaniesWithAdmins() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const companyAId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Company A",
      createdAt: Date.now(),
      enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));

  const companyBId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Company B",
      createdAt: Date.now(),
      enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));

  const adminAId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "adminA@test.com", role: "ADMIN", companyId: companyAId }));

  const adminBId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "adminB@test.com", role: "ADMIN", companyId: companyBId }));

  return {
    t,
    companyAId,
    companyBId,
    adminA: t.withIdentity({ subject: adminAId }),
    adminB: t.withIdentity({ subject: adminBId }),
  };
}

describe("connected tool servers", () => {
  test("a company sees only its own servers", async () => {
    const { adminA, adminB } = await twoCompaniesWithAdmins();

    await adminA.mutation(api.mcpServers.createServer, {
      name: "A's finance system",
      url: "https://a-finance.example.com/mcp",
      authMode: "NONE",
    });
    await adminB.mutation(api.mcpServers.createServer, {
      name: "B's warehouse",
      url: "https://b-warehouse.example.com/mcp",
      authMode: "NONE",
    });

    const listA = await adminA.query(api.mcpServers.listServers, {});
    const listB = await adminB.query(api.mcpServers.listServers, {});

    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("A's finance system");
    expect(listB).toHaveLength(1);
    expect(listB[0].name).toBe("B's warehouse");
  });

  test("one company cannot read, change, or delete another's server", async () => {
    const { adminA, adminB } = await twoCompaniesWithAdmins();

    const serverAId = await adminA.mutation(api.mcpServers.createServer, {
      name: "A's finance system",
      url: "https://a-finance.example.com/mcp",
      authMode: "NONE",
    });

    await expect(adminB.query(api.mcpServers.getServer, { id: serverAId }))
      .rejects.toThrowError(/Unauthorized/);

    await expect(adminB.mutation(api.mcpServers.updateServer, {
      id: serverAId,
      url: "https://attacker.example.com/mcp",
    })).rejects.toThrowError(/Unauthorized/);

    await expect(adminB.mutation(api.mcpServers.setServerStatus, {
      id: serverAId,
      status: "CONNECTED",
    })).rejects.toThrowError(/Unauthorized/);

    await expect(adminB.mutation(api.mcpServers.deleteServer, { id: serverAId }))
      .rejects.toThrowError(/Unauthorized/);

    // And A's server is untouched by any of it.
    const stillThere = await adminA.query(api.mcpServers.getServer, { id: serverAId });
    expect(stillThere.url).toBe("https://a-finance.example.com/mcp");
    expect(stillThere.status).toBe("DISABLED");
  });

  test("a signed-out caller cannot reach any of it", async () => {
    const { t } = await twoCompaniesWithAdmins();

    await expect(t.query(api.mcpServers.listServers, {})).rejects.toThrowError();
    await expect(t.mutation(api.mcpServers.createServer, {
      name: "Nobody's server",
      url: "https://example.com/mcp",
      authMode: "NONE",
    })).rejects.toThrowError();
  });

  test("a new server starts switched off", async () => {
    // Nothing should begin reaching outward because a form was submitted.
    const { adminA } = await twoCompaniesWithAdmins();

    const id = await adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "NONE",
    });

    expect((await adminA.query(api.mcpServers.getServer, { id })).status).toBe("DISABLED");
  });

  test("the same name cannot be used twice in one company, but can across two", async () => {
    const { adminA, adminB } = await twoCompaniesWithAdmins();

    await adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://one.example.com/mcp",
      authMode: "NONE",
    });

    await expect(adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://two.example.com/mcp",
      authMode: "NONE",
    })).rejects.toThrowError(/already connected/);

    // One workspace's naming is no business of another's.
    await expect(adminB.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://three.example.com/mcp",
      authMode: "NONE",
    })).resolves.toBeDefined();
  });

  test("an unsafe address is refused on the way in and on the way through", async () => {
    const { adminA } = await twoCompaniesWithAdmins();

    await expect(adminA.mutation(api.mcpServers.createServer, {
      name: "Metadata",
      url: "https://169.254.169.254/latest/meta-data",
      authMode: "NONE",
    })).rejects.toThrowError(/private network address/);

    // "It passed when it was created" is not a check — an update re-validates.
    const id = await adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "NONE",
    });

    await expect(adminA.mutation(api.mcpServers.updateServer, {
      id,
      url: "http://127.0.0.1:8080",
    })).rejects.toThrowError();

    expect((await adminA.query(api.mcpServers.getServer, { id })).url)
      .toBe("https://finance.example.com/mcp");
  });

  test("a credential is stored as a reference, never as itself", async () => {
    const { adminA } = await twoCompaniesWithAdmins();

    await expect(adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "SECRET_REF",
      secretRef: "sk-thisisarealtokenpasted",
    })).rejects.toThrowError(/raw secret value/);

    const id = await adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "SECRET_REF",
      secretRef: "vault/acme/mcp-token",
    });

    expect((await adminA.query(api.mcpServers.getServer, { id })).secretRef)
      .toBe("vault/acme/mcp-token");
  });

  test("a server can be renamed, switched on, and disconnected", async () => {
    const { adminA } = await twoCompaniesWithAdmins();

    const id = await adminA.mutation(api.mcpServers.createServer, {
      name: "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "NONE",
    });

    await adminA.mutation(api.mcpServers.updateServer, { id, name: "Finance system" });
    await adminA.mutation(api.mcpServers.setServerStatus, { id, status: "CONNECTED" });

    const updated = await adminA.query(api.mcpServers.getServer, { id });
    expect(updated.name).toBe("Finance system");
    expect(updated.status).toBe("CONNECTED");

    await adminA.mutation(api.mcpServers.deleteServer, { id });
    expect(await adminA.query(api.mcpServers.listServers, {})).toHaveLength(0);
  });
});
