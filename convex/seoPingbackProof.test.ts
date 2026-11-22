import { describe, expect, test } from "vitest";
import { seoPingbackProof, seoPingbackProofMatches } from "./seoPingbackProof";

describe("SEO pingback proof", () => {
  test("binds the callback to the submitted tag and backend credential", async () => {
    const proof = await seoPingbackProof("submitted-tag", "private-password");
    expect(await seoPingbackProofMatches("submitted-tag", proof, "private-password")).toBe(true);
    expect(await seoPingbackProofMatches("other-tag", proof, "private-password")).toBe(false);
    expect(await seoPingbackProofMatches("submitted-tag", proof, "other-password")).toBe(false);
    expect(await seoPingbackProofMatches("submitted-tag", "bad", "private-password")).toBe(false);
  });
});
