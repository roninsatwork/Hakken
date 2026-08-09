import { describe, expect, test } from "vitest";

import { widgetMessageDisplayText } from "./widgetSystemMessages";

describe("widgetMessageDisplayText", () => {
  const refusal = {
    content: "I'm sorry, but I can't take new messages right now. Please try again later.",
    systemKey: "quotaRefusal",
  };

  test("an ordinary message is shown exactly as stored", () => {
    expect(widgetMessageDisplayText({ content: "Hello there" }, "it-IT")).toBe("Hello there");
  });

  test("an Italian browser reads the refusal in Italian", () => {
    // Both the bare tag and a regional variant: navigator.language reports
    // whatever the OS is set to, and "it-CH" must not read as English.
    expect(widgetMessageDisplayText(refusal, "it")).toContain("Mi dispiace");
    expect(widgetMessageDisplayText(refusal, "it-IT")).toContain("Mi dispiace");
    expect(widgetMessageDisplayText(refusal, "it-CH")).toContain("Mi dispiace");
  });

  test("English and unknown languages fall back to the stored content", () => {
    expect(widgetMessageDisplayText(refusal, "en-GB")).toBe(refusal.content);
    expect(widgetMessageDisplayText(refusal, "fr-FR")).toBe(refusal.content);
    expect(widgetMessageDisplayText(refusal, undefined)).toBe(refusal.content);
  });

  test("a systemKey this client does not know falls back to the stored content", () => {
    // A new key can ship server-side before any client learns it; the stored
    // English must carry the meaning on its own.
    const future = { content: "Something the server said.", systemKey: "notYetInvented" };
    expect(widgetMessageDisplayText(future, "it-IT")).toBe(future.content);
  });
});
