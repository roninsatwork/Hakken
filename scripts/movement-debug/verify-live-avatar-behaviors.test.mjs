import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("mounted Game behaviour acceptance policy", () => {
  it("treats supported root, hand, and face behaviour as hard failures", () => {
    const source = fs.readFileSync(
      "scripts/movement-debug/verify-live-avatar-behaviors.mjs",
      "utf8",
    );

    expect(source).not.toContain("diagnosticLimitations");
    expect(source).toContain("root-turn-did-not-establish-rendered-history");
    expect(source).toContain("hand-curl-did-not-reach-rendered-hands");
    expect(source).toContain("asymmetric-blink-did-not-reach-rendered-face");
  });
});
