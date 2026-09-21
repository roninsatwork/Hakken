import { describe, expect, test } from "vitest";

import {
  SEO_OPERATIONS,
  buildSeoTask,
  describeSeoOperation,
  findSeoOperation,
  searchSeoOperations,
  seoOperationFamilies,
  seoResultPath,
  seoSiteOperations,
  seoSiteOperationParams,
} from "./dataForSeoRegistry";

/**
 * The registry is what stands between an agent and a wasted charge.
 *
 * DataForSEO bills for the attempt, not the success, so every refusal that
 * happens here is money not spent. The tests below are mostly about refusals
 * for that reason: an accepted-but-wrong request is the expensive failure, and
 * it is invisible until the bill.
 */

describe("the registry holds well-formed entries", () => {
  test("every operation has a unique id", () => {
    const ids = SEO_OPERATIONS.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a queued operation posts a task and a live one does not", () => {
    // The suffix is not decoration: it is how DataForSEO decides whether the
    // answer comes back now or later, so a mismatch here means a webhook that
    // never arrives or a result nobody reads.
    for (const operation of SEO_OPERATIONS) {
      if (operation.mode === "QUEUED") expect(operation.path.endsWith("/task_post")).toBe(true);
      else expect(operation.path.endsWith("/live")).toBe(true);
    }
  });

  test("every queued operation says where its result is collected from", () => {
    // A queued task with nowhere to collect from is a charge nobody can read.
    for (const operation of SEO_OPERATIONS) {
      if (operation.mode === "QUEUED") {
        expect(operation.resultPath).toBeTruthy();
        expect(operation.resultPath).toContain("$id");
      } else {
        expect(operation.resultPath).toBeUndefined();
      }
    }
  });

  test("a result path puts the task id where the placeholder was", () => {
    const queued = SEO_OPERATIONS.find((operation) => operation.mode === "QUEUED")!;
    const live = SEO_OPERATIONS.find((operation) => operation.mode === "LIVE")!;

    expect(seoResultPath(queued, "abc-123")).toContain("abc-123");
    expect(seoResultPath(queued, "abc-123")).not.toContain("$id");
    expect(seoResultPath(live, "abc-123")).toBeNull();
  });

  test("a task id is escaped rather than pasted into the path", () => {
    const queued = SEO_OPERATIONS.find((operation) => operation.mode === "QUEUED")!;
    expect(seoResultPath(queued, "../../v3/appendix/user_data")).not.toContain("../");
  });

  test("every path is a v3 path", () => {
    for (const operation of SEO_OPERATIONS) {
      expect(operation.path.startsWith("/v3/")).toBe(true);
    }
  });

  test("every operation says what it answers, in words a person could read", () => {
    for (const operation of SEO_OPERATIONS) {
      expect(operation.question.length).toBeGreaterThan(20);
      expect(operation.family.length).toBeGreaterThan(0);
    }
  });

  test("every parameter explains itself, because the model reads it", () => {
    for (const operation of SEO_OPERATIONS) {
      for (const param of Object.values(operation.params)) {
        expect(param.description.length).toBeGreaterThan(10);
      }
    }
  });

  test("the families it covers are the ones it claims", () => {
    expect(seoOperationFamilies()).toEqual([
      "Backlinks",
      "DataForSEO Labs",
      "Keywords Data",
      "SERP",
    ]);
  });
});

describe("finding an operation", () => {
  test("by id", () => {
    expect(findSeoOperation("backlinks_summary")?.family).toBe("Backlinks");
  });

  test("an unknown id is null, not a throw", () => {
    expect(findSeoOperation("nonsense")).toBeNull();
  });

  test("searching by family", () => {
    const found = searchSeoOperations("backlinks");
    expect(found.map((operation) => operation.id)).toContain("backlinks_summary");
  });

  test("searching in plain words, as an agent would ask", () => {
    const found = searchSeoOperations("how strong is this site");
    expect(found.map((operation) => operation.id)).toContain("backlinks_summary");
  });

  test("a blank search shows the menu rather than nothing", () => {
    // An agent that does not know what to ask for should see what exists.
    expect(searchSeoOperations()).toHaveLength(SEO_OPERATIONS.length);
    expect(searchSeoOperations("   ")).toHaveLength(SEO_OPERATIONS.length);
  });

  test("a search matching nothing returns nothing", () => {
    expect(searchSeoOperations("zzzzz")).toHaveLength(0);
  });
});

describe("what the model is shown", () => {
  test("it never sees the path, because it has nowhere to put one", () => {
    const described = describeSeoOperation(findSeoOperation("serp_google_organic")!);
    expect(JSON.stringify(described)).not.toContain("/v3/");
  });

  test("it is told when an answer will not arrive in this reply", () => {
    // An agent that thinks a queued result is coming back now will sit and
    // wait for numbers that cannot exist yet.
    expect(describeSeoOperation(findSeoOperation("serp_google_organic")!).resultArrives)
      .toBe("later, separately");
    expect(describeSeoOperation(findSeoOperation("backlinks_summary")!).resultArrives)
      .toBe("in this reply");
  });

  test("required and optional parameters are distinguished, with their defaults", () => {
    const described = describeSeoOperation(findSeoOperation("domain_ranked_keywords")!);
    const target = described.parameters.find((param) => param.name === "target");
    const limit = described.parameters.find((param) => param.name === "limit");

    expect(target?.required).toBe(true);
    expect(limit?.required).toBe(false);
    expect(limit?.default).toBe(100);
  });
});

describe("building a task — what is refused before any money is spent", () => {
  test("an operation that does not exist", () => {
    const result = buildSeoTask("invented_operation", { target: "example.com" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.field).toBe("operation");
    expect(result.ok === false && result.problem.message).toContain("describe_seo_operations");
  });

  test("a missing required parameter", () => {
    const result = buildSeoTask("backlinks_summary", {});
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.field).toBe("target");
  });

  test("an empty required parameter is missing, not empty", () => {
    expect(buildSeoTask("backlinks_summary", { target: "" }).ok).toBe(false);
    expect(buildSeoTask("serp_google_organic", { keyword: "   " }).ok).toBe(false);
  });

  test("a target that is not a website", () => {
    const result = buildSeoTask("backlinks_summary", { target: "not a domain" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.message).toContain("not a website address");
  });

  test("a target that is somewhere only this machine can reach", () => {
    expect(buildSeoTask("backlinks_summary", { target: "localhost:3000" }).ok).toBe(false);
  });

  test("a number that is not a number", () => {
    const result = buildSeoTask("domain_ranked_keywords", { target: "example.com", limit: "loads" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.field).toBe("limit");
  });

  test("more keywords than DataForSEO will take in one task", () => {
    const many = Array.from({ length: 1001 }, (_, index) => `keyword ${index}`);
    const result = buildSeoTask("keyword_search_volume", { keywords: many });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.message).toContain("1,000");
  });
});

describe("building a task — what it produces", () => {
  test("a target is normalised the same way the Websites screens normalise it", () => {
    // If these ever disagree, a pull cannot be matched to the website it was
    // for, and the ledger stops meaning anything.
    const result = buildSeoTask("backlinks_summary", { target: "https://www.Example.com/uk?a=1" });
    expect(result.ok && result.task).toEqual({ target: "example.com" });
  });

  test("optional parameters fall back to their defaults", () => {
    const result = buildSeoTask("serp_google_organic", { keyword: "emergency plumber leeds" });
    expect(result.ok && result.task).toEqual({
      keyword: "emergency plumber leeds",
      location_code: 2826,
      language_code: "en",
    });
  });

  test("the default location is the United Kingdom", () => {
    // 2826 is DataForSEO's code for the UK. Hakken sells to UK businesses, so
    // a default of anywhere else would quietly measure the wrong country.
    const result = buildSeoTask("serp_google_organic", { keyword: "x" });
    expect(result.ok && result.task.location_code).toBe(2826);
  });

  test("a given value beats the default", () => {
    const result = buildSeoTask("serp_google_organic", { keyword: "x", location_code: 2840 });
    expect(result.ok && result.task.location_code).toBe(2840);
  });

  test("keywords arrive as a list, however they were given", () => {
    const fromString = buildSeoTask("keyword_search_volume", { keywords: "plumber, boiler repair " });
    const fromArray = buildSeoTask("keyword_search_volume", { keywords: ["plumber", "boiler repair"] });

    expect(fromString.ok && fromString.task.keywords).toEqual(["plumber", "boiler repair"]);
    expect(fromArray.ok && fromArray.task.keywords).toEqual(["plumber", "boiler repair"]);
  });

  test("a number arrives as a number, not the string the model sent", () => {
    const result = buildSeoTask("domain_ranked_keywords", { target: "example.com", limit: "25" });
    expect(result.ok && result.task.limit).toBe(25);
  });

  test("nothing the agent did not ask for is added", () => {
    const result = buildSeoTask("backlinks_summary", { target: "example.com", nonsense: "ignored" });
    expect(result.ok && Object.keys(result.task)).toEqual(["target"]);
  });
});

describe("seoSiteOperations", () => {
  test("is every operation a host alone is enough to ask", () => {
    const ids = seoSiteOperations().map((operation) => operation.id);

    expect(ids).toContain("domain_ranked_keywords");
    expect(ids).toContain("backlinks_summary");
  });

  test("leaves out the ones that need a keyword", () => {
    const ids = seoSiteOperations().map((operation) => operation.id);

    // These are one paid task *per keyword*, so a cycle may not start running
    // them for every site on its own. That is a plan decision.
    expect(ids).not.toContain("serp_google_organic");
    expect(ids).not.toContain("keyword_search_volume");
  });
});

describe("seoSiteOperationParams", () => {
  test("fills the host and the registry's own defaults", () => {
    const operation = seoSiteOperations().find((op) => op.id === "domain_ranked_keywords");
    expect(operation).toBeTruthy();

    const params = seoSiteOperationParams(operation!, "example.com");

    expect(params.target).toBe("example.com");
    // Defaults are filled at enqueue rather than at send, so what was asked
    // and what was hashed for the duplicate check are the same thing.
    expect(params.location_code).toBe(2826);
    expect(params.language_code).toBe("en");
    expect(params.limit).toBe(100);
  });
});
