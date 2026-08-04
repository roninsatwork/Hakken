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
 * ## Why this looks like 2005
 *
 * Legacy Outlook is a Tier A client and it renders through Microsoft Word, not
 * a browser. Word ignores flexbox, CSS positioning, `max-width`, custom
 * properties, gradients, `border-radius` and `letter-spacing`. So:
 *
 * - Layout is nested presentation tables with fixed pixel widths.
 * - Spacing lives on `<td>`, never on a `<div>` or as a margin.
 * - Every colour is a literal hex, repeated as a `bgcolor` attribute.
 * - Every text cell carries `mso-line-height-rule:exactly`, or Word adds its
 *   own leading and the stat row stops lining up.
 * - There is no `<style>` element at all. Gmail strips it for non-Google
 *   accounts, so anything that mattered there would matter inconsistently.
 * - Nothing is an `<img>`. External images are blocked by default, so an image
 *   can never carry meaning.
 *
 * Corners are square in Outlook and tracking collapses on the uppercase
 * labels. Both are accepted: radius and tracking are decoration here, and the
 * labels still read through size, weight and colour. The single place roundness
 * matters — the primary button — gets a VML fallback.
 */

/** 600px is the width every mail client agrees on. */
const WIDTH = 600;

/**
 * Gmail truncates around 102KB and hides the rest behind "View entire
 * message". A noisy alert is exactly the mail most at risk, so the card list is
 * capped and the remainder becomes a link.
 */
export const MAX_CARDS = 8;

/**
 * Neutral charcoal with a blue/gold/red signal ramp.
 *
 * This replaced the forest-green palette on 2026-08-04. Anthony, on the system
 * health alert: *"the colours are terrible, they are not accessible, I cannot
 * read half of it because of the colours. I am colour blind red/green."* The
 * forest design signalled healthy in pale green and failed in pale red — the
 * two colours red/green colour blindness merges. Simulated deuteranopia puts
 * the old sage/blush pair at a 1.06 contrast ratio: literally the same colour.
 *
 * The replacement removes green entirely and signals on the blue/yellow axis,
 * which every form of red/green colour blindness preserves:
 *
 * - **good** is blue, **warning** is gold — opposite ends of the surviving axis.
 * - **critical** is a deep red that is also markedly *darker* than gold, so the
 *   warning/critical distinction is carried by brightness, which survives any
 *   colour vision including greyscale.
 * - Colour is never the only carrier: stats have text labels, and a card with
 *   no badge renders its severity as a word instead.
 *
 * `emailLayoutService.test.ts` asserts every foreground/ground pair against
 * WCAG AA *and* asserts the signal colours stay distinguishable under
 * simulated deuteranopia and protanopia. Contrast is not a matter of taste
 * here: an email is read once, on someone else's screen, at whatever
 * brightness they happen to have.
 */
export const EMAIL_PALETTE = {
  ground: "#101114",
  card: "#1a1c21",
  inset: "#14161a",
  edge: "#3a3e48",
  ink: "#f7f8fa",
  ink70: "#c6cad3",
  // Small print: footer, meta lines. Measures 6.57 on the card — comfortably
  // past AA while staying visibly quieter than body copy.
  ink45: "#9ba1ad",
  // Healthy, and every link. 9.49 on the card.
  blue: "#8fc6ff",
  // Needs attention. 13.25 on the card — deliberately the brightest signal.
  gold: "#fae19e",
  // Failed. 5.31 on the card: past AA, but far darker than gold on purpose —
  // the brightness gap is what keeps warning and critical apart when hue
  // cannot.
  red: "#ee6352",
  orange: "#ff5a1f",
  // Label colour for the orange fill. White on #ff5a1f measures 3.12 and
  // fails AA on the one element the whole email exists to get clicked.
  // Dark ink on the same fill measures 5.76 and leaves the brand hex alone.
  onOrange: "#1b1611",
} as const;

const C = EMAIL_PALETTE;

/**
 * Borders and secondary text are flat hex rather than rgba: Word does not
 * support alpha channels, and a colour that silently drops to black is worse
 * than one that is slightly off. These are the composited equivalents.
 */

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The only `<style>` element in the document, and it is deliberately inert.
 *
 * Anthony, 2026-07-31, on the sign-in mail side by side in Apple Mail and
 * Outlook: *"the colours on outlook are terrible and hard to read [...] this to
 * work in light and dark mode."*
 *
 * The palette was not the problem — every foreground/ground pair passes AA, and
 * `emailLayoutService.test.ts` asserts it. The problem is that clients in dark
 * mode rewrite colours they were never asked to touch. Outlook turned the
 * primary button from dark-ink-on-orange into white-on-red, which is the exact
 * pairing `onOrange` exists to avoid: white on #ff5a1f measures 3.12 and fails.
 *
 * ## Why this does not break the no-`<style>` rule
 *
 * The plan banned `<style>` because Gmail strips it for non-Google accounts, so
 * anything living there would apply inconsistently. That reasoning holds for
 * CSS that carries the design. It does not hold here: every rule below restates
 * a value that is *already inline on the same element*. Strip the block and you
 * get the intended design; keep it and you get the intended design. It can only
 * ever put back what a client has taken away, so there is nothing to be
 * inconsistent about.
 *
 * The narrower rule the plan now carries is: no *load-bearing* CSS in `<style>`.
 * `emailLayoutService.test.ts` enforces it by asserting this block declares no
 * colour that is not also in `EMAIL_PALETTE`.
 *
 * ## The two mechanisms
 *
 * - `prefers-color-scheme` covers Apple Mail, iOS Mail and Outlook for iOS.
 * - `[data-ogsc]`/`[data-ogsb]` cover Outlook.com and new Outlook on Mac and
 *   Windows, which tag every element whose colour they rewrote. Matching on the
 *   tag and restating the original is the only lever those clients expose.
 *
 * Neither covers legacy Windows Outlook, which has no dark mode for message
 * bodies, or Gmail's mobile apps, which rewrite without tagging. Both render the
 * inline colours, so both are already correct.
 */
const COLOUR_LOCK =
  `<style type="text/css">` +
  `:root{color-scheme:light dark;supported-color-schemes:light dark;}` +
  // Each selector restates the inline value on that same element. Grouped so
  // one palette change cannot update the inline colour and miss the lock.
  [
    [".e-ground", `background-color:${C.ground}!important;`],
    [".e-card", `background-color:${C.card}!important;`],
    [".e-inset", `background-color:${C.inset}!important;`],
    [".e-mark", `background-color:${C.orange}!important;color:${C.onOrange}!important;`],
    [".e-btn", `background-color:${C.orange}!important;border-color:${C.orange}!important;color:${C.onOrange}!important;`],
    [".e-btn-secondary", `background-color:${C.card}!important;color:${C.ink}!important;`],
    [".e-ink", `color:${C.ink}!important;`],
    [".e-ink70", `color:${C.ink70}!important;`],
    [".e-ink45", `color:${C.ink45}!important;`],
    [".e-blue", `color:${C.blue}!important;`],
    [".e-gold", `color:${C.gold}!important;`],
    [".e-red", `color:${C.red}!important;`],
    [".e-stripe-red", `background-color:${C.red}!important;`],
    [".e-stripe-gold", `background-color:${C.gold}!important;`],
    [".e-stripe-edge", `background-color:${C.edge}!important;`],
  ]
    .map(([selector, declarations]) =>
      `@media (prefers-color-scheme:dark){${selector}{${declarations}}}` +
      `[data-ogsc] ${selector}{${declarations}}` +
      `[data-ogsb] ${selector}{${declarations}}`
    )
    .join("") +
  `</style>`;

export type EmailTone = "neutral" | "good" | "warning" | "critical";
export type EmailSeverity = "info" | "warning" | "critical";

export type EmailStat = { label: string; value: string; tone?: EmailTone };
export type EmailFact = { term: string; value: string; tone?: EmailTone };
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
  /** Uppercase label beside the wordmark: "System health", "Invitation". */
  kind: string;
  /** Inbox preview text. Falls back to the lede, then the verdict. */
  preheader?: string;
  /** What happened, in one sentence. Never a metric dump. */
  verdict: string;
  lede?: string;
  /**
   * Prose body, one entry per paragraph. Single newlines inside a paragraph
   * become line breaks; callers still supply text, never markup.
   */
  paragraphs?: string[];
  stats?: EmailStat[];
  facts?: EmailFact[];
  cards?: EmailCard[];
  /** Shown when the card list was capped. */
  overflow?: EmailAction;
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
 * whatever case it was authored in — the wordmark and every kicker would come
 * out mixed case in legacy Outlook while looking correct everywhere else.
 * Casing the text itself is the only version that holds in all clients.
 *
 * The case change happens before escaping, or an entity like `&lt;` would be
 * mangled into `&LT;`.
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
 * Tone and severity resolve to a colour *and* the dark-mode lock class that
 * restores it, so a client that rewrites the inline value cannot strip the
 * signal.
 */
function tone(value: EmailTone | undefined): { colour: string; cls: string } {
  if (value === "good") return { colour: C.blue, cls: "e-blue" };
  if (value === "warning") return { colour: C.gold, cls: "e-gold" };
  if (value === "critical") return { colour: C.red, cls: "e-red" };
  return { colour: C.ink, cls: "e-ink" };
}

function severityStripe(severity: EmailSeverity | undefined): { colour: string; cls: string } {
  if (severity === "critical") return { colour: C.red, cls: "e-stripe-red" };
  if (severity === "warning") return { colour: C.gold, cls: "e-stripe-gold" };
  return { colour: C.edge, cls: "e-stripe-edge" };
}

function severityText(severity: EmailSeverity | undefined) {
  if (severity === "critical") return { colour: C.red, cls: "e-red" };
  if (severity === "warning") return { colour: C.gold, cls: "e-gold" };
  return { colour: C.ink45, cls: "e-ink45" };
}

/**
 * The badge a card renders. When the caller supplied none but marked the card
 * warning or critical, the severity itself becomes the badge — colour must
 * never be the only thing saying how bad a card is.
 */
function badgeText(card: EmailCard) {
  if (card.badge) return card.badge;
  if (card.severity === "critical") return "Critical";
  if (card.severity === "warning") return "Needs attention";
  return undefined;
}

/** Every text cell needs this or Word re-leads it. */
function line(size: number, height: number, colour: string, weight = 400, extra = "") {
  return (
    `font-family:${FONT};font-size:${size}px;` +
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

function renderStats(stats: EmailStat[]) {
  const width = Math.floor((WIDTH - 44 - (stats.length - 1) * 8) / stats.length);

  const cells = stats
    .map((stat, index) => {
      const spacer = index === 0 ? "" : `<td width="8" style="width:8px;font-size:0;">&nbsp;</td>`;
      const statTone = tone(stat.tone);
      return (
        `${spacer}<td width="${width}" valign="top" class="e-inset" bgcolor="${C.inset}" ` +
        `style="width:${width}px;background-color:${C.inset};border:1px solid ${C.edge};padding:11px 12px;">` +
        `<div class="e-ink45" style="${line(11, 15, C.ink45, 700)}">${up(stat.label)}</div>` +
        `<div class="${statTone.cls}" style="${line(25, 29, statTone.colour, 700, "padding-top:5px;")}">${esc(stat.value)}</div>` +
        `</td>`
      );
    })
    .join("");

  return `${openTable(`width="${WIDTH - 44}"`)}<tr>${cells}</tr></table>`;
}

function renderCard(card: EmailCard) {
  const stripe = severityStripe(card.severity);
  const badgeTone = severityText(card.severity);
  const label = badgeText(card);
  const badge = label
    ? `<td align="right" valign="top" class="${badgeTone.cls}" style="${line(11, 15, badgeTone.colour, 700, "padding-left:12px;")}">${up(label)}</td>`
    : "";

  const meta = card.meta
    ? `<tr><td class="e-ink45" style="${line(12, 17, C.ink45, 400, "padding-top:7px;")}">${esc(card.meta)}</td></tr>`
    : "";

  const fix = card.fix
    ? `<tr><td style="padding-top:9px;">` +
      `${openTable(`width="100%"`)}<tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;">&nbsp;</td></tr></table>` +
      `<div class="e-ink45" style="${line(13, 19, C.ink45, 400, "padding-top:9px;")}">${esc(card.fix)}</div>` +
      `</td></tr>`
    : "";

  const link = card.link
    ? `<tr><td class="e-blue" style="${line(12, 17, C.blue, 700, "padding-top:9px;")}">` +
      `<a href="${esc(safeUrl(card.link.url))}" class="e-blue" style="color:${C.blue};">${esc(card.link.label)}</a>` +
      `</td></tr>`
    : "";

  return (
    `${openTable(`width="${WIDTH - 44}"`)}<tr>` +
    `<td width="3" class="${stripe.cls}" bgcolor="${stripe.colour}" style="width:3px;background-color:${stripe.colour};font-size:0;line-height:0;">&nbsp;</td>` +
    `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};border-left:0;padding:13px 15px;">` +
    `${openTable(`width="100%"`)}` +
    `<tr><td class="e-ink" style="${line(14, 19, C.ink, 700)}">${esc(card.title)}</td>${badge}</tr>` +
    `<tr><td colspan="${label ? 2 : 1}" class="e-ink70" style="${line(13, 19, C.ink70, 400, "padding-top:7px;")}">${esc(card.body)}</td></tr>` +
    meta +
    fix +
    link +
    `</table></td></tr></table>`
  );
}

/**
 * A button that survives Word.
 *
 * VML draws a real rounded rectangle for Outlook; every other client gets the
 * anchor. Both carry the same href and label, so the two can never disagree.
 */
function renderButton(action: EmailAction) {
  const primary = action.emphasis !== "secondary";
  const bg = primary ? C.orange : C.card;
  const fg = primary ? C.onOrange : C.ink;
  const url = safeUrl(action.url);
  const label = esc(action.label);
  // VML cannot size to its content, so the width is estimated from the label.
  const vmlWidth = Math.max(150, action.label.length * 9 + 46);

  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${esc(url)}" style="height:42px;v-text-anchor:middle;width:${vmlWidth}px;" ` +
    `arcsize="50%" stroke="${primary ? "f" : "t"}" strokecolor="${C.edge}" fillcolor="${bg}">` +
    `<w:anchorlock/>` +
    `<center style="${line(14, 42, fg, 700)}">${label}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${esc(url)}" class="${primary ? "e-btn" : "e-btn-secondary"}" style="${line(14, 42, fg, 700)}display:inline-block;background-color:${bg};` +
    `border:1px solid ${primary ? bg : C.edge};border-radius:21px;padding:0 22px;text-decoration:none;">${label}</a>` +
    `<!--<![endif]-->`
  );
}

function renderFacts(facts: EmailFact[]) {
  const rows = facts
    .map((fact) => {
      const factTone = tone(fact.tone);
      return (
        `<tr>` +
        `<td class="e-ink70" style="${line(13, 19, C.ink70, 400, "padding:4px 0;")}">${esc(fact.term)}</td>` +
        `<td align="right" class="${factTone.cls}" style="${line(13, 19, factTone.colour, 700, "padding:4px 0 4px 14px;")}">${esc(fact.value)}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `${openTable(`width="${WIDTH - 44}"`)}<tr>` +
    `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};padding:13px 15px;">` +
    `${openTable(`width="100%"`)}${rows}</table>` +
    `</td></tr></table>`
  );
}

export function renderEmail(content: EmailContent, options: RenderEmailOptions = {}): RenderedEmail {
  const platformName = (options.platformName || "Sonae").trim() || "Sonae";
  const creditLine = options.creditLine ?? `${platformName} · Powered by Ronins`;
  const initial = platformName.slice(0, 1).toUpperCase();
  const preheader = content.preheader || content.lede || content.verdict;

  const cards = content.cards ?? [];
  const shown = cards.slice(0, MAX_CARDS);
  const hidden = cards.length - shown.length;

  const body: string[] = [];

  body.push(
    `<tr><td class="e-ink" style="${line(25, 29, C.ink, 700, `padding:0 22px;letter-spacing:-0.02em;`)}">${esc(content.verdict)}</td></tr>`
  );

  if (content.lede) {
    body.push(gap(14));
    body.push(`<tr><td class="e-ink70" style="${line(15, 23, C.ink70, 400, "padding:0 22px;")}">${esc(content.lede)}</td></tr>`);
  }

  for (const paragraph of content.paragraphs ?? []) {
    body.push(gap(14));
    // Escape first, then turn the survivors into breaks — the other order would
    // let a caller's literal "<br />" through as markup.
    const withBreaks = esc(paragraph).replace(/\r?\n/g, "<br />");
    body.push(`<tr><td class="e-ink70" style="${line(15, 23, C.ink70, 400, "padding:0 22px;")}">${withBreaks}</td></tr>`);
  }

  if (content.stats?.length) {
    body.push(gap(20));
    body.push(`<tr><td style="padding:0 22px;">${renderStats(content.stats)}</td></tr>`);
  }

  if (content.facts?.length) {
    body.push(gap(18));
    body.push(`<tr><td style="padding:0 22px;">${renderFacts(content.facts)}</td></tr>`);
  }

  for (const card of shown) {
    body.push(gap(14));
    body.push(`<tr><td style="padding:0 22px;">${renderCard(card)}</td></tr>`);
  }

  if (hidden > 0 && content.overflow) {
    body.push(gap(12));
    body.push(
      `<tr><td class="e-ink45" style="${line(13, 19, C.ink45, 400, "padding:0 22px;")}">` +
        `${esc(`${hidden} more not shown.`)} ` +
        `<a href="${esc(safeUrl(content.overflow.url))}" class="e-blue" style="color:${C.blue};">${esc(content.overflow.label)}</a>` +
        `</td></tr>`
    );
  }

  if (content.actions?.length) {
    body.push(gap(22));
    const buttons = content.actions
      .map((action) => `<td style="padding:0 9px 9px 0;">${renderButton(action)}</td>`)
      .join("");
    body.push(
      `<tr><td style="padding:0 22px;">${openTable()}<tr>${buttons}</tr></table></td></tr>`
    );
  }

  for (const quiet of content.quiet ?? []) {
    body.push(gap(14));
    body.push(`<tr><td class="e-ink45" style="${line(13, 20, C.ink45, 400, "padding:0 22px;")}">${esc(quiet)}</td></tr>`);
  }

  const footerLines = (content.footer?.lines ?? [])
    .map(
      (text) => `<tr><td class="e-ink45" style="${line(12, 19, C.ink45, 400, "padding:0 22px 4px;")}">${esc(text)}</td></tr>`
    )
    .join("");

  const footerLinks = content.footer?.links?.length
    ? `<tr><td class="e-ink45" style="${line(12, 19, C.ink45, 400, "padding:0 22px 4px;")}">` +
      content.footer.links
        .map(
          (link) =>
            `<a href="${esc(safeUrl(link.url))}" class="e-blue" style="color:${C.blue};">${esc(link.label)}</a>`
        )
        .join(" &middot; ") +
      `</td></tr>`
    : "";

  const html =
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">` +
    `<head>` +
    `<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="x-apple-disable-message-reformatting" />` +
    // "light dark" declares that this email handles both appearances itself.
    // Declaring only "dark" left clients free to decide we had not considered
    // light, and Apple Mail in particular treats an unclaimed scheme as licence
    // to adjust.
    `<meta name="color-scheme" content="light dark" />` +
    `<meta name="supported-color-schemes" content="light dark" />` +
    `<title>${esc(content.verdict)}</title>` +
    COLOUR_LOCK +
    // Windows above 96 DPI rescales fixed widths and breaks the 600px column.
    // It does not reproduce at 100% scaling, so without this it ships unseen.
    `<!--[if mso]><xml><o:OfficeDocumentSettings>` +
    `<o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>` +
    `</o:OfficeDocumentSettings></xml><![endif]-->` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${C.ground};" class="e-ground" bgcolor="${C.ground}">` +
    // Inbox preview text, then filler so the client does not pull body copy in.
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">` +
    `${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>` +
    `${openTable(`width="100%" class="e-ground" bgcolor="${C.ground}" style="background-color:${C.ground};"`)}` +
    `<tr><td align="center" style="padding:26px 12px 22px;">` +
    `${openTable(`width="${WIDTH}" style="width:${WIDTH}px;"`)}` +
    // header
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-bottom:0;padding:15px 22px;">` +
    `${openTable(`width="100%"`)}<tr>` +
    `<td width="26" class="e-mark" bgcolor="${C.orange}" align="center" style="width:26px;background-color:${C.orange};${line(14, 26, C.onOrange, 700)}">${esc(initial)}</td>` +
    `<td class="e-ink" style="${line(14, 26, C.ink, 700, "padding-left:10px;")}">${up(platformName)}</td>` +
    `<td align="right" class="e-ink45" style="${line(11, 26, C.ink45, 700)}">${up(content.kind)}</td>` +
    `</tr></table></td></tr>` +
    // body
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};border-left:1px solid ${C.edge};border-right:1px solid ${C.edge};">` +
    `${openTable(`width="100%"`)}${gap(24)}${body.join("")}${gap(20)}</table>` +
    `</td></tr>` +
    // footer
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-top:0;padding:16px 0 20px;">` +
    `${openTable(`width="100%"`)}` +
    `<tr><td style="padding:0 22px 12px;">${openTable(`width="100%"`)}<tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
    footerLines +
    footerLinks +
    `<tr><td class="e-ink45" style="${line(11, 17, C.ink45, 700, "padding:6px 22px 0;")}">${up(creditLine)}</td></tr>` +
    `</table></td></tr>` +
    `</table></td></tr></table></body></html>`;

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
  const rule = "-".repeat(52);

  out.push(`${branding.platformName.toUpperCase()} — ${content.kind.toUpperCase()}`, "");
  out.push(content.verdict, "");
  if (content.lede) out.push(content.lede, "");

  for (const paragraph of content.paragraphs ?? []) out.push(paragraph, "");

  for (const stat of content.stats ?? []) out.push(`  ${stat.label}: ${stat.value}`);
  if (content.stats?.length) out.push("");

  for (const fact of content.facts ?? []) out.push(`  ${fact.term}: ${fact.value}`);
  if (content.facts?.length) out.push("");

  const cards = content.cards ?? [];
  for (const card of cards.slice(0, MAX_CARDS)) {
    out.push(rule);
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

  for (const action of content.actions ?? []) {
    out.push(`${action.label}: ${safeUrl(action.url)}`);
  }
  if (content.actions?.length) out.push("");

  for (const quiet of content.quiet ?? []) out.push(quiet, "");

  out.push(rule);
  for (const text of content.footer?.lines ?? []) out.push(text);
  for (const link of content.footer?.links ?? []) out.push(`${link.label}: ${safeUrl(link.url)}`);
  out.push(branding.creditLine);

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
