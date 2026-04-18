export function resolveTemplate(template: string | object, globalPayload: Record<string, any>): any {
  if (!template) return template;

  // Helper to extract nested values
  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => {
      // Handle array indices if needed, e.g., items[0]
      const match = part.match(/(.+?)\[(\d+)\]/);
      if (match && acc && match[1] in acc) {
        return acc[match[1]][parseInt(match[2], 10)];
      }
      return acc && typeof acc === 'object' ? acc[part] : undefined;
    }, obj);
  };

  // If template is a string, replace {{ }} interpolations
  if (typeof template === "string") {
    return template.replace(/\{\{\s*([\w\.\[\]]+)\s*\}\}/g, (match, path) => {
      const value = getNestedValue(globalPayload, path);
      if (value === undefined || value === null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  }

  // If template is an object (like a JSON Schema mapping), recursively resolve strings
  if (typeof template === "object" && template !== null) {
    const objTemplate = template as Record<string, any>;
    const resolvedObject: any = Array.isArray(objTemplate) ? [] : {};
    for (const key in objTemplate) {
      if (typeof objTemplate[key] === "string") {
        resolvedObject[key] = resolveTemplate(objTemplate[key], globalPayload);
      } else if (typeof objTemplate[key] === "object") {
        resolvedObject[key] = resolveTemplate(objTemplate[key], globalPayload);
      } else {
        resolvedObject[key] = objTemplate[key];
      }
    }
    return resolvedObject;
  }

  return template;
}
