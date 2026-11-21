import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const require = createRequire("/Users/ants/Projects/Kakken/package.json");
const { chromium } = require("playwright");
const D = process.argv[2]; const names = process.argv.slice(3);
const kit = "/Users/ants/Projects/Kakken/docs/design/drawing-kit/build/kit.css";
mkdirSync(`${D}/look`, { recursive: true });
const browser = await chromium.launch();
const out = {};
for (const width of [1440, 1330]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  for (const n of names) {
    const s = readFileSync(`${D}/canvas/project/${n}`, "utf8").replace(/\/_blob\/[0-9a-f]{32}/, `file://${kit}`).replace('<script src="./support.js"></script>', "");
    writeFileSync(`${D}/look/${n}.html`, s);
    await page.goto(`file://${D}/look/${n}.html`);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const main = document.querySelector("main");
      const over = [...document.querySelectorAll("table")].map(t => t.scrollWidth - t.parentElement.clientWidth).filter(x => x > 1);
      const names = [...document.querySelectorAll("td a.truncate")].map(a => a.getBoundingClientRect().width).sort((a, b) => a - b)[0];
      const svgs = [...document.querySelectorAll("svg.recharts-surface[role=application], [data-part=hundred-strips] svg")].map(s => Math.round(s.getBoundingClientRect().width) + "/" + Math.round(s.parentElement.getBoundingClientRect().width));
      return { h: main.scrollHeight, over, narrowestName: Math.round(names || 0), svgs };
    });
    if (width === 1440) { out[n] = m.h + 40; await page.screenshot({ path: `${D}/look/${n}.png`, fullPage: true }); }
    console.log(width, n, JSON.stringify(m));
  }
  await page.close();
}
await browser.close();
writeFileSync(`${D}/heights.json`, JSON.stringify(out, null, 1));
