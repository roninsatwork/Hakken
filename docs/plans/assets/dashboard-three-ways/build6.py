"""The chart dashboards with the Reading room as it's meant to be: its own front page, the newest articles, every Google update."""
import json, os, re
import build as B
import build2 as R2
import build4 as R4
import build5 as R5
from build import e, heading, sees_on_page, page, stack, link

HERE = B.HERE
OUT = B.OUT
RAW = os.path.join(HERE, "raw")

# every Google update in the last year, as the Reading room lists them
R4.UPDATES = [("December 2025 core update", "2025-12-11"), ("February 2026 Discover update", "2026-02-05"), ("March 2026 spam update", "2026-03-24"),
              ("March 2026 core update", "2026-03-27"), ("May 2026 core update", "2026-05-21"), ("June 2026 spam update", "2026-06-24"),
              ("August 2026 spam update", "2026-08-18"), ("September 2026 spam update", "2026-09-24"), ("November 2026 core update", "2026-11-10")]
YEARLY = re.sub(r'<div data-part="filter" data-part-label="Compare with".*?</select></div>', "", R4.year_chart(), count=1, flags=re.S)
YEARLY = YEARLY.replace("The last 12 months. Each G is one of Google's updates, from the Reading room.", "The last 12 months. Each G is one of Google's 9 updates, from the Reading room.")

# ---------- the Reading room's front page, on the Dashboard ----------
DATELINE = open(os.path.join(RAW, "rr_dateline.html")).read()
DATELINE = re.sub(r"<span>No stories in the last 7 days</span>", "", DATELINE)
LEAD = open(os.path.join(RAW, "rr_leadsec.html")).read()
COLS = open(os.path.join(RAW, "rr_section.html")).read()
art0 = COLS[COLS.index("<article"):]
ART = art0[:B.match_el(art0, 0)]
KIND_ICON = re.search(r"<svg.*?</svg>", ART, re.S).group(0)
BOOK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>'


def story(kind, source, when, iso, title, teaser):
    t = f'<span aria-hidden="true" class="text-muted">·</span><time datetime="{iso}T00:00:00.000Z">{e(when)}</time>' if when else ""
    return ('<article class="relative transition-colors hover:bg-hover flex min-w-0 flex-col gap-3 px-5 py-5 md:border-l md:border-border-dim md:first:border-l-0">'
            f'<p class="flex min-w-0 items-center gap-2 whitespace-nowrap text-[12px] text-secondary">{BOOK}<span class="text-[10.5px] font-medium uppercase tracking-[0.12em] text-foreground/85">{e(kind)}</span>'
            f'<span aria-hidden="true" class="text-muted">·</span><span class="truncate">{e(source)}</span>{t}</p>'
            f'<h3 class="text-[18px] font-bold leading-snug tracking-[-0.02em] text-foreground"><a class="transition-colors hover:text-foreground/80" href="#"><span aria-hidden="true" class="absolute inset-0"></span>{e(title)}</a></h3>'
            f'<p class="line-clamp-5 text-[13.5px] leading-relaxed text-secondary">{e(teaser)}</p></article>')


STORIES = ('<section data-part="story-columns" aria-label="More stories" class="border-b border-border-dim py-2"><div class="-mx-5 grid grid-cols-1 md:grid-cols-3">'
           + story("Helpful content", "Search Engine Roundtable", "8 Oct", "2026-10-08", "Is Google Issuing More Google Search Manual Action Penalties?",
                   "People are seeing more penalties handed out by Google's own reviewers.")
           + story("Helpful content", "Google for Developers", "21 Sept", "2026-09-21", "Google Search's Guidance on Generative AI Content on Your Website",
                   "Google warns that pages made in bulk with AI, with nothing new in them, break its rules.")
           + story("Knowledge", "Traffic", "1 Oct", "2026-10-01", "How is traffic worked out?",
                   "Where the traffic figures in Visibility come from, and why they're a guess.")
           + "</div></section>")
MORE = ('<div class="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4">'
        + link("Who to follow · Lily Ray, Barry Schwartz and 4 more") + link("Everything in the Reading room") + "</div>")
READING_ROOM = stack(heading("Reading room", "What has changed in search and AI, and what's new to read.", R2.icon("lightbulb").replace("lightbulb", "lightbulb") if False else re.sub(r'class="[^"]*"', 'class="lucide h-4 w-4 text-brand"', re.search(r'<svg[^>]*lucide-graduation-cap.*?</svg>', B.TODAY, re.S).group(0), count=1)),
                     '<div class="flex flex-col">' + LEAD + STORIES + "</div>", MORE)

DESC = "Saturday 21 November. Your daily figures came in this morning."
RIGHT = R2.RIGHT
ICON = R2.icon
KPIS, RIVALS, AI, VISITS_BY, TOUCH, SCROLL, BING, MOVED = R5.KPIS, R5.RIVALS, R5.AI, R5.VISITS_BY, R5.TOUCH, R5.SCROLL, R5.BING, R5.MOVED


def visits_columns():
    c = R5.VISITS_BY
    i = c.index('role="application"')
    a = c.rindex("<svg", 0, i)
    b = B.match_el(c, a)
    svg = c[a:b]
    lines = re.findall(r'<line[^>]*\sx1="([\d.]+)"[^>]*\sy1="([\d.]+)"[^>]*\sx2="([\d.]+)"', svg)
    left, top, right = float(lines[0][0]), float(lines[0][1]), float(lines[0][2])
    bottom = float(lines[1][1])
    series = [[R5.MORE["channels"].get(k, {}).get(d, 0) for d in R5.OCT_DAYS] for k, _, _ in R5.CHANNELS]
    totals = [sum(col[j] for col in series) for j in range(31)]
    top_v = R2.nice_max(max(totals))
    step = (right - left) / 31
    bw = step * 0.62
    rects = []
    for j in range(31):
        x = left + step * j + (step - bw) / 2
        base = 0
        for (k, name, colour), col in zip(R5.CHANNELS, series):
            v = col[j]
            if not v:
                continue
            y1 = bottom - (bottom - top) * (base + v) / top_v
            y0 = bottom - (bottom - top) * base / top_v
            rects.append(f'<rect x="{x:.2f}" y="{y1:.2f}" width="{bw:.2f}" height="{max(y0 - y1 - 1, 0.5):.2f}" rx="1.5" fill="{colour}"><title>{e(name)} {v}</title></rect>')
            base += v
    svg = re.sub(r'<g class="recharts-layer recharts-area">.*?</g>', '<g class="recharts-layer recharts-bar">' + "".join(rects) + "</g>", svg, count=1, flags=re.S)
    # day labels centred under their columns
    def move(m):
        x = float(m.group(2))
        day = round((x - left) / ((right - left) / 30))
        return m.group(1) + f"{left + step * day + step / 2:.2f}" + m.group(3)
    svg = re.sub(r'(<text[^>]*orientation="bottom"[^>]*\sx=")([\d.]+)(")', move, svg)
    svg = re.sub(r'(<tspan\sx=")([\d.]+)(" dy="0.71em">)', move, svg)
    c = c[:a] + svg + c[b:]
    return c.replace("October. The colours stack, so the top edge is all your visits.", "October. Each column is a day, and its colours add up to all its visits.")


VISITS_BY = visits_columns()

# ---------- AI assistants as the app's ChannelMap: websites down the side, assistants along the top ----------
ENGINES = [("ChatGPT", 60), ("Perplexity", 50), ("Gemini", 50), ("Claude", 50), ("Google AI Mode", 30)]
TIMES = {"ronins.co.uk": [1, 24, 13, 9, 0], "pixelfield.co.uk": [3, 10, 4, 4, 3], "chilliapple.co.uk": [0, 7, 1, 2, 3],
         "plugandplaydesign.co.uk": [3, 2, 1, 1, 0], "lightflows.co.uk": [0, 0, 4, 0, 0]}
RAMP = [(36, "#cde2fb", "#111111"), (21, "#9ec5f4", "#111111"), (11, "#6da7ec", "#f5f5f5"), (6, "#3987e5", "#f5f5f5"), (1, "#256abf", "#f5f5f5")]


def ai_map():
    cols = "minmax(96px, 170px) repeat(5, minmax(0, 1fr))"
    head = (f'<div class="grid gap-1 text-[11px] text-muted" style="grid-template-columns:{cols}"><span></span>'
            + "".join(f'<span class="truncate px-1 text-center" title="{e(n)}, {a} answers">{e(n)}</span>' for n, a in ENGINES) + "</div>")
    rows = []
    for site, times in TIMES.items():
        cells = []
        for (n, asked), t in zip(ENGINES, times):
            per = t / asked * 100
            if t == 0:
                cells.append(f'<span class="flex min-w-0"><span title="Not named by {e(n)}" aria-label="Not named by {e(n)}" class="flex h-11 w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-md leading-tight" style="background-color:#4d4d52;opacity:0.35;color:#f5f5f5"></span></span>')
                continue
            bg, ink = next((b, i) for floor, b, i in RAMP if per >= floor)
            cells.append(f'<span class="flex min-w-0"><span title="{t} of {asked} answers" aria-label="{t} of {asked} answers" class="flex h-11 w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-md leading-tight" style="background-color:{bg};opacity:1;color:{ink}">'
                         f'<span class="max-w-full truncate px-0.5 font-mono text-[12px] font-semibold tabular-nums lg:text-[13px]">{t}</span></span></span>')
        you = " That's you." if site == "ronins.co.uk" else ""
        rows.append(f'<div class="grid items-stretch gap-1" style="grid-template-columns:{cols}"><span class="flex min-w-0 flex-col items-end justify-center pr-3 text-right leading-tight">'
                    f'<a href="#" class="text-[12px] text-foreground hover:underline">{e(site)}</a><span class="text-[11px] text-muted">{sum(times)} times in all.{you}</span></span>' + "".join(cells) + "</div>")
    key = ('<div class="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-secondary"><span>Each square shows the times that assistant named that website.</span>'
           + "".join(f'<span aria-hidden="true" class="inline-block h-3 w-3 rounded-[3px]" style="background-color:{b}"></span>' for _, b, _ in reversed(RAMP))
           + '<span>Brighter means named in more of its answers</span></div>')
    return '<div data-part="channel-map" class="flex flex-col gap-1">' + head + "".join(rows) + key + "</div>"


AI = R4.card("How often AI assistants name you and your rivals",
             "On 2 November. ChatGPT gave 60 answers, Google AI Mode 30 and the others 50 each.", ai_map())

# ---------- how far down people read the busiest pages (new shared part: ScrollPages) ----------
PAGES = [("/hub/kapferer-brand-identity-prism/", 320, 35, 0, "Content hub"), ("/", 139, 39, 6, "Brand"), ("/ai-agency/", 135, 32, 1, "Service"),
         ("/about-us/", 36, 69, 1, "Brand"), ("/hub/accessible-design-for-neurodiversity/", 30, 29, 0, "Content hub"),
         ("/hub/psychology-of-website-navigation/", 19, 17, 0, "Content hub"), ("/digital-marketing-agency/", 18, 23, 1, "Service"), ("/ai-consultancy/", 16, 33, 0, "Service")]
KIND_COLOUR = {"Service": R5.ORANGE, "Content hub": R5.VIOLET, "Brand": R5.TEAL}


def scroll_pages():
    cols = []
    for path, visits, scroll, back, kind in PAGES:
        c = KIND_COLOUR[kind]
        cols.append('<div class="flex min-w-0 flex-col items-center gap-2">'
                    '<div class="relative w-full overflow-hidden rounded-[10px] border border-border-dim bg-foreground/5" style="height:200px;max-width:96px">'
                    f'<div class="absolute inset-x-0 top-0" style="height:{scroll}%;background-color:{c};opacity:0.85"></div>'
                    '<div class="absolute inset-x-0 border-t border-dashed border-foreground/45" style="top:33%"></div>'
                    f'<span class="absolute inset-x-0 text-center font-mono text-[12px] text-foreground" style="top:calc({scroll}% + 4px)">{scroll}%</span></div>'
                    f'<a href="#" title="{e(path)}" class="block w-full truncate text-center text-[12px] text-info hover:underline">{e(path)}</a>'
                    f'<span class="text-center text-[12px] text-secondary"><span class="font-mono">{visits:,}</span> visits</span></div>')
    grid = '<div data-part="scroll-pages" class="grid gap-4" style="grid-template-columns:repeat(8, minmax(0, 1fr))">' + "".join(cols) + "</div>"
    return grid + R5.legend([("Service", R5.ORANGE), ("Content hub", R5.VIOLET), ("Brand", R5.TEAL)])


SCROLL = R4.card("How far people scroll down your busiest pages",
                 "October. Each shape is a page, filled as far down as people scrolled. The dashed line is your whole website, 33%.",
                 scroll_pages(), R4.show_chip("Show", ["Every device", "Computers", "Phones", "Tablets"]))


def section(title, mark, *charts):
    return stack(heading(title, None, mark), *charts)


way1 = page(
    B.page_header(DESC, RIGHT), KPIS,
    READING_ROOM,
    section("Search Console", ICON("search-check"), YEARLY),
    section("Google Analytics", ICON("chart-column"), VISITS_BY, TOUCH),
    section("Visibility", ICON("globe"), RIVALS, AI),
    section("Microsoft Clarity", ICON("mouse-pointer-click"), SCROLL),
    section("Bing Webmaster", ICON("scan-search"), BING),
)
way2 = page(
    B.page_header(DESC, RIGHT),
    sees_on_page(
        [
            "Estimated traffic from Google fell from {1,937} on 26 September to {936} on 2 November.",
            "People got in touch {5} times in October, up from {2} in September.",
            "On phones, people scrolled only {21%} of the way down each page. On computers it was {34%}.",
        ],
        [("Move the AI Agency page's main point and its enquiry link nearer the top.", "See Pages in Clarity")],
    ),
    KPIS, READING_ROOM,
    stack(heading("Found", "On Google, on Bing and in AI answers"), YEARLY, RIVALS, AI, BING),
    stack(heading("Visited", "What people did on your website"), VISITS_BY, SCROLL),
    stack(heading("Got in touch", "Each event is someone getting in touch, as Google Analytics counts it."), TOUCH),
)
way3 = page(B.page_header(DESC, RIGHT), KPIS, MOVED, READING_ROOM, RIVALS, VISITS_BY, YEARLY, AI, TOUCH, SCROLL, BING)

BOARDS = {
    "Way1.dc.html": ("Way 1, a chart for every source", way1),
    "Way2.dc.html": ("Way 2, found, visited, got in touch", way2),
    "Way3.dc.html": ("Way 3, what moved, then why", way3),
}

if __name__ == "__main__":
    hp = os.path.join(HERE, "heights6.json")
    heights = json.load(open(hp)) if os.path.exists(hp) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 5000)
        s = B.frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
