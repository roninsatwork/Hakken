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
 * Side padding on the panel.
 *
 * Raised from 22 to 32 on 2026-08-06. Anthony, comparing our system health
 * alert against a well-made intelligence digest: *"the Sonae emails are
 * terrible, can we make them look more like the Conterra email in terms of
 * colour."* Half of what separated the two was not colour at all — it was air.
 * Tight padding is what made our panel read as a form rather than a document.
 */
const PAD = 32;

/** The measure everything inside the panel is drawn to. */
const INNER = WIDTH - PAD * 2;

/**
 * Gmail truncates around 102KB and hides the rest behind "View entire
 * message". A noisy alert is exactly the mail most at risk, so the card list is
 * capped and the remainder becomes a link.
 */
export const MAX_CARDS = 8;

/**
 * Conterra-style charcoal with a blue/gold/red signal ramp.
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
 *
 * ## The 2026-08-08 revision: the Conterra readability pass
 *
 * Anthony compared the Sonae alert against a Conterra alert and then clarified
 * that every outbound email should be easy to read in that colour scheme. The
 * shell now takes the Conterra cues that matter in email clients: near-black
 * page, black card, readable white body copy, quiet grey metadata, a soft grey
 * summary strip, and yellow/orange operational accents. The signal colours
 * still avoid the red/green axis, and colour is still never the only carrier.
 *
 * The hues above were right and are unchanged. What was wrong was their
 * *setting*. Ground `#101114` and card `#1a1c21` were close enough in value to
 * read as one mid-grey slab, and `#3a3e48` borders drew a visible box around
 * every element inside it — so a two-signal alert arrived looking like a form.
 *
 * The panel now sits barely above a near-black ground and the borders are
 * hairlines. Nothing about the signal ramp moved, so the colour-blind
 * separation the palette was rebuilt for on 2026-08-04 is untouched; every
 * contrast pair only improved, because a darker ground raises the ratio against
 * light type.
 */
export const EMAIL_PALETTE = {
  ground: "#050505",
  card: "#111111",
  inset: "#191919",
  edge: "#303030",
  banner: "#5f625d",
  onBanner: "#f2f2ed",
  ink: "#ffffff",
  ink70: "#d8d8d8",
  // Small print: footer, meta lines. Measures 6.57 on the card — comfortably
  // past AA while staying visibly quieter than body copy.
  ink45: "#a8a8a8",
  // Non-signal operational label colour, matching the Conterra monitor's
  // muted sage. Signal status never relies on this hue.
  sage: "#aebd9a",
  // Healthy, and every link. 9.49 on the card.
  blue: "#82bdff",
  // Needs attention. 13.25 on the card — deliberately the brightest signal.
  gold: "#f3d66e",
  // Failed. 5.31 on the card: past AA, but far darker than gold on purpose —
  // the brightness gap is what keeps warning and critical apart when hue
  // cannot.
  red: "#e45545",
  orange: "#ff7a1f",
  // Label colour for the orange fill. White on #ff5a1f measures 3.12 and
  // fails AA on the one element the whole email exists to get clicked.
  // Dark ink on the same fill measures 5.76 and leaves the brand hex alone.
  onOrange: "#241300",
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
    [".e-banner", `background-color:${C.banner}!important;color:${C.onBanner}!important;`],
    [".e-btn-secondary", `background-color:${C.card}!important;color:${C.ink}!important;`],
    [".e-ink", `color:${C.ink}!important;`],
    [".e-ink70", `color:${C.ink70}!important;`],
    [".e-ink45", `color:${C.ink45}!important;`],
    [".e-sage", `color:${C.sage}!important;`],
    [".e-blue", `color:${C.blue}!important;`],
    [".e-gold", `color:${C.gold}!important;`],
    [".e-red", `color:${C.red}!important;`],
    [".e-btn", `background-color:${C.orange}!important;border-color:${C.orange}!important;color:${C.onOrange}!important;`],
    [".e-stripe-red", `background-color:${C.red}!important;`],
    [".e-stripe-gold", `background-color:${C.gold}!important;`],
    [".e-stripe-edge", `background-color:${C.edge}!important;`],
  ]
    .map(([selector, declarations]) =>
      // Both appearances, not just dark. A client set to *light* is the one
      // that might drop a dark background while leaving the light text on it —
      // which is the white-on-white failure. Restating the background under
      // `light` as well means a reader in light mode cannot lose it.
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
  if (stats.length === 1) {
    const stat = stats[0];
    const statTone = tone(stat.tone);
    return (
      `${openTable(`width="${INNER}"`)}<tr>` +
      `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};padding:20px 24px;">` +
      `<div class="${statTone.cls}" style="${line(32, 38, statTone.colour, 700)}">${esc(stat.value)}</div>` +
      `<div class="e-ink45" style="${line(12, 17, C.ink45, 700, "padding-top:8px;")}">${up(stat.label)}</div>` +
      `</td></tr></table>`
    );
  }

  /*
   * Stat tiles made the alert read as a dashboard screenshot. Count rows are
   * denser and easier to scan in a mail client, matching the Conterra monitor.
   */
  const rows = stats
    .map((stat, index) => {
      const statTone = tone(stat.tone);
      const divider = index === 0 ? "" : `border-top:1px solid ${C.edge};`;
      return (
        `<tr>` +
        `<td class="e-ink45" style="${line(13, 18, C.ink45, 700, `padding:15px 0;${divider}`)}">${up(stat.label)}</td>` +
        `<td align="right" class="${statTone.cls}" style="${line(16, 18, statTone.colour, 700, `padding:15px 0 15px 14px;${divider}`)}">${esc(stat.value)}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `${openTable(`width="${INNER}"`)}<tr>` +
    `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};padding:0 20px;">` +
    `${openTable(`width="100%"`)}${rows}</table>` +
    `</td></tr></table>`
  );
}

function renderCard(card: EmailCard) {
  const stripe = severityStripe(card.severity);
  const badgeTone = severityText(card.severity);
  const label = badgeText(card);
  const badge = label
    ? `<td align="right" valign="top" class="${badgeTone.cls}" style="${line(12, 16, badgeTone.colour, 700, "padding-left:12px;")}">${up(label)}</td>`
    : "";

  const meta = card.meta
    ? `<tr><td class="e-ink45" style="${line(13, 19, C.ink45, 400, "padding-top:9px;")}">${esc(card.meta)}</td></tr>`
    : "";

  const fix = card.fix
    ? `<tr><td style="padding-top:13px;">` +
      `${openTable(`width="100%"`)}<tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;">&nbsp;</td></tr></table>` +
      `<div class="e-ink70" style="${line(13, 21, C.ink70, 400, "padding-top:12px;")}">${esc(card.fix)}</div>` +
      `</td></tr>`
    : "";

  const link = card.link
    ? `<tr><td class="e-blue" style="${line(13, 18, C.blue, 700, "padding-top:12px;")}">` +
      `<a href="${esc(safeUrl(card.link.url))}" class="e-blue" style="color:${C.blue};">${esc(card.link.label)}</a>` +
      `</td></tr>`
    : "";

  return (
    `${openTable(`width="${INNER}"`)}<tr>` +
    `<td width="3" class="${stripe.cls}" bgcolor="${stripe.colour}" style="width:3px;background-color:${stripe.colour};font-size:0;line-height:0;">&nbsp;</td>` +
    `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};border-left:0;padding:20px 24px;">` +
    `${openTable(`width="100%"`)}` +
    `<tr><td class="e-ink" style="${line(17, 23, C.ink, 700)}">${esc(card.title)}</td>${badge}</tr>` +
    `<tr><td colspan="${label ? 2 : 1}" class="e-ink70" style="${line(15, 23, C.ink70, 400, "padding-top:9px;")}">${esc(card.body)}</td></tr>` +
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
  const vmlWidth = Math.max(150, action.label.length * 9 + 54);

  // Near-square corners rather than a pill. The pill read as a web UI control
  // dropped into a document; a 4px corner reads as part of the page, which is
  // the whole direction of the 2026-08-06 revision.
  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${esc(url)}" style="height:44px;v-text-anchor:middle;width:${vmlWidth}px;" ` +
    `arcsize="9%" stroke="${primary ? "f" : "t"}" strokecolor="${C.edge}" fillcolor="${bg}">` +
    `<w:anchorlock/>` +
    `<center style="${line(14, 44, fg, 700)}">${label}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${esc(url)}" class="${primary ? "e-btn" : "e-btn-secondary"}" style="${line(14, 44, fg, 700)}display:inline-block;background-color:${bg};` +
    `border:1px solid ${primary ? bg : C.edge};border-radius:4px;padding:0 26px;text-decoration:none;">${label}</a>` +
    `<!--<![endif]-->`
  );
}

/**
 * Label left, value right, one hairline between each pair.
 *
 * The dividers are the point. A stack of rows in a single box reads as a form;
 * the same rows ruled apart read as a record, which is what these facts are.
 */
function renderFacts(facts: EmailFact[]) {
  const rows = facts
    .map((fact, index) => {
      const factTone = tone(fact.tone);
      const divider = index === 0 ? "" : `border-top:1px solid ${C.edge};`;
      return (
        `<tr>` +
        `<td class="e-ink45" style="${line(12, 17, C.ink45, 700, `padding:14px 0;${divider}`)}">${up(fact.term)}</td>` +
        `<td align="right" class="${factTone.cls}" style="${line(15, 17, factTone.colour, 700, `padding:14px 0 14px 14px;${divider}`)}">${esc(fact.value)}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `${openTable(`width="${INNER}"`)}<tr>` +
    `<td class="e-inset" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};padding:2px 18px;">` +
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

  // The headline carries the message. It was 25px sitting in a tight panel,
  // which is the size a form label gets — not the size a verdict gets.
  body.push(
    `<tr><td class="e-ink" style="${line(33, 40, C.ink, 700, `padding:0 ${PAD}px;letter-spacing:0;`)}">${esc(content.verdict)}</td></tr>`
  );

  if (content.lede) {
    body.push(gap(16));
    body.push(`<tr><td class="e-ink70" style="${line(16, 25, C.ink70, 400, `padding:0 ${PAD}px;`)}">${esc(content.lede)}</td></tr>`);
  }

  for (const paragraph of content.paragraphs ?? []) {
    body.push(gap(16));
    // Escape first, then turn the survivors into breaks — the other order would
    // let a caller's literal "<br />" through as markup.
    const withBreaks = esc(paragraph).replace(/\r?\n/g, "<br />");
    body.push(`<tr><td class="e-ink70" style="${line(16, 25, C.ink70, 400, `padding:0 ${PAD}px;`)}">${withBreaks}</td></tr>`);
  }

  if (content.stats?.length) {
    body.push(gap(26));
    body.push(`<tr><td style="padding:0 ${PAD}px;">${renderStats(content.stats)}</td></tr>`);
  }

  if (content.facts?.length) {
    body.push(gap(24));
    body.push(`<tr><td style="padding:0 ${PAD}px;">${renderFacts(content.facts)}</td></tr>`);
  }

  for (const card of shown) {
    body.push(gap(18));
    body.push(`<tr><td style="padding:0 ${PAD}px;">${renderCard(card)}</td></tr>`);
  }

  if (hidden > 0 && content.overflow) {
    body.push(gap(14));
    body.push(
      `<tr><td class="e-ink45" style="${line(13, 19, C.ink45, 400, `padding:0 ${PAD}px;`)}">` +
        `${esc(`${hidden} more not shown.`)} ` +
        `<a href="${esc(safeUrl(content.overflow.url))}" class="e-blue" style="color:${C.blue};">${esc(content.overflow.label)}</a>` +
        `</td></tr>`
    );
  }

  if (content.actions?.length) {
    body.push(gap(28));
    const buttons = content.actions
      .map((action) => `<td style="padding:0 10px 10px 0;">${renderButton(action)}</td>`)
      .join("");
    body.push(
      `<tr><td style="padding:0 ${PAD}px;">${openTable()}<tr>${buttons}</tr></table></td></tr>`
    );
  }

  for (const quiet of content.quiet ?? []) {
    body.push(gap(18));
    body.push(`<tr><td class="e-ink45" style="${line(13, 20, C.ink45, 400, `padding:0 ${PAD}px;`)}">${esc(quiet)}</td></tr>`);
  }

  const footerLines = (content.footer?.lines ?? [])
    .map(
      (text) => `<tr><td class="e-ink45" style="${line(12, 19, C.ink45, 400, `padding:0 ${PAD}px 5px;`)}">${esc(text)}</td></tr>`
    )
    .join("");

  const footerLinks = content.footer?.links?.length
    ? `<tr><td class="e-ink45" style="${line(12, 19, C.ink45, 400, `padding:0 ${PAD}px 5px;`)}">` +
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
    `<tr><td align="center" style="padding:30px 12px 34px;">` +
    `${openTable(`width="${WIDTH}" style="width:${WIDTH}px;"`)}` +
    `<tr><td class="e-banner" bgcolor="${C.banner}" style="background-color:${C.banner};padding:15px ${PAD}px;">` +
    `<div class="e-banner" style="${line(14, 20, C.onBanner, 700)}">${esc(preheader)}</div>` +
    `</td></tr>` +
    // Header. The rule beneath it does the separating, so the panel reads as one
    // surface rather than three stacked boxes.
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};padding:34px ${PAD}px 28px;">` +
    `${openTable(`width="100%"`)}<tr>` +
    `<td width="34" class="e-banner" bgcolor="${C.banner}" align="center" style="width:34px;background-color:${C.banner};${line(16, 34, C.onBanner, 700)}">${esc(initial)}</td>` +
    `<td style="padding-left:14px;">` +
    `<div class="e-ink" style="${line(17, 22, C.ink, 700)}">${esc(platformName)}</div>` +
    `<div class="e-ink45" style="${line(13, 18, C.ink45, 400, "padding-top:2px;")}">${esc(content.kind)}</div>` +
    `</td>` +
    `</tr></table>` +
    `${openTable(`width="100%"`)}${gap(34)}` +
    `<tr><td class="e-sage" style="${line(13, 18, C.sage, 700)}">${up(content.kind)}</td></tr></table>` +
    `</td></tr>` +
    // body
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};">` +
    `${openTable(`width="100%"`)}${gap(0)}${body.join("")}${gap(28)}</table>` +
    `</td></tr>` +
    // footer
    `<tr><td class="e-card" bgcolor="${C.card}" style="background-color:${C.card};padding:0 0 30px;">` +
    `${openTable(`width="100%"`)}` +
    `<tr><td style="padding:0 ${PAD}px 18px;">${openTable(`width="100%"`)}<tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
    footerLines +
    footerLinks +
    `<tr><td class="e-ink45" style="${line(11, 17, C.ink45, 700, `padding:8px ${PAD}px 0;`)}">${up(creditLine)}</td></tr>` +
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
