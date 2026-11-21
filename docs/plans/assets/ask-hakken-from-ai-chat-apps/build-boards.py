"""Make the Ask Hakken from ChatGPT and Claude canvas boards.

Boards 2 to 5 start from pages copied from the running app (raw/*.dc.html);
boards 1 and 6 are drawn from the kit's parts and the approved rain board.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "canvas", "project")
REPO = "/Users/ants/Projects/Kakken"
KIT = "/_blob/eecf7d8c9e6da8576c72ebf5b17b73c1"
os.makedirs(OUT, exist_ok=True)


def read(path):
    return open(path, encoding="utf-8").read()


def write(name, text):
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(text)


def swap(s, old, new, count=1):
    assert s.count(old) >= count, f"not found: {old[:90]}"
    return s.replace(old, new, count)


def static_fix(s):
    # A canvas reads an empty boolean attribute as false: say it outright.
    return s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"')


def no_marker(s):
    # These boards carry new lines, so the drawing check reads every word on them.
    return re.sub(r"<!-- copied-from-app[^>]*-->\n?", "", s)


def set_title(s, title):
    return re.sub(r"<title>.*?</title>", f"<title>{title}</title>", s, count=1)


def set_height(s, height):
    return re.sub(r'"\$preview":\{"width":1440,"height":\d+\}', f'"$preview":{{"width":1440,"height":{height}}}', s, count=1)


def icon(name, cls, paths):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-{name} {cls}" aria-hidden="true">{paths}</svg>')


BOT = '<path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path>'
SEND = '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path>'
CHECK = '<path d="M20 6 9 17l-5-5"></path>'
CROSS = '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
MINUS = '<path d="M5 12h14"></path>'
ARROW = '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>'
UP_RIGHT = '<path d="M7 7h10v10"></path><path d="M7 17 17 7"></path>'
PLUG = '<path d="M12 22v-5"></path><path d="M15 8V2"></path><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"></path><path d="M9 8V2"></path>'
MESSAGES = '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"></path><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"></path>'
SEARCH = '<path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle>'
LOGO = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full" aria-hidden="true">'
        '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707"></path><circle cx="12" cy="12" r="3"></circle></svg>')


def status(tone, words):
    ico = {"success": icon("check", "shrink-0 h-3.5 w-3.5 text-success", CHECK),
           "neutral": icon("minus", "shrink-0 h-3.5 w-3.5 text-secondary", MINUS)}[tone]
    return f'<span data-tone="{tone}" class="inline-flex w-fit font-normal text-foreground/85 items-center whitespace-nowrap gap-1.5 text-[12px]">{ico}{words}</span>'


QUIET = "px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50"
ROW = "border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"


def dc_script(height, logic=None):
    body = logic or "class Component extends DCLogic {\n  renderVals() { return {}; }\n}"
    return (f"<script type=\"text/x-dc\" data-dc-script data-props='{{\"$preview\":{{\"width\":1440,\"height\":{height}}}}}'>\n"
            f"{body.strip()}\n</script>")


def page(title, helmet_style, body, height, logic=None):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="{KIT}">
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
{helmet_style}
</style>
</helmet>
{body}
</x-dc>
{dc_script(height, logic)}
</body>
</html>
"""


# ---------- 1 · The Allow page ----------

def rain_section():
    s = read(os.path.join(REPO, "docs/plans/assets/home-page/Rain.dc.html"))
    a = s.index('<section class="bg-sidebar"')
    b = s.index("</section>", a) + len("</section>")
    rain = s[a:b]
    # No Sign in over the rain: the person is signed in.
    rain = re.sub(r'\n  <a href="#" class="rounded-\[8px\][^\n]*?Sign in</a>\n', "\n", rain)
    assert "Sign in" not in rain
    logic = s[s.index("class Component extends DCLogic"):s.index("</script>", s.index("data-dc-script"))]
    return rain, logic


def bullet(kind, words):
    ico = icon("check", "h-4 w-4 shrink-0 text-success", CHECK) if kind == "can" else icon("x", "h-4 w-4 shrink-0 text-secondary", CROSS)
    return f'<li class="flex items-start gap-2.5 text-[13px] leading-relaxed text-secondary"><span class="mt-0.5">{ico}</span><span>{words}</span></li>'


def allow_board():
    rain, logic = rain_section()
    can = "".join(bullet("can", w) for w in [
        "The figures on your screens, such as visits and clicks.",
        "What changed on each screen, and why.",
        "The first 10 of any list, such as your top keywords.",
    ])
    cant = "".join(bullet("cant", w) for w in [
        "Change, send or delete anything.",
        "See another company's figures.",
    ])
    hero = f"""<section data-part="hero" style="display: flex; flex-direction: column; justify-content: space-between; gap: 48px; padding: 44px 56px 40px 56px; min-height: min(100vh, 150vw); box-sizing: border-box">
  <div aria-hidden="true" style="height: 36px"></div>

  <div style="display: flex; flex-direction: column; gap: 22px; max-width: 440px">
    <span class="font-mono text-muted" style="font-size: 12px; letter-spacing: 0.32em; text-transform: uppercase">Link an app</span>
    <h1 data-part-title="true" style="margin: 0; font-size: 48px; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em">Let ChatGPT read your figures?</h1>
    <p data-part="hero-copy" class="text-secondary" style="margin: 0; font-size: 14px; line-height: 1.6">Press Allow and you can ask about Period House Group's websites in ChatGPT.</p>
    <div class="flex items-center justify-between gap-4 border-y border-border-dim py-3">
      <span class="flex items-center gap-3"><span aria-hidden="true" class="flex h-8 w-8 items-center justify-center rounded-full bg-card text-[12px] font-medium text-foreground">JH</span><span class="text-[13px] text-foreground">Signed in as Jo Hughes</span></span>
      <button type="button" data-part="link" class="text-[13px] text-secondary transition-colors hover:text-foreground">Use a different email</button>
    </div>
    <div class="flex flex-col gap-2">
      <h2 class="m-0 text-[13px] font-medium text-foreground">What ChatGPT can read</h2>
      <ul class="m-0 flex flex-col gap-1.5 p-0">{can}</ul>
    </div>
    <div class="flex flex-col gap-2">
      <h2 class="m-0 text-[13px] font-medium text-foreground">What ChatGPT can't do</h2>
      <ul class="m-0 flex flex-col gap-1.5 p-0">{cant}</ul>
    </div>
    <p class="text-[12px] leading-relaxed text-muted" style="margin: 0">ChatGPT keeps a copy of what it reads. OpenAI's terms say what happens to that copy. You can unlink ChatGPT any time on the Integrations tab of My Profile.</p>
    <div class="flex items-center gap-3">
      <button type="button" data-part="primary-action" class="rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand flex items-center justify-center gap-2.5 px-[22px] py-[13px] text-[15px]"><span>Allow</span>{icon("arrow-right", "h-4 w-4", ARROW)}</button>
      <button type="button" class="px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Cancel</button>
    </div>
  </div>

  <p data-part="copyright" class="font-mono text-muted" style="margin: 0; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase">© 2026 Hakken. All rights reserved.</p>
</section>"""
    body = f"""<div class="dark"><div data-part="allow" class="bg-background text-foreground font-sans tracking-tight antialiased" style="min-height: 100vh; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr))">

{hero}

{rain}

</div></div>"""
    style = """body{margin:0}
@keyframes hk-ripple{0%{transform:translate(-50%,-50%) scale(.04);opacity:0}4%{opacity:.9}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}
@keyframes hk-splash{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}3%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}14%{opacity:0;transform:translate(-50%,-50%) scale(.6)}100%{opacity:0}}
@keyframes hk-sheen{0%{transform:translateY(-8%)}100%{transform:translateY(8%)}}"""
    return page("Let ChatGPT read your figures", style, body, HEIGHTS["Main.dc.html"], logic)


# ---------- 2 · My Profile → Integrations ----------

def app_row(href, ico, name, what, label, action):
    tag = f'a href="{href}"' if href else "span"
    end = "a" if href else "span"
    cell_name = f'<{tag} class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">{ico}<span title="{name}" class="block truncate">{name}</span></{end}>'
    if href:
        action = f'<a href="{href}" class="{QUIET}">{action}</a>'
    else:
        action = f'<button type="button" class="{QUIET}">{action}</button>'
    return (f'<tr class="{ROW} cursor-pointer">'
            f'<td class="px-4 py-3 w-[240px] min-w-[160px] max-w-0">{cell_name}</td>'
            f'<td class="px-4 py-3 "><span class="text-[12px] text-secondary">{what}</span></td>'
            f'<td class="px-4 py-3 ">{label}</td>'
            f'<td class="px-4 py-3 text-right w-[150px] whitespace-nowrap">{action}</td></tr>')


def integrations_board():
    s = read(os.path.join(RAW, "ProfileIntegrations.dc.html"))
    s = no_marker(s)
    s = set_title(s, "My Profile, Integrations")
    s = swap(s, "Link Hakken to apps you already use, to hear from it and ask it things there.",
             "Link apps you already use, to ask about your websites there.")
    a = s.index("<tbody>")
    b = s.index("</tbody>", a) + len("</tbody>")
    bot = icon("bot", "h-4 w-4 text-secondary", BOT)
    rows = "".join([
        app_row("ChatGPT.dc.html", bot, "ChatGPT", "Ask about your websites in ChatGPT, and see your figures as charts.", status("success", "Linked"), "Manage"),
        app_row(None, bot, "Claude", "Ask about your websites in Claude, and see your figures as charts.", status("neutral", "Not linked"), "Link"),
        app_row(None, icon("send", "h-4 w-4 text-secondary", SEND), "Telegram", "Get your alerts and reports as messages, and ask about your websites from your phone.", status("neutral", "Not linked"), "Link"),
    ])
    s = s[:a] + "<tbody>" + rows + "</tbody>" + s[b:]
    s = set_height(s, HEIGHTS["Integrations.dc.html"])
    return static_fix(s)


# ---------- 3 · ChatGPT's own page ----------

QUESTIONS = [
    ("What changed in Microsoft Clarity", "morehandles.co.uk", "Last month", "Today, 10:44", ("neutral", "Switched off")),
    ("Top keywords in Search Console", "morehandles.co.uk", "Last month", "Today, 10:43", ("success", "Answered")),
    ("What changed in Google Analytics", "morehandles.co.uk", "Last month", "Today, 10:42", ("success", "Answered")),
    ("How a website is doing", "morehandles.co.uk", "Last month", "Today, 10:42", ("success", "Answered")),
    ("How a page is doing", "morehandles.co.uk", "Last 3 months", "Thursday 19 November", ("success", "Answered")),
    ("Your websites", "", "", "Thursday 19 November", ("success", "Answered")),
]


def question_table(platform):
    """The search row, table and footer, copied from the Features page's DataTable."""
    a = platform.index('<div class="flex flex-col gap-5 w-full"><div class="flex items-center gap-3 flex-wrap">')
    b = platform.index('<div class="flex items-center justify-between gap-4"><div class="min-w-0"></div><div data-part="save"', a)
    t = platform[a:b]
    # The block ends with the DataTable's own closing tags; trim the page's.
    t = swap(t, 'placeholder="Search features..." aria-label="Search features..."', 'placeholder="Search what ChatGPT asked for…" aria-label="Search what ChatGPT asked for…"')
    head = ('<thead><tr class="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">'
            '<th class="px-4 py-3 font-medium  min-w-[160px] max-w-0">Asked for</th>'
            '<th class="px-4 py-3 font-medium  w-[200px] whitespace-nowrap">Website</th>'
            '<th class="px-4 py-3 font-medium  w-[150px] whitespace-nowrap">Dates</th>'
            '<th class="px-4 py-3 font-medium  w-[190px] whitespace-nowrap">When</th>'
            '<th class="px-4 py-3 font-medium text-right w-[150px] whitespace-nowrap">Answer</th></tr></thead>')
    t = re.sub(r"<thead>.*?</thead>", head, t, count=1, flags=re.S)
    rows = []
    for asked, site, dates, when, (tone, answer) in QUESTIONS:
        site_cell = f'<span title="{site}" class="block truncate text-[12px] text-info">{site}</span>' if site else '<span class="text-[12px] text-muted">–</span>'
        dates_cell = f'<span class="text-[12px] text-secondary">{dates}</span>' if dates else '<span class="text-[12px] text-muted">–</span>'
        rows.append(
            f'<tr class="{ROW}"><td class="px-4 py-3 min-w-[160px] max-w-0"><span title="{asked}" class="block truncate text-[13px] font-medium text-foreground">{asked}</span></td>'
            f'<td class="px-4 py-3 w-[200px] whitespace-nowrap">{site_cell}</td>'
            f'<td class="px-4 py-3 w-[150px] whitespace-nowrap">{dates_cell}</td>'
            f'<td class="px-4 py-3 w-[190px] whitespace-nowrap"><span class="text-[12px] text-secondary">{when}</span></td>'
            f'<td class="px-4 py-3 text-right w-[150px] whitespace-nowrap">{status(tone, answer)}</td></tr>')
    t = re.sub(r"<tbody>.*?</tbody>", "<tbody>" + "".join(rows) + "</tbody>", t, count=1, flags=re.S)
    t = swap(t, "Showing 1-11 of 11", "Showing 1-6 of 6")
    return t


def chatgpt_board():
    s = read(os.path.join(RAW, "Telegram.dc.html"))
    platform = read(os.path.join(RAW, "PlatformFeatures.dc.html"))
    s = no_marker(s)
    s = set_title(s, "ChatGPT")
    s = swap(s, 'class="inline-flex items-center gap-2 self-start text-[13px] text-secondary hover:text-foreground transition-colors" href="#"',
             'class="inline-flex items-center gap-2 self-start text-[13px] text-secondary hover:text-foreground transition-colors" href="Integrations.dc.html"')
    s = swap(s, icon("send", "h-6 w-6 text-brand", SEND) + "Telegram</h1>", icon("bot", "h-6 w-6 text-brand", BOT) + "ChatGPT</h1>")
    s = swap(s, '<p class="text-[13px] text-secondary mt-1 tracking-wide">Get your alerts and reports as messages, and ask Hakken anything from your phone.</p>',
             '<p class="text-[13px] text-secondary mt-1 tracking-wide">Ask about your websites in ChatGPT, and see your figures as charts.</p>'
             f'<div class="flex flex-wrap items-center gap-2 mt-2.5">{status("success", "Linked")}</div>')
    linked = f"""<div class="flex flex-col gap-3">
<div>
<h4 class="text-[13px] font-medium text-foreground tracking-wide">Your link</h4>
<p class="text-[13px] text-secondary mt-1">Linked to Period House Group since Monday 16 November.</p>
<p class="text-[11px] text-secondary mt-0.5">ChatGPT can read your figures, but it can't change, send or delete anything.</p>
</div>
<div><button type="button" class="{QUIET}">Unlink</button></div>
</div>
<div class="flex flex-col gap-5">
<div>
<h4 class="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">{icon("messages-square", "w-4 h-4 text-brand", MESSAGES)}What ChatGPT asked for</h4>
<p class="text-[11px] text-secondary mt-0.5">The last 90 days. The newest is at the top.</p>
</div>
{question_table(platform)}
</div>"""
    s = swap(s, '<p class="text-[13px] text-secondary">Telegram isn’t ready yet. Check back soon.</p>', linked)
    s = set_height(s, HEIGHTS["ChatGPT.dc.html"])
    return static_fix(s)


# ---------- 4 and 5 · the two Features pages ----------


def chat_apps_row(companies_cell):
    """Ask Hakken in ChatGPT and Claude, the table's last menu row (Anthony, 2026-11-21: "this should be in the table")."""
    name = "Ask Hakken in ChatGPT and Claude"
    what = "People ask about their websites in ChatGPT or Claude."
    tick = ('<span data-part="checkbox" data-part-label="Ask Hakken in ChatGPT and Claude" class="inline-flex items-center">'
            '<label for="chat-apps-on" class="sr-only">Ask Hakken in ChatGPT and Claude</label>'
            '<input id="chat-apps-on" class="accent-brand" type="checkbox" checked="{{on}}" onChange="{{flip}}"></span>')
    return (f'<tr class="{ROW}"><td class="px-4 py-3 w-[200px] min-w-[160px] max-w-0"><span title="{name}" class="block truncate text-[13px] font-medium text-foreground">{name}</span></td>'
            f'<td class="px-4 py-3 max-w-0"><span title="{what}" class="block truncate text-[12px] text-secondary">{what}</span></td>'
            + companies_cell +
            f'<td class="px-4 py-3 text-right w-[150px] whitespace-nowrap">{tick}</td></tr>')


FEATURE_LOGIC = """
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { on: true };
  }
  renderVals() {
    return {
      on: this.state.on,
      saveOff: this.state.on,
      flip: () => this.setState({ on: !this.state.on })
    };
  }
}
"""


def features_board(raw_name, companies_cell, height_key, title, shown_before, shown_after):
    s = read(os.path.join(RAW, raw_name))
    s = no_marker(s)
    s = set_title(s, title)
    # The new row goes straight after Usage, the menu's last row.
    usage = s.index('title="Usage"')
    row_end = s.index("</tr>", usage) + len("</tr>")
    s = s[:row_end] + chat_apps_row(companies_cell) + s[row_end:]
    s = swap(s, shown_before, shown_after)
    # Save wakes up once the new switch changes, as it does on the built page.
    i = s.index('data-part="save"')
    j = s.index("<button", i)
    k = s.index(">", j)
    button = s[j:k]
    button = re.sub(r'\sdisabled="[^"]*"', "", button) + ' disabled="{{saveOff}}"'
    s = s[:j] + button + s[k:]
    s = re.sub(r"<script type=\"text/x-dc\" data-dc-script.*?</script>", lambda _m: dc_script(HEIGHTS[height_key], FEATURE_LOGIC), s, count=1, flags=re.S)
    return static_fix(s)


def platform_board():
    cell = '<td class="px-4 py-3 text-right w-[150px] whitespace-nowrap"><span class="font-mono text-[12px] text-foreground">6 of 6</span></td>'
    s = features_board("PlatformFeatures.dc.html", cell, "Features.dc.html", "System Settings, Features", "Showing 1-11 of 11", "Showing 1-12 of 12")
    # As on the Features canvas (docs/plans/assets/features-switches/build-boards.py).
    return swap(s, "Manage global identity, visual themes, and workspace settings.", "Your platform's name, look and settings.")


def company_board():
    # 16 rows now, at 15 a page as the built table shows them: Wiki moves to page 2.
    s = features_board("CompanyFeatures.dc.html", "", "CompanyFeatures.dc.html", "Period House Group, Features", "Showing 1-15 of 15", "Showing 1-15 of 16")
    wiki = s.index('title="Wiki"')
    start = s.rindex("<tr", 0, wiki)
    end = s.index("</tr>", wiki) + len("</tr>")
    s = s[:start] + s[end:]
    s = swap(s, "Page 1 of 1", "Page 1 of 2")
    nxt = s.index(">Next<")
    button = s.rindex("<button", 0, nxt)
    head_end = s.index(">", button)
    s = s[:button] + s[button:head_end].replace(' disabled="disabled"', "") + s[head_end:]
    return s


# ---------- 6 · A question in a chat, with the chart ----------

FIX = json.load(open(os.path.join(REPO, "src/test/fixtures/moreHandlesOverview.json")))["lastMonth"]
OCT = [p["visits"] for p in FIX["chart"]["points"]]
SEP = [p["visits"] for p in FIX["before"]["points"]]
TOTAL_NOW = FIX["figures"]["now"]["visits"]
TOTAL_BEFORE = FIX["figures"]["before"]["visits"]
ORANGE = "#f97316"   # CHART_SERIES_ORANGE
GREY = "#8a8a90"     # CHART_COMPARATOR_GREY


def chart_svg():
    width, height = 680, 230
    left, right, top, bottom = 48, 12, 10, 28
    w, h = width - left - right, height - top - bottom
    top_value = 1500
    x = lambda i: left + w * i / 30
    y = lambda v: top + h * (1 - v / top_value)
    parts = []
    for v in (0, 500, 1000, 1500):
        yy = round(y(v), 1)
        parts.append(f'<line x1="{left}" x2="{width - right}" y1="{yy}" y2="{yy}" stroke="currentColor" class="text-border-dim" stroke-width="1"></line>')
        parts.append(f'<text x="{left - 10}" y="{yy + 4}" text-anchor="end" class="fill-muted font-mono" font-size="11">{v:,}</text>')
    for i, label in ((0, "1 Oct"), (7, "8 Oct"), (14, "15 Oct"), (21, "22 Oct"), (30, "31 Oct")):
        anchor = "start" if i == 0 else ("end" if i == 30 else "middle")
        parts.append(f'<text x="{round(x(i), 1)}" y="{height - 8}" text-anchor="{anchor}" class="fill-muted" font-size="11">{label}</text>')
    sep = " ".join(f"{round(x(i), 1)},{round(y(v), 1)}" for i, v in enumerate(SEP))
    oct_ = " ".join(f"{round(x(i), 1)},{round(y(v), 1)}" for i, v in enumerate(OCT))
    parts.append(f'<polyline points="{sep}" fill="none" stroke="{GREY}" stroke-width="2" stroke-dasharray="4 4"></polyline>')
    parts.append(f'<polyline points="{oct_}" fill="none" stroke="{ORANGE}" stroke-width="2.5" stroke-linejoin="round"></polyline>')
    hover = 27
    hx = round(x(hover), 1)
    parts.append(f'<line x1="{hx}" x2="{hx}" y1="{top}" y2="{top + h}" stroke="currentColor" class="text-secondary" stroke-width="1"></line>')
    parts.append(f'<circle cx="{hx}" cy="{round(y(OCT[hover]), 1)}" r="4" fill="{ORANGE}"></circle>')
    parts.append(f'<circle cx="{hx}" cy="{round(y(SEP[hover]), 1)}" r="4" fill="{GREY}"></circle>')
    return (f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Visits each day in October against September" style="display: block">'
            + "".join(parts) + "</svg>"), hx


def readout(hx):
    rows = [(ORANGE, "Wednesday 28 October", OCT[27], False), (GREY, "Monday 28 September", SEP[27], True)]
    lines = "".join(
        f'<div class="flex min-w-0 items-center gap-2 py-1 pr-2"><span aria-hidden="true" class="h-[2px] w-3 shrink-0 rounded-full" style="background-color:{c}"></span><span class="truncate text-[13px] text-foreground">{name}</span></div>'
        f'<div class="px-2 text-right text-[13px] py-1"><div class="font-mono tabular-nums font-normal text-foreground">{v:,}</div></div>'
        for c, name, v, _ in rows)
    left = int(hx) - 250
    return (f'<div class="pointer-events-none rounded-[10px] border border-border-dim bg-card shadow-lg min-w-[14rem] max-w-[26rem] px-3.5 py-2.5" style="position: absolute; top: 24px; left: {left}px">'
            f'<div class="font-medium text-secondary text-[13px]">Visits</div>'
            f'<div class="mt-1 grid items-start" style="grid-template-columns:minmax(0,1fr) auto">{lines}</div></div>')


def chat_board():
    svg, hx = chart_svg()
    change = TOTAL_BEFORE - TOTAL_NOW
    assert change > 0
    legend = (f'<div class="flex items-center gap-5 text-[12px] text-secondary">'
              f'<span class="flex items-center gap-2"><span aria-hidden="true" class="h-[2px] w-4 rounded-full" style="background-color:{ORANGE}"></span>October</span>'
              f'<span class="flex items-center gap-2"><svg width="16" height="2" aria-hidden="true"><line x1="0" x2="16" y1="1" y2="1" stroke="{GREY}" stroke-width="2" stroke-dasharray="4 4"></line></svg>September</span></div>')
    view = f"""<div data-part="chat-chart" class="rounded-2xl border border-border-dim bg-card/40 p-5" style="width: 722px; box-sizing: border-box">
  <div class="flex items-center justify-between gap-4">
    <span class="flex items-center gap-2 text-[12px] text-secondary"><span class="flex h-[18px] w-[18px] items-center justify-center text-brand">{LOGO}</span>Hakken · morehandles.co.uk</span>
    <a href="#" class="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">Open Visits{icon("arrow-up-right", "h-3.5 w-3.5", UP_RIGHT)}</a>
  </div>
  <h2 data-part-title="true" class="mt-4 text-[14px] font-medium text-foreground">Visits each day</h2>
  <div class="mt-2 flex items-baseline gap-3"><span class="font-mono text-[28px] font-medium text-foreground">{TOTAL_NOW:,}</span><span class="whitespace-nowrap font-mono text-[12px] text-destructive">▼ {change:,} fewer than September</span></div>
  <div class="mt-3">{legend}</div>
  <div class="relative mt-3">{svg}{readout(hx)}</div>
</div>"""
    body = f"""<div class="dark"><div data-part="chat" class="bg-background text-foreground font-sans tracking-tight antialiased" style="min-height: 100vh; padding: 56px 24px; box-sizing: border-box">
<div class="mx-auto flex flex-col gap-6" style="max-width: 760px">
  <div class="self-end rounded-[18px] bg-card px-4 py-2.5 text-[14px] text-foreground">How did my visits do last month?</div>
  <div class="flex flex-col gap-4 text-[14px] leading-relaxed text-foreground">
    <p style="margin: 0">morehandles.co.uk had {TOTAL_NOW:,} visits in October. That's {change:,} fewer than September.</p>
    {view}
    <p style="margin: 0">All of the drop came from Cross-network, with 1,917 fewer visits than September. Organic Search and Paid Shopping both went up.</p>
  </div>
</div>
</div></div>"""
    return page("A question in a chat", "body{margin:0}", body, HEIGHTS["Chat.dc.html"])


# ---------- the index ----------

HEIGHTS = json.load(open(os.path.join(HERE, "heights.json"))) if os.path.exists(os.path.join(HERE, "heights.json")) else {
    "Main.dc.html": 1000, "Integrations.dc.html": 1000, "ChatGPT.dc.html": 1300,
    "Features.dc.html": 1600, "CompanyFeatures.dc.html": 1800, "Chat.dc.html": 1000,
}

BOARDS = [
    ("Main.dc.html", "1 · The Allow page, after signing in", allow_board, False),
    ("Integrations.dc.html", "2 · My Profile → Integrations", integrations_board, False),
    ("ChatGPT.dc.html", "3 · ChatGPT's own page, once linked", chatgpt_board, False),
    ("Features.dc.html", "4 · System Settings → Features", platform_board, True),
    ("CompanyFeatures.dc.html", "5 · Period House Group's Features page", company_board, True),
    ("Chat.dc.html", "6 · A question in a chat, with the chart", chat_board, False),
]


def index():
    boards, order = {}, []
    row1 = max(HEIGHTS[n] for n, *_ in BOARDS[:3])
    for i, (name, title, _f, interactive) in enumerate(BOARDS):
        col, row = i % 3, i // 3
        entry = {"x": col * 1520, "y": 0 if row == 0 else row1 + 120 + 223, "w": 1440, "h": HEIGHTS[name], "title": title, "expand": "fill"}
        if interactive:
            entry["is_interactive"] = True
        boards[name] = entry
        order.append(name)
    notes = json.load(open(os.path.join(HERE, "notes.json")))
    for note in notes.values():
        if isinstance(note.get("y"), str):
            extra = int(note["y"].split("+")[1]) if "+" in note["y"] else 0
            note["y"] = row1 + 120 + 223 + extra
    return {
        "v": 3,
        "createdOnFiles": {"v": 1, "at": CREATED},
        "title": "Ask Hakken in ChatGPT and Claude",
        "launch": {"view": "canvas"},
        "pages": [],
        "boards": boards,
        "order": order,
        "notes": notes,
        "designSystems": [],
    }


CREATED = "2026-11-21T19:45:00Z"

if __name__ == "__main__":
    for name, _t, make, _i in BOARDS:
        write(name, make())
    open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8").write(json.dumps(index(), indent=2, ensure_ascii=False) + "\n")
    print("built", ", ".join(n for n, *_ in BOARDS))
