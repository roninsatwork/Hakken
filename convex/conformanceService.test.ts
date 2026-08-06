import { describe, expect, test } from "vitest";
import {
  beyondRating,
  checkConformance,
  describeFinding,
  ratingFor,
  type SideEffectLevel,
} from "./conformanceService";

const check = (rating: "LOW" | "MEDIUM" | "HIGH" | undefined, observed: SideEffectLevel[]) =>
  checkConformance({ agentId: "a", agentName: "Invoice checker", rating, observed });

describe("the rating a behaviour actually calls for", () => {
  test("reading only is low", () => {
    expect(ratingFor(["READ", "READ"])).toBe("LOW");
  });

  test("changing things inside the platform is medium", () => {
    expect(ratingFor(["READ", "WRITE"])).toBe("MEDIUM");
  });

  test("reaching outside, or destroying, is high", () => {
    expect(ratingFor(["EXTERNAL"])).toBe("HIGH");
    expect(ratingFor(["DESTRUCTIVE"])).toBe("HIGH");
  });

  test("doing nothing at all is low", () => {
    expect(ratingFor([])).toBe("LOW");
  });
});

describe("what a rating does not account for", () => {
  test("a low-rated assistant that writes is beyond its rating", () => {
    expect(beyondRating("LOW", ["READ", "WRITE"])).toEqual(["WRITE"]);
  });

  test("a high rating covers everything", () => {
    expect(beyondRating("HIGH", ["READ", "WRITE", "DESTRUCTIVE", "EXTERNAL"])).toEqual([]);
  });

  test("each kind is named once, however often it happened", () => {
    expect(beyondRating("LOW", ["WRITE", "WRITE", "WRITE"])).toEqual(["WRITE"]);
  });
});

describe("whether an assistant still matches its classification", () => {
  test("behaviour within the rating produces nothing", () => {
    expect(check("MEDIUM", ["READ", "WRITE"])).toBeNull();
  });

  test("behaviour beyond it is reported, with the rating that would fit", () => {
    const finding = check("LOW", ["READ", "EXTERNAL"]);

    expect(finding?.observed).toEqual(["EXTERNAL"]);
    expect(finding?.suggested).toBe("HIGH");
  });

  test("an unrated assistant produces nothing, because nobody has claimed anything", () => {
    // The register already reports it as unrated. Saying it twice is noise.
    expect(check(undefined, ["EXTERNAL"])).toBeNull();
  });

  test("an assistant that has done nothing yet produces nothing", () => {
    expect(check("LOW", [])).toBeNull();
  });
});

describe("how a finding reads", () => {
  test("as a sentence a compliance officer can act on", () => {
    const finding = check("LOW", ["EXTERNAL"])!;

    expect(describeFinding(finding)).toBe(
      "Invoice checker is rated low risk, but it reached outside the platform. That is high-risk behaviour."
    );
  });

  test("names every kind, not just the worst", () => {
    const finding = check("LOW", ["WRITE", "DESTRUCTIVE"])!;

    expect(describeFinding(finding)).toContain("changed things inside the platform, and deleted things");
  });
});
