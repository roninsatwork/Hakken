/**
 * How many skills an agent or a company may carry.
 *
 * A skill is not a setting, it is text added to every message: it costs money
 * on each one, slows the reply, and spreads the model's attention thinner. Two
 * is a deliberate constraint rather than a technical one, and it is enforced
 * when a skill is attached rather than applied quietly at runtime — a rule that
 * only shows up as behaviour nobody can see is the same fault as a silent cap.
 *
 * These live here, away from the modules that enforce them, because the admin
 * screens need the same number to grey out the "add" button. Importing it from
 * `agentSkills.ts` or `companySkills.ts` would drag every query and mutation in
 * those files into the browser bundle — Convex warns about that today and has
 * said it will throw in a future version. This file deliberately imports
 * nothing, so both sides can read it. Same reasoning as MAX_ALWAYS_MEMORIES in
 * ./memoryApplication.ts.
 */

/** How many skills one agent may carry. */
export const MAX_SKILLS_PER_AGENT = 2;

/** How many skills one company may carry. */
export const MAX_SKILLS_PER_COMPANY = 2;
