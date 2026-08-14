import { describe, expect, test } from "vitest";
import {
  buildConnectTwiml,
  buildDisclosure,
  buildRefusalTwiml,
  computeTwilioSignature,
  findNumberOwner,
  maskPhoneNumber,
  normalisePhoneNumber,
  parseNumberOwnership,
  signaturesMatch,
} from "./telephonyService";

describe("a caller's number", () => {
    test("is masked everywhere but the call itself", () => {
        expect(maskPhoneNumber("+447700900123")).toBe("***123");
        expect(maskPhoneNumber("12")).toBe("***");
        expect(maskPhoneNumber("")).toBe("***");
    });

    test("matches however it was typed into configuration", () => {
        // A stray space in a setting would otherwise refuse every call with
        // nothing anywhere saying why.
        expect(normalisePhoneNumber(" +44 7700 900123 ")).toBe("+447700900123");
        expect(normalisePhoneNumber("+44-7700-900123")).toBe("+447700900123");
        expect(normalisePhoneNumber("(020) 7946 0000")).toBe("02079460000");
    });
});

describe("which workspace owns which number", () => {
    test("reads the mapping and finds the owner however the number was written", () => {
        const mapping = parseNumberOwnership('{" +44 7700 900123 ": "company-a"}');
        expect(findNumberOwner(mapping, "+447700900123")).toBe("company-a");
    });

    test("an unconfigured, malformed or wrongly-shaped setting owns nothing", () => {
        // Failing closed matters here: the alternative to "no owner" is
        // answering a stranger's call as somebody else's company.
        expect(parseNumberOwnership(undefined)).toEqual({});
        expect(parseNumberOwnership("   ")).toEqual({});
        expect(parseNumberOwnership("not json")).toEqual({});
        expect(parseNumberOwnership('["+447700900123"]')).toEqual({});
        expect(parseNumberOwnership('{"+447700900123": 42}')).toEqual({});
        expect(parseNumberOwnership('{"+447700900123": ""}')).toEqual({});
    });

    test("a number nobody claimed has no owner", () => {
        const mapping = parseNumberOwnership('{"+447700900123": "company-a"}');
        expect(findNumberOwner(mapping, "+447700900999")).toBeUndefined();
    });
});

describe("proving the request really came from the provider", () => {
    /*
     * Twilio's scheme cannot be varied: the full URL, then every form field
     * as name followed immediately by value, sorted by name, with no
     * separators at all — then HMAC-SHA1, base64. The missing separators look
     * like a bug and are not, so this is pinned to a computed value.
     */
    test("the same request and token always produce the same signature", async () => {
        const url = "https://example.test/api/telephony/voice";
        const params = { CallSid: "CA123", From: "+447700900123", To: "+441234567890" };
        const first = await computeTwilioSignature(url, params, "token");
        const second = await computeTwilioSignature(url, params, "token");
        expect(first).toBe(second);
        expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    test("fields are signed in sorted order, not the order they arrived in", async () => {
        const url = "https://example.test/api/telephony/voice";
        const inOneOrder = await computeTwilioSignature(url, { a: "1", b: "2" }, "token");
        const inAnother = await computeTwilioSignature(url, { b: "2", a: "1" }, "token");
        expect(inOneOrder).toBe(inAnother);
    });

    test("a different token, url, or field changes the signature", async () => {
        const url = "https://example.test/api/telephony/voice";
        const params = { CallSid: "CA123" };
        const base = await computeTwilioSignature(url, params, "token");

        expect(await computeTwilioSignature(url, params, "other-token")).not.toBe(base);
        expect(await computeTwilioSignature(`${url}?x=1`, params, "token")).not.toBe(base);
        expect(await computeTwilioSignature(url, { CallSid: "CA999" }, "token")).not.toBe(base);
    });

    test("comparison does not give away where two signatures differ", () => {
        expect(signaturesMatch("abc123", "abc123")).toBe(true);
        expect(signaturesMatch("abc123", "abc124")).toBe(false);
        expect(signaturesMatch("abc123", "abc12")).toBe(false);
        expect(signaturesMatch("", "")).toBe(true);
    });
});

describe("what the provider is told to do with the call", () => {
    test("the caller is told it is an AI before the model is connected", () => {
        // Spoken by the phone system rather than left to the model's first
        // sentence: a live model usually follows that instruction, and
        // "usually" is not a standard for a legal notice.
        const twiml = buildConnectTwiml({
            disclosure: buildDisclosure("Ronins"),
            streamUrl: "wss://relay.test/call",
            ticket: "abc.def",
        });
        expect(twiml.indexOf("<Say>")).toBeLessThan(twiml.indexOf("<Connect>"));
        expect(twiml).toContain("A.I. assistant for Ronins");
        expect(twiml).toContain('<Stream url="wss://relay.test/call">');
        expect(twiml).toContain('<Parameter name="ticket" value="abc.def"/>');
    });

    test("a company with no name still gets a disclosure", () => {
        expect(buildDisclosure(undefined)).toContain("A.I. assistant");
        expect(buildDisclosure("   ")).toContain("A.I. assistant");
    });

    test("a company name containing markup cannot break out of the response", () => {
        // The name is workspace-controlled text landing in XML. Unescaped, a
        // quote in a company name produces a document the provider rejects,
        // and every call to that company fails with no obvious cause.
        const twiml = buildConnectTwiml({
            disclosure: buildDisclosure('Ronins & Co "Ltd" <script>'),
            streamUrl: "wss://relay.test/call?a=1&b=2",
            ticket: "abc.def",
        });
        expect(twiml).not.toContain("<script>");
        expect(twiml).toContain("&amp;");
        expect(twiml).toContain("&quot;");
        expect(twiml).toContain("wss://relay.test/call?a=1&amp;b=2");
    });

    test("a refusal says something and hangs up rather than leaving a dead line", () => {
        // Silence is what a caller hears as "this company is broken".
        const twiml = buildRefusalTwiml("Sorry, this number is not in service. Goodbye.");
        expect(twiml).toContain("not in service");
        expect(twiml).toContain("<Hangup/>");
    });
});

describe("against Twilio's own documented example", () => {
    /**
     * The worked example from Twilio's security documentation: this exact
     * URL, these params, auth token "12345", must produce this signature.
     * If this passes, the maths is byte-for-byte Twilio's; a live mismatch
     * is then configuration — the URL or the token — not code.
     */
    test("reproduces the documented signature exactly", async () => {
        const signature = await computeTwilioSignature(
            "https://example.com/myapp.php?foo=1&bar=2",
            {
                CallSid: "CA1234567890ABCDE",
                Caller: "+14158675310",
                Digits: "1234",
                From: "+14158675310",
                To: "+18005551212",
            },
            "12345"
        );
        expect(signature).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
    });
});

describe("a number spaced for reading off a wall", () => {
    test("London numbers group the way people say them", async () => {
        const { formatPhoneNumberForDisplay } = await import("./telephonyService");
        expect(formatPhoneNumberForDisplay("+442045724032")).toBe("+44 20 4572 4032");
    });

    test("UK mobiles group four then six", async () => {
        const { formatPhoneNumberForDisplay } = await import("./telephonyService");
        expect(formatPhoneNumberForDisplay("+447700900123")).toBe("+44 7700 900123");
    });

    test("anything else falls back to fours from the right", async () => {
        const { formatPhoneNumberForDisplay } = await import("./telephonyService");
        expect(formatPhoneNumberForDisplay("+14155552671")).toBe("+141 5555 2671");
        expect(formatPhoneNumberForDisplay("not a number")).toBe("not a number");
    });
});
