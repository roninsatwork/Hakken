#!/usr/bin/env node
/**
 * Turn a page copied from the running app into a canvas board on the drawing
 * kit (docs/plans/active/design-drift-plan.md, D3). A built screen is drawn as
 * it now is: the board is the app's own markup — its classes, icons and
 * charts' SVG — with the scripts taken out, laid out at full height, and links
 * between boards where the app links. How to copy a page: the drawing guide,
 * "Redrawing a built screen".
 *
 *   node scripts/drawing-kit/from-app.mjs images <copy.html>...
 *     writes each picture the copies carry to <dir of the first>/img/ and
 *     prints {key: file}; upload them to the canvas and map key -> its url.
 *
 *   node scripts/drawing-kit/from-app.mjs board <copy.html> --name Main
 *     --title "…" --height 1200 --kit /_blob/<id> --out Main.dc.html
 *     [--links links.json] [--images images.json] [--width 1440]
 *
 * links.json maps an app path to a board name; images.json maps a picture's
 * key to its uploaded url. A picture without one is left out; the signed-in
 * person's photo becomes initials.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONTS } from "../drawing-kit.mjs";

const NEXT_FONT_CLASS = /\s?[a-z_]+_[0-9a-f]{8}-module__[A-Za-z0-9]+__variable/g;

function unescapeHtml(text) {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function bodyOf(page) {
  const start = page.indexOf("<body");
  const openEnd = page.indexOf(">", start) + 1;
  const end = page.lastIndexOf("</body>");
  const tag = page.slice(start, openEnd);
  return { bodyClass: /class="([^"]*)"/.exec(tag)?.[1] ?? "", content: page.slice(openEnd, end) };
}

export function clean(content) {
  return content
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/g, "")
    .replace(/<div hidden="">[\s\S]*?<\/div>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<template[\s\S]*?<\/template>/g, "")
    // next/font's hashed variable classes are not in the stylesheet; the kit sets the fonts.
    .replace(NEXT_FONT_CLASS, "")
    // Full height for the canvas: the app's frame scrolls inside the window.
    .replaceAll("flex h-screen overflow-hidden bg-background", "flex min-h-screen bg-background")
    .replaceAll("h-screen overflow-y-auto flex flex-col w-full", "flex flex-col w-full")
    .replace(/\s(srcset|sizes|loading|decoding|fetchpriority|data-nimg)="[^"]*"/g, "")
    // A canvas reads {{…}} as a hole.
    .replaceAll("{{", "{ {")
    .replaceAll("}}", "} }")
    // framer's entrance, caught before it ran (a background frame does not animate): the resting state.
    .replace(/\sstyle="opacity: 0; transform: translate[XY]?\([^)]*\);?"/g, "")
    .replace(/\sstyle="opacity: 0;?"/g, "")
    // Next.js's own developer badge.
    .replace(/<nextjs-portal[\s\S]*?<\/nextjs-portal>/g, "");
}

const dataImages = (content) => [...content.matchAll(/src="(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)"/g)].map((m) => m[1]);
export const imageKey = (uri) => createHash("sha1").update(uri).digest("hex").slice(0, 16);

function images(paths) {
  const dir = path.join(path.dirname(paths[0]), "img");
  mkdirSync(dir, { recursive: true });
  const found = {};
  for (const file of paths) {
    for (const uri of dataImages(readFileSync(file, "utf8"))) {
      const key = imageKey(uri);
      if (found[key]) continue;
      const kind = uri.split(";")[0].split("/")[1];
      const out = path.join(dir, `${key}.${{ "svg+xml": "svg", jpeg: "jpg" }[kind] ?? kind}`);
      writeFileSync(out, Buffer.from(uri.split(",", 2)[1], "base64"));
      found[key] = out;
    }
  }
  return found;
}

export function board(page, { name, title, height, width = 1440, kit, links = {}, images: uploaded = {} }) {
  const { bodyClass, content: raw } = bodyOf(page);
  let content = clean(raw);
  content = content.replace(/<img\b[^>]*>/g, (tag) => {
    const src = /src="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (src.startsWith("data:")) {
      const url = uploaded[imageKey(src)];
      return url ? tag.replace(/src="[^"]*"/, `src="${url}"`) : "";
    }
    if ((/class="([^"]*)"/.exec(tag)?.[1] ?? "").includes("rounded-full")) {
      // The signed-in person's photo is not drawn; initials stand in.
      return '<div class="w-10 h-10 rounded-full bg-sidebar border border-border-dim flex items-center justify-center text-[13px] font-medium text-secondary">AB</div>';
    }
    return "";
  });
  content = content.replace(/href="([^"]*)"/g, (_, href) => {
    const target = links[unescapeHtml(href).split("?")[0].split("#")[0]];
    return target && target !== name ? `href="${target}.dc.html"` : 'href="#"';
  });
  const cls = bodyClass.replace(NEXT_FONT_CLASS, "").trim();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="${kit}">
</head>
<body>
<x-dc>
<helmet>
<link href="${FONTS}" rel="stylesheet">
<style>
body{margin:0;background:#222224}
</style>
</helmet>
<div class="dark">
<div class="${cls} bg-background text-foreground">
${content}
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${width},"height":${height}}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}

function options(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

function main([command, ...args]) {
  if (command === "images") {
    console.log(JSON.stringify(images(args), null, 2));
    return;
  }
  if (command !== "board" || !args[0]) {
    console.error("usage: from-app.mjs images <copy.html>... | board <copy.html> --name --title --height --kit --out [--links] [--images] [--width]");
    process.exit(1);
  }
  const opts = options(args.slice(1));
  const json = (file) => (file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  const html = board(readFileSync(args[0], "utf8"), {
    name: opts.name,
    title: opts.title,
    height: Number(opts.height),
    width: Number(opts.width ?? 1440),
    kit: opts.kit,
    links: json(opts.links),
    images: json(opts.images),
  });
  writeFileSync(opts.out, html);
  console.log(`${opts.name}: ${Math.round(html.length / 1024)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
