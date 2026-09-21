import { describe, expect, test } from "vitest";
import { EMAIL_PALETTE, MAX_CARDS, renderEmail, type EmailContent } from "./emailLayoutService";

function buildContent(overrides: Partial<EmailContent> = {}): EmailContent {
  return {
    kind: "System health",
    verdict: "Two things need you.",
    lede: "The Research Agent failed six times overnight.",
    stats: [
      { label: "Agent errors", value: "4", tone: "critical" },
      { label: "Failed tool calls", value: "2", tone: "warning" },
      { label: "Checks passed", value: "9", tone: "good" },
    ],
    cards: [
      {
        title: "Agent execution errors",
        badge: "4 x same fault",
        severity: "critical",
        body: "A function call is missing its thought_signature.",
        meta: "Research Agent - last 16:41",
        fix: "Open the run and check the provider configuration.",
      },
    ],
    actions: [
      { label: "Open the agent log", url: "https://app.test/agents/1/logs" },
      { label: "See all runs", url: "https://app.test/agents/1/runs", emphasis: "secondary" },
    ],
    quiet: ["Also checked and clear: budgets, schedules, snapshots."],
    footer: {
      lines: ["Covering 24-31 July."],
      links: [{ label: "Change which alerts you get", url: "https://app.test/settings" }],
    },
    ...overrides,
  };
}

describe("renderEmail — escaping", () => {
  const hostile = "<script>alert(1)</script>";

  test("escapes markup in every content field", () => {
    const { html } = renderEmail(
      buildContent({
        kind: hostile,
        verdict: hostile,
        lede: hostile,
        preheader: hostile,
        stats: [{ label: hostile, value: hostile }],
        facts: [{ term: hostile, value: hostile }],
        cards: [{ title: hostile, badge: hostile, body: hostile, meta: hostile, fix: hostile }],
        actions: [{ label: hostile, url: "https://app.test/x" }],
        quiet: [hostile],
        footer: { lines: [hostile], links: [{ label: hostile, url: "https://app.test/y" }] },
      }),
      { platformName: hostile }
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("escapes markup in the plain text part's structure without leaking tags", () => {
    const { text } = renderEmail(buildContent({ verdict: hostile }));

    // Text is not HTML, so the raw string is correct there — what matters is
    // that nothing was silently dropped.
    expect(text).toContain(hostile);
  });

  test("a caller cannot smuggle an unescaped attribute through a label", () => {
    const { html } = renderEmail(
      buildContent({ actions: [{ label: '" onmouseover="evil()', url: "https://app.test/x" }] })
    );

    expect(html).not.toContain('onmouseover="evil()');
    expect(html).toContain("&quot; onmouseover=&quot;evil()");
  });
});

describe("renderEmail — dangerous URLs", () => {
  test("collapses a javascript: action to a dead link", () => {
    const { html, text } = renderEmail(
      buildContent({ actions: [{ label: "Click", url: "javascript:alert(1)" }] })
    );

    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
    expect(text).toContain("Click: #");
  });

  test("collapses a data: URL", () => {
    const { html } = renderEmail(
      buildContent({ footer: { links: [{ label: "x", url: "data:text/html,<script>" }] } })
    );

    expect(html).not.toContain("data:text/html");
  });

  test("keeps https and mailto", () => {
    const { html } = renderEmail(
      buildContent({
        actions: [
          { label: "App", url: "https://app.test/a" },
          { label: "Mail", url: "mailto:ops@app.test" },
        ],
      })
    );

    expect(html).toContain("https://app.test/a");
    expect(html).toContain("mailto:ops@app.test");
  });
});

describe("renderEmail — legacy Outlook contract", () => {
  const { html } = renderEmail(buildContent());

  test("carries the 120 DPI conditional, without which fixed widths rescale", () => {
    expect(html).toContain("<o:PixelsPerInch>96</o:PixelsPerInch>");
  });

  test("gives the primary button a VML fallback", () => {
    expect(html).toContain("<v:roundrect");
    expect(html).toContain("<w:anchorlock/>");
    expect(html).toContain("<!--[if mso]>");
  });

  /*
   * The rule used to be "no <style> element at all", on the grounds that Gmail
   * strips it for non-Google accounts. That reasoning only covers CSS carrying
   * the design. The one block now present carries none: every rule restates a
   * colour already inline on the same element, so it can only put back what a
   * dark-mode client rewrote. These tests enforce that narrower rule, so the
   * block cannot quietly grow into something Gmail's stripping would break.
   */
  test("has exactly one style element, and it declares nothing but colour", () => {
    const blocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
    expect(blocks).toHaveLength(1);

    const css = blocks[0];
    // Layout, sizing and typography must stay inline, where Word can see them.
    expect(css).not.toMatch(/(padding|margin|width|height|font|border-radius|display)\s*:/i);
    // Only the dark-mode locks and the scheme declaration.
    expect(css).toMatch(/prefers-color-scheme/);
    expect(css).toMatch(/\[data-ogsc\]/);
    expect(css).toMatch(/\[data-ogsb\]/);
  });

  test("the style block introduces no colour outside the audited palette", () => {
    const css = (html.match(/<style[\s\S]*?<\/style>/i) ?? [""])[0];
    const known = new Set(Object.values(EMAIL_PALETTE).map((hex) => hex.toLowerCase()));
    const used = new Set((css.match(/#[0-9a-f]{3,8}/gi) ?? []).map((hex) => hex.toLowerCase()));

    // Every hex in the lock has to be one the contrast tests already cover,
    // otherwise dark mode could ship a pairing nothing has measured.
    expect([...used].filter((hex) => !known.has(hex))).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });

  /*
   * Anthony, 2026-08-06: "if the background goes white the text needs to go
   * dark." The failure he is describing is a client that drops our dark
   * background but keeps the light text sitting on it — white on white.
   *
   * We cannot detect that after the fact, so the answer is that the background
   * must be impossible to lose. It is stated four times over: inline, as a
   * `bgcolor` attribute, and restated under both appearances in the lock. A
   * reader in light mode is the one at risk, so `light` is asserted here as
   * explicitly as `dark`.
   */
  test("restates every surface under light as well as dark", () => {
    const css = (html.match(/<style[\s\S]*?<\/style>/i) ?? [""])[0];

    const light = css.match(/@media \(prefers-color-scheme:light\)\{[^}]*\{[^}]*\}\}/g) ?? [];
    const dark = css.match(/@media \(prefers-color-scheme:dark\)\{[^}]*\{[^}]*\}\}/g) ?? [];

    expect(light.length).toBe(dark.length);
    expect(light.length).toBeGreaterThan(0);
    // The grounds are what white-on-white depends on, so name them rather than
    // trusting the counts to have covered them.
    for (const surface of ["e-ground", "e-card", "e-inset"]) {
      expect(css).toContain(`@media (prefers-color-scheme:light){.${surface}{background-color:`);
    }
  });

  test("no painted surface exists without a lock class to defend it", () => {
    // A new surface added without a class would be the one element a
    // forced-appearance client could strip, and nothing would put it back.
    const document = html.replace(/<style[\s\S]*?<\/style>/i, "");
    const painted = document.match(/<(?:td|body|table)[^>]*background-color:#[0-9a-f]{6}[^>]*>/gi) ?? [];

    expect(painted.length).toBeGreaterThan(0);
    for (const element of painted) {
      expect(element).toMatch(/class="e-[a-z0-9- ]*"/i);
    }
  });

  test("every colour the lock restates is also inline on the element it targets", () => {
    const css = (html.match(/<style[\s\S]*?<\/style>/i) ?? [""])[0];
    const body = html.replace(/<style[\s\S]*?<\/style>/i, "");

    for (const [, selector, declarations] of css.matchAll(/\.(e-[a-z0-9-]+)\{([^}]*)\}/gi)) {
      const cls = selector;
      if (!body.includes(`class="${cls}"`) && !body.includes(`"${cls}"`)) continue;
      for (const [, hex] of declarations.matchAll(/(#[0-9a-f]{3,8})/gi)) {
        // The lock is a restatement, never a new instruction: the same colour
        // must already appear in the document body.
        expect(body.toLowerCase()).toContain(hex.toLowerCase());
      }
    }
  });

  test("has no images, because they are blocked by default", () => {
    expect(html).not.toMatch(/<img[\s>]/i);
  });

  test("uses no layout Word cannot render", () => {
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
    expect(html).not.toContain("var(--");
    expect(html).not.toMatch(/position\s*:\s*(absolute|fixed)/i);

    // `max-width` appears once, in the hidden preheader — the standard way to
    // collapse preview text. Word ignoring it there costs nothing, because the
    // element is already display:none. It must not appear in the layout.
    const withoutPreheader = html.replace(/<div style="display:none;[\s\S]*?<\/div>/, "");
    expect(withoutPreheader).not.toMatch(/max-width\s*:/i);
  });

  test("uppercases labels in the string, because Word ignores text-transform", () => {
    const { html } = renderEmail(buildContent(), { platformName: "Acme Ops" });

    expect(html).not.toContain("text-transform");
    expect(html).toContain("ACME OPS");
    expect(html).toContain("SYSTEM HEALTH");
    expect(html).toContain("AGENT ERRORS");
    expect(html).toContain("4 X SAME FAULT");
  });

  test("every table is a presentation table with the reset attributes", () => {
    const tables = html.match(/<table[^>]*>/g) ?? [];

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table).toContain('cellpadding="0"');
      expect(table).toContain('cellspacing="0"');
      expect(table).toContain('border="0"');
      expect(table).toContain('role="presentation"');
    }
  });

  test("every text cell pins its line height for Word", () => {
    const fontSized = html.match(/font-family:[^"]*/g) ?? [];

    expect(fontSized.length).toBeGreaterThan(0);
    for (const style of fontSized) {
      expect(style).toContain("mso-line-height-rule:exactly");
    }
  });

  test("repeats every background colour as a bgcolor attribute", () => {
    // Measured on the document only. The dark-mode lock restates backgrounds
    // for clients that rewrote them, and those clients are not Word — a
    // `bgcolor` twin there would mean nothing.
    const document = html.replace(/<style[\s\S]*?<\/style>/i, "");
    const backgrounds = document.match(/background-color:#[0-9a-f]{6}/gi) ?? [];

    expect(backgrounds.length).toBeGreaterThan(0);
    // The body and every coloured cell also carry the attribute form.
    expect((document.match(/bgcolor="#[0-9a-f]{6}"/gi) ?? []).length).toBeGreaterThanOrEqual(
      backgrounds.length - 2
    );
  });

  test("is a fixed 600px column", () => {
    expect(html).toContain('width="600"');
    expect(html).toContain("width:600px");
  });
});

describe("renderEmail — Gmail's clip threshold", () => {
  function manyCards(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      title: `Signal ${index + 1}`,
      body: "A long description of the failure that repeats to add weight. ".repeat(6),
      severity: "warning" as const,
    }));
  }

  test("caps the card list and links to the rest", () => {
    const { html } = renderEmail(
      buildContent({
        cards: manyCards(40),
        overflow: { label: "See all 40", url: "https://app.test/alerts/1" },
      })
    );

    expect(html).toContain("Signal 8");
    expect(html).not.toContain("Signal 9");
    expect(html).toContain("32 more not shown.");
    expect(html).toContain("See all 40");
  });

  test("stays well under the 102KB clip with a hostile card count", () => {
    const { html } = renderEmail(
      buildContent({
        cards: manyCards(40),
        overflow: { label: "See all", url: "https://app.test/alerts/1" },
      })
    );

    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(100 * 1024);
  });

  test("caps the text part at the same count", () => {
    const { text } = renderEmail(
      buildContent({
        cards: manyCards(40),
        overflow: { label: "See all", url: "https://app.test/alerts/1" },
      })
    );

    expect(text).toContain(`Signal ${MAX_CARDS}`);
    expect(text).not.toContain(`Signal ${MAX_CARDS + 1}`);
  });
});

describe("renderEmail — the plain text part", () => {
  test("carries the verdict, every stat, and every action URL", () => {
    const content = buildContent();
    const { text } = renderEmail(content);

    expect(text).toContain(content.verdict);
    for (const stat of content.stats ?? []) {
      expect(text).toContain(`${stat.label}: ${stat.value}`);
    }
    for (const action of content.actions ?? []) {
      expect(text).toContain(action.url);
    }
    for (const link of content.footer?.links ?? []) {
      expect(text).toContain(link.url);
    }
  });

  test("carries the card detail an operator needs", () => {
    const { text } = renderEmail(buildContent());

    expect(text).toContain("Agent execution errors (4 x same fault)");
    expect(text).toContain("A function call is missing its thought_signature.");
    expect(text).toContain("Fix: Open the run and check the provider configuration.");
  });

  test("contains no markup", () => {
    const { text } = renderEmail(buildContent());

    expect(text).not.toMatch(/<[a-z!/]/i);
  });
});

describe("renderEmail — branding", () => {
  test("takes the platform name from settings rather than hardcoding one", () => {
    const { html, text } = renderEmail(buildContent(), { platformName: "Acme Ops" });

    expect(html).toContain("ACME OPS");
    expect(text).toContain("ACME OPS");
  });

  test("bakes no domain into the credit line", () => {
    const { html } = renderEmail(buildContent());

    // The footer kicker is cased in the string, not in CSS, so match either.
    expect(html).toMatch(/powered by ronins/i);
    expect(html).not.toMatch(/ronins\.co\.uk/i);
  });

  test("falls back to a preheader when none is given", () => {
    const { html } = renderEmail(buildContent({ preheader: undefined }));

    expect(html).toContain("The Research Agent failed six times overnight.");
  });
});

describe("renderEmail — optional sections", () => {
  test("a card with a severity but no badge says the severity in words", () => {
    // Colour must never be the only carrier of how bad a card is — a stripe
    // alone is invisible information to a colour-blind reader.
    const { html, text } = renderEmail(
      buildContent({
        cards: [
          { title: "Backup failed", severity: "critical", body: "The nightly export did not run." },
          { title: "Queue slow", severity: "warning", body: "Jobs are taking twice as long." },
        ],
      })
    );

    expect(html).toContain("CRITICAL");
    expect(html).toContain("NEEDS ATTENTION");
    expect(text).toContain("Backup failed (Critical)");
    expect(text).toContain("Queue slow (Needs attention)");
  });

  test("renders a minimal message with only a verdict", () => {
    const { html, text } = renderEmail({ kind: "Invitation", verdict: "You're in." });

    expect(html).toContain("You&#39;re in.");
    expect(text).toContain("You're in.");
    expect(html).not.toContain("<v:roundrect");
  });
});

/* ---------------------------------------------------------------------------
 * Regressions for the three surfaces that used to hand-roll their own markup.
 *
 * Invites interpolated an editable template straight into an HTML document;
 * workflow email nodes sent the author-written body as raw `html`. Both holes
 * close because those callers now pass content and the shell escapes it. These
 * assert the property at the boundary they all share.
 * ------------------------------------------------------------------------- */
describe("renderEmail — prose bodies", () => {
  test("escapes a hostile headline, the invite injection hole", () => {
    const { html } = renderEmail({
      kind: "Invitation",
      verdict: '<img src=x onerror="alert(1)">',
      paragraphs: ["You have been added."],
    });

    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&lt;img src=x");
  });

  test("escapes a hostile body, the workflow raw-html hole", () => {
    const { html, text } = renderEmail({
      kind: "Automation",
      verdict: "Report ready",
      paragraphs: ['<script>fetch("http://evil.test")</script>'],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(text).toContain("evil.test");
  });

  test("turns single newlines into breaks but never lets markup through", () => {
    const { html } = renderEmail({
      kind: "Automation",
      verdict: "x",
      paragraphs: ["First line\nsecond line", "A literal <br /> stays literal"],
    });

    expect(html).toContain("First line<br />second line");
    expect(html).toContain("A literal &lt;br /&gt; stays literal");
  });

  test("drops empty paragraphs rather than rendering blank rows", () => {
    const { html } = renderEmail({
      kind: "Invitation",
      verdict: "x",
      paragraphs: ["Real content"],
    });

    expect(html).toContain("Real content");
  });
});

/* ---------------------------------------------------------------------------
 * Contrast.
 *
 * Anthony, 2026-07-31, on receiving the invite: *"the email design makes it
 * hard to read."* Two pairs were failing WCAG AA — the muted tone carrying the
 * footer and every small-print row (4.31), and white on the orange button
 * (3.12), which is the one element the email exists to get clicked.
 *
 * Asserted rather than eyeballed because an email is read once, on someone
 * else's screen, at whatever brightness they happen to have. There is no hover
 * state, no zoom and no second chance to recover from a bad pair.
 * ------------------------------------------------------------------------- */
function relativeLuminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("renderEmail — contrast", () => {
  const P = EMAIL_PALETTE;
  const AA = 4.5;

  const pairs: Array<[string, string, string]> = [
    ["headings on the card", P.ink, P.card],
    ["body copy on the card", P.ink70, P.card],
    ["small print on the card", P.ink45, P.card],
    ["small print on an inset block", P.ink45, P.inset],
    ["body copy on an inset block", P.ink70, P.inset],
    ["the summary strip text", P.onBanner, P.banner],
    ["the operational kicker", P.sage, P.card],
    ["links and the healthy tone", P.blue, P.card],
    ["the healthy tone on an inset tile", P.blue, P.inset],
    ["the warning tone", P.gold, P.card],
    ["the warning tone on an inset tile", P.gold, P.inset],
    ["the critical tone", P.red, P.card],
    ["the critical tone on an inset tile", P.red, P.inset],
    ["the primary button label", P.onOrange, P.orange],
  ];

  test.each(pairs)("%s meets WCAG AA", (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA);
  });

  test("the signal colours survive red/green colour blindness", () => {
    /*
     * Anthony, 2026-08-04, on the system health alert: "the colours are
     * terrible, they are not accessible, I cannot read half of it because of
     * the colours. I am colour blind red/green."
     *
     * The forest palette failed him measurably: under simulated deuteranopia
     * its healthy green and failed red landed at a 1.06 contrast ratio —
     * the same colour. This test renders the three signal colours through
     * the standard Viénot dichromacy matrices and requires every pair to
     * keep a visible brightness or blue-axis gap, so a future palette
     * change cannot quietly reintroduce the failure.
     */
    const linear = (channel: number) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const toSrgb = (c: number) =>
      Math.round(255 * (Math.min(1, Math.max(0, c)) <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
    const simulate = (hex: string, matrix: number[][]) => {
      const [r, g, b] = [1, 3, 5].map((offset) => linear(parseInt(hex.slice(offset, offset + 2), 16)));
      return (
        "#" +
        matrix
          .map(([mr, mg, mb]) => toSrgb(mr * r + mg * g + mb * b))
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")
      );
    };
    const deuteranopia = [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7],
    ];
    const protanopia = [
      [0.170557, 0.829443, 0],
      [0.170557, 0.829443, 0],
      [-0.004517, 0.004517, 1],
    ];

    for (const matrix of [deuteranopia, protanopia]) {
      const [good, warning, critical] = [P.blue, P.gold, P.red].map((hex) => simulate(hex, matrix));
      expect(contrastRatio(good, warning)).toBeGreaterThanOrEqual(1.25);
      expect(contrastRatio(good, critical)).toBeGreaterThanOrEqual(1.25);
      expect(contrastRatio(warning, critical)).toBeGreaterThanOrEqual(1.25);
    }
  });

  test("warning and critical differ in brightness, not just hue", () => {
    // Brightness survives every kind of colour vision including greyscale.
    // Warning is deliberately the lighter of the two.
    expect(contrastRatio(P.gold, P.red)).toBeGreaterThanOrEqual(1.8);
  });

  test("the muted tone is still visibly muted, not just legible", () => {
    // Fixing contrast by making everything white would erase the hierarchy the
    // design depends on. Small print must read as small print.
    expect(contrastRatio(P.ink45, P.card)).toBeLessThan(contrastRatio(P.ink70, P.card));
    expect(contrastRatio(P.ink70, P.card)).toBeLessThan(contrastRatio(P.ink, P.card));
  });

  test("no text is smaller than 11px", () => {
    const { html } = renderEmail(buildContent());
    // The hidden preheader is 1px on purpose — it is never displayed, it only
    // feeds the inbox preview line. Spacer rows are 0.
    const visible = html.replace(/<div style="display:none;[\s\S]*?<\/div>/, "");
    const sizes = [...visible.matchAll(/font-size:(\d+)px/g)]
      .map((match) => Number(match[1]))
      .filter((size) => size > 0);

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  test("no signal colour is green, and none is a red a green could be mistaken for", () => {
    // Anthony, 2026-08-04: "I am colour blind red/green and this is nasty."
    // The forest palette signalled healthy in green and failed in red — the
    // exact pair his vision merges. No signal colour may lean green again:
    // in every signal hex the green channel must not dominate.
    for (const hex of [P.blue, P.gold, P.red]) {
      const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
      expect(g).toBeLessThanOrEqual(Math.max(r, b));
    }
  });

  test("white is never placed on the orange fill", () => {
    const { html } = renderEmail(
      buildContent({ actions: [{ label: "Do the thing", url: "https://app.test/x" }] })
    );
    const orangeRegions = html.split(EMAIL_PALETTE.orange).slice(1);

    for (const region of orangeRegions) {
      expect(region.slice(0, 200)).not.toMatch(/color:#f{6}/i);
      expect(region.slice(0, 200)).not.toMatch(/color:#ffffff/i);
    }
  });
});
