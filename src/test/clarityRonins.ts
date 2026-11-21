import en from "@/messages/en.json";
import type { CalendarPeriod } from "@/convex/utils/calendarPeriods";
import { sourceNameOf, type ClaritySeesWords } from "@/convex/utils/sees/eyeData/clarity";
import { formatDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";

/**
 * Ronins' Clarity figures as its screens read them (`src/test/fixtures/roninsClarity*.json`, read by the test with
 * `readFixture`), and the screens' own English words. Shared by the rules' test of every period
 * (`convex/utils/sees/clarityFindingsPeriods.test.ts`) and the chat app's builders' test
 * (`convex/chatAppEyes/clarity.test.ts`), so both read the very same answers in the very same words.
 */

/** The website's own address in the figures: Ronins', written over. */
export const CLARITY_RONINS_HOST = "www.agency.test";

type Stored = Record<string, unknown> & { sameAs?: string; expected?: number; period?: Record<string, unknown> };

/** A period's answer as stored: the long periods hold the 3 months' days, with their own "days expected". */
export function clarityAnswerOf(fixture: Record<string, unknown>, period: CalendarPeriod): never {
  const stored = fixture[period] as Stored;
  if (!stored.sameAs) return stored as never;
  const same = fixture[stored.sameAs] as Stored;
  return { ...same, period: { ...same.period, expected: stored.expected } } as never;
}

const capital = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
const DEVICES = en.clarity.devices as Record<string, string>;

/** The screens' own English words, as `useClaritySeesWords` builds them. */
export function clarityWordsFor(period: CalendarPeriod): ClaritySeesWords {
  const device = (code: string) => DEVICES[code] ?? DEVICES.Other;
  return {
    website: en.clarity.common.eye.website,
    before: capital(en.common.periods.before[period]),
    device,
    source: (source) => sourceNameOf(source, CLARITY_RONINS_HOST, { direct: en.clarity.sources.direct, own: en.clarity.sources.own }),
    ownSource: en.clarity.sources.own,
    group: (kind, name) => name ?? (kind === "NOT_SORTED" ? null : kind),
    low: en.clarity.common.eye.low,
    otherSources: en.clarity.common.eye.otherSources,
    day: formatDay,
    days: en.clarity.common.eye.days,
    where: (browser, code) => en.clarity.common.browserOn.replace("{browser}", browser).replace("{device}", device(code).toLowerCase()),
  };
}
