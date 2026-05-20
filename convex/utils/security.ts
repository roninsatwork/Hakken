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
      // Strip brackets for normalization
      const normalizedHost = host.replace(/[\[\]]/g, "");
      
      const isLoopback = normalizedHost === "::1" || normalizedHost === "::" || 
                        normalizedHost === "0:0:0:0:0:0:0:1" || normalizedHost === "0:0:0:0:0:0:0:0" ||
                        /^:*:*$/.test(normalizedHost);
      
      const isPrivate = normalizedHost.startsWith("fd") || normalizedHost.startsWith("fc") || 
                        normalizedHost.startsWith("fe80") || normalizedHost.startsWith("f::") || 
                        normalizedHost.startsWith("f:0:0:0:");

      if (isLoopback || isPrivate) {
         throw new Error(`SSRF Prevention: Private IPv6 address denied via ${context}`);
      }
      if (normalizedHost.includes("::ffff:")) {
         throw new Error(`SSRF Prevention: IPv4-mapped IPv6 address denied via ${context}`);
      }
    }
    
    // 2. IPv4 Regex for private blocks, Carrier-Grade NAT (100.64.0.0/10), and wildcard (0.0.0.0/8)
    const ipv4Private = /^(0\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+)$/;
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
