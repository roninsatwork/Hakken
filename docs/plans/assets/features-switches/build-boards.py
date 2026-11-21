"""Make the Features canvas boards from the app copies (raw-*.dc.html)."""
import re, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "project")
os.makedirs(OUT, exist_ok=True)


def read(name):
    return open(os.path.join(HERE, name)).read()


def match_div(s, start):
    """Index just past the </div> closing the <div at `start`."""
    depth = 0
    for m in re.finditer(r"<div\b|</div>", s[start:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return start + m.end()
    raise ValueError("unclosed div")


def swap(s, old, new, count=1):
    assert s.count(old) >= count, f"not found: {old[:80]}"
    return s.replace(old, new, count)


def set_script(s, height, logic):
    a = s.index('<script type="text/x-dc" data-dc-script')
    b = s.index("</script>", a) + len("</script>")
    return s[:a] + (
        f"<script type=\"text/x-dc\" data-dc-script data-props='{{\"$preview\":{{\"width\":1440,\"height\":{height}}}}}'>\n"
        + logic.strip() + "\n</script>"
    ) + s[b:]


def static_fix(s):
    # A canvas reads an empty boolean attribute as false: say it outright.
    return s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"')


# ---------- parts ----------
BLOCKS = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks {cls}" aria-hidden="true"><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"></path><rect x="14" y="2" width="8" height="8" rx="1"></rect></svg>'
ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right hidden h-[18px] w-[18px] text-muted sm:block" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>'
SEARCH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search w-4 h-4 text-muted" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>'
CHEV_L = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left w-4 h-4" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>'
CHEV_R = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>'
SAVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save w-3.5 h-3.5" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"></path><path d="M7 3v4a1 1 0 0 0 1 1h7"></path></svg>'

ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check shrink-0 h-3.5 w-3.5 text-success" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
ICON_MINUS = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus shrink-0 h-3.5 w-3.5 text-secondary" aria-hidden="true"><path d="M5 12h14"></path></svg>'
ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock shrink-0 h-3.5 w-3.5 text-secondary" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'


def status(tone, icon, words):
    return f'<span data-tone="{tone}" class="inline-flex w-fit font-normal text-foreground/85 items-center whitespace-nowrap gap-1.5 text-[12px]">{icon}{words}</span>'


ALWAYS = status("neutral", ICON_LOCK, "Always on")
ON = status("success", ICON_CHECK, "On")
OFF = status("neutral", ICON_MINUS, "Off")


def page_header(title, description):
    return (
        '<div data-part="page-header" class="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><div class="flex items-center gap-3">'
        f'<h1 data-part-title="true" class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">{BLOCKS.format(cls="w-6 h-6 text-brand")}{title}</h1></div>'
        f'<p class="text-[13px] text-secondary mt-1 tracking-wide">{description}</p></div></div>'
    )


def step(name, where, text, current):
    box = "border-foreground/25 bg-foreground/5" if current else "border-border-dim bg-black/20"
    cur = ' aria-current="step"' if current else ""
    return (
        f'<div{cur} class="flex flex-1 min-w-0 flex-col gap-1 rounded-[12px] border px-4 py-3.5 {box}">'
        f'<span class="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">{name}</span>'
        f'<span class="text-[14px] font-semibold text-foreground">{where}</span>'
        f'<span class="text-[12px] leading-relaxed text-secondary">{text}</span></div>'
    )


def levels(first, second, note):
    return (
        '<div class="flex flex-col gap-3.5 rounded-[16px] border border-border-dim bg-card/30 p-5">'
        '<ol class="flex flex-col gap-3.5 sm:flex-row sm:items-center">'
        f'<li class="contents">{first}</li><li class="contents">{ARROW}{second}</li></ol>'
        f'<p class="text-[12px] leading-relaxed text-muted">{note}</p></div>'
    )


def search_box():
    return (
        '<div class="flex items-center gap-3 flex-wrap"><div class="flex-1 min-w-[240px]"><div data-part="search" class="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm"><div class="flex items-center gap-2 px-3 flex-1">'
        f'{SEARCH_ICON}<input placeholder="Search features..." aria-label="Search features..." class="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground" type="text" value=""></div></div></div></div>'
    )


def table(headers, rows_html, count):
    th = "".join(
        f'<th class="px-4 py-3 font-medium {cls}"{t}>{h}</th>' for h, cls, t in headers
    )
    return (
        '<div data-part="table" class="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full"><div class="w-full overflow-x-auto">'
        f'<table class="w-full text-left border-collapse min-w-[720px] lg:min-w-0"><thead><tr class="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">{th}</tr></thead><tbody>{rows_html}</tbody></table></div>'
        '<div data-part="table-footer" class="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">'
        f'<div class="text-[12px] font-medium text-secondary"><span>Showing 1-{count} of {count}</span></div><div class="flex items-center gap-3">'
        f'<button type="button" disabled="disabled" class="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim">{CHEV_L}Previous</button>'
        '<div class="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">Page 1 of 1</div>'
        f'<button type="button" disabled="disabled" class="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim">Next{CHEV_R}</button></div></div></div>'
    )


def checkbox(key, label, prefix, disabled=False, hover=""):
    title = f' title="{hover}"' if hover else ""
    if disabled:
        return f'<span data-part="checkbox" data-part-label="{label}" class="inline-flex items-center"{title}><label for="{prefix}-{key}" class="sr-only">{label}</label><input id="{prefix}-{key}" class="accent-brand" type="checkbox" disabled="disabled"></span>'
    return f'<span data-part="checkbox" data-part-label="{label}" class="inline-flex items-center"><label for="{prefix}-{key}" class="sr-only">{label}</label><input id="{prefix}-{key}" class="accent-brand" type="checkbox" checked="{{{{rows.{key}.on}}}}" onChange="{{{{rows.{key}.toggle}}}}"></span>'


def row(cells):
    return '<tr class="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group">' + "".join(cells) + "</tr>"


def name_cell(name):
    return f'<td class="px-4 py-3 w-[200px] max-w-0 min-w-[160px]"><span title="{name}" class="block truncate text-[13px] font-medium text-foreground">{name}</span></td>'


def text_cell(text):
    return f'<td class="px-4 py-3 max-w-0"><span title="{text}" class="block truncate text-[12px] text-secondary">{text}</span></td>'


def right_cell(inner):
    return f'<td class="px-4 py-3 text-right w-[150px] whitespace-nowrap">{inner}</td>'


def save_row():
    return (
        '<div class="flex items-center justify-between gap-4"><div class="min-w-0"></div><div data-part="save" class="flex items-center gap-3">'
        f'<button type="button" disabled="{{{{saveOff}}}}" class="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/5 hover:bg-white/10 text-foreground text-[12px] font-medium border border-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{SAVE_ICON}Save Features</button></div></div>'
    )


# The menu, in its order. None = always on.
FEATURES = [
    ("dashboard", "Dashboard", "The first page people see when they sign in.", None),
    ("ask", "Ask Hakken", "People ask about their websites and get answers.", None),
    ("insights", "Insights", "What changed on the company's websites, and why.", "on"),
    ("visibility", "Visibility", "Where the company shows up on Google and in AI answers, next to its rivals.", "on"),
    ("sc", "Search Console", "Which keywords Google shows the company's websites for, and which get clicked.", "on"),
    ("bing", "Bing Webmaster", "Which keywords Bing shows the company's websites for, and which get clicked.", "on"),
    ("ga", "Google Analytics", "Who visits the company's websites, where they come from and what they do.", "on"),
    ("clarity", "Microsoft Clarity", "How far people scroll on each page, and where they get stuck or turn back.", "off"),
    ("reading", "Reading room", "News, people worth following and helpful guides.", None),
    ("tasks", "Hakken tasks", "The alerts and reports people ask for.", "on"),
    ("usage", "Usage", "Where the company's credits go.", None),
]

# ---------- board 2: System Settings → Features ----------
s = read("raw-Limits.dc.html")
ACTIVE_TAB = "flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap border-brand text-brand bg-brand/5 rounded-t-[8px]"
IDLE_TAB = "flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap border-transparent text-secondary hover:text-foreground hover:border-foreground/30 rounded-t-[8px]"
s = swap(s, f'<a class="{ACTIVE_TAB}" href="#">', f'<a class="{IDLE_TAB}" href="#">')
s = swap(s, "Classification</a>", f'Classification</a><a class="{ACTIVE_TAB}" href="#">{BLOCKS.format(cls="w-4 h-4")}Features</a>')
s = swap(s, "<title>System Settings — Features</title>", "<title>System Settings, Features</title>")
s = swap(s, "Manage global identity, visual themes, and workspace settings.", "Your platform's name, look and settings.")

g_rows = []
for key, name, text, kind in FEATURES:
    if kind is None:
        g_rows.append(row([name_cell(name), text_cell(text), right_cell('<span class="font-mono text-[12px] text-foreground">6 of 6</span>'), right_cell(ALWAYS)]))
    else:
        g_rows.append(row([
            name_cell(name), text_cell(text),
            right_cell(f'<span class="text-[12px] {{{{rows.{key}.tone}}}}">{{{{rows.{key}.companies}}}}</span>'),
            right_cell(checkbox(key, name, "g")),
        ]))
G_HEAD = [("Feature", "w-[200px]", ""), ("What it does", "", ""), ("Companies", "text-right w-[150px] whitespace-nowrap", ""), ("Switched on", "text-right w-[150px] whitespace-nowrap", "")]
g_content = (
    '<div class="flex w-full flex-col gap-6 pb-12">'
    + page_header("Features", "What every company can see in its menu. Switch a feature off and nothing new comes in for it. The figures so far stay.")
    + levels(
        step("1 · Platform", "This page", "Every company starts with what's switched on here.", True),
        step("2 · Company", "Its Features page", "Switch a feature off on a company's page and only that company loses it.", False),
        "Switch a feature off here and every company loses it. Switch it back on and each company goes back to how it was.",
    )
    + '<div class="flex flex-col gap-5 w-full">' + search_box() + table(G_HEAD, "".join(g_rows), len(FEATURES)) + "</div>"
    + save_row()
    + "</div>"
)
a = s.index('<div class="relative flex-1 flex flex-col min-h-0 bg-transparent pt-4 z-0">')
inner = s.index('<div class="flex w-full flex-col gap-6 pb-12">', a)
s = s[:inner] + g_content + s[match_div(s, inner):]
G_LOGIC = """
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { on: { insights: true, visibility: true, sc: true, bing: true, ga: true, clarity: false, tasks: true } };
  }
  renderVals() {
    const saved = { insights: true, visibility: true, sc: true, bing: true, ga: true, clarity: false, tasks: true };
    const own = { insights: 6, visibility: 6, sc: 6, bing: 4, ga: 6, clarity: 6, tasks: 5 };
    const s = this.state;
    const rows = {};
    let changed = false;
    for (const key of Object.keys(saved)) {
      const on = Boolean(s.on[key]);
      if (on !== saved[key]) changed = true;
      rows[key] = {
        on,
        companies: on ? own[key] + " of 6" : "Off for everyone",
        tone: on ? "font-mono text-foreground" : "text-muted",
        toggle: () => this.setState({ on: Object.assign({}, s.on, { [key]: !on }) }),
      };
    }
    return { rows, saveOff: !changed };
  }
}
"""
G_HEIGHT = 1440
s = swap(s, "<!-- copied-from-app: today's words, so check:drawing doesn't judge their reading age -->\n", "")
s = set_script(s, G_HEIGHT, G_LOGIC)
open(os.path.join(OUT, "Main.dc.html"), "w").write(s)  # the System Settings page is the canvas's first board

# ---------- board 3: Period House Group → Features ----------
s = read("raw-Main.dc.html")
s = swap(s, "<title>Period House Group — Features today</title>", "<title>Period House Group, Features</title>")
c_rows = []
OFF_ALL = status("neutral", ICON_MINUS, "Off for everyone")
for key, name, text, kind in FEATURES:
    if kind is None:
        c_rows.append(row([name_cell(name), text_cell(text), right_cell(ALWAYS)]))
    elif kind == "off":
        c_rows.append(row([name_cell(name), text_cell(text), right_cell(OFF_ALL)]))
    else:
        c_rows.append(row([name_cell(name), text_cell(text), right_cell(checkbox(key, name, "c"))]))
C_HEAD = [("Feature", "w-[200px]", ""), ("What it does", "", ""), ("Switched on", "text-right w-[150px] whitespace-nowrap", "")]

OTHER = [
    ("Tasks", "The shared to-do list. What to chase, who's chasing it, and what's done.", False),
    ("Calls", "Who rang the company's phone line, and what the assistant did.", False),
    ("Reception", "The front-desk screen visitors use to say they've arrived.", False),
    ("Wiki", "What the assistant has learned about the company, and where it found each fact.", True),
]
o_rows = []
for name, text, on in OTHER:
    tick = ' checked="checked"' if on else ""
    o_rows.append(row([name_cell(name), text_cell(text), right_cell(
        f'<span data-part="checkbox" data-part-label="{name}" class="inline-flex items-center"><label for="o-{name.lower()}" class="sr-only">{name}</label><input id="o-{name.lower()}" class="accent-brand" type="checkbox"{tick}></span>'
    )]))

c_content = (
    '<div class="flex w-full flex-col gap-6 pb-12">'
    + page_header("Features", "What Period House Group sees in its menu. Switch a feature off and nothing new comes in for it. The figures so far stay.")
    + levels(
        step("1 · Platform", '<a href="Main.dc.html" class="text-brand hover:underline">System Settings → Features</a>', "Every company starts with what's switched on there.", False),
        step("2 · Company", "This page", "Switch a feature off here and only Period House Group loses it.", True),
        "A feature marked Off for everyone is switched off in System Settings. Switch it back on there.",
    )
    + '<div class="flex flex-col gap-5 w-full">' + search_box() + table(C_HEAD, "".join(c_rows + o_rows), len(FEATURES) + len(OTHER)) + "</div>"
    + save_row()
    + "</div>"
)
inner = s.index('<div class="flex w-full flex-col gap-6 pb-12">')
s = s[:inner] + c_content + s[match_div(s, inner):]
C_LOGIC = """
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { on: { insights: true, visibility: true, sc: true, bing: false, ga: true, tasks: true } };
  }
  renderVals() {
    const saved = { insights: true, visibility: true, sc: true, bing: false, ga: true, tasks: true };
    const s = this.state;
    const rows = {};
    let changed = false;
    for (const key of Object.keys(saved)) {
      const on = Boolean(s.on[key]);
      if (on !== saved[key]) changed = true;
      rows[key] = { on, toggle: () => this.setState({ on: Object.assign({}, s.on, { [key]: !on }) }) };
    }
    return { rows, saveOff: !changed };
  }
}
"""
C_HEIGHT = 1640
s = swap(s, "<!-- copied-from-app: today's words, so check:drawing doesn't judge their reading age -->\n", "")
s = set_script(s, C_HEIGHT, C_LOGIC)
open(os.path.join(OUT, "Company.dc.html"), "w").write(s)

# (today's page, board 1 until 21 Nov, is off the canvas: the built page replaced it; a copy is old-today-Main.dc.html)

# ---------- board 4: what the company sees ----------
s = static_fix(read("raw-Menu.dc.html"))
for label in ("Bing Webmaster", "Microsoft Clarity"):
    i = s.index(f"<span>{label}</span>")
    start = s.rindex('<div class="flex flex-col mb-0.5 relative">', 0, i)
    s = s[:start] + s[match_div(s, start):]
s = swap(s, "<title>What Period House Group sees</title>", "<title>Period House Group's menu</title>")
s = swap(s, "What Google itself counted for your own websites: real clicks and impressions for every search and page. Open one to see them.", "How often Google showed your websites, and the clicks they got. Open one to see every keyword and page.")
s = set_script(s, 900, "class Component extends DCLogic {\n  renderVals() { return {}; }\n}")
open(os.path.join(OUT, "Menu.dc.html"), "w").write(s)
print("built")
