import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/Users/ants/Projects/Kakken/package.json");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const L = await import(require.resolve("lucide-react"));
const out = {};
for (const [n, k] of [["globe", "Globe"], ["lightbulb", "Lightbulb"], ["scan-search", "ScanSearch"], ["mouse-pointer-click", "MousePointerClick"], ["chart-column", "ChartColumn"], ["search-check", "SearchCheck"]]) {
  out[n] = renderToStaticMarkup(React.createElement(L[k], { className: "w-[18px] h-[18px] text-secondary group-hover:text-foreground", "aria-hidden": "true" }));
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(Object.keys(out).join(" "), out.globe.slice(0, 160));
