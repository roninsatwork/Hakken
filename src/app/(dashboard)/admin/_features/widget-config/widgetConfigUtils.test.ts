import { describe, expect, test } from "vitest";
import {
  buildWidgetEmbedSnippet,
  canAddConversationStarter,
  getWidgetLogoPreviewUrl,
  parseAllowedDomains,
} from "./widgetConfigUtils";

describe("widget config utils", () => {
  test("parses comma separated allowed domains", () => {
    expect(parseAllowedDomains(" https://example.com, ,https://app.example.com ")).toEqual([
      "https://example.com",
      "https://app.example.com",
    ]);
  });

  test("builds embed snippet only when a widget id exists", () => {
    expect(buildWidgetEmbedSnippet("https://hakken.local", "widget123")).toBe(
      '<script src="https://hakken.local/embed.js" data-widget-id="widget123"></script>',
    );
    expect(buildWidgetEmbedSnippet("https://hakken.local")).toBe("");
  });

  test("only browser-displayable logos are treated as preview urls", () => {
    expect(getWidgetLogoPreviewUrl("blob:http://local/logo")).toBe("blob:http://local/logo");
    expect(getWidgetLogoPreviewUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    expect(getWidgetLogoPreviewUrl("storage-id-123")).toBeNull();
  });

  test("enforces starter text and the four starter limit", () => {
    expect(canAddConversationStarter("  ", [])).toBe(false);
    expect(canAddConversationStarter("Help me", ["a", "b", "c", "d"])).toBe(false);
    expect(canAddConversationStarter("Help me", ["a", "b", "c"])).toBe(true);
  });
});
