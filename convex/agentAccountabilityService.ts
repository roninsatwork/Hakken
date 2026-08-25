/**
 * What every new AI system has to say about itself before it can exist.
 *
 * Both fields were already on the record and both were optional, so an
 * assistant could be switched on with no description and nobody's name against
 * it — which is how a register ends up as a list of names rather than a record.
 * Required here rather than in the screens, because a rule enforced only in one
 * form is a rule the next form forgets.
 *
 * Kept free of database access so the wording can be tested directly.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

import { appError } from "./utils/appError";

/** Long enough to say what a thing is for, short enough to be one sentence. */
export const MINIMUM_PURPOSE_LENGTH = 10;

export function normalisePurpose(purpose: string | undefined): string {
  return (purpose ?? "").trim();
}

/**
 * Why this cannot be created yet, written for the person looking at the form.
 *
 * Returns every problem at once. Telling someone about one missing field, then
 * about the next one after they fix it, is the slowest way to fill in a form.
 */
export function describePurposeAndOwnerProblems(args: {
  purpose: string | undefined;
  ownerId: string | undefined;
}): string[] {
  const problems: string[] = [];
  const purpose = normalisePurpose(args.purpose);

  if (!purpose) {
    problems.push("Say what this is for, in a sentence.");
  } else if (purpose.length < MINIMUM_PURPOSE_LENGTH) {
    // A single word passes "not empty" and tells a reader nothing.
    problems.push("The purpose is too short to tell anyone what this does.");
  }

  if (!args.ownerId) {
    problems.push("Choose the person accountable for this.");
  }

  return problems;
}

export function assertPurposeAndOwner(args: {
  purpose: string | undefined;
  ownerId: string | undefined;
}): void {
  const problems = describePurposeAndOwnerProblems(args);
  if (problems.length > 0) {
    throw appError("INVALID_INPUT", problems.join(" "));
  }
}
