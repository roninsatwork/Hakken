import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_THINKING_LEVEL,
  modelSupportsThinking,
  readRememberedThinkingLevel,
  rememberThinkingLevel,
  resolveThinkingLevelForModel,
} from "./composerPreferences";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/**
 * The thinking level used to reset to Fast on every load. It is a
 * preference, so it survives the page — but only where it means something.
 */
describe("remembering the thinking level", () => {
  test("a chosen level comes back on the next load", () => {
    rememberThinkingLevel("MEDIUM");
    expect(readRememberedThinkingLevel()).toBe("MEDIUM");
  });

  test("nothing stored yet reads as the default", () => {
    expect(readRememberedThinkingLevel()).toBe(DEFAULT_THINKING_LEVEL);
  });

  test("a value written by a different build is ignored, not trusted", () => {
    window.localStorage.setItem("hakken.composer.thinkingLevel", "EXTREME");
    expect(readRememberedThinkingLevel()).toBe(DEFAULT_THINKING_LEVEL);
  });

  test("a browser that refuses storage still gives a usable composer", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => rememberThinkingLevel("HIGH")).not.toThrow();
    expect(readRememberedThinkingLevel()).toBe(DEFAULT_THINKING_LEVEL);
  });
});

describe("what actually gets sent", () => {
  test("the remembered level is used where the model acts on it", () => {
    expect(resolveThinkingLevelForModel({ remembered: "HIGH", modelSupportsThinking: true })).toBe("HIGH");
  });

  test("a model that ignores thinking is never sent a level it did not offer", () => {
    // The control is hidden for these models, so sending the remembered value
    // would mean the request claimed a setting the screen never showed.
    expect(resolveThinkingLevelForModel({ remembered: "HIGH", modelSupportsThinking: false })).toBe("NONE");
  });

  test("the remembered choice survives a trip through a model that ignores it", () => {
    rememberThinkingLevel("MEDIUM");
    expect(resolveThinkingLevelForModel({ remembered: readRememberedThinkingLevel(), modelSupportsThinking: false })).toBe("NONE");
    // Back on a model that thinks, the earlier choice is still there.
    expect(resolveThinkingLevelForModel({ remembered: readRememberedThinkingLevel(), modelSupportsThinking: true })).toBe("MEDIUM");
  });

  test("only providers that act on the setting are treated as supporting it", () => {
    expect(modelSupportsThinking("google")).toBe(true);
    expect(modelSupportsThinking("openai")).toBe(false);
    expect(modelSupportsThinking("anthropic")).toBe(false);
    expect(modelSupportsThinking("openrouter")).toBe(false);
    expect(modelSupportsThinking(undefined)).toBe(false);
  });
});
