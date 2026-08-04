import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The research job.
 *
 * What these hold in place is the thing the old sweeps had no way of doing:
 * something owns the whole list, hands it out a piece at a time, takes back what
 * a dead run was holding, gives up on one item without giving up on the job, and
 * can say at the end whether the work is actually finished.
 */

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ").replace(/&/g, "AND");

const ACCOUNTS = [
  { accountName: "Barrowfield Hotel Ltd", groupName: "Daish's Hotels", customerType: "HOTELS" },
  { accountName: "The Devonshire Hotel Ltd", groupName: "Daish's Hotels", customerType: "HOTELS" },
  { accountName: "Fairmile Grange", groupName: "Allegra Care", customerType: "CARE HOMES" },
];

async function seed() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: Date.now(),
    });
    const userId = await ctx.db.insert("users", {
      email: "buyer@test.com",
      role: "ADMIN",
      companyId,
    });
    const importId = await ctx.db.insert("salesDataImports", {
      companyId,
      fileName: "sample.xlsx",
      status: "COMPLETED" as const,
      sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
      periodLabels: ["2026-01"],
      importedBy: userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    for (const account of ACCOUNTS) {
      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey: key(account.accountName),
        accountName: account.accountName,
        codeTally: { CODE: 4 },
        groupName: account.groupName,
        groupNameKey: key(account.groupName),
        customerType: account.customerType,
        customerTypeKey: key(account.customerType),
        totalRevenue: 100,
        productCount: 1,
      });
    }

    const agentId = await ctx.db.insert("agents", {
      name: "Research Agent",
      modelId: "test-model",
      thinkingMode: false,
      isActive: true,
      companyId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // The record tool is what marks this agent as the job's record filler —
    // worker resolution goes by tool bindings, not by name.
    for (const handlerMapping of [
      "salesCustomers.research.read",
      "salesCustomers.research.record",
      "salesCustomers.job.next",
    ]) {
      const toolId = await ctx.db.insert("aiTools", {
        name: handlerMapping,
        description: "Customer research.",
        handlerMapping,
        connectorKey: "sales-customer-research",
        requiredRole: "ADMIN" as const,
        createdAt: Date.now(),
        createdBy: userId,
      });
      await ctx.db.insert("agentTools", { agentId, toolId, assignedAt: Date.now() });
    }

    return { companyId, userId, agentId };
  });

  return { t, ...seeded, client: t.withIdentity({ subject: seeded.userId }) };
}

/**
 * The run the job belongs to.
 *
 * There is no button. Anthony, 2026-08-03: *"I only want it to run from the
 * agent screen."* So a job exists because a run asked for work, and these tests
 * start one the same way rather than through a door nobody else can use.
 */
async function seedRun(
  t: Awaited<ReturnType<typeof seed>>["t"],
  args: { agentId: Id<"agents">; userId: Id<"users">; companyId: Id<"companies"> }
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("agentRuns", {
      agentId: args.agentId,
      triggerType: "MANUAL" as const,
      objective: "Work through this workspace's research queue until it is empty.",
      title: "Research queue · run 1",
      status: "RUNNING" as const,
      companyId: args.companyId,
      userId: args.userId,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

const nextTask = async (
  t: Awaited<ReturnType<typeof seed>>["t"],
  companyId: Id<"companies">,
  args: { previousOutcome?: "DONE" | "COULD_NOT"; note?: string; runId?: Id<"agentRuns"> } = {}
) =>
  await t.mutation(internal.salesDataResearchJobs.claimNextTaskInternal, {
    companyId,
    ...args,
  });

/**
 * Answer the sizing figure for every seeded account.
 *
 * The queue does not accept a customer back while its bedrooms or pupils
 * question is open. Tests about queue mechanics answer it up front so their
 * arithmetic stays about the queue; the gate itself is tested in "the figure
 * the next phase is sized on".
 */
/**
 * Mark every chain as having had a site offered, once the job exists.
 *
 * The queue does not accept a chain as done until a site has been offered for
 * it. Queue-mechanics tests satisfy that up front, the way `answerKeyFigures`
 * satisfies the customer gate; the chain gate itself is tested in "a chain is
 * not taken at its word".
 */
const offerChainSites = async (t: Awaited<ReturnType<typeof seed>>["t"]) =>
  await t.run(async (ctx) => {
    const items = await ctx.db.query("salesDataResearchJobItems").collect();
    for (const item of items) {
      if (item.kind === "CHAIN") await ctx.db.patch(item._id, { sitesOffered: 1 });
    }
  });

const answerKeyFigures = async (
  t: Awaited<ReturnType<typeof seed>>["t"],
  companyId: Id<"companies">
) =>
  await t.run(async (ctx) => {
    for (const account of ACCOUNTS) {
      await ctx.db.insert("salesDataCustomerResearch", {
        companyId,
        subjectKey: key(account.accountName),
        subjectType: "CUSTOMER" as const,
        field: "bedrooms",
        value: "",
        confidence: "HIGH" as const,
        status: "NOT_FOUND" as const,
        foundAt: Date.now(),
      });
    }
  });

describe("starting a job", () => {
  test("the first ask builds the queue: every customer with gaps, every chain", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });

    const first = await nextTask(t, companyId, { runId });

    const { items, job } = await t.run(async (ctx) => ({
      items: await ctx.db.query("salesDataResearchJobItems").collect(),
      job: await ctx.db.query("salesDataResearchJobs").first(),
    }));

    // Three customers, two chains — and the first of them already in hand.
    expect(items.filter((item) => item.kind === "CUSTOMER")).toHaveLength(3);
    expect(items.filter((item) => item.kind === "CHAIN")).toHaveLength(2);
    expect(first.task?.kind).toBe("CUSTOMER");
    expect(items.filter((item) => item.status === "IN_PROGRESS")).toHaveLength(1);

    // The run that asked is the job's first run, not a second one it started.
    expect(job).toMatchObject({
      status: "RUNNING",
      phase: "CUSTOMERS",
      runsStarted: 1,
      currentRunId: runId,
      agentId,
    });
    expect(job?.companyId).toBe(companyId);
  });

  /**
   * A parked finding is a person's decision pending, not a gap. Counting it as
   * one re-queued every customer with a needs-a-check row on every job, and
   * each re-visit spent money to discover there was nothing to do.
   */
  test("a customer whose every gap is settled or parked is not re-queued", async () => {
    const { t, companyId, userId, agentId } = await seed();

    // Barrowfield: every applicable field either searched-and-not-published,
    // or found but parked for a person to check. Nothing left to research.
    const fields = [
      "addressLine1", "addressLine2", "town", "postcode", "country", "phone",
      "mobile", "email", "accountsEmail", "website", "contactName", "contactRole",
      "bedrooms",
    ];
    await t.run(async (ctx) => {
      for (const field of fields) {
        await ctx.db.insert("salesDataCustomerResearch", {
          companyId,
          subjectKey: key("Barrowfield Hotel Ltd"),
          subjectType: "CUSTOMER" as const,
          field,
          value: field === "phone" ? "01637 878878" : "",
          confidence: field === "phone" ? ("MEDIUM" as const) : ("HIGH" as const),
          status: field === "phone" ? ("NEEDS_CHECK" as const) : ("NOT_FOUND" as const),
          foundAt: Date.now(),
        });
      }
    });

    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    const items = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect());
    const customers = items.filter((item) => item.kind === "CUSTOMER").map((item) => item.key);
    expect(customers).not.toContain(key("Barrowfield Hotel Ltd"));
    expect(customers).toHaveLength(2);
  });

  /**
   * Two jobs against one workspace would hand the same customer to two runs and
   * pay for it twice.
   */
  test("a second run joins the job that is already running rather than starting one", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });

    await nextTask(t, companyId, { runId });
    await nextTask(t, companyId, { runId, previousOutcome: "DONE" });

    const jobs = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobs").collect());
    expect(jobs).toHaveLength(1);
  });

  /** Nothing on a client-facing screen can start this. */
  test("a run with nobody behind it cannot start a job", async () => {
    const { t, companyId, agentId } = await seed();
    const runId = await t.run(async (ctx) =>
      await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "SCHEDULE" as const,
        objective: "Work the queue.",
        status: "RUNNING" as const,
        companyId,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const result = await nextTask(t, companyId, { runId });

    expect(result).toMatchObject({ done: true, task: null });
    const jobs = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobs").collect());
    expect(jobs).toHaveLength(0);
  });
});

describe("working the queue", () => {
  /**
   * The order is the reason this is one job: a prospect's details cannot be
   * researched until the chain pass has found the prospect.
   */
  test("hands out customers first, then chains", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });

    // The first ask both builds the queue and hands out the first task.
    const kinds: string[] = [];
    for (let call = 0; call < 5; call += 1) {
      const result = await nextTask(t, companyId, {
        runId,
        ...(call === 0 ? {} : { previousOutcome: "DONE" as const }),
      });
      kinds.push(result.task?.kind ?? "NONE");
    }

    expect(kinds).toEqual(["CUSTOMER", "CUSTOMER", "CUSTOMER", "CHAIN", "CHAIN"]);
  });

  test("says there is nothing left once the queue is empty", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });
    await offerChainSites(t);

    for (let call = 0; call < 5; call += 1) {
      await nextTask(t, companyId, call === 0 ? {} : { previousOutcome: "DONE" });
    }
    const last = await nextTask(t, companyId, { previousOutcome: "DONE" });

    expect(last).toMatchObject({ done: true, task: null });
  });

  /**
   * One awkward chain must not take the other twenty-nine down with it — which
   * is exactly what the old fan-out did, silently.
   */
  test("gives an item a second go, then records it as undone and carries on", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    const first = await nextTask(t, companyId);
    const firstKey = first.task?.key;

    // Failed once: it goes back on the queue rather than being lost, and it is
    // not handed straight back to the run that just failed it — that would
    // spend its second attempt on the conditions that caused the first.
    const second = await nextTask(t, companyId, {
      previousOutcome: "COULD_NOT",
      note: "Site was down.",
    });
    expect(second.task?.key).not.toBe(firstKey);

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    expect(items.find((item) => item.key === firstKey)).toMatchObject({
      status: "PENDING",
      attempts: 1,
    });

    // The queue moved on to the next one rather than repeating it immediately;
    // the failed one is picked back up once the others have been handed out.
    const handedOut: string[] = [];
    for (let call = 0; call < 5; call += 1) {
      const result = await nextTask(t, companyId, { previousOutcome: "COULD_NOT" });
      if (result.task) handedOut.push(result.task.key);
    }

    const after = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    // Everything that was tried twice is now recorded as undone, with a reason,
    // rather than being handed out for ever.
    const failed = after.filter((item) => item.status === "FAILED");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].lastError).toBeTruthy();
    expect(handedOut.length).toBeGreaterThan(0);
  });

  /** A run outside a job must not be told to do a job's work. */
  test("tells a run there is nothing to do when no job is running", async () => {
    const { t, companyId } = await seed();

    const result = await nextTask(t, companyId);

    expect(result).toMatchObject({ done: true, task: null });
  });
});

describe("the figure the next phase is sized on", () => {
  /**
   * The first live job said "Researched 83 of 83 — nothing left" while seventy
   * of them had no bedrooms answer of any kind: the run visited, recorded
   * nothing, and asked for the next one, and asking was all it took. "Done" is
   * now a claim the queue checks rather than a word it takes.
   */
  test("a customer is not accepted as done while its bedrooms question is open", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });

    const first = await nextTask(t, companyId, { runId });
    expect(first.task?.kind).toBe("CUSTOMER");
    // Said at hand-out, not left for the model to infer from a list of eleven
    // equal-looking gaps.
    expect(first.task?.instruction).toContain("bedrooms");
    expect(first.task?.instruction).toContain("not accepted without it");

    const second = await nextTask(t, companyId, { previousOutcome: "DONE" });
    // Not handed straight back — it goes to the back of the queue for a fresh go.
    expect(second.task?.key).not.toBe(first.task?.key);

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    const bounced = items.find((item) => item.key === first.task?.key);
    expect(bounced).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(bounced?.lastError).toContain("bedrooms");
  });

  test("after its goes, it is recorded as undone with the reason", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    // The run keeps claiming done without ever answering the figure.
    for (let call = 0; call < 12; call += 1) {
      await nextTask(t, companyId, { previousOutcome: "DONE" });
    }

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    const customers = items.filter((item) => item.kind === "CUSTOMER");
    expect(customers.length).toBeGreaterThan(0);
    for (const item of customers) {
      expect(item.status).toBe("FAILED");
      expect(item.lastError).toContain("was never recorded");
    }
    // The chains have their own gate — nothing was offered for them either,
    // so they end recorded as undone too, with their own reason.
    for (const item of items.filter((i) => i.kind === "CHAIN")) {
      expect(item.status).toBe("FAILED");
      expect(item.lastError).toContain("No site was ever offered");
    }
  });

  /**
   * "Looked, and it is not published" is an answer. The gate demands the
   * question be closed, not that every hotel confess its room count.
   */
  test("a not-found note answers the question, and done stands", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });

    const first = await nextTask(t, companyId, { runId });
    await t.run(async (ctx) => {
      await ctx.db.insert("salesDataCustomerResearch", {
        companyId,
        subjectKey: first.task!.key,
        subjectType: "CUSTOMER" as const,
        field: "bedrooms",
        value: "",
        confidence: "LOW" as const,
        status: "NOT_FOUND" as const,
        foundAt: Date.now(),
      });
    });

    await nextTask(t, companyId, { previousOutcome: "DONE" });

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    expect(items.find((item) => item.key === first.task?.key)).toMatchObject({
      status: "DONE",
      attempts: 1,
    });
  });
});

describe("a chain is not taken at its word", () => {
  /** Claims through the customers (figures answered) until a chain is handed out. */
  const claimUntilChain = async (
    t: Awaited<ReturnType<typeof seed>>["t"],
    companyId: Id<"companies">,
    runId: Id<"agentRuns">
  ) => {
    let result = await nextTask(t, companyId, { runId });
    for (let call = 0; call < 6 && result.task?.kind !== "CHAIN"; call += 1) {
      result = await nextTask(t, companyId, { previousOutcome: "DONE" });
    }
    return result;
  };

  /**
   * Two of the first hunt's ten chains produced nothing, and there was no way
   * to tell "this group runs no sites we do not supply" from "nobody looked"
   * without checking by hand. A run that read a group's list always offered at
   * least one site from it; a chain with none offered was skipped.
   */
  test("a chain with no site ever offered is not accepted as done", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });

    const chain = await claimUntilChain(t, companyId, runId);
    expect(chain.task?.kind).toBe("CHAIN");
    expect(chain.task?.instruction).toContain("not accepted as finished");

    await nextTask(t, companyId, { previousOutcome: "DONE" });

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    const bounced = items.find((item) => item.key === chain.task?.key);
    expect(bounced).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(bounced?.lastError).toContain("No site was ever offered");
  });

  /**
   * A group whose every site is already supplied still proves itself: the
   * refused offers are the evidence the list was read.
   */
  test("an offer refused as already supplied counts, and done stands", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });

    const chain = await claimUntilChain(t, companyId, runId);
    // Chains queue in index order, so Allegra Care is handed first.
    expect(chain.task?.key).toBe(key("Allegra Care"));

    const offered = await t.mutation(internal.salesDataResearch.recordProspect, {
      companyId,
      groupName: "Allegra Care",
      siteName: "Fairmile Grange",
      sourceUrl: "https://allegracare.co.uk/our-homes/",
      sourceName: "Allegra Care",
    });
    expect(offered).toMatchObject({ recorded: false, alreadyKnown: true });

    await nextTask(t, companyId, { previousOutcome: "DONE" });

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    expect(items.find((item) => item.key === chain.task?.key)).toMatchObject({
      status: "DONE",
      sitesOffered: 1,
    });
  });

  test("a newly filed prospect counts, and done stands", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });

    const chain = await claimUntilChain(t, companyId, runId);
    expect(chain.task?.key).toBe(key("Allegra Care"));

    const filed = await t.mutation(internal.salesDataResearch.recordProspect, {
      companyId,
      groupName: "Allegra Care",
      siteName: "Brook View Care Home",
      town: "West Moors",
      postcode: "BH22 0JW",
      sourceUrl: "https://allegracare.co.uk/our-homes/",
      sourceName: "Allegra Care",
    });
    expect(filed).toMatchObject({ recorded: true });

    await nextTask(t, companyId, { previousOutcome: "DONE" });

    const items = await t.run(
      async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()
    );
    expect(items.find((item) => item.key === chain.task?.key)).toMatchObject({
      status: "DONE",
      sitesOffered: 1,
    });
  });
});

describe("prospects found while it runs", () => {
  /**
   * The third pass is fed by the second, inside the same job. Before this, a
   * prospect found at half past two waited for somebody to press a second
   * button — and mostly nobody did.
   */
  test("a prospect found by the chain pass joins the queue", async () => {
    const { t, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });
    await offerChainSites(t);

    await t.mutation(internal.salesDataResearchJobs.appendProspectItemInternal, {
      companyId,
      prospectKey: "ST GEORGES NURSING HOME",
      siteName: "St Georges Nursing Home",
    });
    // The same site twice is one piece of work, not two.
    await t.mutation(internal.salesDataResearchJobs.appendProspectItemInternal, {
      companyId,
      prospectKey: "ST GEORGES NURSING HOME",
      siteName: "St Georges Nursing Home",
    });

    const prospects = await t.run(async (ctx) =>
      (await ctx.db.query("salesDataResearchJobItems").collect()).filter(
        (item) => item.kind === "PROSPECT"
      )
    );
    expect(prospects).toHaveLength(1);

    // And it is handed out, after the customers and the chains. The first task
    // was taken when the job was built, so four asks clear the rest of them.
    const kinds: string[] = [];
    for (let call = 0; call < 5; call += 1) {
      const result = await nextTask(t, companyId, { previousOutcome: "DONE" });
      kinds.push(result.task?.kind ?? "NONE");
    }
    expect(kinds).toEqual(["CUSTOMER", "CUSTOMER", "CHAIN", "CHAIN", "PROSPECT"]);
  });
});

describe("starting from the workspace screen", () => {
  /**
   * Each button starts its own kind of job. The details button queues the
   * customers (and any prospects on the books with gaps) and none of the
   * chains; pressing anything while a job runs joins it rather than paying
   * for a second one.
   */
  test("the details button queues detail work only; a second press joins it", async () => {
    const { t, client, companyId } = await seed();

    const first = await client.mutation(api.salesDataResearchJobs.startResearchJob, { mode: "DETAILS" });
    expect(first).toMatchObject({ started: true });

    const { job, runs, items } = await t.run(async (ctx) => ({
      job: await ctx.db.query("salesDataResearchJobs").first(),
      runs: await ctx.db.query("agentRuns").collect(),
      items: await ctx.db.query("salesDataResearchJobItems").collect(),
    }));
    expect(job).toMatchObject({ status: "RUNNING", mode: "DETAILS", runsStarted: 1 });
    expect(runs).toHaveLength(1);
    expect(runs[0].title).toBe("Research · run 1");
    expect(job?.companyId).toBe(companyId);
    // Detail work only — the chains belong to the other button.
    expect(items.filter((item) => item.kind === "CUSTOMER")).toHaveLength(3);
    expect(items.filter((item) => item.kind === "CHAIN")).toHaveLength(0);

    const second = await client.mutation(api.salesDataResearchJobs.startResearchJob, { mode: "PROSPECTS" });
    expect(second).toMatchObject({ started: false, alreadyRunning: true });
    const jobs = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobs").collect());
    expect(jobs).toHaveLength(1);
  });

  test("the prospects button queues the chains and does not research what it files", async () => {
    const { t, client, companyId } = await seed();

    const first = await client.mutation(api.salesDataResearchJobs.startResearchJob, { mode: "PROSPECTS" });
    expect(first).toMatchObject({ started: true });

    const items = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect());
    expect(items.filter((item) => item.kind === "CHAIN")).toHaveLength(2);
    expect(items.filter((item) => item.kind === "CUSTOMER")).toHaveLength(0);

    // A site filed during the hunt is not appended for research: that is the
    // detail button's queue, next time it is pressed.
    const appended = await t.mutation(internal.salesDataResearchJobs.appendProspectItemInternal, {
      companyId,
      prospectKey: "WENTWORTH COURT",
      siteName: "Wentworth Court",
    });
    expect(appended).toMatchObject({ appended: false });
  });
});

describe("two workers", () => {
  const seedFinder = async (
    t: Awaited<ReturnType<typeof seed>>["t"],
    args: { companyId: Id<"companies">; userId: Id<"users"> }
  ) =>
    await t.run(async (ctx) => {
      const finderId = await ctx.db.insert("agents", {
        name: "Prospect Search Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        companyId: args.companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const toolId = await ctx.db.insert("aiTools", {
        name: "file a site",
        description: "Files a site in a group.",
        handlerMapping: "salesCustomers.prospects.record",
        connectorKey: "sales-customer-research",
        requiredRole: "ADMIN" as const,
        createdAt: Date.now(),
        createdBy: args.userId,
      });
      await ctx.db.insert("agentTools", { agentId: finderId, toolId, assignedAt: Date.now() });
      return finderId;
    });

  /**
   * Run Agent on the finder is the prospects button: a chains-only job, worked
   * by the finder, its spend banked in the finding bucket, its handovers
   * staying with the finder.
   */
  test("the finder's press makes a prospect hunt, paid from the finding bucket", async () => {
    const { t, companyId, userId } = await seed();
    const finderId = await seedFinder(t, { companyId, userId });

    const finderRunId = await seedRun(t, { agentId: finderId, userId, companyId });
    const first = await nextTask(t, companyId, { runId: finderRunId });
    expect(first.task?.kind).toBe("CHAIN");

    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("salesDataResearchJobs").first())!._id
    );
    const created = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(created).toMatchObject({ mode: "PROSPECTS", prospectAgentId: finderId });
    expect(
      (await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobItems").collect()))
        .every((item) => item.kind === "CHAIN")
    ).toBe(true);
    expect(
      (await t.run(async (ctx) => await ctx.db.get(finderRunId)))?.title
    ).toBe("Prospect search · run 1");

    // The run ends mid-hunt; the watchdog banks its spend as finding work and
    // hands the queue to another finder run, never the filler.
    await t.run(async (ctx) => {
      await ctx.db.patch(finderRunId, { status: "SUCCESS" as const, costGBP: 0.2, updatedAt: Date.now() });
    });
    await t.mutation(internal.salesDataResearchJobs.tickJobInternal, { jobId });

    const after = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    expect(after.job?.findingSpentGBP).toBeCloseTo(0.2);
    const nextRun = after.runs.find((run) => run._id !== finderRunId);
    expect(nextRun).toMatchObject({ agentId: finderId, title: "Prospect search · run 2" });
  });

  /**
   * The everything job — no mode, both kinds queued — still conducts: an agent
   * asked for the other's work is told its part is over, and the watchdog
   * starts the right worker with the spend split by bucket.
   */
  test("an everything job hands each kind to its own agent", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const finderId = await seedFinder(t, { companyId, userId });

    const { jobId } = await t.run(async (ctx) => {
      const importId = (await ctx.db.query("salesDataImports").first())!._id;
      const jobId = await ctx.db.insert("salesDataResearchJobs", {
        companyId,
        importId,
        status: "RUNNING" as const,
        phase: "CUSTOMERS" as const,
        agentId,
        prospectAgentId: finderId,
        runsStarted: 1,
        maxCostGBP: 25,
        spentGBP: 0,
        findingSpentGBP: 0,
        fillingSpentGBP: 0,
        startedBy: userId,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (const item of [
        { kind: "CUSTOMER" as const, key: "FAIRMILE GRANGE", label: "Fairmile Grange" },
        { kind: "CHAIN" as const, key: "ALLEGRA CARE", label: "Allegra Care" },
      ]) {
        await ctx.db.insert("salesDataResearchJobItems", {
          jobId,
          companyId,
          ...item,
          status: "PENDING" as const,
          attempts: 0,
          updatedAt: Date.now(),
        });
      }
      return { jobId };
    });

    // The finder asks while the customer pass is open: not its work.
    const finderRunId = await seedRun(t, { agentId: finderId, userId, companyId });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { currentRunId: finderRunId, updatedAt: Date.now() });
    });
    const refused = await nextTask(t, companyId, { runId: finderRunId });
    expect(refused.done).toBe(true);
    expect(refused.message).toContain("other agent");

    // It concludes; the watchdog starts the filler, and the filler is handed
    // the customer.
    await t.run(async (ctx) => {
      await ctx.db.patch(finderRunId, { status: "SUCCESS" as const, costGBP: 0.2, updatedAt: Date.now() });
    });
    await t.mutation(internal.salesDataResearchJobs.tickJobInternal, { jobId });

    const after = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    expect(after.job?.findingSpentGBP).toBeCloseTo(0.2);
    const fillerRun = after.runs.find((run) => run._id !== finderRunId);
    expect(fillerRun).toMatchObject({ agentId, title: "Research · run 2" });

    const handed = await nextTask(t, companyId, { runId: fillerRun!._id });
    expect(handed.task?.kind).toBe("CUSTOMER");
  });
});

describe("when a run ends", () => {
  const endRun = async (
    t: Awaited<ReturnType<typeof seed>>["t"],
    patch: { status: "SUCCESS" | "FAILED"; costGBP?: number; error?: string }
  ) =>
    await t.run(async (ctx) => {
      const run = await ctx.db.query("agentRuns").first();
      if (!run) throw new Error("no run");
      await ctx.db.patch(run._id, { ...patch, updatedAt: Date.now() });
    });

  const tick = async (t: Awaited<ReturnType<typeof seed>>["t"]) => {
    const jobId = await t.run(async (ctx) => (await ctx.db.query("salesDataResearchJobs").first())!._id);
    await t.mutation(internal.salesDataResearchJobs.tickJobInternal, { jobId });
  };

  /**
   * The case the old sweeps lost silently: a run dies with work in hand, and
   * nothing anywhere remembers that the work was ever started.
   */
  test("takes back the item a dead run was holding, and starts another run", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });
    const claimed = await nextTask(t, companyId);

    await endRun(t, { status: "FAILED", costGBP: 0.4, error: "Ran out of tool calls." });
    await tick(t);

    const { items, job, runs } = await t.run(async (ctx) => ({
      items: await ctx.db.query("salesDataResearchJobItems").collect(),
      job: await ctx.db.query("salesDataResearchJobs").first(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));

    expect(items.find((item) => item.key === claimed.task?.key)).toMatchObject({
      status: "PENDING",
      lastError: "Ran out of tool calls.",
    });
    // The job carries on rather than ending with the run.
    expect(job).toMatchObject({ status: "RUNNING", runsStarted: 2 });
    expect(runs).toHaveLength(2);
    // The dead run's spend still counts against the job.
    expect(job?.spentGBP).toBeCloseTo(0.4);
    // And the ended run is marked as continued, so no screen dresses a planned
    // handover as a failure.
    const successor = runs.find((r) => r._id !== runId);
    expect(runs.find((r) => r._id === runId)?.continuedByRunId).toBe(successor?._id);
  });

  /**
   * The failure the first live job hit. A run whose action is killed before it
   * saves a checkpoint stays marked RUNNING for ever — the platform's stall
   * sweeper only looks at runs that have a checkpoint to resume from, so it
   * never sees this one. The job waited politely for a run that no longer
   * existed: 126 steps, then silence.
   */
  test("moves on from a run that is marked running but has gone quiet", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    const claimed = await nextTask(t, companyId, { runId });

    // It did some work, then stopped, and never told anybody.
    const longAgo = Date.now() - 30 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("agentRunSteps", {
        runId,
        agentId,
        companyId,
        stepIndex: 1,
        kind: "MODEL" as const,
        status: "SUCCESS" as const,
        startedAt: longAgo,
      });
    });

    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("salesDataResearchJobs").first())!._id
    );
    await t.mutation(internal.salesDataResearchJobs.tickJobInternal, { jobId });

    // The item it was holding is back on the queue, a fresh run is working, and
    // the dead run says so rather than claiming to be busy for ever.
    const { items, runs } = await t.run(async (ctx) => ({
      items: await ctx.db.query("salesDataResearchJobItems").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));

    expect(items.find((item) => item.key === claimed.task?.key)?.status).toBe("PENDING");
    expect(runs.find((run) => run._id === runId)).toMatchObject({ status: "FAILED" });
    expect(runs).toHaveLength(2);

    const job = await client.query(api.salesDataResearchJobs.getResearchJobForAgent, { agentId });
    expect(job).toMatchObject({ status: "RUNNING", runsStarted: 2 });
  });

  /**
   * A run only writes its total onto its own row if it lives to finish. The
   * first live job's run died mid-flight, and the job recorded £0 for work it
   * had just watched spend money — so the spend ceiling bounded nothing.
   */
  test("a run that dies without reporting its cost still counts against the job", async () => {
    const { t, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    // It worked, it spent, and it never wrote a total: only the steps remain.
    const longAgo = Date.now() - 30 * 60 * 1000;
    await t.run(async (ctx) => {
      for (const [stepIndex, costGBP] of [[1, 0.12], [2, 0.3]] as const) {
        await ctx.db.insert("agentRunSteps", {
          runId,
          agentId,
          companyId,
          stepIndex,
          kind: "MODEL" as const,
          status: "SUCCESS" as const,
          startedAt: longAgo,
          costGBP,
        });
      }
    });

    await tick(t);

    const job = await t.run(async (ctx) => await ctx.db.query("salesDataResearchJobs").first());
    expect(job?.spentGBP).toBeCloseTo(0.42);
  });

  test("finishes cleanly once every item is done", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await answerKeyFigures(t, companyId);
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });
    await offerChainSites(t);

    for (let call = 0; call < 5; call += 1) {
      await nextTask(t, companyId, { previousOutcome: "DONE" });
    }

    await endRun(t, { status: "SUCCESS", costGBP: 1.2 });
    await tick(t);

    const job = await client.query(api.salesDataResearchJobs.getResearchJob, {});
    expect(job).toMatchObject({ status: "COMPLETE", remaining: 0, failed: 0 });
  });

  /**
   * "Finished" and "finished apart from these two" are different things to be
   * told, and the second has to name them.
   */
  test("ends with exceptions, and names what it could not do", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    // Fail everything twice over.
    for (let call = 0; call < 12; call += 1) {
      await nextTask(t, companyId, { previousOutcome: "COULD_NOT", note: "Nothing published." });
    }

    await endRun(t, { status: "SUCCESS", costGBP: 0.5 });
    await tick(t);

    const job = await client.query(api.salesDataResearchJobs.getResearchJob, {});
    expect(job).toMatchObject({ status: "COMPLETE_WITH_EXCEPTIONS" });
    expect(job?.exceptions.length).toBeGreaterThan(0);
    expect(job?.exceptions[0].reason).toBe("Nothing published.");
    expect(job?.endedReason).toContain("could not do");
  });

  /**
   * Per-run ceilings stop one run going mad. Only the job's own ceiling stops a
   * job costing fifty pounds by starting twenty runs that each stayed politely
   * under theirs.
   */
  test("stops at its own spend ceiling rather than starting another run", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    await endRun(t, { status: "SUCCESS", costGBP: 40 });
    await tick(t);

    const job = await client.query(api.salesDataResearchJobs.getResearchJob, {});
    expect(job).toMatchObject({ status: "STOPPED" });
    expect(job?.endedReason).toContain("ceiling");

    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
  });
});

describe("what a run recorded", () => {
  /**
   * The run screen leads with this. It must be built from the rows the run
   * wrote — not the model's account, and not another run's rows.
   */
  test("lists the rows this run wrote, in plain words, and nothing else", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    const otherRunId = await seedRun(t, { agentId, userId, companyId });

    await t.run(async (ctx) => {
      await ctx.db.insert("salesDataCustomerResearch", {
        companyId,
        subjectKey: "FAIRMILE GRANGE",
        subjectType: "CUSTOMER" as const,
        field: "postcode",
        value: "BH23 2DF",
        confidence: "HIGH" as const,
        status: "APPLIED" as const,
        sourceUrl: "https://allegracare.co.uk/fairmile-grange",
        sourceName: "Allegra Care",
        runId,
        agentId,
        foundAt: Date.now(),
      });
      await ctx.db.insert("salesDataCustomerResearch", {
        companyId,
        subjectKey: "FAIRMILE GRANGE",
        subjectType: "CUSTOMER" as const,
        field: "mobile",
        value: "",
        confidence: "HIGH" as const,
        status: "NOT_FOUND" as const,
        runId,
        agentId,
        foundAt: Date.now(),
      });
      // Another run's work must not be credited to this one.
      await ctx.db.insert("salesDataCustomerResearch", {
        companyId,
        subjectKey: "BARROWFIELD HOTEL LTD",
        subjectType: "CUSTOMER" as const,
        field: "phone",
        value: "01234 567890",
        confidence: "HIGH" as const,
        status: "APPLIED" as const,
        runId: otherRunId,
        agentId,
        foundAt: Date.now(),
      });
      await ctx.db.insert("salesDataProspects", {
        companyId,
        prospectKey: "WENTWORTH COURT",
        siteName: "Wentworth Court",
        groupName: "Allegra Care",
        groupNameKey: "ALLEGRA CARE",
        customerType: "CARE HOMES",
        customerTypeKey: "CARE HOMES",
        status: "NEW" as const,
        sourceUrl: "https://allegracare.co.uk/our-homes",
        sourceName: "Allegra Care",
        runId,
        agentId,
        foundAt: Date.now(),
      });
    });

    const record = await client.query(api.salesDataResearchJobs.getRunRecord, { runId });

    expect(record?.details).toHaveLength(2);
    expect(record?.details[0]).toMatchObject({
      subject: "FAIRMILE GRANGE",
      field: "postcode",
      value: "BH23 2DF",
      outcome: "saved to the record",
      saved: true,
    });
    // "Not found" is a recorded outcome, not an absence — and it carries no
    // value to show.
    expect(record?.details[1]).toMatchObject({
      field: "mobile",
      value: null,
      outcome: "looked for, not published anywhere",
      saved: false,
    });
    expect(record?.prospects).toHaveLength(1);
    expect(record?.prospects[0]).toMatchObject({
      siteName: "Wentworth Court",
      outcome: "filed as a prospect",
    });
  });
});

describe("ending", () => {
  /**
   * Cancelling the run on the agent screen is the stop control. Without this the
   * job would notice the run had ended and helpfully start another, which is the
   * opposite of what pressing cancel meant.
   */
  test("cancelling the run stops the job rather than starting another", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    const runId = await seedRun(t, { agentId, userId, companyId });
    await nextTask(t, companyId, { runId });

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "CANCELLED" as const, updatedAt: Date.now() });
    });
    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("salesDataResearchJobs").first())!._id
    );
    await t.mutation(internal.salesDataResearchJobs.tickJobInternal, { jobId });

    const job = await client.query(api.salesDataResearchJobs.getResearchJob, {});
    expect(job).toMatchObject({ status: "STOPPED" });
    expect(job?.endedReason).toContain("5 left to do");

    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
  });

  test("a workspace with nothing to do finishes without paying for a run", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Nothing To Do",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", { email: "a@b.com", role: "ADMIN", companyId });
      await ctx.db.insert("salesDataImports", {
        companyId,
        fileName: "empty.xlsx",
        status: "COMPLETED" as const,
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
        importedBy: userId,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Research Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (const handlerMapping of ["salesCustomers.job.next", "salesCustomers.research.record"]) {
        const toolId = await ctx.db.insert("aiTools", {
          name: handlerMapping,
          description: "Customer research.",
          handlerMapping,
          connectorKey: "sales-customer-research",
          requiredRole: "ADMIN" as const,
          createdAt: Date.now(),
          createdBy: userId,
        });
        await ctx.db.insert("agentTools", { agentId, toolId, assignedAt: Date.now() });
      }
      return userId;
    });

    const client = t.withIdentity({ subject: userId });
    const companyId = await t.run(
      async (ctx) => (await ctx.db.query("companies").first())!._id
    );
    const agentId = await t.run(async (ctx) => (await ctx.db.query("agents").first())!._id);
    const runId = await t.run(async (ctx) =>
      await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "MANUAL" as const,
        objective: "Work the queue.",
        status: "RUNNING" as const,
        companyId,
        userId,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const result = await t.mutation(internal.salesDataResearchJobs.claimNextTaskInternal, {
      companyId,
      runId,
    });

    // Nothing to hand out, and no second run started to discover that.
    expect(result).toMatchObject({ done: true, task: null });
    const job = await client.query(api.salesDataResearchJobs.getResearchJob, {});
    expect(job).toMatchObject({ status: "RUNNING", total: 0 });
  });
});
