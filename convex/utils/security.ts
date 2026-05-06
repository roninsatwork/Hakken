export function validateSafeUrl(url: string, context: string = "URL"): void {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    
    // Block non-HTTP protocols
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`SSRF Prevention: Invalid protocol via ${context}`);
    }

    if (host === "localhost" || host === "metadata.google.internal" || host === "metadata.azure.com") {
      throw new Error(`SSRF Prevention: Restricted internal host denied via ${context}`);
    }

    // 1. Check for pure IPv6 patterns
    if (host.includes(":")) {
      if (host === "[::1]" || host === "[::]" || host.startsWith("[fd") || host.startsWith("[fc") || host.startsWith("[fe80")) {
         throw new Error(`SSRF Prevention: Private IPv6 address denied via ${context}`);
      }
      if (host.includes("::ffff:")) {
         throw new Error(`SSRF Prevention: IPv4-mapped IPv6 address denied via ${context}`);
      }
    }
    
    // 2. IPv4 Regex for private blocks
    const ipv4Private = /^(0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+)$/;
    if (ipv4Private.test(host)) {
        throw new Error(`SSRF Prevention: Private IPv4 address denied via ${context}`);
    }
    
    // 3. Reject non-standard representations of IPs (octal, hex, int)
    if (/^\d+$/.test(host)) {
        throw new Error(`SSRF Prevention: Numerical IP representation denied via ${context}`);
    }
    
    if (/^0x[0-9a-f]+$/i.test(host) || host.includes(".0x")) {
        throw new Error(`SSRF Prevention: Hexadecimal IP representation denied via ${context}`);
    }
    
    // Octal representations starting with 0
    if (/^0[0-7]+(\.0[0-7]+)*$/.test(host) || host.includes(".0")) {
        // Exclude 0.0.0.0 because it's caught above, but catch other .0 things just in case, wait, 10.0.0.1 has .0
        // So host.includes(".0") is bad. We just check if the host matches octal formats
        // Better:
        const parts = host.split(".");
        if (parts.some(p => p.length > 1 && p.startsWith("0") && !p.includes("x"))) {
            throw new Error(`SSRF Prevention: Octal IP representation denied via ${context}`);
        }
    }

  } catch (e: any) {
    if (e.message && e.message.startsWith("SSRF Prevention")) throw e;
    throw new Error(`SSRF Prevention: Malformed URL provided for ${context}.`);
  }
}
