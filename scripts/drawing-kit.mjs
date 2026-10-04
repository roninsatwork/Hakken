// npm run drawing-kit — builds the drawing kit from the app itself
// (docs/plans/active/design-drift-plan.md, D2; how to use it:
// docs/design/drawing-kit/README.md).
//
//   kit.css     the app's own stylesheet, compiled from src/app/globals.css
//               exactly as the app compiles it, with the dark look from
//               hakken.theme.json on the page root.
//   parts.html  every kit part, rendered from the real components.
//   kit.json    what the kit was built from, so a stale drawing shows.
//
// The output is not committed (it is rebuilt from the code in seconds).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { ROOT, readThemeRecord, themeVariables } from "./theme-record.mjs";

export const KIT_OUT = path.join(ROOT, "docs/design/drawing-kit/build");
const STUBS = path.join(ROOT, "scripts/drawing-kit/stubs");
const STUBBED = {
  "next/link": "next-link.tsx",
  "next/navigation": "next-navigation.tsx",
  "next/image": "next-image.tsx",
  "next-intl": "next-intl.tsx",
  "framer-motion": "framer-motion.tsx",
  "convex/react": "convex-react.tsx",
  "@convex-dev/auth/react": "convex-auth-react.tsx",
  "next-themes": "next-themes.tsx",
  "@/src/context/SystemSettingsContext": "system-settings.tsx",
};

/** The app's two fonts, as a drawing loads them: Inter for words, JetBrains Mono for numbers. */
export const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap";

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function compileCss(theme) {
  const source = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const result = await postcss([tailwindcss({ base: ROOT })]).process(source, { from: path.join(ROOT, "src/app/globals.css") });
  const dark = themeVariables(theme, "dark");
  const root = [
    "color-scheme: dark",
    ...Object.entries(dark).map(([name, value]) => `${name}: ${value}`),
    // The app's words are Inter and its numbers JetBrains Mono (next/font in
    // src/app/layout.tsx); a drawing loads both from Google Fonts.
    `--font-inter: "Inter"`,
    `--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace`,
  ].join("; ");
  const css = result.css.replace(/\/\*# sourceMappingURL=.*?\*\//g, "");
  return `${css}\n\n/* Drawing kit: the dark look on the page root, as the app's <html class="dark"> paints it (hakken.theme.json). */\nhtml:root { ${root}; }\n`;
}

/** framer shows one element per layoutId — the last mounted — so the kit keeps only that one. */
function oneLayoutElement(html) {
  const pattern = /<div([^>]*?) data-kit-layout-id="([^"]+)"([^>]*)><\/div>/g;
  const last = new Map();
  for (const match of html.matchAll(pattern)) last.set(match[2], match.index);
  return html.replace(pattern, (whole, before, id, after, offset) => (last.get(id) === offset ? `<div${before}${after}></div>` : ""));
}

async function renderParts(out) {
  const bundle = path.join(out, ".parts.mjs");
  await build({
    entryPoints: [path.join(ROOT, "scripts/drawing-kit/parts.tsx")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    logLevel: "error",
    tsconfig: path.join(ROOT, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    loader: { ".json": "json" },
    plugins: [{
      name: "drawing-kit-stubs",
      setup(builder) {
        const pattern = new RegExp(`^(${Object.keys(STUBBED).map((name) => name.replace(/[/.@-]/g, (c) => `\\${c}`)).join("|")})$`);
        builder.onResolve({ filter: pattern }, (args) => ({ path: path.join(STUBS, STUBBED[args.path]) }));
      },
    }],
  });
  const { renderParts: render } = await import(`${pathToFileURL(bundle).href}?${Date.now()}`);
  const parts = render().map((part) => ({ ...part, html: oneLayoutElement(part.html) }));
  rmSync(bundle);
  return parts;
}

function partsPage(parts, kit) {
  const sections = parts.map((part) => `<section id="${part.id}" class="kit-part">
<div class="kit-part-head"><h2>${escapeHtml(part.name)}</h2><p>${escapeHtml(part.use)}</p><p class="kit-source">From ${escapeHtml(part.source)}</p></div>
<div class="kit-part-sample">
<!-- part:${part.id} -->
${part.html}
<!-- /part:${part.id} -->
</div>
</section>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Hakken drawing kit — parts</title>
<link rel="stylesheet" href="kit.css">
<link href="${FONTS}" rel="stylesheet">
<style>
body { margin: 0; }
.kit-page { max-width: 1440px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 48px; }
.kit-part { display: flex; flex-direction: column; gap: 16px; }
.kit-part-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
.kit-part-head p { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
.kit-part-head .kit-source { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
</style>
</head>
<body class="dark">
<div class="dark bg-background text-foreground font-sans tracking-tight antialiased min-h-screen">
<div class="kit-page">
<header><h1 style="margin:0;font-size:24px">Hakken drawing kit</h1><p style="margin:6px 0 0;font-size:13px;color:var(--text-secondary)">Every part rendered from the real components. Built ${kit.builtAt} from hakken.theme.json ${kit.theme} and the app's stylesheet ${kit.css}. Copy parts whole; see README.md.</p></header>
${sections}
</div>
</div>
</body>
</html>
`;
}

/** Builds the kit into `out` and says what it built from. */
export async function buildDrawingKit(out = KIT_OUT) {
  mkdirSync(out, { recursive: true });
  const theme = readThemeRecord();
  const css = await compileCss(theme);
  const parts = await renderParts(out);
  const kit = { builtAt: new Date().toISOString(), theme: hash(JSON.stringify(theme)), css: hash(css), parts: parts.map((part) => part.id) };
  writeFileSync(path.join(out, "kit.css"), css);
  writeFileSync(path.join(out, "parts.html"), partsPage(parts, kit));
  writeFileSync(path.join(out, "kit.json"), `${JSON.stringify(kit, null, 2)}\n`);
  return { kit, css, parts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { kit, css, parts } = await buildDrawingKit();
  console.log(`Drawing kit built in ${path.relative(ROOT, KIT_OUT)}: kit.css (${Math.round(css.length / 1024)} KB, ${kit.css}), parts.html (${parts.length} parts), look ${kit.theme}.`);
}
