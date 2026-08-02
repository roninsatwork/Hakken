/**
 * The rules that decide what happens to something the research agent found.
 *
 * Kept out of the Convex functions and free of database access so each rule can
 * be tested on its own, and — the reason this file exists at all — so the
 * decision lives in code rather than in a system prompt. The agent reports what
 * it found, how sure it is and where it came from. What that is worth is not
 * its call: a rule that lives only in an instruction is a rule the model may
 * talk itself out of on a bad day.
 */

/** The confidence an agent may report. Anything else is refused. */
export const RESEARCH_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type ResearchConfidence = (typeof RESEARCH_CONFIDENCES)[number];

export type ResearchStatus =
  | "APPLIED"
  | "NEEDS_CHECK"
  | "REJECTED"
  | "SUPERSEDED"
  | "NOT_FOUND";

/**
 * The details worth researching, and how each is stored.
 *
 * `notes` is absent on purpose: it is where staff write things in their own
 * words, and an agent filling it would be writing over the one field with no
 * shape to check against.
 */
export const RESEARCHABLE_FIELDS = {
  addressLine1: "text",
  addressLine2: "text",
  town: "text",
  postcode: "text",
  country: "text",
  phone: "text",
  mobile: "text",
  email: "text",
  accountsEmail: "text",
  website: "text",
  contactName: "text",
  contactRole: "text",
  bedrooms: "number",
  pupils: "number",
} as const;

export type ResearchField = keyof typeof RESEARCHABLE_FIELDS;

/**
 * The two figures that belong to a customer type rather than to every customer.
 *
 * `extraFieldForType` in the CRM already owns which type gets which. This is
 * the set that has to be checked against it — the other eleven fields apply to
 * anybody.
 */
const TYPE_SPECIFIC_FIELDS = new Set<ResearchField>(["bedrooms", "pupils"]);

/** Long enough for an address line, short enough that a page cannot be pasted in. */
const MAX_VALUE_LENGTH = 300;
const MAX_REASONING_LENGTH = 500;
const MAX_SOURCE_NAME_LENGTH = 120;

export function isResearchField(value: string): value is ResearchField {
  return Object.prototype.hasOwnProperty.call(RESEARCHABLE_FIELDS, value);
}

export function isResearchConfidence(value: string): value is ResearchConfidence {
  return (RESEARCH_CONFIDENCES as readonly string[]).includes(value);
}

/**
 * Is this a web address we would let the agent cite?
 *
 * The same shape check the page reader applies, repeated here because a source
 * is only worth storing if somebody can click it later. A finding whose source
 * cannot be opened is indistinguishable from one that was invented.
 */
export function isUsableSourceUrl(value: string | undefined): value is string {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * A web address reduced to the page it identifies.
 *
 * Used to compare a cited source against the pages a run actually read. Host
 * and path only: a query string or a fragment does not make it a different
 * page, and `www.` is dropped because a site that answers on both is one site.
 * Everything else is kept, so `/our-homes/fairmile-grange` stays distinct from
 * `/fairmile-grange` — which is exactly the pair that caught this.
 */
export function canonicalSourceUrl(value: string | undefined): string | null {
  if (!isUsableSourceUrl(value)) return null;
  const parsed = new URL(value.trim());
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  return `${host}${path}`;
}

export type ResearchRoutingInput = {
  field: string;
  value: string;
  confidence: string;
  sourceUrl?: string;
  /** The agent reporting that this detail is not published anywhere it looked. */
  notFound?: boolean;
  /** Whether the customer record already holds something for this field. */
  fieldHasValue: boolean;
  /** From `extraFieldForType`: which of the two figures this customer type has. */
  extraFieldForCustomer: "bedrooms" | "pupils" | null;
};

export type ResearchRoutingDecision =
  | { ok: false; reason: string }
  | {
      ok: true;
      field: ResearchField;
      status: Extract<ResearchStatus, "APPLIED" | "NEEDS_CHECK" | "NOT_FOUND">;
      /** Set only when the status is `APPLIED`. Nothing else touches the record. */
      writeValue?: string | number;
      value: string;
      confidence: ResearchConfidence;
    };

/**
 * Where a finding lands.
 *
 * The table in the plan, in one place:
 *
 * | Situation | What happens |
 * | --- | --- |
 * | Empty field, `HIGH` | Written to the record, row saved `APPLIED` |
 * | Empty field, `MEDIUM` or `LOW` | Row saved `NEEDS_CHECK`, field left empty |
 * | Field already has a value | Row saved `NEEDS_CHECK`, existing value untouched |
 * | Nothing found | Row saved `NOT_FOUND`, so it is not researched again |
 * | Wrong figure for the customer type | Refused |
 * | No usable source | Refused |
 *
 * Refusals come back as a reason rather than an exception because the agent is
 * meant to read them and correct itself — "you gave me a bed count for a
 * school" is a more useful next step than a failed tool call.
 */
export function routeResearchFinding(input: ResearchRoutingInput): ResearchRoutingDecision {
  if (!isResearchField(input.field)) {
    return {
      ok: false,
      reason:
        `"${input.field}" is not a detail this customer record holds. `
        + `Use one of: ${Object.keys(RESEARCHABLE_FIELDS).join(", ")}.`,
    };
  }
  const field = input.field;

  // The figure has to belong to the kind of business. A bed count stored
  // against a school is a number no screen would ever show again.
  if (TYPE_SPECIFIC_FIELDS.has(field) && input.extraFieldForCustomer !== field) {
    return {
      ok: false,
      reason: input.extraFieldForCustomer
        ? `This customer is measured by ${input.extraFieldForCustomer}, not ${field}.`
        : `This customer's type has no ${field} figure.`,
    };
  }

  // "Not published anywhere" is a real answer and worth recording, so the same
  // customer is not searched for the same missing detail every month.
  if (input.notFound) {
    return {
      ok: true,
      field,
      status: "NOT_FOUND",
      value: "",
      // Not knowing is knowing something. The confidence column is about the
      // value, and there is no value, so it is recorded at the floor.
      confidence: "LOW",
    };
  }

  if (!isResearchConfidence(input.confidence)) {
    return {
      ok: false,
      reason: `Confidence must be one of: ${RESEARCH_CONFIDENCES.join(", ")}.`,
    };
  }
  const confidence = input.confidence;

  const value = input.value.trim();
  if (!value) {
    return {
      ok: false,
      reason: "Give the value you found, or report that nothing was found.",
    };
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return { ok: false, reason: `A ${field} of more than ${MAX_VALUE_LENGTH} characters is not one.` };
  }

  if (!isUsableSourceUrl(input.sourceUrl)) {
    return {
      ok: false,
      reason:
        "Every detail needs the web address of the page it came from. "
        + "If you cannot name the page, you have not found the detail.",
    };
  }

  if (RESEARCHABLE_FIELDS[field] === "number") {
    const parsed = parseCount(value);
    if (parsed === null) {
      return { ok: false, reason: `${field} has to be a whole number. "${value}" is not one.` };
    }
    // Parked rather than written when it is not certain, exactly as text is.
    if (input.fieldHasValue || confidence !== "HIGH") {
      return { ok: true, field, status: "NEEDS_CHECK", value, confidence };
    }
    return { ok: true, field, status: "APPLIED", writeValue: parsed, value, confidence };
  }

  // A person's typing outranks anything found online, and a contradiction is
  // worth a human's attention rather than a silent overwrite.
  if (input.fieldHasValue) {
    return { ok: true, field, status: "NEEDS_CHECK", value, confidence };
  }

  if (confidence !== "HIGH") {
    return { ok: true, field, status: "NEEDS_CHECK", value, confidence };
  }

  return { ok: true, field, status: "APPLIED", writeValue: value, value, confidence };
}

/**
 * A count as written on a register page.
 *
 * Registers publish "64 beds", "Registered beds: 64" and plain "64". All three
 * mean the same thing, and refusing the first two would park findings that are
 * perfectly good. Anything with more than one number in it is refused instead
 * of guessed at — "40 beds across 2 units" is not a bed count this can settle.
 */
export function parseCount(value: string): number | null {
  // The sign is captured so a negative is read and then rejected below, rather
  // than being silently read as its positive.
  const numbers = value.match(/-?\d[\d,]*/g);
  if (!numbers || numbers.length !== 1) return null;
  const parsed = Number.parseInt(numbers[0].replace(/,/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Trimmed to what is worth storing, so a model's essay does not become a row. */
export function truncateReasoning(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_REASONING_LENGTH ? trimmed.slice(0, MAX_REASONING_LENGTH) : trimmed;
}

/** What to call the source on screen. Falls back to the site it came from. */
export function resolveSourceName(sourceName: string | undefined, sourceUrl: string) {
  const trimmed = sourceName?.trim();
  if (trimmed) {
    return trimmed.length > MAX_SOURCE_NAME_LENGTH
      ? trimmed.slice(0, MAX_SOURCE_NAME_LENGTH)
      : trimmed;
  }
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

/**
 * The key that makes a replayed tool call write once.
 *
 * Subject, field and value, because that triple is what the write is: reporting
 * the same number for the same field on the same customer twice is one finding
 * arriving twice, whatever the run. A different value is a different finding
 * and gets its own row.
 */
export function researchIdempotencyKey(args: {
  subjectKey: string;
  field: string;
  value: string;
  notFound?: boolean;
}) {
  const value = args.notFound ? "__NOT_FOUND__" : args.value.trim().toUpperCase();
  return `${args.subjectKey}::${args.field}::${value}`;
}
