function normalizeChecksumValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeChecksumValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeChecksumValue(entryValue)]),
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(6));
  }
  return value;
}

export function movementBoundaryChecksum(value: unknown) {
  const serialized = JSON.stringify(normalizeChecksumValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
