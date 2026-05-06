export function validateSafeUrl(url: string, context: string = "URL"): void {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    // Block traversal, internal network lookups, and cloud metadata
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("169.254.") ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    ) {
      throw new Error(`SSRF Prevention: Cannot access internal or restricted URL (${url}) via ${context}`);
    }
  } catch (e: any) {
    if (e.message && e.message.startsWith("SSRF Prevention")) throw e;
    throw new Error(`SSRF Prevention: Malformed URL provided for ${context}.`);
  }
}
