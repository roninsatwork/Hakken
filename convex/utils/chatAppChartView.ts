/**
 * Ask Hakken in ChatGPT and Claude: the chart drawn in the chat
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phase 4;
 * board 6). An MCP Apps view (SEP-1865, 2026-01-26): ChatGPT or Claude loads
 * this page in a frame beside the answer, hands it the tool's result, and the
 * page draws one figure each day against the dates before.
 *
 * - Drawn in real pixels at the width the chat gives it, and redrawn when that
 *   changes: never a stretched picture (AGENTS.md, "A chart never grows with
 *   the screen").
 * - Colours: the chart palette's orange for the dates chosen and its comparison
 *   grey, dashed, for the dates before (`chartPalette.ts`: CHART_SERIES_ORANGE,
 *   CHART_COMPARATOR_GREY), on the chat's own light or dark ground.
 * - It reads nothing itself: no fetch, no outside file. Everything it shows
 *   came in the tool's answer. The tool's words still carry the figures, so an
 *   app that can't draw views still gets an answer.
 */

export const CHART_ORANGE = "#f97316";
export const CHART_GREY = "#8a8a90";

const STYLE = `
:root { color-scheme: light dark; --ink: #1f1f22; --muted: #6b6b70; --rule: #e4e4e7; --card: #ffffff; --down: #b42318; --up: #1f7a3d; }
:root[data-theme="dark"] { --ink: #ededee; --muted: #a1a1a6; --rule: #2f2f33; --card: #1c1c1e; --down: #f97066; --up: #6ce9a6; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.num { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
#view { padding: 16px 16px 12px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); }
.top a { color: var(--muted); text-decoration: none; cursor: pointer; }
.top a:hover { color: var(--ink); }
h1 { margin: 14px 0 0; font-size: 14px; font-weight: 500; }
.figure { display: flex; align-items: baseline; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
.figure .big { font-size: 28px; font-weight: 500; }
.figure .move { font-size: 12px; }
.down { color: var(--down); } .up { color: var(--up); } .same { color: var(--muted); }
.legend { display: flex; gap: 20px; margin-top: 10px; font-size: 12px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 8px; }
#chart { position: relative; margin-top: 10px; }
svg text { fill: var(--muted); font-size: 11px; }
.readout { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--rule); border-radius: 10px; padding: 8px 12px; font-size: 13px; box-shadow: 0 6px 18px rgba(0,0,0,.12); display: none; min-width: 200px; }
.readout .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 3px 0; }
.readout .key { display: inline-flex; align-items: center; gap: 8px; }
.empty { font-size: 13px; color: var(--muted); padding: 24px 0; }
`;

const SCRIPT = `
(function () {
  var ORANGE = "${CHART_ORANGE}", GREY = "${CHART_GREY}";
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var state = { chart: null, link: null, width: 0 };
  var next = 0, waiting = {};

  function send(message) { window.parent.postMessage(message, "*"); }
  function ask(method, params) {
    return new Promise(function (done, fail) {
      var id = ++next; waiting[id] = { done: done, fail: fail };
      send({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function tell(method, params) { send({ jsonrpc: "2.0", method: method, params: params }); }

  function dayOf(text) { var d = new Date(text + "T12:00:00Z"); return d; }
  function monthOf(points) { return points.length ? MONTHS[dayOf(points[0].day).getUTCMonth()] : ""; }
  function longDay(text) { var d = dayOf(text); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function shortDay(text) { var d = dayOf(text); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function n(value) { return Math.round(value).toLocaleString("en-GB"); }
  function sum(points) { return points.reduce(function (t, p) { return t + (p.value || 0); }, 0); }
  function el(tag, attrs, text) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function niceTop(value) {
    if (value <= 0) return 1;
    var step = Math.pow(10, Math.floor(Math.log10(value)));
    var top = Math.ceil(value / step) * step;
    return top / 2 >= value ? top / 2 : top;
  }

  function draw() {
    var chart = state.chart, box = document.getElementById("chart"), view = document.getElementById("view");
    if (!chart) return;
    document.getElementById("title").textContent = chart.title || "";
    document.getElementById("site").textContent = (chart.source ? chart.source + " · " : "") + (chart.website || "");
    var link = document.getElementById("open");
    link.style.display = state.link ? "" : "none";
    var points = chart.points || [], before = chart.before || [];
    var total = typeof chart.total === "number" ? chart.total : sum(points);
    var totalBefore = typeof chart.totalBefore === "number" ? chart.totalBefore : (before.length ? sum(before) : null);
    var nowMonth = monthOf(points), beforeMonth = monthOf(before);
    document.getElementById("big").textContent = n(total);
    var move = document.getElementById("move");
    if (totalBefore === null || !beforeMonth) { move.textContent = ""; }
    else if (Math.round(total) === Math.round(totalBefore)) { move.className = "move num same"; move.textContent = "No change since " + beforeMonth; }
    else if (total < totalBefore) { move.className = "move num down"; move.textContent = "▼ " + n(totalBefore - total) + " fewer than " + beforeMonth; }
    else { move.className = "move num up"; move.textContent = "▲ " + n(total - totalBefore) + " more than " + beforeMonth; }
    document.getElementById("nowName").textContent = nowMonth;
    document.getElementById("beforeName").textContent = beforeMonth;
    document.getElementById("beforeKey").style.display = before.length ? "" : "none";

    while (box.firstChild) box.removeChild(box.firstChild);
    if (!points.length) { var empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Nothing to draw for these dates yet."; box.appendChild(empty); return; }
    var width = Math.max(260, Math.floor(view.clientWidth - 32)), height = 220;
    var left = 48, right = 12, top = 10, bottom = 28, w = width - left - right, h = height - top - bottom;
    var most = 0;
    points.concat(before).forEach(function (p) { if (p.value > most) most = p.value; });
    var topValue = niceTop(most);
    var count = Math.max(points.length, before.length);
    function x(i) { return left + (count <= 1 ? 0 : w * i / (count - 1)); }
    function y(v) { return top + h * (1 - v / topValue); }
    var svg = el("svg", { width: width, height: height, role: "img", "aria-label": (chart.title || "") + ", " + nowMonth + (beforeMonth ? " against " + beforeMonth : "") });
    for (var g = 0; g <= 3; g++) {
      var value = topValue * g / 3, yy = y(value);
      svg.appendChild(el("line", { x1: left, x2: width - right, y1: yy, y2: yy, stroke: "var(--rule)", "stroke-width": 1 }));
      svg.appendChild(el("text", { x: left - 10, y: yy + 4, "text-anchor": "end", "class": "num" }, n(value)));
    }
    var ticks = [0, Math.round((points.length - 1) / 2), points.length - 1];
    ticks.forEach(function (i, k) {
      if (!points[i]) return;
      svg.appendChild(el("text", { x: x(i), y: height - 8, "text-anchor": k === 0 ? "start" : (k === 2 ? "end" : "middle") }, shortDay(points[i].day)));
    });
    function line(list) { return list.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.value).toFixed(1); }).join(" "); }
    if (before.length) svg.appendChild(el("polyline", { points: line(before), fill: "none", stroke: GREY, "stroke-width": 2, "stroke-dasharray": "4 4" }));
    svg.appendChild(el("polyline", { points: line(points), fill: "none", stroke: ORANGE, "stroke-width": 2.5, "stroke-linejoin": "round" }));
    var guide = el("line", { x1: 0, x2: 0, y1: top, y2: top + h, stroke: "var(--muted)", "stroke-width": 1, visibility: "hidden" });
    var dotNow = el("circle", { r: 4, fill: ORANGE, visibility: "hidden" });
    var dotBefore = el("circle", { r: 4, fill: GREY, visibility: "hidden" });
    svg.appendChild(guide); svg.appendChild(dotNow); svg.appendChild(dotBefore);
    box.appendChild(svg);
    var readout = document.createElement("div"); readout.className = "readout"; box.appendChild(readout);

    function show(i) {
      var p = points[i], b = before[i];
      guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.setAttribute("visibility", "visible");
      if (p) { dotNow.setAttribute("cx", x(i)); dotNow.setAttribute("cy", y(p.value)); dotNow.setAttribute("visibility", "visible"); } else dotNow.setAttribute("visibility", "hidden");
      if (b) { dotBefore.setAttribute("cx", x(i)); dotBefore.setAttribute("cy", y(b.value)); dotBefore.setAttribute("visibility", "visible"); } else dotBefore.setAttribute("visibility", "hidden");
      var rows = "";
      if (p) rows += '<div class="row"><span class="key"><svg width="12" height="2"><line x1="0" x2="12" y1="1" y2="1" stroke="' + ORANGE + '" stroke-width="2"/></svg>' + longDay(p.day) + '</span><span class="num">' + n(p.value) + '</span></div>';
      if (b) rows += '<div class="row"><span class="key"><svg width="12" height="2"><line x1="0" x2="12" y1="1" y2="1" stroke="' + GREY + '" stroke-width="2" stroke-dasharray="3 2"/></svg>' + longDay(b.day) + '</span><span class="num">' + n(b.value) + '</span></div>';
      readout.innerHTML = '<div style="color:var(--muted);font-size:13px">' + (chart.title || "") + "</div>" + rows;
      readout.style.display = "block";
      var place = x(i) + 14;
      if (place + readout.offsetWidth > width) place = x(i) - readout.offsetWidth - 14;
      readout.style.left = Math.max(0, place) + "px"; readout.style.top = "8px";
    }
    function hide() { readout.style.display = "none"; guide.setAttribute("visibility", "hidden"); dotNow.setAttribute("visibility", "hidden"); dotBefore.setAttribute("visibility", "hidden"); }
    svg.addEventListener("mousemove", function (event) {
      var rect = svg.getBoundingClientRect(), at = event.clientX - rect.left;
      var i = Math.round((at - left) / (count <= 1 ? 1 : w / (count - 1)));
      show(Math.max(0, Math.min(count - 1, i)));
    });
    svg.addEventListener("mouseleave", hide);
    tell("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
  }

  function theme(context) {
    if (context && context.theme) document.documentElement.setAttribute("data-theme", context.theme === "dark" ? "dark" : "light");
  }
  function result(params) {
    var content = params && params.structuredContent;
    if (!content || !content.chart) return;
    state.chart = content.chart;
    state.link = content.chart.link || null;
    draw();
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id != null && !message.method && waiting[message.id]) {
      var call = waiting[message.id]; delete waiting[message.id];
      if (message.error) call.fail(message.error); else call.done(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result") result(message.params);
    if (message.method === "ui/notifications/host-context-changed") theme(message.params);
    if (message.method === "ui/resource-teardown") send({ jsonrpc: "2.0", id: message.id, result: {} });
  });
  document.getElementById("open").addEventListener("click", function (event) {
    event.preventDefault();
    if (state.link) ask("ui/open-link", { url: state.link }).catch(function () {});
  });
  new ResizeObserver(function () {
    var width = document.getElementById("view").clientWidth;
    if (width !== state.width) { state.width = width; draw(); }
  }).observe(document.getElementById("view"));
  ask("ui/initialize", { appInfo: { name: "days-chart", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" })
    .then(function (answer) { theme(answer && answer.hostContext); tell("ui/notifications/initialized", {}); })
    .catch(function () {});
})();
`;

/** The whole page, as `resources/read` sends it. */
export const CHART_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Days chart</title>
<style>${STYLE}</style>
</head>
<body>
<div id="view">
  <div class="top"><span id="site"></span><a id="open" href="#">Open Visits ↗</a></div>
  <h1 id="title"></h1>
  <div class="figure"><span id="big" class="big num"></span><span id="move" class="move num"></span></div>
  <div class="legend">
    <span><svg width="16" height="2" aria-hidden="true"><line x1="0" x2="16" y1="1" y2="1" stroke="${CHART_ORANGE}" stroke-width="2"/></svg><span id="nowName"></span></span>
    <span id="beforeKey"><svg width="16" height="2" aria-hidden="true"><line x1="0" x2="16" y1="1" y2="1" stroke="${CHART_GREY}" stroke-width="2" stroke-dasharray="4 4"/></svg><span id="beforeName"></span></span>
  </div>
  <div id="chart"></div>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
