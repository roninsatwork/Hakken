import { describe, expect, test } from "vitest";
import { readSource, sourceCode } from "./autoSetupAgent";
import { mainPagesOf, readJson } from "./autoSetupText";

describe("Auto Setup's text helpers (auto-setup-plan.md, AS5, AS6)", () => {
  test("a home page's main pages: the business's own, the likeliest first, never posts, carts, files or other websites", () => {
    const links = [
      "https://www.nec.ac.uk/blog/new-courses",
      "https://nec.ac.uk/a-levels",
      "/about-us/",
      "https://nec.ac.uk/gcse/maths/past-papers/2024",
      "https://nec.ac.uk/basket",
      "https://nec.ac.uk/prospectus.pdf",
      "https://elsewhere.test/about",
      "https://nec.ac.uk/a-levels#fees",
      "https://nec.ac.uk/fees",
      "https://nec.ac.uk/staff-room",
    ];
    expect(mainPagesOf("nec.ac.uk", links, 3)).toEqual(["https://nec.ac.uk/fees", "https://nec.ac.uk/about-us/", "https://nec.ac.uk/a-levels"]);
  });

  test("the model's JSON is read in a code fence or with words around it, and nothing is made of a reply that is not JSON", () => {
    expect(readJson<{ a: number }>("Here it is:\n```json\n{\"a\": 1}\n```")).toEqual({ a: 1 });
    expect(readJson("No idea.")).toBeNull();
    expect(readJson("{ broken")).toBeNull();
  });

  test("what a box was written from is kept as a short code and read back", () => {
    expect(sourceCode("RIVALS", ["a.com", "b.com"])).toBe("RIVALS:a.com,b.com");
    expect(readSource("RIVALS:a.com,b.com")).toEqual({ kind: "RIVALS", hosts: ["a.com", "b.com"] });
    expect(readSource(sourceCode("OWN_NAME"))).toEqual({ kind: "OWN_NAME", hosts: [] });
    expect(readSource("SOMETHING")).toBeNull();
    expect(readSource(null)).toBeNull();
  });
});
