import { describe, expect, test } from "vitest";
import { board, imageKey } from "./from-app.mjs";

const PICTURE = "data:image/png;base64,iVBORw0KGgo=";

// A page as copied from the running app: next/font's class, a script, framer
// caught mid-entrance, the dev badge, a picture, the person's photo and links.
const copied = `<html><head></head><body class="inter_5b3c1f0a-module__AbC1__variable antialiased"><div class="flex h-screen overflow-hidden bg-background">
<script>self.__next_f.push([1])</script><nextjs-portal><span>N</span></nextjs-portal>
<aside style="opacity: 0; transform: translateX(-12px);"><a href="/app/sites?tab=1">Websites</a><a href="/app/settings">Settings</a></aside>
<img src="${PICTURE}" alt="logo"><img class="w-10 h-10 rounded-full" src="https://lh3.example.com/me.jpg" alt="">
<p>{{not a hole}}</p></div></body></html>`;

describe("from-app: a built screen as a canvas board", () => {
  const html = board(copied, {
    name: "Overview",
    title: "Overview, as built",
    height: 1200,
    kit: "/_blob/kit",
    links: { "/app/sites": "List" },
    images: { [imageKey(PICTURE)]: "/_blob/logo" },
  });

  test("keeps the app's markup on the kit, without the app's machinery", () => {
    expect(html).toContain('<link rel="stylesheet" href="/_blob/kit">');
    expect(html).toContain('<div class="antialiased bg-background text-foreground">');
    expect(html).toContain('class="flex min-h-screen bg-background"');
    expect(html).not.toMatch(/__next_f|nextjs-portal|module__|opacity: 0/);
    expect(html).toContain("{ {not a hole} }");
  });

  test("links between boards where the app links, and nowhere else", () => {
    expect(html).toContain('<a href="List.dc.html">Websites</a>');
    expect(html).toContain('<a href="#">Settings</a>');
  });

  test("pictures become uploads, and the person's photo their initials", () => {
    expect(html).toContain('<img src="/_blob/logo" alt="logo">');
    expect(html).not.toContain("lh3.example.com");
    expect(html).toContain(">AB</div>");
  });

  test("sizes the board for the canvas", () => {
    expect(html).toContain(`data-props='{"$preview":{"width":1440,"height":1200}}'`);
  });
});
