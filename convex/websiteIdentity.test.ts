import { describe, expect, test } from "vitest";

import {
  WEBSITE_IDENTITY_MESSAGES,
  readWebsiteHost,
  type WebsiteIdentityProblem,
} from "./websiteIdentity";

/**
 * The heaviest test file in the feature, because this is the promise.
 *
 * "One website, stored once" is worth nothing if two spellings of the same site
 * produce two keys — and that failure is invisible, since both records look
 * correct on screen and only the DataForSEO bill knows. So every accepted
 * spelling is asserted to reach one string, and the near-misses that must stay
 * separate are asserted to stay separate.
 */

/** The key, or a thrown assertion — for the many cases that should succeed. */
function host(input: string): string {
  const result = readWebsiteHost(input);
  if (!result.ok) throw new Error(`expected "${input}" to be accepted, got ${result.problem}`);
  return result.host;
}

function problem(input: string): WebsiteIdentityProblem {
  const result = readWebsiteHost(input);
  if (result.ok) throw new Error(`expected "${input}" to be refused, got ${result.host}`);
  return result.problem;
}

describe("the wrapping is noise", () => {
  test("a bare domain is already the key", () => {
    expect(host("example.com")).toBe("example.com");
  });

  test("the scheme goes", () => {
    expect(host("https://example.com")).toBe("example.com");
    expect(host("http://example.com")).toBe("example.com");
    expect(host("//example.com")).toBe("example.com");
  });

  test("www goes", () => {
    expect(host("www.example.com")).toBe("example.com");
    expect(host("https://www.example.com")).toBe("example.com");
  });

  test("the path, query and fragment go", () => {
    expect(host("example.com/uk")).toBe("example.com");
    expect(host("example.com/uk/retail/")).toBe("example.com");
    expect(host("example.com?ref=1")).toBe("example.com");
    expect(host("example.com#top")).toBe("example.com");
    expect(host("https://www.example.com/uk?ref=1#top")).toBe("example.com");
  });

  test("the port goes", () => {
    expect(host("example.com:443")).toBe("example.com");
    expect(host("https://example.com:8080/uk")).toBe("example.com");
  });

  test("credentials go", () => {
    expect(host("https://user:pass@example.com/uk")).toBe("example.com");
    expect(host("https://user:p@ss@example.com")).toBe("example.com");
  });

  test("case goes", () => {
    expect(host("EXAMPLE.COM")).toBe("example.com");
    expect(host("HTTPS://WWW.Example.COM")).toBe("example.com");
  });

  test("a trailing dot goes", () => {
    expect(host("example.com.")).toBe("example.com");
    expect(host("https://www.example.com./uk")).toBe("example.com");
  });

  test("surrounding whitespace goes", () => {
    expect(host("   example.com   ")).toBe("example.com");
    expect(host("\n https://example.com/uk \t")).toBe("example.com");
  });
});

describe("every spelling of one site reaches one key", () => {
  // The whole premise, stated as one assertion. If this test ever fails, two
  // records exist for one website and the DataForSEO saving is gone.
  const spellings = [
    "example.com",
    "Example.com",
    "EXAMPLE.COM",
    "www.example.com",
    "WWW.Example.com",
    "http://example.com",
    "https://example.com",
    "https://www.example.com",
    "https://www.example.com/",
    "https://www.example.com/uk",
    "https://www.example.com/uk/retail?ref=1#top",
    "https://example.com:443",
    "example.com.",
    "  example.com  ",
    "//www.example.com",
  ];

  test("all fifteen spellings agree", () => {
    const keys = new Set(spellings.map(host));
    expect([...keys]).toEqual(["example.com"]);
  });
});

describe("a subdomain is a different website", () => {
  test("shop is not the parent", () => {
    expect(host("shop.example.com")).toBe("shop.example.com");
    expect(host("shop.example.com")).not.toBe(host("example.com"));
  });

  test("blog is not shop", () => {
    expect(host("blog.example.com")).not.toBe(host("shop.example.com"));
  });

  test("a deep subdomain keeps every label", () => {
    expect(host("uk.shop.example.com")).toBe("uk.shop.example.com");
  });

  test("www on a subdomain is still just www", () => {
    expect(host("www.shop.example.com")).toBe("shop.example.com");
  });

  test("a path is not a website, so two countries on one domain are one record", () => {
    // Deliberate: path-level targets are not modelled. If multi-country-on-one-
    // domain clients turn up, that is a decision taken then, not a field that
    // arrived by accident.
    expect(host("example.com/uk")).toBe(host("example.com/de"));
  });
});

describe("what is refused", () => {
  test("nothing", () => {
    expect(problem("")).toBe("EMPTY");
    expect(problem("   ")).toBe("EMPTY");
    expect(problem("https://")).toBe("EMPTY");
  });

  test("a word with no domain ending", () => {
    expect(problem("example")).toBe("NO_DOT");
    expect(problem("intranet")).toBe("NO_DOT");
    expect(problem("http://intranet")).toBe("NO_DOT");
  });

  test("an IP address", () => {
    expect(problem("127.0.0.1")).toBe("IP_ADDRESS");
    expect(problem("192.168.0.1")).toBe("IP_ADDRESS");
    expect(problem("https://8.8.8.8/path")).toBe("IP_ADDRESS");
    expect(problem("[::1]")).toBe("IP_ADDRESS");
    expect(problem("http://[2001:db8::1]:8080")).toBe("IP_ADDRESS");
  });

  test("somewhere only that machine can reach", () => {
    expect(problem("localhost")).toBe("LOCAL");
    expect(problem("http://localhost:3000")).toBe("LOCAL");
    expect(problem("myapp.local")).toBe("LOCAL");
    expect(problem("box.internal")).toBe("LOCAL");
    expect(problem("site.test")).toBe("LOCAL");
  });

  test("characters a hostname cannot hold", () => {
    expect(problem("exa mple.com")).toBe("UNPARSEABLE");
    expect(problem("exa\tmple.com")).toBe("UNPARSEABLE");
    expect(problem("exam_ple.com/")).toBe("UNPARSEABLE");
    expect(problem("<script>.com")).toBe("UNPARSEABLE");
  });

  test("empty labels", () => {
    expect(problem("example..com")).toBe("UNPARSEABLE");
    expect(problem(".example.com")).toBe("UNPARSEABLE");
  });

  test("longer than DNS allows", () => {
    const tooLong = `${"a".repeat(250)}.com`;
    expect(problem(tooLong)).toBe("TOO_LONG");
    expect(problem(`https://${"b".repeat(2100)}.com`)).toBe("TOO_LONG");
  });

  test("something that is not a string at all", () => {
    expect(problem(undefined as unknown as string)).toBe("UNPARSEABLE");
    expect(problem(null as unknown as string)).toBe("UNPARSEABLE");
  });
});

describe("internationalised domains", () => {
  test("the key is punycode, so a lookup can compare it", () => {
    expect(host("münchen.de")).toBe("xn--mnchen-3ya.de");
  });

  test("the unicode and punycode spellings are the same website", () => {
    expect(host("münchen.de")).toBe(host("xn--mnchen-3ya.de"));
    expect(host("https://www.münchen.de/preise")).toBe(host("münchen.de"));
  });

  test("the readable form is kept for showing back", () => {
    const result = readWebsiteHost("https://www.MÜNCHEN.de/preise");
    expect(result.ok && result.displayHost).toBe("münchen.de");
    expect(result.ok && result.host).toBe("xn--mnchen-3ya.de");
  });

  test("an ordinary domain shows exactly what it stores", () => {
    const result = readWebsiteHost("https://www.example.com/uk");
    expect(result.ok && result.displayHost).toBe("example.com");
    expect(result.ok && result.host).toBe("example.com");
  });
});

describe("the awkward ones", () => {
  test("www.com is a real domain and survives having www stripped", () => {
    // Stripping "www." blindly would leave "com", which is not a website.
    expect(host("www.com")).toBe("www.com");
    expect(host("https://www.com")).toBe("www.com");
  });

  test("a domain that merely starts with the letters www is untouched", () => {
    expect(host("wwwexample.com")).toBe("wwwexample.com");
  });

  test("www2 is an ordinary subdomain, not the www convention", () => {
    expect(host("www2.example.com")).toBe("www2.example.com");
  });

  test("a second www is a genuine subdomain and stays", () => {
    expect(host("www.www.example.com")).toBe("www.example.com");
  });

  test("multi-part endings work", () => {
    expect(host("https://www.example.co.uk/about")).toBe("example.co.uk");
    expect(host("example.org.uk")).toBe("example.org.uk");
  });

  test("a hyphenated domain is fine", () => {
    expect(host("my-shop.example.com")).toBe("my-shop.example.com");
  });

  test("a colon that is not a port does not silently become one", () => {
    expect(problem("example.com:notaport")).toBe("UNPARSEABLE");
  });
});

describe("normalising is idempotent", () => {
  // A key fed back in must produce itself, or a re-save would drift the record
  // off the key every other time.
  const keys = [
    "example.com",
    "shop.example.com",
    "example.co.uk",
    "my-shop.example.com",
    "xn--mnchen-3ya.de",
    "www.com",
  ];

  test.each(keys)("%s survives a second pass", (key) => {
    expect(host(key)).toBe(key);
  });
});

describe("every refusal has something to say", () => {
  test("each problem carries a sentence a person can act on", () => {
    const problems: WebsiteIdentityProblem[] = [
      "EMPTY",
      "UNPARSEABLE",
      "NO_DOT",
      "IP_ADDRESS",
      "LOCAL",
      "TOO_LONG",
    ];

    for (const key of problems) {
      expect(WEBSITE_IDENTITY_MESSAGES[key]).toBeTruthy();
      expect(WEBSITE_IDENTITY_MESSAGES[key].length).toBeGreaterThan(10);
    }
  });
});
