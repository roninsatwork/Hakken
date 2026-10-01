import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { iconSourceUrl, readIconReply } from "./websiteIcons";
import { requestMissingIcons } from "./websites";

/**
 * Website icons (`websiteIcons.ts`): looked for once when a website is first
 * added, kept as image data in `websiteIcons`, drawn by the Sites lists in
 * place of the letter. A 404 means "no icon" and is final; anything else that
 * fails is asked again.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;

function reply(status: number, type = "image/png", body: BodyInit = PNG) {
  return new Response(body, { status, headers: { "content-type": type } });
}

beforeEach(() => {
  vi.useFakeTimers();
  // The suite never reaches Google; these tests answer for it.
  vi.stubEnv("WEBSITE_ICONS_IN_TESTS", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function website(t: Harness, host: string) {
  return await t.run(async (ctx) => await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }));
}

async function answered(t: Harness, websiteId: Id<"websites">, dataUrl?: string) {
  await t.run(async (ctx) => await ctx.db.insert("websiteIcons", { websiteId, dataUrl, checkedAt: Date.now() }));
}

const iconOf = (t: Harness, websiteId: Id<"websites">) =>
  t.run(async (ctx) => await ctx.db.query("websiteIcons").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).unique());

const iconJobs = (t: Harness) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
    .filter((job) => job.name.startsWith("websiteIcons:") && job.state.kind === "pending"));

async function superAdmin(t: Harness) {
  const id = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Super", email: "super@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: id });
}

describe("Reading the favicon service's reply", () => {
  test("an image is an icon, kept as image data; a 404 is no icon; a server error is worth asking again", async () => {
    expect(await readIconReply(reply(200))).toEqual({ kind: "found", dataUrl: PNG_DATA_URL });
    expect((await readIconReply(reply(404))).kind).toBe("none");
    expect((await readIconReply(reply(503))).kind).toBe("failed");
  });

  test("anything but a small raster image is no icon — an SVG could carry script", async () => {
    expect((await readIconReply(reply(200, "image/svg+xml", "<svg onload='x()'/>"))).kind).toBe("none");
    expect((await readIconReply(reply(200, "text/html", "<html></html>"))).kind).toBe("none");
    expect((await readIconReply(reply(200, "image/png", new Uint8Array(0)))).kind).toBe("none");
    expect((await readIconReply(reply(200, "image/png", new Uint8Array(21 * 1024)))).kind).toBe("none");
  });

  test("asks for the host at twice the largest tile", () => {
    expect(iconSourceUrl("kordatackle.com")).toBe("https://www.google.com/s2/favicons?domain=kordatackle.com&sz=64");
  });
});

describe("Looking for a website's icon", () => {
  test("a new website asks for its icon; one already on file does not ask again", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const korda = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() }));
    const other = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() }));

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: korda, url: "https://kordatackle.com" });
    expect(await iconJobs(t)).toHaveLength(1);

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: other, url: "kordatackle.com" });
    expect(await iconJobs(t)).toHaveLength(1);
  });

  test("an icon found is kept for the website", async () => {
    const t = harness();
    const fetchMock = vi.fn(async () => reply(200));
    vi.stubGlobal("fetch", fetchMock);
    const websiteId = await website(t, "kordatackle.com");

    await t.action(internal.websiteIcons.fetchWebsiteIcon, { websiteId });

    expect(fetchMock).toHaveBeenCalledWith(iconSourceUrl("kordatackle.com"), expect.anything());
    expect(await iconOf(t, websiteId)).toMatchObject({ dataUrl: PNG_DATA_URL, checkedAt: expect.any(Number) });
  });

  test("no icon is written down as answered, and not asked again", async () => {
    const t = harness();
    const fetchMock = vi.fn(async () => reply(404));
    vi.stubGlobal("fetch", fetchMock);
    const websiteId = await website(t, "noicon.com");

    await t.action(internal.websiteIcons.fetchWebsiteIcon, { websiteId });
    await t.action(internal.websiteIcons.fetchWebsiteIcon, { websiteId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const row = await iconOf(t, websiteId);
    expect(row?.dataUrl).toBeUndefined();
    expect(row?.checkedAt).toEqual(expect.any(Number));
  });

  test("a failed request is left unanswered and tried again later, a limited number of times", async () => {
    const t = harness();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const websiteId = await website(t, "flaky.com");

    await t.action(internal.websiteIcons.fetchWebsiteIcon, { websiteId });
    expect(await iconOf(t, websiteId)).toBeNull();
    const retries = await iconJobs(t);
    expect(retries).toHaveLength(1);
    expect(retries[0].args[0]).toEqual({ websiteId, attempt: 1 });

    await t.action(internal.websiteIcons.fetchWebsiteIcon, { websiteId, attempt: 2 });
    expect(await iconJobs(t)).toHaveLength(1);
  });

  test("an answer arriving for a website deleted meanwhile is dropped", async () => {
    const t = harness();
    const websiteId = await website(t, "gone.com");
    await t.run(async (ctx) => await ctx.db.delete(websiteId));

    await t.mutation(internal.websiteIcons.fileWebsiteIcon, { websiteId, dataUrl: PNG_DATA_URL });

    expect(await iconOf(t, websiteId)).toBeNull();
  });
});

describe("Websites added before icons were looked for", () => {
  test("the backfill asks about each website never answered, and only those", async () => {
    const t = harness();
    const unasked = await website(t, "unasked.com");
    await answered(t, await website(t, "answered.com"));

    const result = await t.run(async (ctx) => await requestMissingIcons(ctx, null, 100));

    expect(result).toMatchObject({ isDone: true, processed: 2, updated: 1 });
    const jobs = await iconJobs(t);
    expect(jobs.map((job) => job.args[0])).toEqual([{ websiteId: unasked }]);
  });
});

describe("Drawing the icon", () => {
  test("the Sites list gives each website its icon, and null where there is none", async () => {
    const t = harness();
    const companyId = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() }));
    const memberId = await t.run(async (ctx) =>
      await ctx.db.insert("users", { name: "Member", email: "m@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() }));
    const withIcon = await website(t, "kordatackle.com");
    const withoutIcon = await website(t, "noicon.com");
    await answered(t, withIcon, PNG_DATA_URL);
    await answered(t, withoutIcon);
    await t.run(async (ctx) => {
      for (const websiteId of [withIcon, withoutIcon]) {
        await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      }
    });

    const rows = await t.withIdentity({ subject: memberId }).query(api.sites.listMySites, {});

    const byHost = new Map(rows.map((row) => [row.host, row.iconUrl]));
    expect(byHost.get("kordatackle.com")).toBe(PNG_DATA_URL);
    expect(byHost.get("noicon.com")).toBeNull();
  });

  test("deleting a website deletes its icon", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const websiteId = await website(t, "kordatackle.com");
    await answered(t, websiteId, PNG_DATA_URL);

    await admin.mutation(api.websites.deleteWebsite, { id: websiteId });

    expect(await iconOf(t, websiteId)).toBeNull();
  });
});
