import { expect, test, describe } from "vitest";
import { resolveTemplate } from "./templateParser";

describe("Security Utilities - resolveTemplate", () => {
  test("Resolves simple string template", () => {
    const payload = { user: { name: "Alice" } };
    const result = resolveTemplate("Hello {{ user.name }}", payload);
    expect(result).toBe("Hello Alice");
  });

  test("Resolves nested array paths", () => {
    const payload = { data: { items: ["apple", "banana"] } };
    const result = resolveTemplate("Item: {{ data.items[1] }}", payload);
    expect(result).toBe("Item: banana");
  });

  test("Recursively resolves object templates", () => {
    const payload = { config: { url: "https://example.com" }, limit: 10 };
    const template = {
      endpoint: "{{ config.url }}",
      max: "{{ limit }}",
      nested: {
        value: "{{ config.url }}/api"
      }
    };
    const result = resolveTemplate(template, payload);
    expect(result).toEqual({
      endpoint: "https://example.com",
      max: "10",
      nested: {
        value: "https://example.com/api"
      }
    });
  });

  test("Returns empty string for missing paths in string template", () => {
    const payload = { user: {} };
    const result = resolveTemplate("Hello {{ user.name }}", payload);
    expect(result).toBe("Hello ");
  });
});
