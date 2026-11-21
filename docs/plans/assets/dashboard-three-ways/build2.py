"""The three Dashboard ways again, with every source, for Ronins Agency (ronins.co.uk): real saved figures for October."""
import json, os, re
import build as B
from build import (e, swap, figure, figures, heading, link, table, th, name_cell, num_cell, word_cell, move_cell,
                   chip, sees_on_page, page, stack, DATES, UP, DOWN, match_el)

HERE = B.HERE
OUT = B.OUT
ICONS = json.load(open(os.path.join(HERE, "icons.json")))
R = os.path.join(HERE, "ronins")

# ---------- the menu: every section Ronins Agency has ----------
TODAY = B.TODAY
aside_a = TODAY.index("<aside")
aside_b = match_el(TODAY, aside_a)
ASIDE = TODAY[aside_a:aside_b]


def item_wrapper(label):
    k = ASIDE.index(f"<span>{label}</span>")
    a = ASIDE.rindex("<a ", 0, k)
    w = ASIDE.rindex("<div", 0, a)
    return ASIDE[w:match_el(ASIDE, w)]


ASK = item_wrapper("Ask Hakken")


def new_item(label, icon):
    s = re.sub(r"<svg[^>]*lucide-bot.*?</svg>", lambda m: ICONS[icon], ASK, count=1, flags=re.S)
    return swap(s, "<span>Ask Hakken</span>", f"<span>{e(label)}</span>")


aside = ASIDE
aside = swap(aside, ASK, ASK + new_item("Insights", "lightbulb") + new_item("Visibility", "globe"))
sc = item_wrapper("Search Console")
aside = swap(aside, sc, sc + new_item("Bing Webmaster", "scan-search"))
ga = item_wrapper("Google Analytics")
aside = swap(aside, ga, ga + new_item("Microsoft Clarity", "mouse-pointer-click"))
aside = swap(aside, ">Period House Group</span>", ">Ronins Agency</span>")
B.TODAY = TODAY[:aside_a] + aside + TODAY[aside_b:]


def icon(name):
    return ICONS[name].replace("w-[18px] h-[18px] text-secondary group-hover:text-foreground", "h-4 w-4 text-brand")


# ---------- Ronins' own clicks each day, drawn the way the chart draws them ----------
DAYS = json.load(open(os.path.join(R, "days.json")))
OCT = [d[1] for d in sorted(DAYS["oct"])]
SEP = [d[1] for d in sorted(DAYS["sep"])]


def monotone(pts):
    """d3's curveMonotoneX, as recharts' type="monotone" draws a line."""
    def sign(v):
        return -1 if v < 0 else 1

    def slope3(x0, y0, x1, y1, x2, y2):
        h0, h1 = x1 - x0, x2 - x1
        s0 = (y1 - y0) / h0 if h0 else 0
        s1 = (y2 - y1) / h1 if h1 else 0
        p = (s0 * h1 + s1 * h0) / (h0 + h1)
        return (sign(s0) + sign(s1)) * min(abs(s0), abs(s1), 0.5 * abs(p)) or 0

    def slope2(x0, y0, x1, y1, t):
        h = x1 - x0
        return (3 * (y1 - y0) / h - t) / 2 if h else t

    def seg(x0, y0, x1, y1, t0, t1):
        dx = (x1 - x0) / 3
        return f"C{x0 + dx:.3f},{y0 + dx * t0:.3f},{x1 - dx:.3f},{y1 - dx * t1:.3f},{x1:.3f},{y1:.3f}"

    d = f"M{pts[0][0]:.3f},{pts[0][1]:.3f}"
    t = [0.0] * len(pts)
    for i in range(1, len(pts) - 1):
        t[i] = slope3(*pts[i - 1], *pts[i], *pts[i + 1])
    t[0] = slope2(*pts[0], *pts[1], t[1])
    t[-1] = slope2(*pts[-2], *pts[-1], t[-2])
    for i in range(len(pts) - 1):
        d += seg(*pts[i], *pts[i + 1], t[i], t[i + 1])
    return d


def nice_max(v):
    for base in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8):
        pass
    for k in range(0, 6):
        for base in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8):
            step = base * 10 ** k
            if step * 4 >= v:
                return step * 4
    return v


def clicks_chart():
    card = B.SC_DAYS
    top, bottom, left, right = 8, 252, 48, 1086
    top_v = nice_max(max(OCT + SEP))
    y = lambda v: bottom - (bottom - top) * v / top_v
    x = lambda i: left + (right - left) * i / 30
    for name, series in (("October", OCT), ("September", SEP)):
        d = monotone([(x(i), y(v)) for i, v in enumerate(series)])
        card = re.sub(r'(<path name="%s"[^>]*\sd=")[^"]*(")' % name, lambda m: m.group(1) + d + m.group(2), card, count=1)
    ticks = [0, top_v / 4, top_v / 2, top_v * 3 / 4, top_v]
    labels = iter(("%g" % t) for t in ticks)
    card = re.sub(r'(<text[^>]*orientation="left"[^>]*><tspan[^>]*>)([^<]*)(</tspan>)', lambda m: m.group(1) + next(labels) + m.group(3), card)
    return card


CLICKS = clicks_chart()
CLICKS_W1 = CLICKS  # one chart on each board, so its hint is said once


def notice(words, button):
    return ('<div data-part="notice" data-part-variant="info" role="status" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border p-4 text-secondary border-border-dim/50 bg-foreground/[0.015]">'
            '<span class="flex min-w-0 items-start gap-3"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info mt-0.5 h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
            f'<span class="text-[12.5px] leading-relaxed">{e(words)}</span></span>'
            f'<button type="button" class="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{e(button)}</button></div>')


NOT_CONNECTED = ('<span data-tone="neutral" class="inline-flex w-fit font-normal text-foreground/85 items-center whitespace-nowrap gap-1.5 text-[12px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus shrink-0 h-3.5 w-3.5 text-secondary" aria-hidden="true"><path d="M5 12h14"></path></svg>Not connected</span>')


def status_cell():
    return f'<td class="px-4 py-3 text-right whitespace-nowrap">{NOT_CONNECTED}</td>'


RIGHT = chip("Website", ["All your websites", "ronins.co.uk"]) + DATES

READING = ('<section class="flex flex-col gap-2">' + heading("Reading room", None, icon_reading := re.sub(r'class="[^"]*"', 'class="lucide h-4 w-4 text-brand"', re.search(r'<svg[^>]*lucide-graduation-cap.*?</svg>', TODAY, re.S).group(0), count=1)) +
           '<div class="flex flex-col gap-1 pt-1"><a href="#" class="text-[13px] font-medium text-foreground hover:underline">November 2026 core update</a>'
           '<p class="text-[13px] text-secondary">Google started it on 10 November. It can take up to 2 weeks to finish.</p></div>'
           + link("Read it in the Reading room") + "</section>")

# ================= Way 1 · Every source at a glance =================
way1 = page(
    B.page_header("How Google, Bing and AI assistants show you, and what people do on your websites.", RIGHT),
    stack(
        heading("Visibility", "Checked on 2 November", icon("globe")),
        figures([
            figure("AI answers", "47 of 240", "Perplexity named you most, in 24 of its 50 answers."),
            figure("Keywords", "694", "▼ 46 fewer than on 12 October", DOWN),
            figure("In the top 3", "55", "▼ 2 fewer than on 12 October", DOWN),
            figure("Estimated traffic", "936", "▲ 37 more than on 12 October. Your 4 rivals average 1,388."),
        ]),
        link("See everything on Websites"),
    ),
    stack(
        heading("Search Console", "Updated today at 04:00", icon("search-check")),
        figures([
            figure("Clicks", "341", "▼ 12.6% fewer than September", DOWN),
            figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN),
            figure("Click-through rate", "0.12%", "It was 0.13% in September"),
            figure("Average position", "20.7", "▼ 2.5 places worse than September", DOWN),
        ]),
        CLICKS_W1,
        link("See everything on Performance"),
    ),
    stack(
        heading("Bing Webmaster", None, icon("scan-search")),
        notice("Bing Webmaster isn't connected yet. Once it is, Bing's clicks and impressions show here.", "Go to Connection"),
    ),
    stack(
        heading("Google Analytics", "Updated today at 03:21", icon("chart-column")),
        figures([
            figure("Visits", "245", "▲ 2% more than September", UP),
            figure("Events", "5", "2.0 for every 100 visits. It was 0.8 in September, with 3 more events."),
            figure("Biggest change", "Organic Search", "8 more visits than September.", big=False),
            figure("Best for events", "Direct", "6.5 events for every 100 visits. Your website gets 2.0.", big=False),
        ]),
        link("See everything on Overview"),
    ),
    stack(
        heading("Microsoft Clarity", "Updated today at 05:50", icon("mouse-pointer-click")),
        figures([
            figure("Visits", "1,140", "145 bot visits left out"),
            figure("Scrolled, on average", "33%", "of the way down each page"),
            figure("Went straight back", "15", "visits left a page within seconds"),
            figure("Dead clicks", "5", "No rage clicks"),
        ]),
        link("See everything on Clarity"),
    ),
    READING,
)

# ================= Way 2 · What changed, and when figures came in =================
changes = [
    [name_cell("Clicks from Google"), word_cell("Search Console"), num_cell("341", True), num_cell("390"), move_cell("▼ 49", DOWN)],
    [name_cell("Impressions"), word_cell("Search Console"), num_cell("279,239", True), num_cell("294,618"), move_cell("▼ 15,379", DOWN)],
    [name_cell("Visits that started on Service pages"), word_cell("Google Analytics"), num_cell("72", True), num_cell("92"), move_cell("▼ 20", DOWN)],
    [name_cell("Visits that started on Brand pages"), word_cell("Google Analytics"), num_cell("68", True), num_cell("53"), move_cell("▲ 15", UP)],
    [name_cell("Events"), word_cell("Google Analytics"), num_cell("5", True), num_cell("2"), move_cell("▲ 3", UP)],
    [name_cell("Keywords on Google"), word_cell("Visibility"), num_cell("694", True), num_cell("740"), move_cell("▼ 46", DOWN)],
    [name_cell("Estimated traffic"), word_cell("Visibility"), num_cell("936", True), num_cell("899"), move_cell("▲ 37", UP)],
]
came_in = [
    [name_cell("Google Analytics figures"), word_cell("ronins.co.uk"), word_cell("Today at 03:21")],
    [name_cell("Search Console figures"), word_cell("ronins.co.uk"), word_cell("Today at 04:00")],
    [name_cell("Clarity figures"), word_cell("ronins.co.uk"), word_cell("Today at 05:50")],
    [name_cell("Positions on Google"), word_cell("Yours and 4 rivals"), word_cell("2 November")],
    [name_cell("AI answers"), word_cell("Yours and 4 rivals"), word_cell("2 November")],
    [name_cell("Bing Webmaster figures"), word_cell("ronins.co.uk"), status_cell()],
]
SECTIONS = ["Every section", "Visibility", "Search Console", "Bing Webmaster", "Google Analytics", "Microsoft Clarity"]
way2 = page(
    B.page_header("What changed on your websites, and when your figures last came in.", RIGHT),
    sees_on_page(
        [
            "Clicks from Google fell to {341} in October, from {390} in September.",
            "Visits held steady at {245}, but {39%} of people left straight away. In September it was {18%}.",
            "Perplexity named you in {24} of its {50} answers. ChatGPT named you once in {60}.",
            "On phones, people scrolled only {21%} of the way down each page. On computers it was {34%}.",
        ],
        [
            ("See which pages people leave straight away.", "See Overview in Google Analytics"),
            ("Move the AI Agency page's main point and its enquiry link nearer the top.", "See Pages in Clarity"),
        ],
    ),
    CLICKS,
    table("What changed since September", "7 changes", "Visibility's rows show its last two checks. That's 2 November against 12 October.",
          [th("Change", first=True), th("Section"), th("Now", "October, or 2 November for Visibility"), th("Before", "September, or 12 October for Visibility"), th("Up or down")],
          changes, "Search changes…", [chip("Section", SECTIONS)], "Showing 1-7 of 7"),
    table("When your figures last came in", "6 kinds", "They come in by themselves. Only Bing Webmaster needs you, to connect it.",
          [th("What", first=True), th("Websites"), th("Came in", sorted_=True)],
          came_in, "Search figures…", [chip("Section", SECTIONS)], "Showing 1-6 of 6"),
    READING,
)

# ================= Way 3 · From being found to getting in touch =================
classes = [
    [name_cell("Service"), num_cell("72", True), num_cell("1", True), move_cell("▼ 20", DOWN)],
    [name_cell("Brand"), num_cell("68", True), num_cell("4", True), move_cell("▲ 15", UP)],
    [name_cell("Content hub"), num_cell("53", True), num_cell("0", True), move_cell("▼ 1", DOWN)],
    [name_cell("Not sorted yet"), num_cell("40", True), num_cell("0", True), move_cell("▲ 10", UP)],
    [name_cell("Case studies"), num_cell("7", True), num_cell("0", True), move_cell("▲ 5", UP)],
    [name_cell("Journal"), num_cell("3", True), num_cell("0", True), move_cell("▲ 1", UP)],
    [name_cell("Authors"), num_cell("2", True), num_cell("0", True), move_cell("▼ 4", DOWN)],
]
busiest = [
    [name_cell("/hub/kapferer-brand-identity-prism/", address=True), num_cell("320", True), num_cell("35%"), num_cell("0")],
    [name_cell("/", address=True), num_cell("139", True), num_cell("39%"), num_cell("6")],
    [name_cell("/ai-agency/", address=True), num_cell("135", True), num_cell("32%"), num_cell("1")],
    [name_cell("/about-us/", address=True), num_cell("36", True), num_cell("69%"), num_cell("1")],
    [name_cell("/hub/accessible-design-for-neurodiversity/", address=True), num_cell("30", True), num_cell("29%"), num_cell("0")],
    [name_cell("/hub/psychology-of-website-navigation/", address=True), num_cell("19", True), num_cell("17%"), num_cell("0")],
    [name_cell("/digital-marketing-agency/", address=True), num_cell("18", True), num_cell("23%"), num_cell("1")],
    [name_cell("/ai-consultancy/", address=True), num_cell("16", True), num_cell("33%"), num_cell("0")],
]
rivals = [
    [name_cell("chilliapple.co.uk", address=True), num_cell("2,584", True), move_cell("▼ 53", DOWN), num_cell("1,434"), num_cell("13")],
    [name_cell("lightflows.co.uk", address=True), num_cell("1,313", True), move_cell("▲ 59", UP), num_cell("583"), num_cell("4")],
    [name_cell("pixelfield.co.uk", address=True), num_cell("1,076", True), move_cell("▼ 11", DOWN), num_cell("1,183"), num_cell("24")],
    [name_cell("ronins.co.uk", tag="Yours", address=True), num_cell("936", True), move_cell("▲ 37", UP), num_cell("694"), num_cell("47")],
    [name_cell("plugandplaydesign.co.uk", address=True), num_cell("580", True), move_cell("▼ 16", DOWN), num_cell("892"), num_cell("7")],
]
way3 = page(
    B.page_header("How people find you, what they do on your website and how many get in touch.", RIGHT),
    stack(
        heading("Found", "On Google, on Bing and in AI answers"),
        figures([
            figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN),
            figure("Clicks", "341", "0.12 for every 100 impressions."),
            figure("AI answers", "47 of 240", "Perplexity named you most, in 24 of its 50 answers."),
            figure("Bing", "Not connected", "Connect it to see Bing's clicks.", big=False),
        ]),
        CLICKS,
        table("You and your rivals", "5 websites", "These come from Visibility's check on 2 November.",
              [th("Website", first=True), th("Traffic", "Estimated traffic, the visits Google sends in a month", sorted_=True), th("Up or down", "2 November against 12 October"), th("Keywords", "Keywords Google shows the website for"), th("AI answers", "Times AI assistants named the website, out of 240 answers")],
              rivals, "Search websites…", [chip("Whose", ["Yours and your rivals", "Yours", "Your rivals"])], "Showing 1-5 of 5"),
    ),
    stack(
        heading("Visited", "What people did on your website"),
        figures([
            figure("Visits", "245", "▲ 2% more than September", UP),
            figure("Left straight away", "39%", "It was 18% in September"),
            figure("Scrolled, on average", "33%", "of the way down each page"),
            figure("Went straight back", "15", "visits left a page within seconds"),
        ]),
        table("Busiest pages in Clarity", "Top 8", "How far people scroll on each page, and how many go straight back.",
              [th("Page", first=True), th("Visits", sorted_=True), th("Scrolled", "Scrolled, on average"), th("Went back", "Went straight back")],
              busiest, "Search pages…", [chip("Device", ["Every device", "Computers", "Phones", "Tablets"])], "Showing 1-8 of 8"),
    ),
    stack(
        heading("Got in touch", "Each event is someone getting in touch, as Google Analytics counts it."),
        table("Where people start, and who gets in touch", "7 Classifications", "How many visits started on each of your Classifications, and the events they led to.",
              [th("Started on", "The Classification of the page people started on", first=True), th("Visits", sorted_=True), th("Events"), th("Up or down", "Visits in October against September")],
              classes, "Search Classifications…", [chip("Device", ["Every device", "Desktop", "Mobile", "Tablet"])], "Showing 1-7 of 7"),
    ),
    READING,
)

BOARDS = {
    "Way1.dc.html": ("Way 1, every source at a glance", way1),
    "Way2.dc.html": ("Way 2, what changed and when figures came in", way2),
    "Way3.dc.html": ("Way 3, from being found to getting in touch", way3),
}

if __name__ == "__main__":
    hp = os.path.join(HERE, "heights2.json")
    heights = json.load(open(hp)) if os.path.exists(hp) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 3000)
        s = B.frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
