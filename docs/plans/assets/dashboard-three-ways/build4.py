"""Three chart dashboards, every chart full width, no tables. Ronins Agency, October. Every source and the Reading room."""
import datetime as dt, json, os, re
import build as B
import build2 as R2
import build3 as R3
from build import e, figure, figures, heading, sees_on_page, page, stack, UP, DOWN, match_el

HERE = B.HERE
OUT = B.OUT
RIGHT = R2.RIGHT
ICON = R2.icon

# ---------- the chart card the app wraps every chart in ----------
GA_CARD = B.GA_DAYS
CARD_HEAD_END = GA_CARD.index('<div class="mt-4">')
DOWNLOAD_BTN = re.search(r'<button[^>]*data-part="download"[^>]*>.*?</button>', GA_CARD, re.S)
DOWNLOAD_BTN = DOWNLOAD_BTN.group(0) if DOWNLOAD_BTN else ""
DL_WRAP = ""
m = re.search(r'(<div class="absolute[^"]*"[^>]*>)\s*' + re.escape(DOWNLOAD_BTN), GA_CARD) if DOWNLOAD_BTN else None
if m:
    DL_WRAP = m.group(1) + DOWNLOAD_BTN + "</div>"


def card(title, hint, body, menus=""):
    head = ('<div data-chart-export-root="" class="group relative rounded-2xl border border-border-dim bg-card/40 p-5">'
            f'<div data-part="chart-card" class="flex flex-col gap-3 pr-28"><div><h2 data-part-title="true" class="text-[14px] font-medium text-foreground">{e(title)}</h2>'
            f'<p class="text-[12px] text-secondary">{e(hint)}</p></div></div>{DL_WRAP}')
    menu = f'<div class="flex flex-wrap items-center gap-2">{menus}</div>' if menus else ""
    return head + f'<div class="mt-4"><div class="flex flex-col gap-5">{menu}{body}</div></div></div>'


def show_chip(word, options):
    return (B.chip("Show", options).replace(f'<span aria-hidden="true" class="min-w-0 truncate">{e(options[0])}</span>',
            f'<span aria-hidden="true" class="min-w-0 truncate"><span class="text-secondary">{e(word)}:</span> {e(options[0])}</span>'))


# ---------- a bar for now and a mark (AgainstBars) ----------
def against(rows, bar_key, mark_key):
    out = []
    for label, bar, mark, value, change, sub in rows:
        mk = (f'<span data-mark="" class="absolute block rounded-full text-foreground" style="left:{mark:.2f}%;top:-5px;bottom:-5px;width:3px;background-color:currentColor"></span>' if mark is not None else "")
        ch = f' <span class="whitespace-nowrap font-mono text-[12px] {change[1]}">{e(change[0])}</span>' if change else ""
        out.append('<div class="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_minmax(190px,230px)]">'
                   f'<span class="text-[13px] text-foreground sm:text-right">{e(label)}</span>'
                   f'<span class="relative block h-7 rounded-[3px] bg-foreground/10"><span data-bar="" class="absolute inset-y-0 left-0 block rounded-[3px]" style="width:{bar:.2f}%;background-color:#f97316"></span>{mk}</span>'
                   f'<span class="flex flex-col leading-tight"><span class="text-[13px] text-foreground"><span class="font-mono">{e(value)}</span>{ch}</span>'
                   f'<span class="text-[12px] text-secondary">{e(sub)}</span></span></div>')
    key = (f'<div class="flex items-center justify-center gap-5 text-[12px] text-secondary"><span class="inline-flex items-center gap-1.5"><span class="inline-block h-3 w-3 rounded-[3px]" style="background-color:#f97316"></span>{e(bar_key)}</span>'
           + (f'<span class="inline-flex items-center gap-1.5"><span class="inline-block rounded-full text-foreground" style="width:3px;height:14px;background-color:currentColor"></span>{e(mark_key)}</span>' if mark_key else "") + "</div>")
    return '<div data-part="against-bars" class="relative flex flex-col gap-5">' + "".join(out) + key + "</div>"


# ---------- what gained and what lost (ChangeBars) ----------
def change_bars(rows, lost, gained):
    top = max(abs(r[1]) for r in rows)
    out = [f'<div class="grid grid-cols-2 text-muted"><span class="pr-3 text-right">◀ {e(lost)}</span><span class="border-l border-border-dim pl-3">{e(gained)} ▶</span></div>']
    for name, pct, before, now in rows:
        w = abs(pct) / top * 100
        mv = f'<span class="whitespace-nowrap font-mono text-[12px] {"text-success" if pct > 0 else "text-destructive"}">{"▲" if pct > 0 else "▼"} {abs(pct):g}%</span>'
        words = (f'<span class="inline-flex min-w-0 items-baseline gap-1.5 text-foreground"><a href="#" class="truncate hover:underline">{e(name)}</a>'
                 f'<span class="shrink-0">{mv}</span><span class="shrink-0 font-mono text-[11px] text-secondary">{e(before)} → {e(now)}</span></span>')
        if pct > 0:
            out.append(f'<div class="grid grid-cols-2 items-center"><span class="flex min-w-0 justify-end pr-3">{words}</span>'
                       f'<span class="flex border-l border-border-dim"><span class="block h-6 rounded-[3px]" style="width:{w:.2f}%;background-color:#f97316"></span></span></div>')
        else:
            out.append(f'<div class="grid grid-cols-2 items-center"><span class="flex justify-end border-r border-border-dim"><span class="block h-6 rounded-[3px]" style="width:{w:.2f}%;background-color:#8a8a90"></span></span>'
                       f'<span class="flex min-w-0 pl-3">{words}</span></div>')
    return '<div data-part="change-bars" class="flex flex-col gap-4 text-[11px]">' + "".join(out) + "</div>"


# ---------- who visits, and who gets in touch (HundredStrips) ----------
TEMPLATE_STRIPS = B.GA_STRIPS
COLOURS = dict(re.findall(r'<g data-segment="([^"]+)"[^>]*><polygon[^>]*fill="(#[0-9a-f]{6})"', TEMPLATE_STRIPS))


def strips(rows, top_word, bottom_word, width=B.CHART_W):
    pitch, sq = width / 100, width / 100 - 1.29
    parts = [f'<text x="0" y="12" fill="currentColor" class="text-secondary" style="font-size: 12px;">{e(top_word)}</text>',
             f'<text x="0" y="222" fill="currentColor" class="text-secondary" style="font-size: 12px;">{e(bottom_word)}</text>']
    t0 = b0 = 0
    for name, top, bottom in rows:
        c = COLOURS.get(name, "#8a8a90")
        g = [f'<g data-segment="{e(name)}" class="cursor-pointer" opacity="1">']
        if top or bottom:
            g.append(f'<polygon points="{t0 * pitch:.2f},71 {max(t0 * pitch, (t0 + top) * pitch - 1.34):.2f},71 {max(b0 * pitch, (b0 + bottom) * pitch - 1.34):.2f},153 {b0 * pitch:.2f},153" fill="{c}" fill-opacity="0.24"></polygon>')
        if top:
            g.append(f'<path fill="{c}" d="' + "".join(f"M{(t0 + i) * pitch:.2f},40h{sq:.2f}v30h-{sq:.2f}z" for i in range(top)) + '"></path>')
        if bottom:
            g.append(f'<path fill="{c}" d="' + "".join(f"M{(b0 + i) * pitch:.2f},154h{sq:.2f}v30h-{sq:.2f}z" for i in range(bottom)) + '"></path>')
        for share, start, y in ((top, t0, 33), (bottom, b0, 199)):
            if share:
                words = f"{name} {share}" if share * pitch > len(f"{name} {share}") * 6.6 else f"{share}"
                g.append(f'<text x="{start * pitch:.2f}" y="{y}" fill="currentColor" class="text-foreground" style="font-size: 12px;">{e(words)}</text>')
        g.append("</g>")
        parts.append("".join(g))
        t0 += top
        b0 += bottom
    label = ". ".join([top_word, bottom_word] + [f"{n} {t} and {b}" for n, t, b in rows])
    svg = f'<svg width="{width}" height="224" role="img" aria-label="{e(label)}">' + "".join(parts) + "</svg>"
    legend = "".join(
        f'<div role="button" tabindex="0" aria-pressed="false" data-key="{e(n)}" class="flex cursor-pointer items-center gap-2 text-[13px]"><span class="block h-3 w-3 shrink-0 rounded-[3px]" style="background-color: {COLOURS.get(n, "#8a8a90")};"></span>'
        f'<span class="min-w-0 flex-1 truncate text-foreground">{e(n)}</span><span class="whitespace-nowrap font-mono text-[12px] text-secondary">{t} → {b}</span></div>' for n, t, b in rows)
    return f'<div class="flex flex-col gap-3"><div data-part="hundred-strips" class="relative flex flex-col gap-3">{svg}</div><div class="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{legend}</div></div>'


# ---------- clicks each week for a year, with Google's updates marked ----------
YEAR = json.load(open(os.path.join(HERE, "ronins", "year.json")))
WEEKS = []
for i in range(0, 364, 7):
    chunk = YEAR[i:i + 7]
    WEEKS.append((chunk[0][0], sum(c for _, c in chunk)))
UPDATES = [("December 2025 core update", "2025-12-11"), ("February 2026 Discover update", "2026-02-05"), ("March 2026 spam update", "2026-03-24"),
           ("March 2026 core update", "2026-03-27"), ("May 2026 core update", "2026-05-21"), ("November 2026 core update", "2026-11-10")]
GOOGLE_MARK = ('<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path>'
               '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path>'
               '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"></path>'
               '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path>')


def year_chart():
    c = B.SC_DAYS
    i = c.index('role="application"')
    a = c.rindex("<svg", 0, i)
    b = match_el(c, a)
    svg = c[a:b]
    left, top, right, bottom = 48, 8, 1086, 252
    n = len(WEEKS)
    top_v = R2.nice_max(max(v for _, v in WEEKS))
    x = lambda k: left + (right - left) * k / (n - 1)
    y = lambda v: bottom - (bottom - top) * v / top_v
    d = R2.monotone([(x(k), y(v)) for k, (_, v) in enumerate(WEEKS)])
    svg = re.sub(r'(<path name="October"[^>]*\sd=")[^"]*(")', lambda m: m.group(1) + d + m.group(2), svg, count=1)
    svg = re.sub(r'<g class="recharts-layer recharts-line">(?:(?!<g class="recharts-layer recharts-line">).)*?name="September".*?</g></g>', "", svg, count=1, flags=re.S)
    labels = iter(("%g" % t) for t in (0, top_v / 4, top_v / 2, top_v * 3 / 4, top_v))
    svg = re.sub(r'(<text[^>]*orientation="left"[^>]*><tspan[^>]*>)([^<]*)(</tspan>)', lambda m: m.group(1) + next(labels) + m.group(3), svg)
    # month labels along the bottom, pushed down to make room for the marks, as the app does
    tmpl = re.search(r'<g class="recharts-layer recharts-cartesian-axis-tick-label"><text[^>]*orientation="bottom".*?</g>', svg, re.S).group(0)
    xs = re.compile(r'<g class="recharts-layer recharts-cartesian-axis-tick-label"><text[^>]*orientation="bottom".*?</g>', re.S)
    months = []
    for k, (day, _) in enumerate(WEEKS):
        dd = dt.date.fromisoformat(day)
        if k == 0 or dd.day <= 7:
            label = dd.strftime("%b") + (f" {dd.year}" if dd.month == 1 or k == 0 else "")
            if months and x(k) - months[-1][0] < 60:
                continue
            months.append((x(k), label))
    new_ticks = "".join(re.sub(r'(\sy=")[\d.]+(")', r'\g<1>274\2', re.sub(r'(\sx=")[\d.]+(")', lambda mm, X=X: mm.group(1) + f"{X:.2f}" + mm.group(2), re.sub(r">[^<>]*</tspan>", f">{e(L)}</tspan>", tmpl))) for X, L in months)
    first = xs.search(svg)
    svg = xs.sub("", svg)
    pos = first.start()
    svg = svg[:pos] + new_ticks + svg[pos:]
    # Google's updates: a dashed line, and the G in a circle on the axis (GoogleUpdateMarks)
    marks, last = [], -999
    start, end = dt.date.fromisoformat(WEEKS[0][0]), dt.date.fromisoformat(WEEKS[-1][0]) + dt.timedelta(days=6)
    for title, day in UPDATES:
        dd = dt.date.fromisoformat(day)
        if not (start <= dd <= end):
            continue
        lx = left + (right - left) * (dd - start).days / ((end - start).days)
        logo = max(lx, last + 24)
        last = logo
        marks.append((title, day, lx, logo))
    lines = "".join(f'<line data-google-update-line="" x1="{lx:.2f}" x2="{lx:.2f}" y1="{top}" y2="{bottom}" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.55"></line>' for _, _, lx, _ in marks)
    logos = "".join(
        f'<g role="button" tabindex="0" aria-label="{e(t)}" class="cursor-pointer outline-none"><title>{e(t)}, from {dt.date.fromisoformat(d_).day} {dt.date.fromisoformat(d_).strftime("%B")}</title>'
        f'<circle data-google-update-logo="" cx="{lg:.2f}" cy="{bottom}" r="11" fill="var(--color-card)" stroke="currentColor" stroke-width="1" stroke-opacity="0.2" class="text-foreground"></circle>'
        f'<svg width="14" height="14" x="{lg - 7:.2f}" y="{bottom - 7}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="shrink-0">{GOOGLE_MARK}</svg></g>' for t, d_, _, lg in marks)
    svg = svg.replace("</svg>", f'<g class="google-update-markers"><g class="text-foreground" pointer-events="none">{lines}</g>{logos}</g></svg>')
    svg = svg.replace('height="300" viewBox="0 0 1094 300"', 'height="314" viewBox="0 0 1094 314"', 1)
    c = c[:a] + svg + c[b:]
    c = c.replace("width: 1094px; height: 300px;", "width: 1094px; height: 314px;").replace('height: 300px; min-width', 'height: 314px; min-width')
    c = re.sub(r'<li[^>]*>(?:(?!</li>).)*September(?:(?!</li>).)*</li>', "", c, flags=re.S)
    c = c.replace(">October</span>", ">Clicks</span>")
    c = c.replace('<span class="text-secondary">Compare with:</span> September', '<span class="text-secondary">Compare with:</span> No comparison')
    c = re.sub(r'<h2 data-part-title="true"([^>]*)>Clicks each day</h2>', r'<h2 data-part-title="true"\1>Clicks from Google each week</h2>', c)
    c = c.replace("October and September, lined up by date.", "The last 12 months. Each G is one of Google's updates, from the Reading room.")
    return c


YEARLY = year_chart()

# ---------- the charts, with Ronins' October figures ----------
AI = card("How often AI assistants name you", "Out of every 100 answers on 2 November. The mark is Pixelfield, the rival named most.",
          against([
              ("Perplexity", 48, 20, "24 of 50", None, "Pixelfield 10"),
              ("Gemini", 26, 8, "13 of 50", None, "Pixelfield 4"),
              ("Claude", 18, 8, "9 of 50", None, "Pixelfield 4"),
              ("ChatGPT", 2, 5, "1 of 60", None, "Pixelfield 3"),
              ("AI Mode", 0, 10, "0 of 30", None, "Pixelfield 3"),
          ], "You", "Pixelfield"))
RIVALS = card("You and your rivals on Google", "About how many visits Google sends each website in a month, worked out on 2 November. The mark is 12 October.",
              against([
                  ("chilliapple.co.uk", 2584 / 2637 * 100, 2637 / 2637 * 100, "2,584", ("▼ 2%", "text-destructive"), "1,434 keywords"),
                  ("lightflows.co.uk", 1313 / 2637 * 100, 1254 / 2637 * 100, "1,313", ("▲ 5%", "text-success"), "583 keywords"),
                  ("pixelfield.co.uk", 1076 / 2637 * 100, 1087 / 2637 * 100, "1,076", ("▼ 1%", "text-destructive"), "1,183 keywords"),
                  ("ronins.co.uk", 936 / 2637 * 100, 899 / 2637 * 100, "936", ("▲ 4%", "text-success"), "694 keywords. That's you."),
                  ("plugandplaydesign.co.uk", 580 / 2637 * 100, 596 / 2637 * 100, "580", ("▼ 3%", "text-destructive"), "892 keywords"),
              ], "2 November", "12 October"))
SCROLL = card("How far down people scroll", "Scrolled, on average, in October. The mark is your whole website, 33%.",
              against([
                  ("Computers", 34, 33, "34%", None, "1,056 visits"),
                  ("Tablets", 34, 33, "34%", None, "27 visits"),
                  ("Phones", 21, 33, "21%", None, "57 visits"),
              ], "Scrolled, on average", "Your whole website"))
TOUCH = card("Who visits, and who gets in touch", "The top row is where 100 visits came from. The bottom row is the same for 100 events. Press one to keep it lit.",
             strips([("Organic Search", 77, 20), ("Direct", 19, 60), ("AI assistants", 2, 0), ("Referral", 1, 20), ("Organic Social", 1, 0)],
                    "Out of every 100 visits", "Out of every 100 events"))
MOVED = card("What went up and down since September", "Each figure in October against September. Keywords and Estimated traffic compare 2 November with 12 October.",
             change_bars([
                 ("Events", 150, "2", "5"),
                 ("Visits that started on Brand pages", 28, "53", "68"),
                 ("Estimated traffic", 4, "899", "936"),
                 ("Visits", 2, "240", "245"),
                 ("Impressions", -5, "294,618", "279,239"),
                 ("Keywords", -6, "740", "694"),
                 ("Clicks from Google", -13, "390", "341"),
                 ("Visits that started on Service pages", -22, "92", "72"),
             ], "Went down", "Went up"))
BING = card("Clicks from Bing", "Bing's clicks and impressions each week.",
            R2.notice("Bing Webmaster isn't connected yet. Once it is, this chart fills in.", "Go to Connection"))
VISITS = R3.VISITS
NOTICE = R3.NOTICE
KPIS = figures([
    figure("Visits", "245", "▲ 2% more than September", UP),
    figure("Events", "5", "2.0 for every 100 visits. It was 0.8 in September, with 3 more events."),
    figure("Clicks", "341", "▼ 12.6% fewer than September", DOWN),
    figure("AI answers", "47 of 240", "Perplexity named you most, in 24 of its 50 answers."),
])
DESC = R3.DESC


def section(title, mark, *charts):
    return stack(heading(title, None, mark), *charts)


# ================= Way 1 · A chart for every source =================
way1 = page(
    B.page_header(DESC, RIGHT),
    NOTICE,
    KPIS,
    section("Visibility", ICON("globe"), AI, RIVALS),
    section("Search Console", ICON("search-check"), YEARLY),
    section("Bing Webmaster", ICON("scan-search"), BING),
    section("Google Analytics", ICON("chart-column"), VISITS, TOUCH),
    section("Microsoft Clarity", ICON("mouse-pointer-click"), SCROLL),
)

# ================= Way 2 · Found, visited, got in touch =================
way2 = page(
    B.page_header(DESC, RIGHT),
    NOTICE,
    sees_on_page(
        [
            "People got in touch {5} times in October, up from {2} in September.",
            "Fewer people found you on Google. Clicks fell to {341}, from {390} in September.",
            "On phones, people scrolled only {21%} of the way down each page. On computers it was {34%}.",
        ],
        [("Move the AI Agency page's main point and its enquiry link nearer the top.", "See Pages in Clarity")],
    ),
    stack(heading("Found", "On Google, on Bing and in AI answers"), YEARLY, AI, RIVALS, BING),
    stack(heading("Visited", "What people did on your website"), VISITS, SCROLL),
    stack(heading("Got in touch", "Each event is someone getting in touch, as Google Analytics counts it."), TOUCH),
)

# ================= Way 3 · What moved, then why =================
way3 = page(
    B.page_header(DESC, RIGHT),
    NOTICE,
    KPIS,
    MOVED,
    YEARLY,
    VISITS,
    TOUCH,
    AI,
    SCROLL,
    BING,
)

BOARDS = {
    "Way1.dc.html": ("Way 1, a chart for every source", way1),
    "Way2.dc.html": ("Way 2, found, visited, got in touch", way2),
    "Way3.dc.html": ("Way 3, what moved, then why", way3),
}

if __name__ == "__main__":
    hp = os.path.join(HERE, "heights4.json")
    heights = json.load(open(hp)) if os.path.exists(hp) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 4000)
        s = B.frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
