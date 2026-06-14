import { describe, expect, it } from "vitest";
import { getStudioRoutineTitle } from "./movementPresentation";

describe("movement presentation helpers", () => {
  it("keeps intentional routine names", () => {
    expect(getStudioRoutineTitle("Roll Down")).toBe("Roll Down");
    expect(getStudioRoutineTitle("  Tall Spine Practice  ")).toBe("Tall Spine Practice");
  });

  it("replaces legacy capture titles with a pitch-ready studio name", () => {
    expect(getStudioRoutineTitle("Body Capture 3D")).toBe("Tall Spine Flow");
    expect(getStudioRoutineTitle("Untitled Routine")).toBe("Tall Spine Flow");
    expect(getStudioRoutineTitle("")).toBe("Tall Spine Flow");
  });
});
