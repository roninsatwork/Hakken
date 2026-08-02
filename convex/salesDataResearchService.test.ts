import { describe, expect, test } from "vitest";
import {
  canonicalSourceUrl,
  parseCount,
  researchIdempotencyKey,
  resolveSourceName,
  routeResearchFinding,
} from "./salesDataResearchService";

/**
 * Where a finding lands.
 *
 * These rules are the reason the agent may be left to write without stopping
 * for approval, so they are tested on their own rather than only through the
 * mutation that calls them. Each case here is a way the CRM could quietly fill
 * up with something nobody can stand behind.
 */

const base = {
  field: "phone",
  value: "01803 555000",
  confidence: "HIGH",
  sourceUrl: "https://devonshirehotel.co.uk/contact",
  fieldHasValue: false,
  extraFieldForCustomer: "bedrooms" as const,
};

describe("routing a research finding", () => {
  test("a confident value on an empty field is written to the record", () => {
    const decision = routeResearchFinding(base);

    expect(decision).toMatchObject({
      ok: true,
      status: "APPLIED",
      field: "phone",
      writeValue: "01803 555000",
    });
  });

  test("a medium finding on an empty field parks, and nothing is written", () => {
    const decision = routeResearchFinding({ ...base, confidence: "MEDIUM" });

    expect(decision).toMatchObject({ ok: true, status: "NEEDS_CHECK" });
    expect(decision).not.toHaveProperty("writeValue");
  });

  test("a low finding parks too", () => {
    expect(routeResearchFinding({ ...base, confidence: "LOW" })).toMatchObject({
      status: "NEEDS_CHECK",
    });
  });

  test("a confident finding parks when somebody has already typed a value", () => {
    const decision = routeResearchFinding({ ...base, fieldHasValue: true });

    // The point of the whole feature: what a person typed is not overwritten,
    // and the contradiction is put in front of somebody rather than resolved.
    expect(decision).toMatchObject({ ok: true, status: "NEEDS_CHECK" });
    expect(decision).not.toHaveProperty("writeValue");
  });

  test("a value with no source is refused outright", () => {
    expect(routeResearchFinding({ ...base, sourceUrl: undefined })).toMatchObject({ ok: false });
  });

  test("a source that is not a web address is refused", () => {
    expect(routeResearchFinding({ ...base, sourceUrl: "the hotel's website" })).toMatchObject({
      ok: false,
    });
  });

  test("a bed count offered for a school is refused", () => {
    const decision = routeResearchFinding({
      ...base,
      field: "bedrooms",
      value: "64",
      extraFieldForCustomer: "pupils",
    });

    expect(decision).toMatchObject({ ok: false });
    expect(decision).toHaveProperty("reason", expect.stringContaining("pupils"));
  });

  test("a pupil count is accepted for a school", () => {
    expect(
      routeResearchFinding({
        ...base,
        field: "pupils",
        value: "820",
        extraFieldForCustomer: "pupils",
      })
    ).toMatchObject({ ok: true, status: "APPLIED", writeValue: 820 });
  });

  test("a figure offered for a type that has neither is refused", () => {
    expect(
      routeResearchFinding({
        ...base,
        field: "bedrooms",
        value: "64",
        extraFieldForCustomer: null,
      })
    ).toMatchObject({ ok: false });
  });

  test("a count written as it appears on a register is read", () => {
    expect(
      routeResearchFinding({
        ...base,
        field: "bedrooms",
        value: "Registered beds: 64",
      })
    ).toMatchObject({ status: "APPLIED", writeValue: 64 });
  });

  test("a count that is really two numbers is refused rather than guessed at", () => {
    expect(
      routeResearchFinding({ ...base, field: "bedrooms", value: "40 beds across 2 units" })
    ).toMatchObject({ ok: false });
  });

  test("nothing found is a recordable answer, and needs no source", () => {
    const decision = routeResearchFinding({
      ...base,
      value: "",
      confidence: "",
      sourceUrl: undefined,
      notFound: true,
    });

    expect(decision).toMatchObject({ ok: true, status: "NOT_FOUND" });
    expect(decision).not.toHaveProperty("writeValue");
  });

  test("a field the record does not hold is refused", () => {
    expect(routeResearchFinding({ ...base, field: "vatNumber" })).toMatchObject({ ok: false });
  });

  test("notes cannot be written by the agent", () => {
    expect(routeResearchFinding({ ...base, field: "notes", value: "Nice people" })).toMatchObject({
      ok: false,
    });
  });

  test("an empty value with no notFound flag is refused", () => {
    expect(routeResearchFinding({ ...base, value: "   " })).toMatchObject({ ok: false });
  });

  test("a confidence the platform does not recognise is refused", () => {
    expect(routeResearchFinding({ ...base, confidence: "PRETTY SURE" })).toMatchObject({
      ok: false,
    });
  });
});

describe("reading a count", () => {
  test.each([
    ["64", 64],
    ["Registered beds: 64", 64],
    ["1,200 pupils", 1200],
  ])("%s reads as %s", (input, expected) => {
    expect(parseCount(input)).toBe(expected);
  });

  test.each(["none", "40 beds across 2 units", "0", "-5"])("%s is not a count", (input) => {
    expect(parseCount(input)).toBeNull();
  });
});

describe("reducing a source to the page it names", () => {
  test("query strings, fragments, trailing slashes and www do not make a new page", () => {
    const canonical = canonicalSourceUrl("https://allegracare.co.uk/fairmile-grange");
    expect(canonicalSourceUrl("https://www.allegracare.co.uk/fairmile-grange/?ref=x#top")).toBe(
      canonical
    );
  });

  test("a different path is a different page", () => {
    // The exact pair from the first live run: the agent cited a plausible
    // address it had never opened, and the one it had read was elsewhere.
    expect(canonicalSourceUrl("https://www.allegracare.co.uk/our-homes/fairmile-grange")).not.toBe(
      canonicalSourceUrl("https://allegracare.co.uk/fairmile-grange")
    );
  });

  test("a different host is a different page", () => {
    expect(canonicalSourceUrl("https://cqc.org.uk/location/1-2")).not.toBe(
      canonicalSourceUrl("https://allegracare.co.uk/location/1-2")
    );
  });

  test("anything unusable is not a page", () => {
    expect(canonicalSourceUrl("the hotel's website")).toBeNull();
    expect(canonicalSourceUrl(undefined)).toBeNull();
  });
});

describe("naming a source", () => {
  test("uses what the agent called it", () => {
    expect(resolveSourceName("Devonshire Hotel", "https://devonshirehotel.co.uk/contact")).toBe(
      "Devonshire Hotel"
    );
  });

  test("falls back to the site, without the www", () => {
    expect(resolveSourceName(undefined, "https://www.cqc.org.uk/location/1-234")).toBe("cqc.org.uk");
  });
});

describe("the key that stops a replay writing twice", () => {
  test("the same finding produces the same key however it is spelled", () => {
    const first = researchIdempotencyKey({
      subjectKey: "THE DEVONSHIRE HOTEL LTD",
      field: "phone",
      value: "01803 555000",
    });
    const second = researchIdempotencyKey({
      subjectKey: "THE DEVONSHIRE HOTEL LTD",
      field: "phone",
      value: " 01803 555000 ",
    });

    expect(first).toBe(second);
  });

  test("a different value is a different finding", () => {
    expect(
      researchIdempotencyKey({ subjectKey: "A", field: "phone", value: "111" })
    ).not.toBe(researchIdempotencyKey({ subjectKey: "A", field: "phone", value: "222" }));
  });

  test("nothing found has its own key, whatever value came with it", () => {
    expect(
      researchIdempotencyKey({ subjectKey: "A", field: "phone", value: "", notFound: true })
    ).toContain("NOT_FOUND");
  });
});
