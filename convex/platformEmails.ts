import { renderEmail, type RenderedEmail } from "./emailLayoutService";
import { emailWording } from "./utils/emailWording";

/**
 * The platform's own emails, built here — free of any Convex function — so
 * the senders (`auth.ts`, `invites.ts`, `workflowRuntime.ts`) and the dev
 * preview (`src/app/api/email-preview`) render the same thing, in style B's
 * friendly words (docs/plans/active/hakken-tasks-plan.md, item 3.3; boards
 * MailSignInLink, MailSignInCode, MailInvitation, MailAutomation).
 */

/** The sign-in link. Sent before anyone is known, so in English. */
export function buildSignInEmail(args: { platformName: string; url: string; hours: number }): RenderedEmail & { subject: string } {
  const words = emailWording("en").signIn;
  return {
    subject: words.subject({ platformName: args.platformName }),
    ...renderEmail(
      {
        kind: words.kind,
        verdict: words.verdict({ platformName: args.platformName }),
        lede: words.lede,
        actions: [{ label: words.button, url: args.url }],
        quiet: [words.lasts({ hours: args.hours })],
        footer: { lines: [words.notYou] },
      },
      { platformName: args.platformName },
    ),
  };
}

/** The sign-in code: the code big, in two halves to read ("482 913"), typed with or without the space. */
export function buildSignInCodeEmail(args: { platformName: string; code: string; minutes: number }): RenderedEmail & { subject: string } {
  const words = emailWording("en").signInCode;
  return {
    subject: words.subject({ platformName: args.platformName, code: args.code }),
    ...renderEmail(
      {
        kind: words.kind,
        figure: args.code.length === 6 ? `${args.code.slice(0, 3)} ${args.code.slice(3)}` : args.code,
        verdict: words.verdict({ platformName: args.platformName }),
        lede: words.lede,
        quiet: [words.lasts({ minutes: args.minutes })],
        footer: { lines: [words.notYou] },
      },
      { platformName: args.platformName },
    ),
  };
}

/**
 * The names an invitation's template may use, filled in when it is sent:
 * `{inviter}`, `{company}` and `{platform}` — so the default reads "Jo Hughes
 * invited you to join Ronins Agency on Hakken", as drawn, and an admin's own
 * wording can say the same.
 */
export function fillInvitation(text: string, names: { inviter: string; company: string; platform: string }): string {
  return text.replaceAll("{inviter}", names.inviter).replaceAll("{company}", names.company).replaceAll("{platform}", names.platform);
}

/**
 * An invitation from the admin's template: its headline, its opening under it,
 * the button, then the rest as small print. The template is an editable
 * record, so every word of it is content, escaped by the shell.
 */
export function buildInvitationEmail(args: {
  platformName: string;
  url: string;
  template: { subject: string; headline: string; body: string; ctaText: string };
  names: { inviter: string; company: string };
}): RenderedEmail & { subject: string } {
  const words = emailWording("en").invitation;
  const fill = (text: string) => fillInvitation(text, { ...args.names, platform: args.platformName });
  const opening = fill(args.template.body).split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length > 0);
  return {
    subject: fill(args.template.subject),
    ...renderEmail(
      {
        kind: words.kind,
        verdict: fill(args.template.headline),
        ...(opening[0] ? { lede: opening[0] } : {}),
        actions: [{ label: fill(args.template.ctaText), url: args.url }],
        quiet: opening.slice(1),
        footer: { lines: [words.notExpecting] },
      },
      { platformName: args.platformName },
    ),
  };
}

/** An automation's email: author-written and filled with run data, so content, never markup. */
export function buildAutomationEmail(args: { platformName: string; subject: string; body: string }): RenderedEmail {
  return renderEmail(
    {
      kind: "Automation",
      verdict: args.subject,
      paragraphs: args.body.split(/\n{2,}/).filter((part) => part.trim().length > 0),
      footer: { lines: [`Sent by an automation you or a colleague set up in ${args.platformName}.`] },
    },
    { platformName: args.platformName },
  );
}
