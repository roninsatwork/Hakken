type TemplateObject = Record<string, unknown>;

export function resolveTemplate<T>(template: T, globalPayload: Record<string, unknown>): T {
  if (!template) return template;

  // Helper to extract nested values
  const getNestedValue = (obj: unknown, path: string): unknown => {
    return path.split('.').reduce<unknown>((acc, part) => {
      // Handle array indices if needed, e.g., items[0]
      const match = part.match(/(.+?)\[(\d+)\]/);
      if (match && acc && typeof acc === "object" && match[1] in acc) {
        const value = (acc as Record<string, unknown>)[match[1]];
        return Array.isArray(value) ? value[parseInt(match[2], 10)] : undefined;
      }
      return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined;
    }, obj);
  };

  // If template is a string, replace {{ }} interpolations
  if (typeof template === "string") {
    return template.replace(/\{\{\s*([\w.[\]-]+)\s*\}\}/g, (match, path) => {
      const value = getNestedValue(globalPayload, path);
      if (value === undefined || value === null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }) as T;
  }

  // If template is an object (like a JSON Schema mapping), recursively resolve strings
  if (typeof template === "object" && template !== null) {
    if (Array.isArray(template)) {
      return template.map((item) => resolveTemplate(item, globalPayload)) as T;
    }

    const resolvedObject: TemplateObject = {};
    for (const [key, value] of Object.entries(template)) {
      resolvedObject[key] = resolveTemplate(value, globalPayload);
    }
    return resolvedObject as T;
  }

  return template;
}
