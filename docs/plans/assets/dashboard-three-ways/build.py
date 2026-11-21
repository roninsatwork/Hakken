"""Make the three Dashboard ways from the app's own parts (copied pages + the drawing kit)."""
import re, os, json, html as H
from parts import match_el, part, roots

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "canvas", "project")
KIT = "/Users/ants/Projects/Kakken/docs/design/drawing-kit/build/parts.html"
KITCSS = "/_blob/5506ede5f6788b1d2db71bda8a89fa26"
CHART_W = 1094  # chart width inside a full-width card on a 1440 board with the menu


def read(p):
    return open(os.path.join(HERE, p)).read()


TODAY = read("Today.keep.html")
GA = read("raw/GAOverview.dc.html")
SC = read("raw/SCPerformance.dc.html")
KITS = open(KIT).read()


def kp(name):
    a = KITS.index("<!-- part:%s -->" % name) + len("<!-- part:%s -->" % name)
    b = KITS.index("<!-- /part:%s -->" % name)
    return KITS[a:b].replace('<div role="alert" aria-live="assertive" class="pointer-events-none fixed bottom-6 right-6 z-[999999] flex flex-col gap-2"></div>', "")


def swap(s, old, new, count=1):
    assert s.count(old) >= count, f"not found: {old[:90]}"
    return s.replace(old, new, count)


def e(t):
    return H.escape(t, quote=True)


# ---------- the frame: today's board, its page area emptied ----------
EYE = part(GA, "sees-eye")


def frame(title, content, height):
    s = TODAY
    s = re.sub(r"<title>.*?</title>", f"<title>{e(title)}</title>", s, count=1)
    s = s.replace("<!-- copied-from-app: today's words, so check:drawing doesn't judge their reading age -->\n", "")
    s = s.replace("<!-- copied-from-app -->\n", "")
    i = s.index('<div class="flex flex-col pb-16">')
    end = match_el(s, i)
    hdr_end = s.index("</header>", i) + len("</header>")
    header = s[i + len('<div class="flex flex-col pb-16">'):hdr_end]
    header = swap(header, '<div class="flex items-center gap-3"><div class="relative"><button type="button" class="rounded-full', '<div class="flex items-center gap-3">' + EYE + '<div class="relative"><button type="button" class="rounded-full')
    body = '<div class="flex flex-col pb-16">' + header + content + "</div>"
    s = s[:i] + body + s[end:]
    s = re.sub(r"data-props='[^']*'", "data-props='{\"$preview\":{\"width\":1440,\"height\":%d}}'" % height, s, count=1)
    return s


# ---------- parts ----------
DASH_ICON = re.search(r'<svg[^>]*lucide-layout-dashboard[^>]*>.*?</svg>', TODAY).group(0).replace("w-[18px] h-[18px] opacity-80", "h-5 w-5 text-brand")
DATES = part(GA, "dates-menu")
CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down pointer-events-none h-4 w-4 text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>'
ARROW_OUT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-right h-3.5 w-3.5" aria-hidden="true"><path d="M7 7h10v10"></path><path d="M7 17 17 7"></path></svg>'
SEARCH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search w-4 h-4 text-muted" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>'
SORT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down h-3 w-3 shrink-0 opacity-40" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg>'
SORT_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down h-3 w-3 shrink-0" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>'
DOWNLOAD = '<button type="button" class="rounded-[8px] border border-border-dim bg-white/[0.03] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12px]" data-part="download" data-part-label="Download CSV" aria-live="polite"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download h-3.5 w-3.5" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>Download CSV</button>'


def chip(label, options):
    opts = "".join(f'<option value="{i}"{" selected=\"selected\"" if i == 0 else ""}>{e(o)}</option>' for i, o in enumerate(options))
    return (f'<div data-part="filter" data-part-label="{e(label)}" class="relative inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] transition-colors focus-within:border-brand/50 border-border-dim bg-background text-foreground hover:bg-hover/40">'
            f'<span aria-hidden="true" class="min-w-0 truncate">{e(options[0])}</span>{CHEVRON}'
            f'<select aria-label="{e(label)}" class="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-background text-[13px] text-foreground opacity-0 disabled:cursor-default">{opts}</select></div>')


def page_header(description, right):
    return ('<div data-part="page-header" class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-dim pb-6"><div><div class="flex items-center gap-3">'
            f'<h1 data-part-title="true" class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">{DASH_ICON}Dashboard</h1></div>'
            f'<p class="text-[13px] text-secondary mt-1 tracking-wide">{e(description)}</p></div>'
            f'<div class="flex flex-wrap items-center gap-3">{right}</div></div>')


def icon(name):
    m = re.search(r'<svg[^>]*lucide-%s[^>]*>.*?</svg>' % name, TODAY).group(0)
    return re.sub(r'class="([^"]*?)w-\[18px\] h-\[18px\][^"]*"', r'class="\1h-4 w-4 text-brand"', m)


def heading(title, line=None, mark=""):
    sub = f'<p class="text-[12px] text-secondary">{e(line)}</p>' if line else ""
    return f'<div><h2 data-part-title="true" class="text-[14px] font-medium text-foreground flex items-center gap-2">{mark}{e(title)}</h2>{sub}</div>'


def link(words):
    return f'<a href="#" class="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">{e(words)}{ARROW_OUT}</a>'


def figure(label, value, line, tone="text-secondary", big=True):
    size = "text-[24px] tabular-nums" if big else "text-[16px]"
    return ('<a data-part="figure" class="rounded-2xl border px-5 py-4 border-border-dim bg-card/40 transition-colors focus-visible:outline-2 focus-visible:outline-brand hover:border-brand/40" href="#">'
            f'<div data-part-title="true" class="text-[12px] text-secondary">{e(label)} →</div>'
            f'<div class="mt-1 font-semibold text-foreground {size}">{e(value)}</div>'
            f'<div class="mt-1 text-[12px]"><span class="{tone}">{e(line)}</span></div></a>')


def figures(boxes):
    return '<div data-part="figures" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">' + "".join(boxes) + "</div>"


UP, DOWN = "text-success", "text-destructive"


# ---------- charts, widened as the app would draw them at this width ----------
def widen_x(svg_html, k, origin, min_x):
    def fx(v):
        v = float(v)
        return v if v < min_x else origin + (v - origin) * k

    def num(v):
        return ("%.2f" % v).rstrip("0").rstrip(".")

    def path_d(m):
        out = []
        for cmd, args in re.findall(r"([A-Za-z])([^A-Za-z]*)", m.group(1)):
            nums = re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", args)
            res = []
            for idx, t in enumerate(nums):
                if cmd == "H":
                    res.append(num(fx(t)))
                elif cmd == "h":
                    res.append(num(float(t) * k))
                elif cmd in "Vv":
                    res.append(t)
                elif cmd in "MLCQST":
                    res.append(num(fx(t)) if idx % 2 == 0 else t)
                elif cmd in "mlcqst":
                    res.append(num(float(t) * k) if idx % 2 == 0 else t)
                else:
                    res.append(t)
            out.append(cmd + ",".join(res))
        return 'd="' + "".join(out) + '"'

    s = re.sub(r'\sd="([^"]+)"', lambda m: " " + path_d(m), svg_html)
    for attr in ("x", "x1", "x2", "cx"):
        s = re.sub(r'(\s%s=")(-?[\d.]+)(")' % attr, lambda m: m.group(1) + num(fx(m.group(2))) + m.group(3), s)
    s = re.sub(r'(<(?:rect|line)[^>]*?\swidth=")([\d.]+)(")', lambda m: m.group(1) + num(float(m.group(2)) * k) + m.group(3), s)
    s = re.sub(r'(\spoints=")([^"]+)(")', lambda m: m.group(1) + " ".join(num(fx(p.split(",")[0])) + "," + p.split(",")[1] for p in m.group(2).split()) + m.group(3), s)
    return s


def widen_line_chart(card, old_w, new_w):
    i = card.index('role="application"')
    a = card.rindex("<svg", 0, i)
    b = match_el(card, a)
    svg = card[a:b]
    h = re.search(r'height="(\d+)" viewBox', svg).group(1)
    left = float(re.search(r'<line[^>]*\sx1="([\d.]+)"', svg).group(1))
    right = float(re.search(r'<line[^>]*\sx2="([\d.]+)"', svg).group(1))
    k = (right - left + (new_w - old_w)) / (right - left)
    svg = svg.replace(f'width="{old_w}" height="{h}" viewBox="0 0 {old_w} {h}"', f'width="{new_w}" height="{h}" viewBox="0 0 {new_w} {h}"', 1)
    inner_a = svg.index(">") + 1
    svg = svg[:inner_a] + widen_x(svg[inner_a:-6], k, left, left - 0.5) + "</svg>"
    card = card[:a] + svg + card[b:]
    card = swap(card, f"width: {old_w}px; height: {h}px;", f"width: {new_w}px; height: {h}px;")
    card = card.replace(f'width="{old_w}" height="{h}" class="recharts-wrapper"', f'width="{new_w}" height="{h}" class="recharts-wrapper"')
    card = card.replace(f"width: {old_w - 8}px; height: auto;", f"width: {new_w - 8}px; height: auto;")
    return card


def widen_strips(card, old_w, new_w):
    k = new_w / old_w
    i = card.index('data-part="hundred-strips"')
    a = card.index("<svg", i)
    b = match_el(card, a)
    svg = card[a:b]
    head_end = svg.index(">") + 1
    head = svg[:head_end].replace(f'width="{old_w}"', f'width="{new_w}"', 1)
    svg = head + widen_x(svg[head_end:-6], k, 0, -1) + "</svg>"
    return card[:a] + svg + card[b:]


GA_DAYS = widen_line_chart(roots(GA)[0], 816, CHART_W)
GA_STRIPS = widen_strips(roots(GA)[2], 816, CHART_W)
GA_STRIPS = swap(GA_STRIPS, 'data-part-label="Compare with"', 'data-part-label="Show"')
GA_STRIPS = swap(GA_STRIPS, '<span class="text-secondary">Compare with:</span> Bought', '<span class="text-secondary">Show:</span> Bought')
GA_STRIPS = swap(GA_STRIPS, '<select aria-label="Compare with"', '<select aria-label="Show"')
SC_DAYS = widen_line_chart(roots(SC)[0], 816, CHART_W)
_i = SC_DAYS.index('data-part="compact-list"'); _a = SC_DAYS.rindex("<div", 0, _i)
SC_DAYS = SC_DAYS[:_a] + SC_DAYS[match_el(SC_DAYS, _a):]
SC_DAYS_W1 = swap(SC_DAYS, '<p class="text-[12px] text-secondary">October and September, lined up by date.</p>', '<p class="text-[12px] text-secondary">The dashed line is September, lined up by date.</p>')


# ---------- the lean table ----------
def th(label, hover=None, first=False, sorted_=False):
    words = f'<span title="{e(hover)}">{e(label)}</span>' if hover else e(label)
    if first:
        return ('<th aria-sort="none" class="px-4 py-3 font-medium  w-[36%] max-w-0 min-w-[160px]"><button type="button" class="font-medium hover:text-foreground transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand inline-flex items-center gap-1 rounded-sm p-0 text-[length:inherit] [text-transform:inherit] hover:bg-transparent text-inherit">'
                f'{words}{SORT}</button></th>')
    cls = "text-foreground" if sorted_ else "text-inherit"
    return (f'<th aria-sort="{"descending" if sorted_ else "none"}" class="px-4 py-3 font-medium text-right whitespace-nowrap"><button type="button" class="font-medium hover:text-foreground transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand inline-flex items-center gap-1 rounded-sm p-0 text-[length:inherit] [text-transform:inherit] hover:bg-transparent {cls}">'
            f'{words}{SORT_DOWN if sorted_ else SORT}</button></th>')


def name_cell(words, tag=None, address=False):
    cls = "text-info" if address else "text-foreground"
    extra = f' <span class="text-[12px] text-secondary">{e(tag)}</span>' if tag else ""
    return (f'<td class="px-4 py-3 w-[36%] max-w-0 min-w-[160px]"><a href="#" title="{e(words)}" class="block truncate text-[13px] {cls} hover:underline">{e(words)}{extra}</a></td>')


def num_cell(v, strong=False):
    return f'<td class="px-4 py-3 text-right"><span class="font-mono text-[12px] {"text-foreground" if strong else "text-secondary"}">{e(v)}</span></td>'


def word_cell(v):
    return f'<td class="px-4 py-3 text-right whitespace-nowrap"><span class="text-[12px] text-secondary">{e(v)}</span></td>'


def move_cell(v, tone):
    return f'<td class="px-4 py-3 text-right whitespace-nowrap"><span class="whitespace-nowrap font-mono text-[12px] {tone}">{e(v)}</span></td>'


def table(title, count, description, heads, rows, search, chips, footer):
    bar = ('<div data-part="table-bar" class="flex flex-wrap items-center justify-between gap-3 border-b border-border-dim/50 bg-background/50 px-4 py-3"><div class="min-w-0"><div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">'
           f'<h3 data-part-title="true" class="text-[14px] font-medium tracking-wide text-foreground">{e(title)}</h3><span aria-live="polite" class="text-[12px] text-secondary">{e(count)}</span></div>'
           f'<p class="mt-0.5 text-[12px] text-secondary">{e(description)}</p></div><div class="flex items-center gap-2">{DOWNLOAD}</div></div>')
    head = '<tr class="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">' + "".join(heads) + "</tr>"
    body = "".join('<tr class="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer">' + "".join(r) + "</tr>" for r in rows)
    foot = (f'<div data-part="table-footer" class="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40"><div></div>'
            f'<div class="flex items-center gap-3 sm:ml-auto"><div class="text-[12px] font-medium text-secondary"><span>{e(footer)}</span></div></div></div>')
    searchrow = ('<div class="flex items-center gap-3 flex-wrap"><div class="flex-1 min-w-[240px]"><div data-part="search" class="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm"><div class="flex items-center gap-2 px-3 flex-1">'
                 f'{SEARCH_ICON}<input placeholder="{e(search)}" aria-label="{e(search)}" class="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground" type="text" value=""></div></div></div>'
                 f'<div class="flex flex-wrap items-center gap-3">{"".join(chips)}</div></div>')
    tbl = ('<div data-part="table" class="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">' + bar +
           '<div class="w-full overflow-x-auto"><table class="w-full text-left border-collapse min-w-[720px] lg:min-w-0"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" + foot + "</div>")
    return '<div class="flex flex-col gap-5 w-full">' + searchrow + tbl + "</div>"


# ---------- the eye's words, laid on the page (Way 2) ----------
def sees_on_page(sentences, steps):
    def sentence(t, first):
        words = "".join(
            f'<span class="transition-opacity duration-300 ease-out motion-reduce:transition-none">{re.sub(r"\{([^}]*)\}", r'<span class="font-mono text-foreground">\1</span>', e(w))} </span>'
            for w in t.split(" "))
        tone = "text-foreground" if first else "text-secondary"
        return f'<p data-part="sees-sentence" class="text-[13px] leading-[1.6] {tone}">{words}</p>'
    body = "".join(sentence(t, i == 0) for i, t in enumerate(sentences))
    do = "".join(f'<div class="flex flex-wrap items-center gap-3"><span class="text-[13px] text-foreground">{i + 1}. {e(w)}</span>{link(l)}</div>' for i, (w, l) in enumerate(steps))
    eye = re.search(r'<svg[^>]*lucide-eye[^>]*>.*?</svg>', EYE).group(0)
    return ('<section data-part="sees-on-page" aria-label="What Hakken sees" class="flex flex-col gap-3 border-b border-border-dim pb-8">'
            f'<div class="flex items-center gap-2">{eye}<span class="shrink-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">What Hakken sees</span></div>'
            f'<div data-part="sees-sentences" class="flex max-w-2xl flex-col gap-2.5">{body}</div>'
            f'<div data-part="sees-steps" class="mt-1 flex flex-col gap-2"><div class="text-[12px] text-muted">Do first</div>{do}</div></section>')


def page(*blocks):
    return '<div class="flex flex-col gap-8">' + "".join(blocks) + "</div>"


def stack(*blocks):
    return '<div class="flex flex-col gap-4">' + "".join(blocks) + "</div>"


RIGHT = chip("Website", ["All your websites", "morehandles.co.uk"]) + DATES

# ================= Way 1 · Every section at a glance =================
way1 = page(
    page_header("What Google showed, who visited and who bought, on all your websites.", RIGHT),
    stack(
        heading("Google Analytics", "Updated today at 06:52", icon("chart-column")),
        figures([
            figure("Visits", "35,739", "▼ 4.7% fewer than September", DOWN),
            figure("Bought", "1,207", "3.4 for every 100 visits. The same as September, with 51 fewer sales."),
            figure("Biggest change", "Cross-network", "1,917 fewer visits than September.", big=False),
            figure("Sells best", "Paid Search", "9.1 bought for every 100 visits. Your website gets 3.4.", big=False),
        ]),
        GA_DAYS,
        link("See everything on Overview"),
    ),
    stack(
        heading("Search Console", "Updated today at 04:02", icon("search-check")),
        figures([
            figure("Clicks", "7,124", "▼ 5.2% fewer than September", DOWN),
            figure("Impressions", "842,984", "▲ 2.6% more than September", UP),
            figure("Click-through rate", "0.8%", "It was 0.9% in September"),
            figure("Average position", "12.2", "▼ 0.5 places worse than September", DOWN),
        ]),
        SC_DAYS_W1,
        link("See everything on Performance"),
    ),
)

# ================= Way 2 · What changed, and what was done =================
changes = [
    [name_cell("Visits that started on your home page"), word_cell("Google Analytics"), num_cell("4,049", True), num_cell("3,186"), move_cell("▲ 863", UP)],
    [name_cell("Clicks from rich results"), word_cell("Search Console"), num_cell("4,012", True), num_cell("4,589"), move_cell("▼ 577", DOWN)],
    [name_cell("Lost keywords"), word_cell("Search Console"), num_cell("9,928", True), num_cell("9,457"), move_cell("▲ 471", DOWN)],
    [name_cell("Visits that started on Black Door Handles"), word_cell("Google Analytics"), num_cell("225", True), num_cell("5"), move_cell("▲ 220", UP)],
    [name_cell("Clicks to Cupboard Handles pages"), word_cell("Search Console"), num_cell("462", True), num_cell("595"), move_cell("▼ 133", DOWN)],
    [name_cell("Clicks from the United States"), word_cell("Search Console"), num_cell("319", True), num_cell("419"), move_cell("▼ 100", DOWN)],
    [name_cell("Sales"), word_cell("Google Analytics"), num_cell("1,207", True), num_cell("1,258"), move_cell("▼ 51", DOWN)],
]
checks = [
    [name_cell("Google Analytics figures"), word_cell("morehandles.co.uk"), word_cell("Today at 06:52"), word_cell("Every day")],
    [name_cell("Search Console figures"), word_cell("morehandles.co.uk"), word_cell("Today at 04:02"), word_cell("Every day")],
    [name_cell("Positions on Google"), word_cell("Yours and 7 rivals"), word_cell("15 November"), word_cell("Every month")],
    [name_cell("Links from other websites"), word_cell("Yours and 7 rivals"), word_cell("15 November"), word_cell("Every month")],
]
reading = ('<section class="flex flex-col gap-2">' + heading("From the Reading room") +
           '<div class="flex flex-col gap-1 pt-1"><a href="#" class="text-[13px] font-medium text-foreground hover:underline">November 2026 core update</a>'
           '<p class="text-[13px] text-secondary">It can take up to 2 weeks to finish.</p></div>'
           + link("Read it in the Reading room") + "</section>")
way2 = page(
    page_header("What changed on your websites, and when your figures last came in.", RIGHT),
    sees_on_page(
        [
            "Your clicks from Google have gone down each month since August, when you had {8,619}.",
            "Rich results brought {4,012} clicks in October, down from {4,589} in September.",
            "Paid Search sells best, with {9.1} bought for every 100 visits. Your website gets {3.4}.",
            "Google started its November 2026 core update on 10 November. Since then, your positions have moved no more than usual.",
        ],
        [
            ("Check the product pages that lost clicks in October. Make sure their price and stock show in Google.", "See Rich results"),
            ("Look at the keywords at Positions 2 and 3 that could reach Position 1.", "See Keywords"),
        ],
    ),
    SC_DAYS,
    table("What changed most since September", "7 changes", "From September to October, with the biggest move first.",
          [th("Change", first=True), th("Section"), th("October"), th("September"), th("Up or down", "October against September", sorted_=True)],
          changes, "Search changes…", [chip("Section", ["Every section", "Google Analytics", "Search Console"])], "Showing 1-7 of 7"),
    table("When your figures last came in", "4 kinds", "They come in by themselves. Nothing here needs you.",
          [th("What", first=True), th("Websites"), th("Came in", sorted_=True), th("How often")],
          checks, "Search figures…", [chip("Section", ["Every section", "Google Analytics", "Search Console", "Visibility"])], "Showing 1-4 of 4"),
    reading,
)

# ================= Way 3 · What brings in business =================
sell = [
    [name_cell("More Handles | Handles, Knobs & Door Furniture"), num_cell("4,049", True), num_cell("220", True), num_cell("5.4"), move_cell("▲ 863", UP)],
    [name_cell("Alexander and Wilks Waltz Round Knob on Stepped Rose"), num_cell("919", True), num_cell("65", True), num_cell("7.1"), move_cell("▲ 15", UP)],
    [name_cell("Dartington internal letter tidy with draught excluder"), num_cell("184", True), num_cell("13", True), num_cell("7.1"), move_cell("▲ 65", UP)],
    [name_cell("Cottingham Shaker with Seam Cast Cupboard Knob"), num_cell("122", True), num_cell("9", True), num_cell("7.4"), move_cell("▲ 74", UP)],
    [name_cell("Alexander and wilks bardom ridged cup handle"), num_cell("122", True), num_cell("9", True), num_cell("7.4"), move_cell("▼ 4", DOWN)],
    [name_cell("Architectural Double Sprung Tubular Latch | More Handles"), num_cell("100", True), num_cell("7", True), num_cell("7.0"), move_cell("▼ 22", DOWN)],
    [name_cell("Cupboard Handles and Knobs | More Handles"), num_cell("299", True), num_cell("6", True), num_cell("2.0"), move_cell("▲ 23", UP)],
    [name_cell("Croft Architectural Hardware | More Handles"), num_cell("153", True), num_cell("6", True), num_cell("3.9"), move_cell("▲ 13", UP)],
]
busy = [
    [name_cell("Black Door Handles | Matt Black & Antique | More Handles"), num_cell("225", True), num_cell("98.2%"), move_cell("▲ 220", UP)],
    [name_cell("Cabinet handles size guide how to choose the right size"), num_cell("197", True), num_cell("42.1%"), move_cell("▲ 11", UP)],
    [name_cell("Why is my door handle stiff? How to Fix Door Knob Sticking"), num_cell("191", True), num_cell("45.5%"), move_cell("▲ 17", UP)],
    [name_cell("More Handles Technical guides: grub screws keep falling out"), num_cell("149", True), num_cell("34.9%"), move_cell("▼ 19", DOWN)],
    [name_cell("Door Handle Not Springing Back - How To Fix a Door Handle Spring"), num_cell("130", True), num_cell("34.6%"), move_cell("▼ 3", DOWN)],
    [name_cell("What is a Spindle and what kind do I need?"), num_cell("127", True), num_cell("32.3%"), move_cell("▼ 29", DOWN)],
    [name_cell("Backplates for Cabinet Handles and Knobs | More Handles"), num_cell("103", True), num_cell("20.4%"), move_cell("▼ 5", DOWN)],
]
rivals = [
    [name_cell("ironmongerydirect.co.uk", address=True), num_cell("48,451", True), move_cell("▼ 165", DOWN), num_cell("18,082")],
    [name_cell("handlestore.com", address=True), num_cell("16,709", True), move_cell("▼ 3,555", DOWN), num_cell("3,941")],
    [name_cell("handles4u.co.uk", address=True), num_cell("16,342", True), move_cell("▼ 3,282", DOWN), num_cell("5,270")],
    [name_cell("corston.com", address=True), num_cell("15,711", True), move_cell("▼ 930", DOWN), num_cell("2,828")],
    [name_cell("doorhandlecompany.co.uk", address=True), num_cell("15,383", True), move_cell("▼ 2,911", DOWN), num_cell("4,085")],
    [name_cell("tradefit.uk", address=True), num_cell("10,309", True), move_cell("▼ 2,332", DOWN), num_cell("2,423")],
    [name_cell("morehandles.co.uk", tag="Yours", address=True), num_cell("9,905", True), move_cell("▼ 1,915", DOWN), num_cell("5,397")],
    [name_cell("hiatt-hardware.com", address=True), num_cell("8,753", True), move_cell("▼ 1,351", DOWN), num_cell("4,427")],
]
way3 = page(
    page_header("Who brings the people who buy, which pages sell and how you compare with your rivals.", RIGHT),
    figures([
        figure("Impressions", "842,984", "▲ 2.6% more than September", UP),
        figure("Clicks", "7,124", "0.8 for every 100 impressions."),
        figure("Visits", "35,739", "▼ 4.7% fewer than September", DOWN),
        figure("Bought", "1,207", "3.4 for every 100 visits. The same as September, with 51 fewer sales."),
    ]),
    GA_STRIPS,
    table("Pages that sell", "Top 8", "The pages people started on, with the most sales first.",
          [th("Page", first=True), th("Visits"), th("Bought", sorted_=True), th("Rate", "Bought for every 100 visits"), th("Up or down", "Visits in October against September")],
          sell, "Search pages…", [chip("Classification", ["Every Classification", "Cupboard Handles", "Handles", "Blog"])], "Showing 1-8 of 8"),
    table("Busy pages, no sales", "7 pages", "Each had 100 visits or more in October.",
          [th("Page", first=True), th("Visits", sorted_=True), th("Left", "Left straight away, out of 100 visits"), th("Up or down", "Visits in October against September")],
          busy, "Search pages…", [chip("Classification", ["Every Classification", "Cupboard Handles", "Handles", "Blog"])], "Showing 1-7 of 7"),
    table("You and your rivals on Google", "8 websites", "About how many visits Google sends each website in a month, worked out on 15 November.",
          [th("Website", first=True), th("Traffic", "Visits Google sends in a month, worked out from where the website shows up", sorted_=True), th("Up or down", "15 November against 5 October"), th("Keywords", "Keywords Google shows the website for")],
          rivals, "Search websites…", [chip("Whose", ["Yours and your rivals", "Yours", "Your rivals"])], "Showing 1-8 of 8"),
)

BOARDS = {
    "Way1.dc.html": ("Way 1, every section at a glance", way1),
    "Way2.dc.html": ("Way 2, what changed and what was checked", way2),
    "Way3.dc.html": ("Way 3, what brings in sales", way3),
}

if __name__ == "__main__":
    heights = json.load(open(os.path.join(HERE, "heights.json"))) if os.path.exists(os.path.join(HERE, "heights.json")) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 3000)
        s = frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
