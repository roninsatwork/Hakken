"""The chart dashboards with the app's chart colours and new charts: figures with their month, visits by where they came from,
AI assistants for you and each rival, and you against your rivals over every check. Ronins Agency."""
import datetime as dt, json, os, re
import build as B
import build2 as R2
import build3 as R3
import build4 as R4
from build import e, heading, sees_on_page, page, stack, UP, DOWN, match_el

HERE = B.HERE
OUT = B.OUT
ORANGE, BLUE, VIOLET, TEAL, AMBER, ROSE, EMERALD, SLATE, GREY = "#f97316", "#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b", "#f43f5e", "#10b981", "#94a3b8", "#8a8a90"
MORE = json.load(open(os.path.join(HERE, "ronins", "ga_more.json")))
GAV = R3.GAV
SCD = sorted(json.load(open(os.path.join(HERE, "ronins", "days.json")))["oct"])
OCT_DAYS = [f"2026-10-{d:02d}" for d in range(1, 32)]


# ---------- a figure with its month drawn under it (new shared part: FigureSpark) ----------
def spark_figure(label, value, line, tone, series, colour):
    w, h = 240, 40
    top = max(series) or 1
    pts = [(i * w / (len(series) - 1), h - 3 - (h - 6) * v / top) for i, v in enumerate(series)]
    d = R2.monotone(pts)
    area = d + f"L{w},{h}L0,{h}Z"
    svg = (f'<svg data-part="figure-spark" viewBox="0 0 {w} {h}" preserveAspectRatio="none" class="mt-auto block h-[52px] w-full pt-3" aria-hidden="true">'
           f'<path d="{area}" fill="{colour}" fill-opacity="0.14"></path><path d="{d}" fill="none" stroke="{colour}" stroke-width="1.75" vector-effect="non-scaling-stroke"></path></svg>')
    return ('<a data-part="figure" class="flex flex-col rounded-2xl border px-5 py-4 border-border-dim bg-card/40 transition-colors focus-visible:outline-2 focus-visible:outline-brand hover:border-brand/40" href="#">'
            f'<div data-part-title="true" class="flex items-center gap-2 text-[12px] text-secondary"><span class="inline-block h-2 w-2 rounded-full" style="background-color:{colour}"></span>{e(label)} →</div>'
            f'<div class="mt-1 font-semibold text-foreground text-[24px] tabular-nums">{e(value)}</div>'
            f'<div class="mt-1 text-[12px]"><span class="{tone}">{e(line)}</span></div>{svg}</a>')


form_days = []
for day in OCT_DAYS:
    form_days.append(MORE["daily_events"].get(day, 0) // 2 if False else MORE["daily_events"].get(day, 0))
KPIS = B.figures([
    spark_figure("Visits", "245", "▲ 2% more than September", UP, [GAV[d] for d in OCT_DAYS], ORANGE),
    spark_figure("Events", "5", "2.0 for every 100 visits. It was 0.8 in September.", "text-secondary", form_days, ROSE),
    spark_figure("Clicks", "341", "▼ 12.6% fewer than September", DOWN, [c for _, c, _ in SCD], BLUE),
    spark_figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN, [i for _, _, i in SCD], VIOLET),
])


def legend(items):
    return ('<div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-secondary">' + "".join(
        f'<span class="inline-flex items-center gap-1.5"><span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:{c}"></span>{e(n)}</span>' for n, c in items) + "</div>")


# ---------- visits each day, by where they came from (stacked, the channels' own colours) ----------
CHANNELS = [("Organic Search", "Organic Search", ORANGE), ("Direct", "Direct", TEAL), ("AI Assistant", "AI assistants", ROSE),
            ("Referral", "Referral", BLUE), ("Organic Social", "Organic Social", VIOLET), ("Unassigned", "Unassigned", SLATE)]


def stacked_visits():
    c = R3.VISITS
    i = c.index('role="application"')
    a = c.rindex("<svg", 0, i)
    b = match_el(c, a)
    svg = c[a:b]
    lines = re.findall(r'<line[^>]*\sx1="([\d.]+)"[^>]*\sy1="([\d.]+)"[^>]*\sx2="([\d.]+)"', svg)
    left, top, right = float(lines[0][0]), float(lines[0][1]), float(lines[0][2])
    bottom = float(lines[1][1])
    series = [[MORE["channels"].get(k, {}).get(d, 0) for d in OCT_DAYS] for k, _, _ in CHANNELS]
    totals = [sum(s[j] for s in series) for j in range(31)]
    top_v = R2.nice_max(max(totals))
    x = lambda j: left + (right - left) * j / 30
    y = lambda v: bottom - (bottom - top) * v / top_v
    base = [0] * 31
    paths = []
    for (k, name, colour), s in zip(CHANNELS, series):
        upper = [base[j] + s[j] for j in range(31)]
        up = R2.monotone([(x(j), y(upper[j])) for j in range(31)])
        down = R2.monotone([(x(j), y(base[j])) for j in reversed(range(31))])
        paths.append(f'<path name="{e(name)}" d="{up}L{down[1:]}Z" fill="{colour}" fill-opacity="0.55" stroke="{colour}" stroke-width="1.25"></path>')
        base = upper
    svg = re.sub(r'<g class="recharts-layer recharts-line">.*?</g></g>', "", svg, flags=re.S)
    svg = svg.replace('<g tabindex="-1" class="recharts-zIndex-layer_400">', '<g tabindex="-1" class="recharts-zIndex-layer_400"><g class="recharts-layer recharts-area">' + "".join(paths) + "</g>", 1)
    labels = iter(("%g" % t) for t in (0, top_v / 4, top_v / 2, top_v * 3 / 4, top_v))
    svg = re.sub(r'(<text[^>]*orientation="left"[^>]*><tspan[^>]*>)([^<]*)(</tspan>)', lambda m: m.group(1) + next(labels) + m.group(3), svg)
    c = c[:a] + svg + c[b:]
    c = re.sub(r'<div class="recharts-legend-wrapper".*?</ul></div>', "", c, count=1, flags=re.S)
    c = re.sub(r'<h2 data-part-title="true"([^>]*)>Visits each day</h2>', r'<h2 data-part-title="true"\1>Visits each day, by where they came from</h2>', c)
    c = c.replace("October and September, lined up by date.", "October. The colours stack, so the top edge is all your visits.")
    c = c.replace('<span class="text-secondary">Compare with:</span> September', '<span class="text-secondary">Split by:</span> Where from')
    i = c.rindex("</div></div>")
    return c[:i] + legend([(n, col) for _, n, col in CHANNELS]) + c[i:]


VISITS_BY = stacked_visits()


# ---------- AI assistants: you and each rival, one colour each (new shared part: GroupedBars) ----------
SITES = [("ronins.co.uk", ORANGE), ("pixelfield.co.uk", BLUE), ("chilliapple.co.uk", VIOLET), ("lightflows.co.uk", TEAL), ("plugandplaydesign.co.uk", AMBER)]
NAMED = {  # times named, and answers asked, on 2 November
    "Perplexity": (50, {"ronins.co.uk": 24, "pixelfield.co.uk": 10, "chilliapple.co.uk": 7, "plugandplaydesign.co.uk": 2}),
    "Gemini": (50, {"ronins.co.uk": 13, "lightflows.co.uk": 4, "pixelfield.co.uk": 4, "chilliapple.co.uk": 1, "plugandplaydesign.co.uk": 1}),
    "Claude": (50, {"ronins.co.uk": 9, "pixelfield.co.uk": 4, "chilliapple.co.uk": 2, "plugandplaydesign.co.uk": 1}),
    "ChatGPT": (60, {"pixelfield.co.uk": 3, "plugandplaydesign.co.uk": 3, "ronins.co.uk": 1}),
    "Google AI Mode": (30, {"chilliapple.co.uk": 3, "pixelfield.co.uk": 3}),
}


def grouped_bars():
    rows = []
    best = {"Perplexity": "Your top rival was pixelfield.co.uk, with 10.", "Gemini": "Your top rivals were pixelfield.co.uk and lightflows.co.uk, with 4 each.", "Claude": "Your top rival was pixelfield.co.uk, with 4.", "ChatGPT": "Your top rivals were pixelfield.co.uk and plugandplaydesign.co.uk, with 3 each.", "Google AI Mode": "Your top rivals were pixelfield.co.uk and chilliapple.co.uk, with 3 each."}
    for engine, (asked, named) in NAMED.items():
        bars = "".join(
            f'<span class="flex items-center gap-2"><span class="block h-2 rounded-[2px]" style="width:{max(named.get(s, 0) / asked * 100 * 1.8, 0.8):.2f}%;background-color:{c};opacity:{1 if named.get(s, 0) else 0.35}"></span>'
            f'<span class="font-mono text-[11px] text-secondary">{named.get(s, 0)}</span></span>' for s, c in SITES)
        rows.append('<div class="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_minmax(190px,230px)]">'
                    f'<span class="text-[13px] text-foreground sm:text-right">{e(engine)}</span>'
                    f'<span class="flex flex-col gap-1">{bars}</span>'
                    f'<span class="flex flex-col leading-tight"><span class="text-[13px] text-foreground">You <span class="font-mono">{named.get("ronins.co.uk", 0)}</span> of <span class="font-mono">{asked}</span></span>'
                    f'<span class="text-[12px] text-secondary">{e(best[engine])}</span></span></div>')
    return '<div data-part="grouped-bars" class="relative flex flex-col gap-6">' + "".join(rows) + legend(SITES) + "</div>"


AI = R4.card("How often AI assistants name you and your rivals", "How many times each assistant named each website on 2 November.", grouped_bars())

# ---------- you and your rivals over every check (lines, a colour each) ----------
CHECKS = ["2026-09-26", "2026-09-29", "2026-10-05", "2026-10-12", "2026-11-02"]
TRAFFIC = {"ronins.co.uk": [1937, 1896, 1054, 899, 936], "pixelfield.co.uk": [1145, 987, 956, 1087, 1076], "chilliapple.co.uk": [3044, 2790, 2739, 2637, 2584],
           "lightflows.co.uk": [2158, 1773, 1320, 1254, 1313], "plugandplaydesign.co.uk": [619, 582, 576, 596, 580]}


def rivals_lines():
    c = B.SC_DAYS
    i = c.index('role="application"')
    a = c.rindex("<svg", 0, i)
    b = match_el(c, a)
    svg = c[a:b]
    left, top, right, bottom = 48, 8, 1086, 252
    t0 = dt.date.fromisoformat(CHECKS[0])
    span = (dt.date.fromisoformat(CHECKS[-1]) - t0).days
    x = lambda day: left + (right - left) * (dt.date.fromisoformat(day) - t0).days / span
    top_v = R2.nice_max(max(max(v) for v in TRAFFIC.values()))
    y = lambda v: bottom - (bottom - top) * v / top_v
    tmpl = re.search(r'<path name="October"[^>]*></path>', svg).group(0)
    paths = ""
    for site, colour in SITES:
        d = R2.monotone([(x(day), y(v)) for day, v in zip(CHECKS, TRAFFIC[site])])
        p = re.sub(r'\sd="[^"]*"', f' d="{d}"', tmpl)
        p = p.replace('name="October"', f'name="{site}"').replace('stroke="#f97316"', f'stroke="{colour}"')
        p = p.replace('stroke-width="2.25"', 'stroke-width="2.25"' if site == "ronins.co.uk" else 'stroke-width="1.75"')
        dots = "".join(f'<circle cx="{x(day):.2f}" cy="{y(v):.2f}" r="3" fill="{colour}"></circle>' for day, v in zip(CHECKS, TRAFFIC[site]))
        paths += p + dots
    svg = re.sub(r'<g class="recharts-layer recharts-line">.*?</g></g>', "", svg, flags=re.S)
    svg = svg.replace('<g tabindex="-1" class="recharts-zIndex-layer_400">', '<g tabindex="-1" class="recharts-zIndex-layer_400"><g class="recharts-layer recharts-line">' + paths + "</g>", 1)
    labels = iter(("%g" % t if t < 1000 else f"{t / 1000:g}k") for t in (0, top_v / 4, top_v / 2, top_v * 3 / 4, top_v))
    svg = re.sub(r'(<text[^>]*orientation="left"[^>]*><tspan[^>]*>)([^<]*)(</tspan>)', lambda m: m.group(1) + next(labels) + m.group(3), svg)
    tick = re.search(r'<g class="recharts-layer recharts-cartesian-axis-tick-label"><text[^>]*orientation="bottom".*?</g>', svg, re.S).group(0)
    xs = re.compile(r'<g class="recharts-layer recharts-cartesian-axis-tick-label"><text[^>]*orientation="bottom".*?</g>', re.S)
    first = xs.search(svg).start()
    svg = xs.sub("", svg)
    names = [f"{dt.date.fromisoformat(d).day} {dt.date.fromisoformat(d).strftime('%b')}" for d in CHECKS]
    new = "".join(re.sub(r'(\sx=")[\d.]+(")', lambda mm, X=min(x(d), right - 16): mm.group(1) + f"{X:.2f}" + mm.group(2), re.sub(r">[^<>]*</tspan>", f">{L}</tspan>", tick)) for d, L in zip(CHECKS, names))
    svg = svg[:first] + new + svg[first:]
    c = c[:a] + svg + c[b:]
    c = re.sub(r'<div class="recharts-legend-wrapper".*?</ul></div>', "", c, count=1, flags=re.S)
    c = re.sub(r'<h2 data-part-title="true"([^>]*)>Clicks each day</h2>', r'<h2 data-part-title="true"\1>You and your rivals on Google</h2>', c)
    c = c.replace("October and September, lined up by date.", "Estimated traffic at each check. That's about how many visits Google sends in a month.")
    c = c.replace('<span class="text-secondary">Show:</span> Clicks', '<span class="text-secondary">Show:</span> Estimated traffic')
    c = re.sub(r'<div data-part="filter" data-part-label="Compare with".*?</select></div>', "", c, count=1, flags=re.S)
    i = c.rindex("</div></div>")
    return c[:i] + legend(SITES) + c[i:]


RIVALS = rivals_lines()

# ---------- how far down people scroll, a colour for each device ----------
SCROLL = R4.card("How far down people scroll", "October, on average. The line across the bars is your whole website, 33%.",
                 R4.against([("Computers", 34, 33, "34%", None, "1,056 visits"), ("Tablets", 34, 33, "34%", None, "27 visits"), ("Phones", 21, 33, "21%", None, "57 visits")],
                            "Scrolled, on average", "Your whole website")
                 .replace('background-color:#f97316"></span><span data-mark', 'background-color:#3b82f6"></span><span data-mark', 1)
                 .replace('background-color:#f97316"></span><span data-mark', 'background-color:#8b5cf6"></span><span data-mark', 1)
                 .replace('<span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:#f97316"></span>Scrolled, on average', '<span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:#3b82f6"></span><span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:#8b5cf6"></span><span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:#f97316"></span>Scrolled, on average'))

YEARLY, TOUCH, MOVED, BING, NOTICE, DESC, RIGHT, ICON = R4.YEARLY, R4.TOUCH, R4.MOVED, R4.BING, R4.NOTICE, R4.DESC, R2.RIGHT, R2.icon
MOVED = R4.card("What went up and down since September", "October against September. Keywords and Estimated traffic use the last check in each month, 29 September and 12 October.",
                 R4.change_bars([
                     ("Events", 150, "2", "5"),
                     ("Visits that started on Brand pages", 28, "53", "68"),
                     ("Visits", 2, "240", "245"),
                     ("Impressions", -5, "294,618", "279,239"),
                     ("Keywords", -7, "793", "740"),
                     ("Clicks from Google", -13, "390", "341"),
                     ("Visits that started on Service pages", -22, "92", "72"),
                     ("Estimated traffic", -53, "1,896", "899"),
                 ], "Went down", "Went up"))

# menus that offer only what each chart can show
YEARLY = re.sub(r'<div data-part="filter" data-part-label="Compare with".*?</select></div>', "", YEARLY, count=1, flags=re.S)
RIVALS = re.sub(r'(<select aria-label="Show"[^>]*>).*?(</select>)', r'\1<option value="traffic" selected="selected">Estimated traffic</option><option value="keywords">Keywords</option><option value="top3">In the top 3</option>\2', RIVALS, count=1, flags=re.S)
VISITS_BY = re.sub(r'(<select aria-label="Show"[^>]*>).*?(</select>)', r'\1<option value="visits" selected="selected">Visits</option><option value="views">Page views</option><option value="events">Events</option>\2', VISITS_BY, count=1, flags=re.S)
VISITS_BY = re.sub(r'data-part-label="Compare with"', 'data-part-label="Split by"', VISITS_BY, count=1)
VISITS_BY = re.sub(r'(<select aria-label=")Compare with("[^>]*>).*?(</select>)', r'\1Split by\2<option value="channel" selected="selected">Where from</option><option value="kind">Classification</option><option value="device">Device</option>\3', VISITS_BY, count=1, flags=re.S)


def section(title, mark, *charts):
    return stack(heading(title, None, mark), *charts)


way1 = page(
    B.page_header(DESC, RIGHT), NOTICE, KPIS,
    section("Visibility", ICON("globe"), RIVALS, AI),
    section("Search Console", ICON("search-check"), YEARLY),
    section("Bing Webmaster", ICON("scan-search"), BING),
    section("Google Analytics", ICON("chart-column"), VISITS_BY, TOUCH),
    section("Microsoft Clarity", ICON("mouse-pointer-click"), SCROLL),
)
way2 = page(
    B.page_header(DESC, RIGHT), NOTICE,
    sees_on_page(
        [
            "Estimated traffic from Google fell from {1,937} on 26 September to {936} on 2 November.",
            "People got in touch {5} times in October, up from {2} in September.",
            "On phones, people scrolled only {21%} of the way down each page. On computers it was {34%}.",
        ],
        [("Move the AI Agency page's main point and its enquiry link nearer the top.", "See Pages in Clarity")],
    ),
    KPIS,
    stack(heading("Found", "On Google, on Bing and in AI answers"), YEARLY, RIVALS, AI, BING),
    stack(heading("Visited", "What people did on your website"), VISITS_BY, SCROLL),
    stack(heading("Got in touch", "Each event is someone getting in touch, as Google Analytics counts it."), TOUCH),
)
way3 = page(
    B.page_header(DESC, RIGHT), NOTICE, KPIS, MOVED, RIVALS, VISITS_BY, YEARLY, AI, TOUCH, SCROLL, BING,
)

BOARDS = {
    "Way1.dc.html": ("Way 1, a chart for every source", way1),
    "Way2.dc.html": ("Way 2, found, visited, got in touch", way2),
    "Way3.dc.html": ("Way 3, what moved, then why", way3),
}

if __name__ == "__main__":
    hp = os.path.join(HERE, "heights5.json")
    heights = json.load(open(hp)) if os.path.exists(hp) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 4000)
        s = B.frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
