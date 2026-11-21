"""Three Dashboard ways as a daily first screen: short, the story first, every source and the Reading room. Ronins Agency, October."""
import json, os, re
import build as B
import build2 as R2
from build import (e, figure, figures, heading, link, table, th, name_cell, num_cell, word_cell, move_cell, chip,
                   sees_on_page, page, stack, UP, DOWN)

HERE = B.HERE
OUT = B.OUT
RIGHT = R2.RIGHT

# ---------- Visits each day, from Ronins' own days ----------
GAV = json.load(open(os.path.join(HERE, "ronins", "gavisits.json")))
OCT = [GAV[f"2026-10-{d:02d}"] for d in range(1, 32)]
SEP = [GAV[f"2026-09-{d:02d}"] for d in range(1, 31)]


def redraw(card, oct_, sep_):
    i = card.index('role="application"')
    svg = card[card.rindex("<svg", 0, i):]
    lines = re.findall(r'<line[^>]*\sx1="([\d.]+)"[^>]*\sy1="([\d.]+)"[^>]*\sx2="([\d.]+)"', svg)
    left, top, right = float(lines[0][0]), float(lines[0][1]), float(lines[0][2])
    bottom = float(lines[1][1])
    top_v = R2.nice_max(max(oct_ + sep_))
    y = lambda v: bottom - (bottom - top) * v / top_v
    x = lambda i: left + (right - left) * i / 30
    for name, series in (("October", oct_), ("September", sep_)):
        d = R2.monotone([(x(i), y(v)) for i, v in enumerate(series)])
        card = re.sub(r'(<path name="%s"[^>]*\sd=")[^"]*(")' % name, lambda m: m.group(1) + d + m.group(2), card, count=1)
    labels = iter(("%g" % t) for t in (0, top_v / 4, top_v / 2, top_v * 3 / 4, top_v))
    return re.sub(r'(<text[^>]*orientation="left"[^>]*><tspan[^>]*>)([^<]*)(</tspan>)', lambda m: m.group(1) + next(labels) + m.group(3), card)


VISITS = redraw(B.GA_DAYS, OCT, SEP)

NOTICE = R2.notice("Google's November 2026 core update is still rolling out. It started on 10 November and can take up to 2 weeks.", "Read it in the Reading room")
DESC = "Friday 21 November. Your daily figures came in this morning."

FOUR = figures([
    figure("Visits", "245", "▲ 2% more than September", UP),
    figure("Events", "5", "2.0 for every 100 visits. It was 0.8 in September, with 3 more events."),
    figure("Clicks", "341", "▼ 12.6% fewer than September", DOWN),
    figure("AI answers", "47 of 240", "Perplexity named you most, in 24 of its 50 answers."),
])


NOTE_BOXES = figures([
    figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN),
    figure("Left straight away", "39%", "It was 18% in September"),
    figure("Went straight back", "15", "visits left a page within seconds"),
    figure("Keywords", "694", "▼ 46 fewer than on 12 October", DOWN),
])
LIST_BOXES = figures([
    figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN),
    figure("Left straight away", "39%", "It was 18% in September"),
    figure("Went straight back", "15", "visits left a page within seconds"),
    figure("Best for events", "Direct", "6.5 events for every 100 visits. Your website gets 2.0.", big=False),
])


def quiet_line(words, link_words):
    return f'<div class="flex flex-wrap items-center gap-3"><span class="text-[12px] text-secondary">{e(words)}</span>{link(link_words)}</div>'


def text_cell(v):
    return f'<td class="px-4 py-3 max-w-0"><span class="block truncate text-[12px] text-secondary" title="{e(v)}">{e(v)}</span></td>'


# ================= Way 1 · The morning note =================
way1 = page(
    B.page_header(DESC, RIGHT),
    NOTICE,
    sees_on_page(
        [
            "Visits held steady at {245} in October. People got in touch {5} times, up from {2} in September.",
            "Fewer people found you on Google. Clicks fell to {341}, from {390} in September.",
            "AI assistants named you in {47} of {240} answers.",
            "On phones, people scrolled only {21%} of the way down each page. On computers it was {34%}.",
        ],
        [("Move the AI Agency page's main point and its enquiry link nearer the top.", "See Pages in Clarity")],
    ),
    stack(NOTE_BOXES, VISITS, quiet_line("Bing Webmaster isn't connected yet.", "Go to Connection")),
)

# ================= Way 2 · The numbers first =================
moved = [
    [name_cell("Clicks from Google"), word_cell("Search Console"), num_cell("341", True), num_cell("390"), move_cell("▼ 49", DOWN)],
    [name_cell("Visits that started on Service pages"), word_cell("Google Analytics"), num_cell("72", True), num_cell("92"), move_cell("▼ 20", DOWN)],
    [name_cell("Visits that started on Brand pages"), word_cell("Google Analytics"), num_cell("68", True), num_cell("53"), move_cell("▲ 15", UP)],
    [name_cell("Events"), word_cell("Google Analytics"), num_cell("5", True), num_cell("2"), move_cell("▲ 3", UP)],
    [name_cell("Keywords on Google"), word_cell("Visibility"), num_cell("694", True), num_cell("740"), move_cell("▼ 46", DOWN)],
]
way2 = page(
    B.page_header(DESC, RIGHT),
    NOTICE,
    stack(
        heading("Found", "On Google, on Bing and in AI answers"),
        figures([
            figure("Impressions", "279,239", "▼ 5.2% fewer than September", DOWN),
            figure("Clicks", "341", "0.12 for every 100 impressions."),
            figure("AI answers", "47 of 240", "Perplexity named you most, in 24 of its 50 answers."),
            figure("Bing", "Not connected", "Connect it to see Bing's clicks.", big=False),
        ]),
    ),
    stack(
        heading("Visited", "What people did on your website"),
        figures([
            figure("Visits", "245", "▲ 2% more than September", UP),
            figure("Scrolled, on average", "33%", "of the way down each page"),
            figure("Went straight back", "15", "visits left a page within seconds"),
            figure("Events", "5", "2.0 for every 100 visits. It was 0.8 in September, with 3 more events."),
        ]),
        VISITS,
    ),
    table("What changed since September", "5 changes", "Visibility's rows show its last two checks. That's 2 November against 12 October.",
          [th("Change", first=True), th("Section"), th("Now", "October, or 2 November for Visibility"), th("Before", "September, or 12 October for Visibility"), th("Up or down")],
          moved, "Search changes…", [chip("Section", R2.SECTIONS)], "Showing 1-5 of 5"),
)

# ================= Way 3 · What was done for you =================
done = [
    [name_cell("Read Microsoft Clarity"), text_cell("People scrolled a third of the way down each page."), word_cell("Today at 05:50")],
    [name_cell("Read Search Console"), text_cell("341 clicks in October, 49 fewer than September."), word_cell("Today at 04:00")],
    [name_cell("Read Google Analytics"), text_cell("245 visits and 5 events in October."), word_cell("Today at 03:21")],
    [name_cell("Watching Google's November 2026 core update"), text_cell("Still rolling out. Read it in the Reading room."), word_cell("Since 10 November")],
    [name_cell("Asked 5 AI assistants about you"), text_cell("They named you in 47 of 240 answers."), word_cell("2 November")],
    [name_cell("Checked you and 4 rivals on Google"), text_cell("You show up for 694 keywords, 46 fewer than on 12 October."), word_cell("2 November")],
    [name_cell("Bing Webmaster isn't connected"), text_cell("Connect it to see Bing's clicks."), R2.status_cell()],
]
way3 = page(
    B.page_header(DESC, RIGHT),
    table("What was done for you", "7 things", "Your daily figures come in by themselves. Only Bing Webmaster needs you, to connect it.",
          [th("What", first=True), '<th class="px-4 py-3 font-medium"><span title="What it found">Found</span></th>', th("When", sorted_=True)],
          done, "Search…", [chip("Section", R2.SECTIONS + ["Reading room"])], "Showing 1-7 of 7"),
    stack(LIST_BOXES, VISITS),
)

BOARDS = {
    "Way1.dc.html": ("Way 1, the morning note", way1),
    "Way2.dc.html": ("Way 2, the numbers first", way2),
    "Way3.dc.html": ("Way 3, what was done for you", way3),
}

if __name__ == "__main__":
    hp = os.path.join(HERE, "heights3.json")
    heights = json.load(open(hp)) if os.path.exists(hp) else {}
    for name, (title, content) in BOARDS.items():
        h = heights.get(name, 2000)
        s = B.frame(title, content, h)
        s = s.replace(' checked=""', ' checked="checked"').replace(' disabled=""', ' disabled="disabled"').replace(' selected=""', ' selected="selected"')
        open(os.path.join(OUT, name), "w").write(s)
        print(name, len(s) // 1024, "KB", "height", h)
