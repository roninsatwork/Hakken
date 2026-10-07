/**
 * The one shell every outbound email renders through.
 *
 * Governed by docs/plans/active/email-design-system-plan.md. Read it before
 * changing anything here.
 *
 * The rule that makes this worth having: **callers supply content, never
 * markup**. Four surfaces used to hand-roll their own HTML at three different
 * levels of care, and the one that escaped its inputs was not the one that
 * looked designed. Passing structured content through a single renderer makes
 * both problems impossible rather than merely fixed.
 *
 * ## The look: "the picture" (style B, 2026-10-07)
 *
 * Anthony chose it from three variants on the Hakken tasks canvas — "I think I
 * prefer B, it's more engaging and intuitive" — then "can we make this the
 * default email style too", for every email the platform sends
 * (docs/plans/active/hakken-tasks-plan.md, item 3.1; the boards are in
 * docs/plans/assets/hakken-tasks/boards/Mail*.dc.html). A white sheet on a
 * light grey ground: the wordmark and a small label, a big number or code when
 * the email is about one, a friendly headline, a short grey lede, plain rows
 * under hairlines rather than boxes, one dark button, and a short footer.
 *
 * Two colours moved from the boards on purpose, both for legibility: the
 * boards' pale grey small print (#999999) measures 2.85 on white and fails AA,
 * so small print is #767676, the palest grey that passes; and the boards'
 * orange labels (#f97316, 2.80) are the deeper #c2410c.
 *
 * ## Why it is still built like 2005
 *
 * Legacy Outlook is a Tier A client and it renders through Microsoft Word, not
 * a browser. Word ignores flexbox, CSS positioning, `max-width`, custom
 * properties, gradients, `border-radius` and `letter-spacing`. So:
 *
 * - Layout is nested presentation tables with fixed pixel widths.
 * - Spacing lives on `<td>`, never on a `<div>` or as a margin.
 * - Every colour is a literal hex, repeated as a `bgcolor` attribute.
 * - Every text cell carries `mso-line-height-rule:exactly`, or Word adds its
 *   own leading and the rows stop lining up.
 * - No `<style>` carries the design (see `COLOUR_LOCK`).
 * - The only `<img>` is a chart the email carries as an attachment, shown by
 *   its content id (`picture`, `utils/emailPictures.ts`): an image from the web
 *   is blocked by default, and Gmail strips a chart drawn in markup. Even that
 *   picture never carries meaning alone — its dates, its line and its figures
 *   are written beside it, and its description is its alt text.
 *
 * The sheet's corners are square in Outlook and tracking collapses on the
 * labels. Both are accepted: radius and tracking are decoration here. The
 * single place roundness matters — the button — gets a VML fallback.
 */

import { PICTURE_HEIGHT, PICTURE_WIDTH } from "./utils/emailPictures";

/** 600px is the width every mail client agrees on. */
const WIDTH = 600;

/** Side padding on the sheet, as drawn: 44px, leaving a 512px measure. */
const PAD = 44;

/** The measure everything inside the sheet is drawn to. */
const INNER = WIDTH - PAD * 2;

/**
 * Gmail truncates around 102KB and hides the rest behind "View entire
 * message". A noisy alert is exactly the mail most at risk, so the card list is
 * capped and the remainder becomes a link.
 */
export const MAX_CARDS = 8;

/**
 * Style B's palette: dark ink on a white sheet over a light grey ground.
 *
 * The signal colours keep the rule the 2026-08-04 rebuild was made for —
 * Anthony is red/green colour blind ("I cannot read half of it because of the
 * colours") — so none is green, good and warning sit on the blue/yellow axis,
 * and critical is markedly darker than warning, so the two stay apart by
 * brightness in any colour vision, greyscale included. Colour is never the
 * only carrier: a card says how bad it is in words.
 *
 * `emailLayoutService.test.ts` asserts every foreground/ground pair against
 * WCAG AA and the signal colours under simulated deuteranopia and protanopia.
 */
export const EMAIL_PALETTE = {
  ground: "#f2f2f2",
  card: "#ffffff",
  // Hairlines: the sheet's edge and the rules between rows.
  edge: "#e5e5e5",
  ink: "#111111",
  // The lede and a row's detail. 5.74 on the sheet.
  ink70: "#666666",
  // Small print: the footer, meta lines, the label beside the wordmark. 4.54.
  ink45: "#767676",
  // A card's label ("Needs you now"): the boards' orange, deepened to pass. 5.18.
  label: "#c2410c",
  // Healthy. 6.70.
  blue: "#1d4ed8",
  // Needs attention. 4.92, and twice as light as critical.
  gold: "#a16207",
  // Failed. 10.02.
  red: "#7f1d1d",
  // The one button: dark, with white words. 13.94.
  button: "#2c2c2e",
  onButton: "#ffffff",
} as const;

const C = EMAIL_PALETTE;

/**
 * Inter where it is installed, the system's own sans everywhere else: a web
 * font cannot be relied on in mail, and Inter is the app's word face.
 */
const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Numbers in the app's number face, JetBrains Mono, where it is installed. */
const MONO = "'JetBrains Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * The only `<style>` element in the document, and it is deliberately inert.
 *
 * Clients in dark mode rewrite colours they were never asked to touch — on a
 * white sheet, the classic failure is a client darkening the ground while
 * leaving the dark ink on it. Every rule below restates a value that is
 * *already inline on the same element*: strip the block and you get the
 * intended design; keep it and you get the intended design. It can only ever
 * put back what a client has taken away. No *load-bearing* CSS lives here, and
 * `emailLayoutService.test.ts` asserts the block declares no colour outside
 * `EMAIL_PALETTE`.
 *
 * - `prefers-color-scheme` covers Apple Mail, iOS Mail and Outlook for iOS.
 * - `[data-ogsc]`/`[data-ogsb]` cover Outlook.com and new Outlook on Mac and
 *   Windows, which tag every element whose colour they rewrote.
 *
 * Neither covers legacy Windows Outlook, which has no dark mode for message
 * bodies, or Gmail's mobile apps, which rewrite without tagging. Both render the
 * inline colours.
 */
const COLOUR_LOCK =
  `<style type="text/css">` +
  `:root{color-scheme:light dark;supported-color-schemes:light dark;}` +
  // Each selector restates the inline value on that same element. Grouped so
  // one palette change cannot update the inline colour and miss the lock.
  [
    [".e-ground", `background-color:${C.ground}!important;`],
    [".e-card", `background-color:${C.card}!important;`],
    [".e-ink", `color:${C.ink}!important;`],
    [".e-ink70", `color:${C.ink70}!important;`],
    [".e-ink45", `color:${C.ink45}!important;`],
    [".e-label", `color:${C.label}!important;`],
    [".e-blue", `color:${C.blue}!important;`],
    [".e-gold", `color:${C.gold}!important;`],
    [".e-red", `color:${C.red}!important;`],
    [".e-btn", `background-color:${C.button}!important;border-color:${C.button}!important;color:${C.onButton}!important;`],
  ]
    .map(([selector, declarations]) =>
      // Both appearances, not just dark: a client in light mode can drop a
      // background while leaving the text on it, too.
      `@media (prefers-color-scheme:dark){${selector}{${declarations}}}` +
      `@media (prefers-color-scheme:light){${selector}{${declarations}}}` +
      `[data-ogsc] ${selector}{${declarations}}` +
      `[data-ogsb] ${selector}{${declarations}}`
    )
    .join("") +
  `</style>`;

export type EmailTone = "neutral" | "good" | "warning" | "critical";
export type EmailSeverity = "info" | "warning" | "critical";

export type EmailStat = { label: string; value: string; tone?: EmailTone };
/** `note`: a line under the term, as a report's page has its visitors last week (board EmailReportB). */
export type EmailFact = { term: string; value: string; tone?: EmailTone; note?: string };
export type EmailAction = { label: string; url: string; emphasis?: "primary" | "secondary" };

export type EmailCard = {
  title: string;
  badge?: string;
  severity?: EmailSeverity;
  body: string;
  meta?: string;
  fix?: string;
  /**
   * Route to the exact record this card is about. A card without one is a dead
   * end — the reader has been told something is wrong and given no way to look.
   */
  link?: EmailAction;
};

export type EmailContent = {
  /** The small label beside the wordmark: "System health", "Alert · example.co.uk". */
  kind: string;
  /** Inbox preview text. Falls back to the lede, then the verdict. */
  preheader?: string;
  /**
   * The one number or code the email is about, drawn big above the headline —
   * "7", "482 913" — when there is one. The headline then reads on from it
   * ("visitors from Google on Monday 5 October").
   */
  figure?: string;
  /** What happened, in one sentence. Never a metric dump. */
  verdict: string;
  lede?: string;
  /**
   * Prose body, one entry per paragraph. Single newlines inside a paragraph
   * become line breaks; callers still supply text, never markup.
   */
  paragraphs?: string[];
  /**
   * A chart the email carries (`utils/emailPictures.ts`), under the lede: its
   * content id, what it shows in words for anyone who cannot see it, a note
   * over its top right ("Your line: 10") and its first and last day under it.
   */
  picture?: { cid: string; alt: string; note?: string; from: string; to: string };
  stats?: EmailStat[];
  facts?: EmailFact[];
  cards?: EmailCard[];
  /** Shown when the card list was capped. */
  overflow?: EmailAction;
  /**
   * More cards under their own heading, after the first list: the weekly
   * digest's Helpful content under its News (insights-helpful-content-plan.md,
   * IH19). Each shows at most as many cards as the first list.
   */
  sections?: Array<{ heading: string; cards: EmailCard[] }>;
  /** The first is the dark button; any after it are plain links beside it. */
  actions?: EmailAction[];
  /** Small print under the action. */
  quiet?: string[];
  footer?: {
    lines?: string[];
    links?: EmailAction[];
  };
};

export type RenderEmailOptions = {
  /** Resolved from settings by the caller, never hardcoded. */
  platformName?: string;
  /** The credit line. Text only — no domain may be baked into shipped code. */
  creditLine?: string;
};

export type RenderedEmail = { html: string; text: string };

function esc(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Uppercase in the string, not in CSS.
 *
 * Word ignores `text-transform`, so a label styled uppercase renders in
 * whatever case it was authored in. Casing the text itself is the only version
 * that holds in all clients. The case change happens before escaping, or an
 * entity like `&lt;` would be mangled into `&LT;`.
 */
function up(value: string) {
  return esc(String(value).toUpperCase());
}

/**
 * Only http(s) and mailto survive.
 *
 * An action URL can reach here from a workflow definition or an agent's tool
 * arguments, both of which are attacker-influenced. `javascript:` and `data:`
 * in an anchor are a real click-through risk, so anything else collapses to a
 * dead link rather than being rendered as given.
 */
function safeUrl(value: string) {
  const trimmed = String(value).trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : "#";
}

/**
 * Tone resolves to a colour *and* the dark-mode lock class that restores it,
 * so a client that rewrites the inline value cannot strip the signal.
 */
function tone(value: EmailTone | undefined): { colour: string; cls: string } {
  if (value === "good") return { colour: C.blue, cls: "e-blue" };
  if (value === "warning") return { colour: C.gold, cls: "e-gold" };
  if (value === "critical") return { colour: C.red, cls: "e-red" };
  return { colour: C.ink, cls: "e-ink" };
}

/**
 * The label a card renders. When the caller supplied none but marked the card
 * warning or critical, the severity itself becomes the label — colour must
 * never be the only thing saying how bad a card is.
 */
function badgeText(card: EmailCard) {
  if (card.badge) return card.badge;
  if (card.severity === "critical") return "Critical";
  if (card.severity === "warning") return "Needs attention";
  return undefined;
}

/** Every text cell needs this or Word re-leads it. */
function line(size: number, height: number, colour: string, weight = 400, extra = "", family = FONT) {
  return (
    `font-family:${family};font-size:${size}px;` +
    `line-height:${height}px;mso-line-height-rule:exactly;` +
    `color:${colour};font-weight:${weight};${extra}`
  );
}

/** Presentation table opener. Every table in this file goes through here. */
function openTable(attrs = "") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${attrs}>`;
}

/** A spacer row, because margins do not survive Word. */
function gap(height: number) {
  return (
    `<tr><td style="font-size:0;line-height:0;height:${height}px;" height="${height}">&nbsp;</td></tr>`
  );
}

/** A hairline across the measure. */
function rule() {
  return `${openTable(`width="100%"`)}<tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/** A link in the words: dark ink, underlined, as drawn. */
function textLink(action: EmailAction, size = 14) {
  return (
    `<a href="${esc(safeUrl(action.url))}" class="e-ink" style="${line(size, size + 6, C.ink, 400, "text-decoration:underline;")}">${esc(action.label)}</a>`
  );
}

/**
 * The figures beside each other on one line, as drawn — "A usual day 23",
 * "Quiet days, last 4 weeks 3" — each word in grey and its number in the
 * number face, in its tone's colour.
 */
function renderStats(stats: EmailStat[]) {
  const cells = stats
    .map((stat, index) => {
      const statTone = tone(stat.tone);
      return (
        `<td valign="top" class="e-ink70" style="${line(13, 20, C.ink70, 400, index < stats.length - 1 ? "padding-right:28px;" : "")}">` +
        `${esc(stat.label)} <b class="${statTone.cls}" style="${line(13, 20, statTone.colour, 700, "", MONO)}">${esc(stat.value)}</b>` +
        `</td>`
      );
    })
    .join("");
  return `${openTable()}<tr>${cells}</tr></table>`;
}

/**
 * One card as a plain row under a hairline, as drawn: its label in the
 * labels' orange and its title on one line, then what happened, and a link.
 */
function renderCard(card: EmailCard) {
  const label = badgeText(card);
  const heading =
    (label ? `<span class="e-label" style="${line(12, 22, C.label, 600)}">${up(label)}</span>&nbsp;&nbsp;` : "") +
    `<span class="e-ink" style="${line(15, 22, C.ink, 600)}">${esc(card.title)}</span>`;

  const meta = card.meta
    ? `<tr><td class="e-ink45" style="${line(12, 18, C.ink45, 400, "padding-top:6px;")}">${esc(card.meta)}</td></tr>`
    : "";
  const fix = card.fix
    ? `<tr><td class="e-ink" style="${line(14, 22, C.ink, 400, "padding-top:6px;")}">${esc(card.fix)}</td></tr>`
    : "";
  const link = card.link
    ? `<tr><td style="${line(12, 18, C.ink45, 400, "padding-top:6px;")}">${textLink(card.link, 12)}</td></tr>`
    : "";

  return (
    `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.edge};">` +
    `${openTable(`width="100%"`)}` +
    `<tr><td class="e-ink" style="${line(15, 22, C.ink, 600)}">${heading}</td></tr>` +
    `<tr><td class="e-ink70" style="${line(14, 22, C.ink70, 400, "padding-top:4px;")}">${esc(card.body)}</td></tr>` +
    meta +
    fix +
    link +
    `</table></td></tr>`
  );
}

/** Cards under one hairline, each ruled off below. */
function renderCards(cards: EmailCard[]) {
  return `${openTable(`width="${INNER}" style="border-top:1px solid ${C.edge};"`)}${cards.map(renderCard).join("")}</table>`;
}

/**
 * A button that survives Word.
 *
 * VML draws a real rounded rectangle for Outlook; every other client gets the
 * anchor. Both carry the same href and label, so the two can never disagree.
 */
function renderButton(action: EmailAction) {
  const url = safeUrl(action.url);
  const label = esc(action.label);
  // VML cannot size to its content, so the width is estimated from the label.
  const vmlWidth = Math.max(150, action.label.length * 9 + 48);

  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${esc(url)}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" ` +
    `arcsize="22%" stroke="f" fillcolor="${C.button}">` +
    `<w:anchorlock/>` +
    `<center style="${line(15, 46, C.onButton, 600)}">${label}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${esc(url)}" class="e-btn" style="${line(15, 46, C.onButton, 600)}display:inline-block;background-color:${C.button};` +
    `border:1px solid ${C.button};border-radius:10px;padding:0 22px;text-decoration:none;">${label}</a>` +
    `<!--<![endif]-->`
  );
}

/**
 * Term left, value right, a hairline between each pair: the same rows ruled
 * apart read as a record, which is what these facts are.
 */
function renderFacts(facts: EmailFact[]) {
  const rows = facts
    .map((fact) => {
      const factTone = tone(fact.tone);
      return (
        `<tr>` +
        `<td class="e-ink" style="${line(14, 20, C.ink, 400, `padding:12px 0;border-bottom:1px solid ${C.edge};`)}">${esc(fact.term)}` +
        (fact.note ? `<div class="e-ink45" style="${line(12, 18, C.ink45, 400, "padding-top:2px;")}">${esc(fact.note)}</div>` : "") +
        `</td>` +
        `<td align="right" valign="top" class="${factTone.cls}" style="${line(15, 20, factTone.colour, 600, `padding:12px 0 12px 14px;border-bottom:1px solid ${C.edge};`, MONO)}">${esc(fact.value)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return `${openTable(`width="${INNER}" style="border-top:1px solid ${C.edge};"`)}${rows}</table>`;
}

/**
 * The chart, at its drawn size, with what it says written around it: the
 * note above its right end, its first and last day below.
 */
function renderPicture(picture: NonNullable<EmailContent["picture"]>) {
  const small = (text: string, align: "left" | "right") =>
    `<td align="${align}" class="e-ink45" style="${line(11, 16, C.ink45, 400)}">${esc(text)}</td>`;
  return (
    `${openTable(`width="${INNER}"`)}` +
    (picture.note ? `<tr>${small("", "left")}${small(picture.note, "right")}</tr>` : "") +
    `<tr><td colspan="2" style="padding:4px 0 6px;">` +
    `<img src="cid:${esc(picture.cid)}" width="${PICTURE_WIDTH}" height="${PICTURE_HEIGHT}" alt="${esc(picture.alt)}" ` +
    `style="display:block;border:0;outline:none;width:${PICTURE_WIDTH}px;height:${PICTURE_HEIGHT}px;" />` +
    `</td></tr>` +
    `<tr>${small(picture.from, "left")}${small(picture.to, "right")}</tr>` +
    `</table>`
  );
}

export function renderEmail(content: EmailContent, options: RenderEmailOptions = {}): RenderedEmail {
  const platformName = (options.platformName || "Hakken").trim() || "Hakken";
  const creditLine = options.creditLine ?? `${platformName} · Powered by Ronins`;
  const preheader = content.preheader || content.lede || content.verdict;

  const cards = content.cards ?? [];
  const shown = cards.slice(0, MAX_CARDS);
  const hidden = cards.length - shown.length;

  const body: string[] = [];
  const cell = (inner: string) => `<tr><td>${inner}</td></tr>`;

  // The big number or code, then the headline reading on from it; or, with
  // none, the headline at its own size.
  if (content.figure) {
    body.push(`<tr><td class="e-ink" style="${line(64, 66, C.ink, 500, "", MONO)}">${esc(content.figure)}</td></tr>`);
    body.push(gap(10));
    body.push(`<tr><td class="e-ink" style="${line(18, 26, C.ink, 600)}">${esc(content.verdict)}</td></tr>`);
  } else {
    body.push(`<tr><td class="e-ink" style="${line(26, 33, C.ink, 700)}">${esc(content.verdict)}</td></tr>`);
  }

  if (content.lede) {
    body.push(gap(8));
    body.push(`<tr><td class="e-ink70" style="${line(15, 23, C.ink70, 400)}">${esc(content.lede)}</td></tr>`);
  }

  if (content.picture) {
    body.push(gap(24));
    body.push(cell(renderPicture(content.picture)));
  }

  for (const paragraph of content.paragraphs ?? []) {
    body.push(gap(18));
    // Escape first, then turn the survivors into breaks — the other order would
    // let a caller's literal "<br />" through as markup.
    const withBreaks = esc(paragraph).replace(/\r?\n/g, "<br />");
    body.push(`<tr><td class="e-ink" style="${line(15, 24, C.ink, 400)}">${withBreaks}</td></tr>`);
  }

  if (content.stats?.length) {
    body.push(gap(24));
    body.push(cell(renderStats(content.stats)));
  }

  if (content.facts?.length) {
    body.push(gap(24));
    body.push(cell(renderFacts(content.facts)));
  }

  if (shown.length > 0) {
    body.push(gap(24));
    body.push(cell(renderCards(shown)));
  }

  if (hidden > 0 && content.overflow) {
    body.push(gap(14));
    body.push(
      `<tr><td class="e-ink45" style="${line(13, 20, C.ink45, 400)}">${esc(`${hidden} more not shown.`)} ${textLink(content.overflow, 13)}</td></tr>`
    );
  }

  for (const section of content.sections ?? []) {
    if (section.cards.length === 0) continue;
    body.push(gap(30));
    body.push(`<tr><td class="e-ink45" style="${line(11, 16, C.ink45, 600, "letter-spacing:1.5px;")}">${up(section.heading)}</td></tr>`);
    body.push(gap(10));
    body.push(cell(renderCards(section.cards.slice(0, MAX_CARDS))));
  }

  if (content.actions?.length) {
    const [primary, ...rest] = content.actions;
    body.push(gap(26));
    const links = rest.map((action) => `<td style="padding:0 0 0 18px;">${textLink(action)}</td>`).join("");
    body.push(cell(`${openTable()}<tr><td>${renderButton(primary)}</td>${links}</tr></table>`));
  }

  for (const quiet of content.quiet ?? []) {
    body.push(gap(16));
    body.push(`<tr><td class="e-ink45" style="${line(13, 20, C.ink45, 400)}">${esc(quiet)}</td></tr>`);
  }

  // The footer: a hairline, then its small print, its links and the credit line in one block.
  const footer = [
    ...(content.footer?.lines ?? []).map((text) => esc(text)),
    ...(content.footer?.links?.length
      ? [content.footer.links.map((link) => textLink(link, 12)).join(" &middot; ")]
      : []),
    esc(creditLine),
  ].join("<br />");

  const html =
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">` +
    `<head>` +
    `<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="x-apple-disable-message-reformatting" />` +
    // "light dark" declares that this email handles both appearances itself.
    `<meta name="color-scheme" content="light dark" />` +
    `<meta name="supported-color-schemes" content="light dark" />` +
    `<title>${esc(content.verdict)}</title>` +
    COLOUR_LOCK +
    // Windows above 96 DPI rescales fixed widths and breaks the 600px column.
    `<!--[if mso]><xml><o:OfficeDocumentSettings>` +
    `<o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>` +
    `</o:OfficeDocumentSettings></xml><![endif]-->` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${C.ground};" class="e-ground" bgcolor="${C.ground}">` +
    // Inbox preview text, then filler so the client does not pull body copy in.
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">` +
    `${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>` +
    `${openTable(`width="100%" class="e-ground" bgcolor="${C.ground}" style="background-color:${C.ground};"`)}` +
    `<tr><td align="center" style="padding:28px 16px 48px;">` +
    // The sheet: white, a hairline edge, corners rounded where the client allows.
    `${openTable(`width="${WIDTH}" class="e-card" bgcolor="${C.card}" style="width:${WIDTH}px;background-color:${C.card};border:1px solid ${C.edge};border-radius:14px;"`)}` +
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};padding:40px ${PAD}px;border-radius:14px;">` +
    `${openTable(`width="${INNER}" style="width:${INNER}px;"`)}` +
    // The wordmark and the email's label beside it.
    `<tr><td>${openTable()}<tr>` +
    `<td class="e-ink" style="${line(16, 22, C.ink, 700)}">${esc(platformName)}</td>` +
    `<td class="e-ink45" style="${line(11, 22, C.ink45, 400, "padding-left:10px;letter-spacing:1.5px;")}">${up(content.kind)}</td>` +
    `</tr></table></td></tr>` +
    gap(28) +
    body.join("") +
    gap(32) +
    `<tr><td>${rule()}</td></tr>` +
    gap(18) +
    `<tr><td class="e-ink45" style="${line(12, 19, C.ink45, 400)}">${footer}</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</td></tr></table></body></html>`;

  return { html, text: renderText(content, { platformName, creditLine }) };
}

/**
 * The plain-text alternative, built from the same content object so the two can
 * never drift. It carries every URL, because for a watch or a screen reader
 * this is the whole message.
 */
function renderText(
  content: EmailContent,
  branding: { platformName: string; creditLine: string }
): string {
  const out: string[] = [];
  const divider = "-".repeat(52);

  out.push(`${branding.platformName.toUpperCase()} — ${content.kind.toUpperCase()}`, "");
  out.push(content.figure ? `${content.figure} ${content.verdict}` : content.verdict, "");
  if (content.lede) out.push(content.lede, "");
  if (content.picture) out.push(content.picture.alt, "");

  for (const paragraph of content.paragraphs ?? []) out.push(paragraph, "");

  for (const stat of content.stats ?? []) out.push(`  ${stat.label}: ${stat.value}`);
  if (content.stats?.length) out.push("");

  for (const fact of content.facts ?? []) out.push(`  ${fact.term}: ${fact.value}${fact.note ? ` (${fact.note})` : ""}`);
  if (content.facts?.length) out.push("");

  const cards = content.cards ?? [];
  for (const card of cards.slice(0, MAX_CARDS)) {
    out.push(divider);
    const badge = badgeText(card);
    out.push(badge ? `${card.title} (${badge})` : card.title);
    out.push(card.body);
    if (card.meta) out.push(card.meta);
    if (card.fix) out.push(`Fix: ${card.fix}`);
    if (card.link) out.push(`${card.link.label}: ${safeUrl(card.link.url)}`);
    out.push("");
  }

  const hidden = cards.length - Math.min(cards.length, MAX_CARDS);
  if (hidden > 0 && content.overflow) {
    out.push(`${hidden} more not shown. ${content.overflow.label}: ${safeUrl(content.overflow.url)}`, "");
  }

  for (const section of content.sections ?? []) {
    if (section.cards.length === 0) continue;
    out.push(section.heading.toUpperCase(), "");
    for (const card of section.cards.slice(0, MAX_CARDS)) {
      out.push(divider);
      out.push(card.title);
      out.push(card.body);
      if (card.meta) out.push(card.meta);
      if (card.link) out.push(`${card.link.label}: ${safeUrl(card.link.url)}`);
      out.push("");
    }
  }

  for (const action of content.actions ?? []) {
    out.push(`${action.label}: ${safeUrl(action.url)}`);
  }
  if (content.actions?.length) out.push("");

  for (const quiet of content.quiet ?? []) out.push(quiet, "");

  out.push(divider);
  for (const text of content.footer?.lines ?? []) out.push(text);
  for (const link of content.footer?.links ?? []) out.push(`${link.label}: ${safeUrl(link.url)}`);
  out.push(branding.creditLine);

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
