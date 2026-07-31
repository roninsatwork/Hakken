/**
 * Dev-only preview of every email the platform sends.
 *
 * Governed by docs/plans/active/email-design-system-plan.md (Phase 6).
 *
 * Two jobs. `GET /api/email-preview` renders every template side by side so a
 * change is visible without sending mail. `?raw=<key>` returns one template's
 * source as text, which is what gets pasted into a render service for the Tier
 * A client grid — no build tooling needed to get the HTML out.
 *
 * Unreachable in production. The templates are harmless, but a public endpoint
 * that renders arbitrary internal fixtures is not something to leave switched
 * on, and an email preview has no business being on a customer deployment.
 */

import { NextResponse } from "next/server";
import { buildEmailPreviews } from "./fixtures";

function isEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.EMAIL_PREVIEW_ENABLED === "1";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: Request) {
  if (!isEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const previews = buildEmailPreviews();

  const raw = url.searchParams.get("raw");
  if (raw) {
    const preview = previews.find((item) => item.key === raw);
    if (!preview) {
      return new NextResponse(`Unknown template: ${raw}`, { status: 404 });
    }

    const wantsText = url.searchParams.get("format") === "text";
    return new NextResponse(wantsText ? preview.email.text : preview.email.html, {
      headers: {
        "cache-control": "no-store",
        // Plain text so the source is copyable rather than rendered.
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const cards = previews
    .map((preview) => {
      const bytes = Buffer.byteLength(preview.email.html, "utf8");
      return `
        <section class="card">
          <header>
            <h2>${escapeHtml(preview.title)}</h2>
            <p class="note">${escapeHtml(preview.note)}</p>
            <p class="meta">
              <code>${escapeHtml(preview.source)}</code>
              &middot; ${(bytes / 1024).toFixed(1)}KB of ${escapeHtml("102KB")} Gmail clip
              &middot; <a href="?raw=${encodeURIComponent(preview.key)}">HTML source</a>
              &middot; <a href="?raw=${encodeURIComponent(preview.key)}&amp;format=text">text part</a>
            </p>
          </header>
          <iframe title="${escapeHtml(preview.title)}" srcdoc="${escapeHtml(preview.email.html)}"></iframe>
        </section>`;
    })
    .join("");

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email preview</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 32px 24px 64px;
    background: #0d1512; color: #eef2ee;
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  h1 { font-size: 28px; letter-spacing: -0.03em; margin: 0 0 6px; }
  .lede { color: #a2b2aa; margin: 0 0 32px; max-width: 70ch; }
  .grid { display: flex; flex-direction: column; gap: 36px; }
  .card { border: 1px solid rgba(238,242,238,0.16); border-radius: 12px; overflow: hidden; }
  header { padding: 14px 16px; border-bottom: 1px solid rgba(238,242,238,0.1); }
  h2 { font-size: 17px; margin: 0 0 4px; letter-spacing: -0.015em; }
  .note { margin: 0 0 6px; color: #a2b2aa; font-size: 13.5px; }
  .meta { margin: 0; color: #6d817a; font-size: 12px; }
  .meta code { font-family: ui-monospace, Menlo, monospace; }
  a { color: #efd49b; }
  iframe { display: block; width: 100%; height: 760px; border: 0; background: #0b2b23; }
</style>
</head>
<body>
  <h1>Email preview</h1>
  <p class="lede">
    Every template the platform sends, built by the real code rather than a copy of it.
    Use the HTML source links to feed a render service for the legacy Outlook grid.
  </p>
  <div class="grid">${cards}</div>
</body>
</html>`;

  return new NextResponse(page, {
    headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
  });
}
