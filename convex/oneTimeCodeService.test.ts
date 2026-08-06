import { describe, expect, test } from "vitest";
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  MAX_REQUESTS_PER_WINDOW,
  REQUEST_WINDOW_MS,
  checkCode,
  describeVerdict,
  expiryFrom,
  generateCode,
  isWithinRequestLimit,
  minutesUntil,
  normaliseCode,
  normaliseEmail,
} from "./oneTimeCodeService";

/** Deterministic bytes, so the shape of the code can be asserted. */
const bytes = (values: number[]) => {
  let index = 0;
  return (count: number) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = values[index % values.length];
      index += 1;
    }
    return out;
  };
};

describe("the code itself", () => {
  test("is six digits", () => {
    const code = generateCode(bytes([1, 2, 3, 4, 5, 6]));

    expect(code).toHaveLength(CODE_LENGTH);
    expect(code).toMatch(/^\d{6}$/);
  });

  test("throws away bytes that would bias the digits", () => {
    // A byte taken mod 10 makes 0–5 likelier than 6–9. Anything at or above 250
    // is discarded rather than folded in, so every digit stays equally likely.
    expect(generateCode(bytes([250, 251, 255, 7]))).toBe("777777");
  });

  test("keeps drawing until it has enough digits", () => {
    expect(generateCode(bytes([9, 250, 8]))).toHaveLength(CODE_LENGTH);
  });
});

describe("what people actually type", () => {
  test("spaces and dashes are ignored", () => {
    expect(normaliseCode("123 456")).toBe("123456");
    expect(normaliseCode("123-456")).toBe("123456");
  });

  test("addresses are compared without case or padding", () => {
    expect(normaliseEmail("  Anthony@Ronins.CO.uk ")).toBe("anthony@ronins.co.uk");
  });
});

describe("whether a code lets someone in", () => {
  const record = { code: "123456", expiresAt: 1_000, attempts: 0 };

  test("the right code, in time, works", () => {
    expect(checkCode(record, "123456", 500)).toEqual({ ok: true });
  });

  test("typed with a space, it still works", () => {
    expect(checkCode(record, "123 456", 500)).toEqual({ ok: true });
  });

  test("the wrong code does not", () => {
    expect(checkCode(record, "000000", 500)).toEqual({ ok: false, reason: "wrong" });
  });

  test("an expired code is called expired, not wrong", () => {
    // Someone retyping a code they can plainly see needs to be told it ran out,
    // not that they cannot type.
    expect(checkCode(record, "123456", 1_001)).toEqual({ ok: false, reason: "expired" });
  });

  test("expiry is checked before the code, so a wrong expired code still reads as expired", () => {
    expect(checkCode(record, "999999", 1_001)).toEqual({ ok: false, reason: "expired" });
  });

  test("a code guessed at too often is dead", () => {
    expect(checkCode({ ...record, attempts: MAX_ATTEMPTS }, "123456", 500)).toEqual({
      ok: false,
      reason: "too-many-attempts",
    });
  });

  test("no code at all reads as wrong, never as a missing account", () => {
    // Saying "no code was requested for that address" would confirm which
    // addresses exist.
    expect(checkCode(null, "123456", 500)).toEqual({ ok: false, reason: "wrong" });
  });
});

describe("what the person is told", () => {
  test("each refusal says what to do next", () => {
    expect(describeVerdict({ ok: false, reason: "expired" })).toContain("Ask for a new one");
    expect(describeVerdict({ ok: false, reason: "too-many-attempts" })).toContain("Ask for a new one");
    expect(describeVerdict({ ok: false, reason: "wrong" })).toContain("try again");
  });

  test("success says nothing, because there is nothing to say", () => {
    expect(describeVerdict({ ok: true })).toBe("");
  });
});

describe("the sign-in form is not a way to post mail at someone", () => {
  test("a few requests are fine", () => {
    expect(isWithinRequestLimit([1, 2, 3], 1_000)).toBe(true);
  });

  test("too many inside the window is not", () => {
    const now = 1_000_000;
    const recent = Array.from({ length: MAX_REQUESTS_PER_WINDOW }, () => now - 1_000);

    expect(isWithinRequestLimit(recent, now)).toBe(false);
  });

  test("older requests fall out of the window", () => {
    const now = 1_000_000;
    const old = Array.from({ length: MAX_REQUESTS_PER_WINDOW }, () => now - REQUEST_WINDOW_MS - 1);

    expect(isWithinRequestLimit(old, now)).toBe(true);
  });
});

describe("how long the code lasts", () => {
  test("expiry is ten minutes out", () => {
    expect(expiryFrom(0)).toBe(10 * 60 * 1000);
  });

  test("the email rounds up, because zero minutes is not reassuring", () => {
    expect(minutesUntil(30_000, 0)).toBe(1);
    expect(minutesUntil(0, 0)).toBe(1);
  });

  test("a full window reads as its whole length", () => {
    expect(minutesUntil(expiryFrom(0), 0)).toBe(10);
  });
});
