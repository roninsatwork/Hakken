import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

describe("agent skills", () => {
  test("re-uploading an edited SKILL.md updates the skill it created instead of adding another", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const buildMarkdown = (instruction: string) => [
      "---",
      "name: Client Follow-up",
      "description: Draft follow-up messages.",
      "category: outreach",
      "riskLevel: low",
      "---",
      "# Client Follow-up",
      "",
      "## Instructions",
      "",
      instruction,
    ].join("\n");

    const importFile = async (markdown: string) => {
      const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
        filename: "SKILL.md",
        markdown,
      });
      return await client.mutation(api.agentSkills.importSkillMarkdown, {
        sourceFilename: preview.sourceFilename,
        sourceHash: preview.sourceHash,
        sourceMarkdown: markdown,
        name: preview.name,
        description: preview.description,
        category: preview.category,
        riskLevel: preview.riskLevel,
        instruction: preview.instruction,
        requiredToolMappingsJson: preview.requiredToolMappingsJson,
        recommendedToolMappingsJson: preview.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: preview.suggestedEvalFixturesJson,
      });
    };

    const first = await importFile(buildMarkdown("Send a short follow-up within two working days."));
    expect(first.outcome).toBe("CREATED");

    // The same bytes again: nothing to record, and no new version.
    const unchanged = await importFile(buildMarkdown("Send a short follow-up within two working days."));
    expect(unchanged.outcome).toBe("UNCHANGED");
    expect(unchanged.skillId).toBe(first.skillId);
    expect(unchanged.skillVersionId).toBe(first.skillVersionId);

    // An edited file updates that same skill and earns a second version.
    const edited = await importFile(buildMarkdown("Send a short follow-up within one working day."));
    expect(edited.outcome).toBe("UPDATED");
    expect(edited.skillId).toBe(first.skillId);
    expect(edited.skillVersionId).not.toBe(first.skillVersionId);

    const state = await t.run(async (ctx) => {
      const skills = await ctx.db.query("agentSkills").collect();
      const skill = await ctx.db.get(first.skillId);
      const versions = await ctx.db
        .query("agentSkillVersions")
        .withIndex("by_skill_created", (q) => q.eq("skillId", first.skillId))
        .collect();
      return { skillCount: skills.length, skill, versionNumbers: versions.map((entry) => entry.versionNumber).sort() };
    });

    // The point of the whole change: one skill, not three.
    expect(state.skillCount).toBe(1);
    expect(state.versionNumbers).toEqual([1, 2]);
    expect(state.skill?.instruction).toContain("one working day");
    expect(state.skill?.sourceFilename).toBe("SKILL.md");
    expect(state.skill?.sourceMarkdown).toContain("one working day");
  });

  test("re-uploading does not pull a live skill back to draft, and skips archived namesakes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const markdown = (instruction: string) => [
      "---",
      "name: Risk Monitoring",
      "riskLevel: low",
      "---",
      "# Risk Monitoring",
      "",
      "## Instructions",
      "",
      instruction,
    ].join("\n");

    const importFile = async (body: string) => {
      const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
        filename: "SKILL.md",
        markdown: markdown(body),
      });
      return await client.mutation(api.agentSkills.importSkillMarkdown, {
        sourceFilename: preview.sourceFilename,
        sourceHash: preview.sourceHash,
        sourceMarkdown: markdown(body),
        name: preview.name,
        description: preview.description,
        category: preview.category,
        riskLevel: preview.riskLevel,
        instruction: preview.instruction,
        requiredToolMappingsJson: preview.requiredToolMappingsJson,
        recommendedToolMappingsJson: preview.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: preview.suggestedEvalFixturesJson,
      });
    };

    const created = await importFile("Escalate material changes with a severity and a reason.");
    await t.run(async (ctx) => await ctx.db.patch(created.skillId, { status: "ACTIVE" }));

    const updated = await importFile("Escalate material changes within one hour, with a severity.");
    expect(updated.skillId).toBe(created.skillId);
    // A live skill staying live is the whole point: agents keep working.
    await expect(t.run(async (ctx) => (await ctx.db.get(created.skillId))?.status)).resolves.toBe("ACTIVE");

    // Archiving is a decision; the next upload must not silently undo it.
    await client.mutation(api.agentSkills.archiveSkill, { skillId: created.skillId });
    const afterArchive = await importFile("Escalate material changes within one hour, with a severity.");
    expect(afterArchive.outcome).toBe("CREATED");
    expect(afterArchive.skillId).not.toBe(created.skillId);
    await expect(t.run(async (ctx) => (await ctx.db.get(created.skillId))?.status)).resolves.toBe("ARCHIVED");
  });

  test("the skill picker pages past the catalogue ceiling instead of hiding skills", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
      const now = Date.now();
      // Past SKILL_CATALOG_LIMIT (250): the old fetch-and-filter picker could
      // not reach these at all, and said nothing about it.
      for (let index = 0; index < 260; index += 1) {
        await ctx.db.insert("agentSkills", {
          name: `Skill ${String(index).padStart(3, "0")}`,
          category: "GENERAL",
          status: "ACTIVE",
          riskLevel: "LOW",
          instruction: "Do the thing.",
          createdBy: adminId,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      // A distinctively named skill created last, so it sits well past the old
      // 250 ceiling: the real question is whether search can still reach it.
      await ctx.db.insert("agentSkills", {
        name: "Invoice Reconciliation",
        category: "FINANCE",
        status: "ACTIVE",
        riskLevel: "LOW",
        instruction: "Reconcile invoices.",
        createdBy: adminId,
        createdAt: now + 500,
        updatedAt: now + 500,
      });
      await ctx.db.insert("agentSkills", {
        name: "Archived Helper",
        category: "GENERAL",
        status: "ARCHIVED",
        riskLevel: "LOW",
        instruction: "Retired.",
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    let cursor: string | null = null;
    let seen = 0;
    let pages = 0;
    do {
      const result: { page: unknown[]; isDone: boolean; continueCursor: string } = await client.query(
        api.agentSkills.searchActiveSkills,
        { paginationOpts: { numItems: 50, cursor } },
      );
      seen += result.page.length;
      pages += 1;
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor && pages < 20);

    // Every active skill is reachable, and the archived one is not offered.
    expect(seen).toBe(261);

    const searched = await client.query(api.agentSkills.searchActiveSkills, {
      paginationOpts: { numItems: 25, cursor: null },
      searchTerm: "Invoice",
    });
    expect(searched.page.map((skill) => skill.name)).toContain("Invoice Reconciliation");

    const skillIds = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("agentSkills")
        .withIndex("by_status_created", (q) => q.eq("status", "ACTIVE"))
        .take(2);
      return rows.map((row) => row._id);
    });
    const excluded = await client.query(api.agentSkills.searchActiveSkills, {
      paginationOpts: { numItems: 50, cursor: null },
      excludeSkillIds: skillIds,
    });

    // Filters must narrow in the database. Applied to the page after it
    // arrived, asking for 50 finance skills out of 261 would return whatever
    // few happened to be in the first 50 rows — the exact fault this pass is
    // removing elsewhere.
    const financeOnly = await client.query(api.agentSkills.searchActiveSkills, {
      paginationOpts: { numItems: 50, cursor: null },
      category: "FINANCE",
    });
    expect(financeOnly.page.map((skill) => skill.name)).toEqual(["Invoice Reconciliation"]);

    const lowRiskFinance = await client.query(api.agentSkills.searchActiveSkills, {
      paginationOpts: { numItems: 50, cursor: null },
      searchTerm: "Invoice",
      category: "FINANCE",
      riskLevel: "LOW",
    });
    expect(lowRiskFinance.page.map((skill) => skill.name)).toEqual(["Invoice Reconciliation"]);

    const wrongRisk = await client.query(api.agentSkills.searchActiveSkills, {
      paginationOpts: { numItems: 50, cursor: null },
      searchTerm: "Invoice",
      riskLevel: "HIGH",
    });
    expect(wrongRisk.page).toEqual([]);
    // Already-attached skills are not offered a second time.
    expect(excluded.page.map((skill) => skill._id)).not.toContain(skillIds[0]);
    expect(excluded.page.map((skill) => skill._id)).not.toContain(skillIds[1]);
  });

  test("the health panel reads a rollup, reports its age, and never passes a truncated walk off as a total", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    // Nothing measured yet. Five confident zeros would be a lie of a different
    // kind, so the panel is told the difference.
    const beforeAnyRebuild = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(beforeAnyRebuild.computedAt).toBeNull();
    expect(beforeAnyRebuild.totals.skills).toBe(0);

    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("agentSkills", {
          name: `Counted ${index}`,
          category: "GENERAL",
          status: index === 0 ? "DRAFT" : "ACTIVE",
          riskLevel: index === 1 ? "HIGH" : "LOW",
          instruction: "Do the thing.",
          createdBy: adminId,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    // Still zero: the read does no counting of its own. That is the point —
    // the old panel totalled the whole catalogue on every page load.
    const beforeRebuild = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(beforeRebuild.totals.skills).toBe(0);

    const rebuild = await client.mutation(api.agentSkills.rebuildSkillCatalogRollup, {});
    expect(rebuild).toMatchObject({ skillsCounted: 3, isPartial: false });

    const afterRebuild = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(afterRebuild.totals).toMatchObject({
      skills: 3,
      activeSkills: 2,
      draftSkills: 1,
      highRiskSkills: 1,
    });
    expect(afterRebuild.computedAt).toBeTypeOf("number");
    expect(afterRebuild.isPartial).toBe(false);
    expect(afterRebuild.skillsCounted).toBe(3);
  });

  test("a catalogue larger than one rebuild can walk is reported as partial, not as the whole truth", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
      const now = Date.now();
      // One past the walk limit of 250.
      for (let index = 0; index < 251; index += 1) {
        await ctx.db.insert("agentSkills", {
          name: `Bulk ${index}`,
          category: "GENERAL",
          status: "ACTIVE",
          riskLevel: "LOW",
          instruction: "Do the thing.",
          createdBy: adminId,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    const rebuild = await client.mutation(api.agentSkills.rebuildSkillCatalogRollup, {});
    // The number is honest about being incomplete rather than presenting 250 as
    // the size of a 251-skill catalogue.
    expect(rebuild).toMatchObject({ skillsCounted: 250, isPartial: true });

    const analytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(analytics.isPartial).toBe(true);
    expect(analytics.skillsCounted).toBe(250);
  });

  test("searching with a status filter fills the page instead of thinning it after the fact", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
      const now = Date.now();
      // 30 archived and 10 active, all matching the same search word. Paginated
      // first and filtered afterwards, the opening page of 10 would be almost
      // entirely archived and would return one or two actives — indistinguishable
      // from "there are only two".
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("agentSkills", {
          name: `Reconciliation Archived ${index}`,
          category: "FINANCE",
          status: "ARCHIVED",
          riskLevel: "LOW",
          instruction: "Retired.",
          createdBy: adminId,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      for (let index = 0; index < 10; index += 1) {
        await ctx.db.insert("agentSkills", {
          name: `Reconciliation Live ${index}`,
          category: "FINANCE",
          status: "ACTIVE",
          riskLevel: "LOW",
          instruction: "Reconcile.",
          createdBy: adminId,
          createdAt: now + 100 + index,
          updatedAt: now + 100 + index,
        });
      }
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    const page = await client.query(api.agentSkills.getPaginatedSkills, {
      paginationOpts: { numItems: 10, cursor: null },
      searchTerm: "Reconciliation",
      status: "ACTIVE",
    });

    expect(page.page).toHaveLength(10);
    expect(page.page.every((skill) => skill.status === "ACTIVE")).toBe(true);
  });

  test("deleting a skill takes its versions and agent attachments with it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const markdown = [
      "---",
      "name: Temporary Skill",
      "---",
      "# Temporary Skill",
      "",
      "## Instructions",
      "",
      "Do the thing until told otherwise.",
    ].join("\n");
    const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "SKILL.md",
      markdown,
    });
    const imported = await client.mutation(api.agentSkills.importSkillMarkdown, {
      sourceFilename: preview.sourceFilename,
      sourceHash: preview.sourceHash,
      sourceMarkdown: markdown,
      name: preview.name,
      description: preview.description,
      category: preview.category,
      riskLevel: preview.riskLevel,
      instruction: preview.instruction,
      requiredToolMappingsJson: preview.requiredToolMappingsJson,
      recommendedToolMappingsJson: preview.recommendedToolMappingsJson,
      suggestedEvalFixturesJson: preview.suggestedEvalFixturesJson,
    });

    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Helper",
        modelId: "test-provider-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(imported.skillId, { status: "ACTIVE" });
    });
    await client.mutation(api.agentSkills.bindSkillToAgent, { agentId, skillId: imported.skillId });

    const result = await client.mutation(api.agentSkills.deleteSkill, { skillId: imported.skillId });
    // The reader is told the consequence rather than being blocked by it.
    expect(result).toMatchObject({ detachedAgents: 1 });

    const after = await t.run(async (ctx) => {
      const skill = await ctx.db.get(imported.skillId);
      const versions = await ctx.db.query("agentSkillVersions").collect();
      const bindings = await ctx.db.query("agentSkillBindings").collect();
      const audit = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "DELETE_AGENT_SKILL"))
        .first();
      return { skill, versionCount: versions.length, bindingCount: bindings.length, audit };
    });

    // Nothing left pointing at a skill that no longer exists.
    expect(after.skill).toBeNull();
    expect(after.versionCount).toBe(0);
    expect(after.bindingCount).toBe(0);
    // The record of what was removed outlives the rows.
    expect(after.audit).not.toBeNull();
    expect(after.audit?.metadata).toContain("Temporary Skill");
  });

  test("a company follows the central skill because it links to it, not because anything syncs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const build = (instruction: string) => [
      "---",
      "name: Client Follow-up",
      "---",
      "# Client Follow-up",
      "",
      "## Instructions",
      "",
      instruction,
    ].join("\n");

    const upload = async (instruction: string) => {
      const markdown = build(instruction);
      const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
        filename: "SKILL.md",
        markdown,
      });
      return await client.mutation(api.agentSkills.importSkillMarkdown, {
        sourceFilename: preview.sourceFilename,
        sourceHash: preview.sourceHash,
        sourceMarkdown: markdown,
        name: preview.name,
        description: preview.description,
        category: preview.category,
        riskLevel: preview.riskLevel,
        instruction: preview.instruction,
        requiredToolMappingsJson: preview.requiredToolMappingsJson,
        recommendedToolMappingsJson: preview.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: preview.suggestedEvalFixturesJson,
      });
    };

    const created = await upload("Follow up within two working days.");
    await t.run(async (ctx) => await ctx.db.patch(created.skillId, { status: "ACTIVE" }));

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Linked Co", createdAt: Date.now() });
      // The company row deliberately keeps stale text of its own. Nothing should
      // read it while the link is intact.
      await ctx.db.insert("companySkills", {
        companyId,
        sourceAgentSkillId: created.skillId,
        name: "Stale name",
        category: "IMPORTED",
        status: "ACTIVE",
        riskLevel: "LOW",
        instruction: "Stale instruction that must never reach a model.",
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return companyId;
    });

    await upload("Follow up within one working day.");

    const runtime = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId });
    });

    // The company's AI reads the file, not the row beside it, and no sync ran.
    expect(runtime.skills).toHaveLength(1);
    expect(runtime.skills[0].name).toBe("Client Follow-up");
    expect(runtime.skills[0].instruction).toContain("one working day");
    expect(runtime.skills[0].instruction).not.toContain("Stale");
  });

  test("re-uploading a file moves the agents using that skill onto it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const build = (instruction: string) => [
      "---",
      "name: Document Extraction",
      "---",
      "# Document Extraction",
      "",
      "## Instructions",
      "",
      instruction,
    ].join("\n");

    const upload = async (instruction: string) => {
      const markdown = build(instruction);
      const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
        filename: "SKILL.md",
        markdown,
      });
      return await client.mutation(api.agentSkills.importSkillMarkdown, {
        sourceFilename: preview.sourceFilename,
        sourceHash: preview.sourceHash,
        sourceMarkdown: markdown,
        name: preview.name,
        description: preview.description,
        category: preview.category,
        riskLevel: preview.riskLevel,
        instruction: preview.instruction,
        requiredToolMappingsJson: preview.requiredToolMappingsJson,
        recommendedToolMappingsJson: preview.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: preview.suggestedEvalFixturesJson,
      });
    };

    const created = await upload("Extract only facts supported by the source.");
    await t.run(async (ctx) => await ctx.db.patch(created.skillId, { status: "ACTIVE" }));

    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Extractor",
        modelId: "test-provider-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await client.mutation(api.agentSkills.bindSkillToAgent, { agentId, skillId: created.skillId });

    const updated = await upload("Extract only facts supported by the source, and cite each one.");
    expect(updated.outcome).toBe("UPDATED");
    // The agent follows the file rather than waiting for someone to notice an
    // "out of date" badge and press upgrade.
    expect(updated.refreshedAgents).toBe(1);

    const binding = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", created.skillId))
        .collect();
      const version = rows[0] ? await ctx.db.get(rows[0].skillVersionId) : null;
      const allVersions = await ctx.db
        .query("agentSkillVersions")
        .withIndex("by_skill_created", (q) => q.eq("skillId", created.skillId))
        .collect();
      const latest = Math.max(...allVersions.map((entry) => entry.versionNumber));
      return { count: rows.length, versionNumber: version?.versionNumber, latest, snapshot: version?.snapshotJson };
    });

    expect(binding.count).toBe(1);
    // On the newest snapshot, whatever number that happens to be — attaching a
    // skill snapshots too, so the count is not worth asserting.
    expect(binding.versionNumber).toBe(binding.latest);
    expect(binding.snapshot).toContain("cite each one");
  });

  test("an agent and a company each stop at two skills, and say so", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    const { agentId, companyId, skillIds } = await t.run(async (ctx) => {
      const now = Date.now();
      const agentId = await ctx.db.insert("agents", {
        name: "Helper",
        modelId: "test-provider-model",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const companyId = await ctx.db.insert("companies", { name: "Capped Co", createdAt: now });
      const skillIds = [];
      for (let index = 0; index < 3; index += 1) {
        skillIds.push(await ctx.db.insert("agentSkills", {
          name: `Skill ${index}`,
          category: "GENERAL",
          status: "ACTIVE",
          riskLevel: "LOW",
          instruction: "Do the thing.",
          createdBy: adminId,
          createdAt: now + index,
          updatedAt: now + index,
        }));
      }
      return { agentId, companyId, skillIds };
    });

    await client.mutation(api.agentSkills.bindSkillToAgent, { agentId, skillId: skillIds[0] });
    await client.mutation(api.agentSkills.bindSkillToAgent, { agentId, skillId: skillIds[1] });
    // The third is refused rather than accepted and then ignored.
    await expect(
      client.mutation(api.agentSkills.bindSkillToAgent, { agentId, skillId: skillIds[2] }),
    ).rejects.toThrow(/can have 2 skills/);

    await client.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: skillIds[0] });
    await client.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: skillIds[1] });
    await expect(
      client.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: skillIds[2] }),
    ).rejects.toThrow(/can have 2 skills/);

    // Re-adding one it already has is not a third skill.
    await expect(
      client.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: skillIds[0] }),
    ).resolves.toBeDefined();
  });

  test("no skills at all is a normal state, not a broken one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" });
    });

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "No Skills Co", createdAt: Date.now() });
    });
    void adminId;

    const runtime = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId });
    });

    expect(runtime.skills).toEqual([]);
    expect(runtime.isCapped).toBe(false);
  });

  test("SKILL.md preview handles frontmatter, dependencies, connectors, examples, and duplicate warnings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const now = Date.now();
      await ctx.db.insert("aiTools", {
        name: "Invoice Reader",
        description: "Reads invoice source documents.",
        handlerMapping: "finance.invoice.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        createdAt: now,
        createdBy: adminId,
      });
      await ctx.db.insert("aiTools", {
        name: "Slack Notify",
        description: "Sends governed Slack notifications.",
        handlerMapping: "slack.notify",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        isActive: true,
        createdAt: now,
        createdBy: adminId,
      });
      await ctx.db.insert("agentSkills", {
        name: "Invoice Ops",
        description: "Existing duplicate skill.",
        category: "FINANCE",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Existing instruction.",
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "invoice-skill.md",
      markdown: [
        "---",
        "name: \"Invoice Ops\"",
        "category: finance",
        "risk_level: high",
        "---",
        "# Invoice Ops",
        "",
        "Extract invoice facts, reconcile totals, and prepare operator-ready exception notes.",
        "",
        "## Workflow",
        "",
        "Read the invoice source, identify supplier, due date, tax, and total amount.",
        "Before any external write or notification, pause for human approval and show the exact action.",
        "",
        "## Dependencies",
        "",
        "- `finance.invoice.read`",
        "",
        "## Connectors",
        "",
        "- `slack.notify`",
        "",
        "## Examples",
        "",
        "- Given a two-line invoice, return supplier, due date, net amount, tax, and total.",
      ].join("\n"),
    });

    expect(preview).toMatchObject({
      sourceFilename: "invoice-skill.md",
      name: "Invoice Ops",
      description: "Extract invoice facts, reconcile totals, and prepare operator-ready exception notes.",
      category: "FINANCE",
      riskLevel: "HIGH",
      requiredToolMappingsJson: "[\"finance.invoice.read\"]",
      recommendedToolMappingsJson: "[\"slack.notify\"]",
      validation: {
        errors: [],
      },
    });
    expect(preview.instruction).toContain("Workflow");
    expect(preview.instruction).toContain("pause for human approval");
    expect(JSON.parse(preview.suggestedEvalFixturesJson)).toHaveLength(1);
    expect(preview.validation.warnings).toContain("A skill named \"Invoice Ops\" already exists.");
    expect(preview.validation.warnings).not.toContain("High-risk language was detected without explicit approval guidance.");
    expect(preview.validation.warnings.some((warning) => warning.includes("Some tool hints do not match active Sonae tool mappings"))).toBe(false);
  });

  test("starter skills seed idempotently, bind to agents, seed evals, and gate high-risk activation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });

      await ctx.db.insert("aiModels", {
        modelId: "default-agent-model",
        displayName: "Default Agent Model",
        isEnabled: true,
        isDefault: true,
        supportedUseCases: ["agent"],
        lastSyncedAt: Date.now(),
      });

      return userId;
    });

    const client = t.withIdentity({ subject: adminId });
    const agentId = await client.mutation(api.agents.createAgent, {
      name: "Skill Regression Agent",
      description: "Tests reusable skill behavior.",
    });
    await client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: false,
      releaseGateMode: "NONE",
    });

    const firstSeed = await client.mutation(api.agentSkills.seedStarterSkills, {});
    expect(firstSeed).toMatchObject({
      createdCount: 6,
      skippedCount: 0,
    });

    const secondSeed = await client.mutation(api.agentSkills.seedStarterSkills, {});
    expect(secondSeed).toMatchObject({
      createdCount: 0,
      skippedCount: 6,
    });

    const activeSkills = await client.query(api.agentSkills.getActiveSkills, {});
    expect(activeSkills.map((skill) => skill.name).sort()).toEqual([
      "Approval Handoff",
      "Client Follow-up",
      "Data Enrichment",
      "Document Extraction",
      "Research Briefing",
      "Risk Monitoring",
    ]);

    const highRiskSkill = activeSkills.find((skill) => skill.name === "Risk Monitoring");
    expect(highRiskSkill).toBeDefined();
    if (!highRiskSkill) throw new Error("Expected Risk Monitoring starter skill");

    const bindingResult = await client.mutation(api.agentSkills.bindSkillToAgent, {
      agentId,
      skillId: highRiskSkill._id,
      seedEvalFixtures: true,
    });
    expect(bindingResult).toMatchObject({
      readiness: {
        missingRequiredToolMappings: [],
      },
    });
    expect(bindingResult.seededEvalFixtureIds).toHaveLength(2);

    await t.run(async (ctx) => {
      const now = Date.now();
      const sourceRunId = await ctx.db.insert("agentRuns", {
        agentId,
        userId: adminId,
        triggerType: "MANUAL",
        objective: "Review risk monitoring learning.",
        status: "FAILED",
        startedAt: now,
        completedAt: now + 10,
        updatedAt: now + 10,
        error: "Risk threshold was unclear.",
      });
      await ctx.db.insert("agentImprovementSuggestions", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        createdBy: adminId,
        type: "SKILL_INSTRUCTION_CHANGE",
        title: "Review shared skill guidance: Risk Monitoring",
        description: "Add clearer confidence thresholds before escalating material risk.",
        proposedPatchJson: JSON.stringify({ appendSkillInstruction: "Add confidence thresholds." }),
        riskLevel: "HIGH",
        status: "PROPOSED",
        createdAt: now + 20,
        updatedAt: now + 20,
      });
      await ctx.db.insert("agentImprovementSuggestions", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        createdBy: adminId,
        type: "SKILL_INSTRUCTION_CHANGE",
        title: "Applied risk monitoring guidance",
        description: "A previous risk-monitoring learning note was applied.",
        proposedPatchJson: JSON.stringify({ appendSkillInstruction: "Applied note." }),
        riskLevel: "MEDIUM",
        status: "APPLIED",
        createdAt: now + 30,
        updatedAt: now + 30,
      });
      await ctx.db.insert("agentMemoryCandidates", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        proposedBy: "SYSTEM_REFLECTION",
        kind: "FACT",
        content: "Risk updates should include source credibility.",
        normalizedContent: "risk updates should include source credibility.",
        confidence: 0.74,
        riskLevel: "MEDIUM",
        status: "PROPOSED",
        createdBy: adminId,
        createdAt: now + 40,
        updatedAt: now + 40,
      });
      await ctx.db.insert("agentMemoryCandidates", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        proposedBy: "SYSTEM_REFLECTION",
        kind: "SUMMARY",
        content: "Rejected vague risk-monitoring memory.",
        normalizedContent: "rejected vague risk-monitoring memory.",
        confidence: 0.4,
        riskLevel: "LOW",
        status: "REJECTED",
        createdBy: adminId,
        createdAt: now + 50,
        updatedAt: now + 50,
      });
    });

    const learningAnalytics = await client.query(api.agentSkills.getSkillLearningAnalytics, {
      skillId: highRiskSkill._id,
    });
    expect(learningAnalytics.totals).toMatchObject({
      suggestions: 2,
      openSuggestions: 1,
      appliedSuggestions: 1,
      rejectedSuggestions: 0,
      memoryCandidates: 2,
      openMemoryCandidates: 1,
      appliedMemoryCandidates: 0,
      rejectedMemoryCandidates: 1,
      highRiskOpenItems: 1,
    });
    expect(learningAnalytics.recentLearning[0]).toMatchObject({
      kind: "memory",
      status: "REJECTED",
      title: "summary memory candidate",
    });
    expect(learningAnalytics.recentLearning).toContainEqual(expect.objectContaining({
      kind: "suggestion",
      status: "PROPOSED",
      title: "Review shared skill guidance: Risk Monitoring",
    }));

    const cloneResult = await client.mutation(api.agentSkills.cloneSkill, {
      skillId: highRiskSkill._id,
      name: "Risk Monitoring Variant",
    });
    const cloneState = await t.run(async (ctx) => {
      const clonedSkill = await ctx.db.get(cloneResult.skillId);
      const clonedVersion = await ctx.db.get(cloneResult.skillVersionId);
      const clonedBindings = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", cloneResult.skillId))
        .collect();
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), cloneResult.skillId))
        .first();
      return { clonedSkill, clonedVersion, clonedBindings, auditLog };
    });
    expect(cloneState.clonedSkill).toMatchObject({
      name: "Risk Monitoring Variant",
      description: highRiskSkill.description,
      category: highRiskSkill.category,
      status: "DRAFT",
      riskLevel: highRiskSkill.riskLevel,
      instruction: highRiskSkill.instruction,
      suggestedEvalFixturesJson: highRiskSkill.suggestedEvalFixturesJson,
    });
    expect(cloneState.clonedSkill?.requiredToolMappingsJson).toBe(highRiskSkill.requiredToolMappingsJson);
    expect(cloneState.clonedVersion).toMatchObject({
      skillId: cloneResult.skillId,
      versionNumber: 1,
    });
    expect(cloneState.clonedBindings).toHaveLength(0);
    expect(cloneState.auditLog).toMatchObject({
      actionType: "CLONE_AGENT_SKILL",
      entityType: "agentSkills",
    });

    const exportedBundle = await client.query(api.agentSkills.exportSkillBundle, {
      skillId: highRiskSkill._id,
    });
    expect(exportedBundle.filename).toBe("risk-monitoring-bundle.json");
    expect(exportedBundle.bundle).toMatchObject({
      format: "sonae.agentSkillBundle.v1",
      skill: {
        name: "Risk Monitoring",
        riskLevel: "HIGH",
        suggestedEvalFixtures: expect.any(Array),
      },
    });
    const importResult = await client.mutation(api.agentSkills.importSkillBundle, {
      bundleJson: exportedBundle.bundleJson,
      name: "Imported Risk Monitoring",
    });
    const importState = await t.run(async (ctx) => {
      const importedSkill = await ctx.db.get(importResult.skillId);
      const importedVersion = await ctx.db.get(importResult.skillVersionId);
      const importedBindings = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", importResult.skillId))
        .collect();
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), importResult.skillId))
        .first();
      return { importedSkill, importedVersion, importedBindings, auditLog };
    });
    expect(importState.importedSkill).toMatchObject({
      name: "Imported Risk Monitoring",
      status: "DRAFT",
      riskLevel: highRiskSkill.riskLevel,
      instruction: highRiskSkill.instruction,
      suggestedEvalFixturesJson: highRiskSkill.suggestedEvalFixturesJson,
    });
    expect(importState.importedVersion).toMatchObject({
      skillId: importResult.skillId,
      versionNumber: 1,
    });
    expect(importState.importedBindings).toHaveLength(0);
    expect(importState.auditLog).toMatchObject({
      actionType: "IMPORT_AGENT_SKILL_BUNDLE",
      entityType: "agentSkills",
    });

    const markdownPreview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "SKILL.md",
      markdown: [
        "---",
        "name: Browser QA",
        "description: Verify browser workflows before shipping.",
        "category: qa",
        "riskLevel: medium",
        "---",
        "# Browser QA",
        "",
        "## Instructions",
        "",
        "Use browser checks to verify local UI behavior and report visible regressions.",
        "",
        "## Required tools",
        "",
        "- `browser.open`",
      ].join("\n"),
    });
    expect(markdownPreview).toMatchObject({
      sourceFilename: "SKILL.md",
      name: "Browser QA",
      description: "Verify browser workflows before shipping.",
      category: "QA",
      riskLevel: "MEDIUM",
      instruction: "Instructions\nUse browser checks to verify local UI behavior and report visible regressions.",
      requiredToolMappingsJson: "[\"browser.open\"]",
      validation: {
        errors: [],
      },
    });
    expect(markdownPreview.validation.warnings).toContain("No examples or eval fixtures were found.");

    const riskyMarkdownPreview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "risky.SKILL.md",
      markdown: [
        "# Client Dispatch",
        "",
        "Dispatch client messages and delete old ACME records using the api key from the tenant note.",
        "",
        "## Required tools",
        "",
        "- `client.dispatch.send`",
      ].join("\n"),
    });
    expect(riskyMarkdownPreview).toMatchObject({
      name: "Client Dispatch",
      riskLevel: "HIGH",
      requiredToolMappingsJson: "[\"client.dispatch.send\"]",
    });
    expect(riskyMarkdownPreview.validation.warnings).toContain("High-risk language was detected without explicit approval guidance.");
    expect(riskyMarkdownPreview.validation.warnings).toContain("The source may contain tenant-specific or sensitive facts.");
    expect(riskyMarkdownPreview.validation.warnings).toContain("Some tool hints do not match active Sonae tool mappings: client.dispatch.send.");
    expect(riskyMarkdownPreview.validation.suggestions).toContain("Add approval handoff language for side-effecting actions.");

    const markdownImport = await client.mutation(api.agentSkills.importSkillMarkdown, {
      sourceFilename: markdownPreview.sourceFilename,
      sourceHash: markdownPreview.sourceHash,
      name: markdownPreview.name,
      description: markdownPreview.description,
      category: markdownPreview.category,
      riskLevel: markdownPreview.riskLevel,
      instruction: markdownPreview.instruction,
      requiredToolMappingsJson: markdownPreview.requiredToolMappingsJson,
      recommendedToolMappingsJson: markdownPreview.recommendedToolMappingsJson,
      suggestedEvalFixturesJson: markdownPreview.suggestedEvalFixturesJson,
    });
    const markdownImportState = await t.run(async (ctx) => {
      const importedSkill = await ctx.db.get(markdownImport.skillId);
      const importedVersion = await ctx.db.get(markdownImport.skillVersionId);
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), markdownImport.skillId))
        .first();
      return { importedSkill, importedVersion, auditLog };
    });
    expect(markdownImportState.importedSkill).toMatchObject({
      name: "Browser QA",
      status: "DRAFT",
      category: "QA",
      riskLevel: "MEDIUM",
      requiredToolMappingsJson: "[\"browser.open\"]",
    });
    expect(markdownImportState.importedVersion).toMatchObject({
      skillId: markdownImport.skillId,
      versionNumber: 1,
    });
    expect(markdownImportState.auditLog).toMatchObject({
      actionType: "IMPORT_AGENT_SKILL_MARKDOWN",
      entityType: "agentSkills",
    });

    const boundSkills = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(boundSkills).toHaveLength(1);
    expect(boundSkills[0]).toMatchObject({
      skill: {
        name: "Risk Monitoring",
        riskLevel: "HIGH",
      },
      evalCoverage: {
        activeFixtureCount: 2,
        latestRun: null,
        latestPassedRun: null,
      },
    });

    const initialReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(initialReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 1,
    });
    expect(initialReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      riskLevel: "HIGH",
      activeEvalFixtureCount: 2,
      skillSmokePassed: false,
    });
    expect(initialReadiness.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "WARN",
    }));

    const manualFixture = await client.mutation(api.agentEvalFixtures.createManual, {
      agentId,
      type: "HAPPY_PATH",
      objective: "Answer a general readiness question.",
      expectedFinalOutputRubric: "The agent gives a direct and safe answer.",
      tags: ["general-readiness"],
    });
    await expect(client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: manualFixture.fixtureId,
    })).resolves.toMatchObject({ status: "SUCCESS" });

    // Readiness still reports that nothing has proven this agent; since
    // 2026-08-01 it reports rather than refuses.
    expect(
      (await client.query(api.agents.getAgentReadiness, { id: agentId })).activationWarnings
    ).toContain("smokeEval");

    const skillFixtureId = await t.run(async (ctx) => {
      const fixtures = await ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "ACTIVE"))
        .collect();
      const skillFixture = fixtures.find((fixture) => {
        try {
          const evidence = JSON.parse(fixture.sourceEvidenceJson) as {
            source?: string;
            skillId?: Id<"agentSkills">;
          };
          return evidence.source === "agent_skill" && evidence.skillId === highRiskSkill._id;
        } catch {
          return false;
        }
      });
      if (!skillFixture) throw new Error("Expected seeded skill fixture");
      return skillFixture._id;
    });

    const skillSmokeEval = await client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: skillFixtureId,
    });
    expect(skillSmokeEval).toMatchObject({
      status: "SUCCESS",
      fixtureId: skillFixtureId,
    });

    const readyState = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(readyState.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 0,
    });
    expect(readyState.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      activeEvalFixtureCount: 2,
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });
    expect(readyState.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "PASS",
    }));

    await client.mutation(api.agentSkills.updateSkill, {
      skillId: highRiskSkill._id,
      instruction: `${highRiskSkill.instruction}\nAlways include an explicit confidence level when escalating risk.`,
    });

    const pinnedReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(pinnedReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 0,
    });
    expect(pinnedReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });

    const pinnedCoverage = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(pinnedCoverage[0]).toMatchObject({
      hasAvailableUpdate: true,
      version: {
        versionNumber: 1,
      },
      latestVersion: {
        versionNumber: 2,
      },
    });
    // The panel reads a pre-computed rollup rather than totalling the catalogue
    // on every load, so the counts are rebuilt before they are read.
    await client.mutation(api.agentSkills.rebuildSkillCatalogRollup, {});
    const updateLagAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(updateLagAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 1,
      validatedBindings: 0,
      needsSmokeBindings: 0,
    });
    expect(updateLagAnalytics.needsAttention).toContainEqual(expect.objectContaining({
      skillId: highRiskSkill._id,
      name: "Risk Monitoring",
      outdatedAgents: 1,
      needsSmokeAgents: 0,
    }));

    const skillBindings = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(skillBindings).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      agent: expect.objectContaining({ _id: agentId, name: "Skill Regression Agent" }),
      hasAvailableUpdate: true,
      version: expect.objectContaining({ versionNumber: 1 }),
      latestVersion: expect.objectContaining({ versionNumber: 2 }),
      evalCoverage: expect.objectContaining({
        latestPassedRun: expect.objectContaining({
          runId: skillSmokeEval.runId,
          isCurrent: true,
        }),
      }),
    }));

    const upgradeResult = await client.mutation(api.agentSkills.upgradeSkillBindingsForSkill, {
      skillId: highRiskSkill._id,
      bindingIds: [pinnedCoverage[0].binding._id],
      seedEvalFixtures: true,
    });
    expect(upgradeResult.upgradedCount).toBe(1);
    expect(upgradeResult.skillVersionId).toBe(pinnedCoverage[0].latestVersion?._id);

    const staleReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(staleReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 1,
    });
    expect(staleReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      activeEvalFixtureCount: 2,
      skillSmokePassed: false,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: false,
      },
    });
    expect(staleReadiness.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "WARN",
    }));

    const staleCoverage = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(staleCoverage[0]).toMatchObject({
      hasAvailableUpdate: false,
      version: {
        versionNumber: 2,
      },
      latestVersion: {
        versionNumber: 2,
      },
    });
    expect(staleCoverage[0].evalCoverage).toMatchObject({
      activeFixtureCount: 2,
      latestRun: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: false,
      },
      latestPassedRun: null,
    });
    await client.mutation(api.agentSkills.rebuildSkillCatalogRollup, {});
    const staleAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(staleAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 0,
      currentBindings: 1,
      validatedBindings: 0,
      needsSmokeBindings: 1,
      highRiskNeedsSmokeBindings: 1,
    });
    expect(staleAnalytics.needsAttention).toContainEqual(expect.objectContaining({
      skillId: highRiskSkill._id,
      name: "Risk Monitoring",
      outdatedAgents: 0,
      needsSmokeAgents: 1,
    }));
    const staleRollout = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(staleRollout).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      hasAvailableUpdate: false,
      evalCoverage: expect.objectContaining({
        latestRun: expect.objectContaining({
          runId: skillSmokeEval.runId,
          isCurrent: false,
        }),
        latestPassedRun: null,
      }),
    }));

    // Readiness still reports that nothing has proven this agent; since
    // 2026-08-01 it reports rather than refuses.
    expect(
      (await client.query(api.agents.getAgentReadiness, { id: agentId })).activationWarnings
    ).toContain("smokeEval");

    const refreshedSkillSmokeEval = await client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: skillFixtureId,
    });
    expect(refreshedSkillSmokeEval).toMatchObject({
      status: "SUCCESS",
      fixtureId: skillFixtureId,
    });

    const refreshedReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(refreshedReadiness.skillReadiness).toMatchObject({
      missingHighRiskEvalCount: 0,
    });
    expect(refreshedReadiness.skillReadiness.skills[0]).toMatchObject({
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: refreshedSkillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });
    const validatedRollout = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(validatedRollout).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      evalCoverage: expect.objectContaining({
        latestPassedRun: expect.objectContaining({
          runId: refreshedSkillSmokeEval.runId,
          isCurrent: true,
        }),
      }),
    }));
    await client.mutation(api.agentSkills.rebuildSkillCatalogRollup, {});
    const validatedAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(validatedAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 0,
      currentBindings: 1,
      validatedBindings: 1,
      needsSmokeBindings: 0,
      highRiskNeedsSmokeBindings: 0,
    });

    // Activation now needs evidence a model was actually called and its answer
    // graded — configuration checks alone are no longer sufficient.
    await t.run(async (ctx) => {
      const now = Date.now() + 30;
      const gradedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "MANUAL",
        objective: "Smoke eval: skill coverage",
        status: "SUCCESS",
        startedAt: now,
        completedAt: now + 1,
        updatedAt: now + 1,
        finalOutput: "Model-graded smoke eval passed.",
      });
      // Carries the same skill evidence as the fixture, so this run counts as
      // the skill's current coverage rather than displacing it with one that
      // has none.
      const skillFixture = await ctx.db.get(skillFixtureId);
      await ctx.db.insert("agentRunSteps", {
        runId: gradedRunId,
        agentId,
        stepIndex: 1,
        kind: "OBSERVE",
        status: "SUCCESS",
        input: "skill coverage",
        output: JSON.stringify({
          status: "PASSED",
          gradingMode: "MODEL_GRADED",
          fixtureId: skillFixtureId,
          fixtureType: skillFixture?.type ?? "HAPPY_PATH",
          sourceEvidenceJson: skillFixture?.sourceEvidenceJson,
        }),
        startedAt: now,
        completedAt: now,
      });
    });

    await expect(client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: true,
    })).resolves.toBe(agentId);
  });
});
