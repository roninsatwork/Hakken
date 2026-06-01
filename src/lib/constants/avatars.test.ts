import { describe, expect, it } from "vitest";
import { AVATAR_ROSTER } from "./avatars";

describe("AVATAR_ROSTER", () => {
  it("keeps stable ids, names, and model paths for every selectable avatar", () => {
    expect(AVATAR_ROSTER).toHaveLength(7);
    expect(new Set(AVATAR_ROSTER.map((avatar) => avatar.id)).size).toBe(AVATAR_ROSTER.length);
    expect(AVATAR_ROSTER.every((avatar) => avatar.path.startsWith("/models/"))).toBe(true);
    expect(AVATAR_ROSTER.map((avatar) => avatar.name)).toEqual(
      expect.arrayContaining(["Eugenia", "Samuela", "Summer V2", "Tom", "Jane", "Charlotte", "Rachel"])
    );
  });
});
