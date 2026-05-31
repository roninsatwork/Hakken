import { describe, expect, test } from "vitest";
import {
  getDefaultModelId,
  getExecutionModelPool,
  SYSTEM_FAILSAFE_MODEL_ID,
} from "./aiModelService";

const model = (modelId: string, isEnabled: boolean, isDefault = false) => ({
  modelId,
  isEnabled,
  isDefault,
});

describe("aiModelService", () => {
  test("uses the active default model when one is configured", () => {
    expect(getDefaultModelId([
      model("disabled-default", false, true),
      model("active-default", true, true),
    ])).toBe("active-default");
  });

  test("falls back to the platform failsafe when no active default exists", () => {
    expect(getDefaultModelId([
      model("disabled-default", false, true),
      model("active-secondary", true, false),
    ])).toBe(SYSTEM_FAILSAFE_MODEL_ID);
  });

  test("returns only enabled models for execution pools", () => {
    expect(getExecutionModelPool([
      model("enabled-a", true),
      model("disabled-b", false),
      model("enabled-c", true),
    ])).toEqual(["enabled-a", "enabled-c"]);
  });

  test("uses the failsafe as the execution pool when no enabled models exist", () => {
    expect(getExecutionModelPool([
      model("disabled-a", false),
      model("disabled-b", false),
    ])).toEqual([SYSTEM_FAILSAFE_MODEL_ID]);
  });
});
