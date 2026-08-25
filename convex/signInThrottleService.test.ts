import { describe, expect, test } from "vitest";

import {
  SIGN_IN_MAX_REQUESTS_PER_HOUR,
  SIGN_IN_REQUEST_WINDOW_MS,
  isWithinHourlySignInLimit,
} from "./signInThrottleService";

const now = 1_700_000_000_000;

const requestsAt = (count: number, at: number) => Array.from({ length: count }, () => at);

describe("how often one address may ask to be sent a way in", () => {
  test("lets an ordinary run of requests through", () => {
    expect(isWithinHourlySignInLimit(requestsAt(3, now - 60_000), now)).toBe(true);
  });

  test("refuses once the address has asked its allowance within the hour", () => {
    const atLimit = requestsAt(SIGN_IN_MAX_REQUESTS_PER_HOUR, now - 60_000);

    expect(isWithinHourlySignInLimit(atLimit.slice(0, -1), now)).toBe(true);
    expect(isWithinHourlySignInLimit(atLimit, now)).toBe(false);
  });

  test("forgets requests older than the hour, so a refusal is never permanent", () => {
    const expired = requestsAt(SIGN_IN_MAX_REQUESTS_PER_HOUR, now - SIGN_IN_REQUEST_WINDOW_MS - 1);

    expect(isWithinHourlySignInLimit(expired, now)).toBe(true);
  });

  test("counts only the part of a run that falls inside the window", () => {
    const times = [
      ...requestsAt(SIGN_IN_MAX_REQUESTS_PER_HOUR, now - SIGN_IN_REQUEST_WINDOW_MS - 1),
      ...requestsAt(SIGN_IN_MAX_REQUESTS_PER_HOUR - 1, now - 1_000),
    ];

    expect(isWithinHourlySignInLimit(times, now)).toBe(true);
  });
});
