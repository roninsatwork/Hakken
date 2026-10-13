# Google Analytics — conversions counted back in time

**Proposed 2026-10-13. Status: plan only, nothing built.** Anthony chose this
("go with a") from three options; waiting for his go to build. Change a
decision here, with a date, before building anything that disagrees with it.

## Why

On 12 Oct an enquiry came through the ronins.co.uk contact form, and Google
Analytics recorded it as `contact`. Hakken never showed it as a conversion. The
tracking was fixed on 13 Oct ([conversion-checks-plan.md](./conversion-checks-plan.md)),
but the fix only works from that day on. Anthony: "Backfilling past enquiries
is a separate plan", then "go with a".

**Why the past is missing.** Google still has every past `contact` event: 179
in 12 months, 67 of them from the United Kingdom. Hakken doesn't count them
because it counts conversions with Google's **key-event count**
(`EVENT_METRICS`, `convex/googleAnalyticsLists.ts`). That count:

- exists only for events marked as key events in Google Analytics
- starts on the day an event is marked
- is never worked out for the past

So an event that becomes a conversion today has no history in Hakken, on any
screen.

**What Hakken keeps today:** each event's daily total for a year (the event
lists), but not split by page or channel. So it can't rebuild "conversions by
landing page" for last year from what it already has.

**Insights already counts the other way.** Its figures for each counted event
use Google's plain event count (`ga.counted.*.times`), so Insights and the
Google Analytics screens can already give different numbers for one
conversion. Option A makes them agree.

## The options Anthony chose between (2026-10-13)

| | What you'd get | Cost |
|---|---|---|
| **A. Count from Google's plain event count, and collect the year again** (chosen) | Any event can count, key event or not. Changing what counts corrects the whole year on every screen. | Every conversion figure is worked out a new way. One full re-collection per website. |
| B. Fix only the daily totals | The charts are right for the past | Pages and channels stay forward-only, so screens disagree |
| C. Leave the past | Nothing to build | Charts mix link clicks (before 13 Oct) with real enquiries (after) |

## 1. Decisions

- **BT1 — A conversion is counted with Google's own count of the event, for
  every date Hakken keeps,** not with Google's key-event count.
  - **An event Google counts once per event** (most of them): each time it
    happened (`eventCount`).
  - **A key event set to count once per visit:** the visits it happened in
    (`sessions`, split by event). That matches Google's own figure.
  - **Hakken reads which is which** from the key event's own setting
    (`countingMethod`), which it already reads with the key events.
  - **The value** stays Google's own (`eventValue`) or the one set in Hakken,
    as today; a purchase is still worth its revenue.
- **BT2 — Any event that reads as an enquiry can count, key event or not.**
  "Choose what counts" lists Google's key events, as today, and every event
  that reads as an enquiry (the words rule check 11 uses: `contact`,
  `enquiry`, `quote`, `call`, `chat`, `book`…) seen in the last 12 months.
  - Those not marked in Google Analytics carry the existing grey note line:
    "Not a key event in Google Analytics: Hakken counts it from Google's own
    figures."
  - Tracking health's check 11 then always has the same fix, "choose it on the
    Connection page", and the "Hakken can't mark it, its access is read-only"
    wording goes.
- **BT3 — Changing what counts corrects the whole year at once.** Hakken keeps
  each listed event's counts on every row, as it keeps every key event's today.
  - **Ticking or unticking a listed event** re-prices all history immediately,
    with nothing to collect.
  - **A newly listed event** (one seen for the first time) starts a fresh
    collection of the website, so its history is filled in.
- **BT4 — One fresh collection per website, once, when this ships.** It runs
  through the same steps as a website's first collection: 60 days by day and
  device, then the 7-day, 30-day, 90-day and 12-month lists, the span before
  and the year before.
  - **It runs itself,** one website after another, and hands itself on at time
    limits like every other run. No person starts or watches it.
  - **The old figures stay on screen** until each list's new figures replace
    them, so nothing goes blank.
- **BT5 — No conversion counted twice by mistake.** On "Choose what counts",
  ticking an event that a counted conversion matches day for day (Ronins'
  "Form sent", now rebuilt from `contact`) shows the existing note line: "Form
  sent is a copy of Contact: count one of them." Hakken doesn't untick
  anything itself.
- **BT6 — The same count everywhere.** These places also ask Google for
  conversions and move to BT1's count:
  - each page's own story (`googleAnalyticsPageStoryAsk.ts`)
  - Insights' history (`insightHistory.ts`)
  - Live

  Insights already uses the plain count, so after this the Google Analytics
  screens, a page's story and Insights give one number for one conversion.

## 2. For ronins.co.uk

**Recommended: count `contact` ("Contact") and stop counting `form_submission`
("Form sent").**

- **Why:** `contact` has always been the real form sends. `form_submission`
  was link clicks until 13 Oct and is a copy of `contact` since.
- **The result:** the whole year's conversions by page and channel show real
  enquiries, Fiona's of 12 Oct included.
- **It's a choice on Ronins' Choose what counts page:** Anthony's to make, or
  done for him on his word.

## 3. Limits — every one, said up front

- **Only events that read as enquiries are offered,** beside Google's key
  events. An event with an unusual name (`ronins_x_done`) has to be marked as
  a key event in Google Analytics to be offered. The words list grows as such
  names are met.
- **12 months, and the year before them, as Hakken keeps today.** Nothing
  older is collected.
- **Hakken's figure differs from Google's own key-events column** for an event
  before the day Google started counting it as a key event. That is the
  point; Choose what counts says so.
- **Visitors who refuse cookies** are not in Google's figures, past or
  present.
- **The fresh collection** takes a website's first collection's time, minutes
  for most. A website's figures may update list by list while it runs.

## 4. Cost

- **Convex.** All of ronins.co.uk's Google Analytics data on dev is about
  0.8 MB (225 kept lists, 224 list markers, 320 kept days; measured
  2026-10-13). A fresh collection rewrites about that much once: a fraction
  of a penny a website. A few more events' counts on each row add little.
- **Google.** The same few hundred requests as a website's first collection,
  well inside the Data API's free daily allowance for a property.

## 5. Phases and man-days

| Phase | What | Days |
|---|---|---|
| 0 | A drawing of "Choose what counts" with Ronins' events: key events, `contact` not a key event, and the copy note. One picture, for Anthony to agree | ¼ |
| 1 | Collection counts with BT1 (`eventCount`, or visits for a once-per-visit key event) for every listed event | 1 |
| 2 | "Choose what counts" lists enquiry-like events from 12 months with their notes (BT2, BT5); check 11's fix simplified; English and Italian | 1¼ |
| 3 | The fresh collection: once per website when this ships, and when a new event is listed (BT3, BT4), old figures kept until replaced | 1 |
| 4 | A page's story, Insights' history and Live on the same count (BT6) | ½ |
| 5 | Tests; run on ronins.co.uk; compare Hakken's 12 months of Contact with Google's own Events report (67, United Kingdom); every Google Analytics screen and Insights in Chrome | 1 |
| 6 | The full `npm run check` and GitHub's steps once, before any commit | ½ |
| | **Total** | **about 5½ days** |

## 6. The drawing (phase 0) — 2026-10-13, waiting for Anthony

[choose-what-counts.png](../assets/conversions-back-in-time/choose-what-counts.png):
ronins.co.uk's own "Choose what counts" page, copied from the running app on
localhost:3000. Only rows and words were changed, so every part, colour and
font is the app's own.

**What's new on it:**
- **The description** names "its other events that read as an enquiry".
- **A Contact row,** made from the page's own Form sent row: ticked, 3 in the
  last 30 days, £20 set in Hakken.
- **Two note lines on Contact,** in the page's existing note style: "Not a key
  event in Google Analytics: Hakken counts it from Google's own figures, for
  the whole year." and "Form sent is a copy of Contact: count one of them."
- **The line under the list:** "What counts, and a value set in Hakken, apply
  to all history: past months change at once."
- **The Save button:** "Save · 5 counted".

**It shows the moment Contact has just been ticked** with Form sent still
ticked, so the copy note shows. Saved with Form sent unticked (§2), that note
goes.

## 7. Built — 2026-10-13, on dev, not committed

Anthony: "ok cool go" after the drawing.

**Phases 1–4 built:**

- **The count (BT1).** Every list's counted events are asked for Google's
  own count, value and visits (`EVENT_METRICS`: `eventCount`, `eventValue`,
  `sessions`). A key event Google counts once a visit (`countingMethod`,
  read with the key events) is counted by its visits (`joinAsks`, `perVisit`).
  - **No new risk from asking for visits:** visits split by event were
    already asked for every event list.
- **What counts (BT2, BT5).** `readWhatCounts` also lists the events that
  read as enquiries seen in 12 months: at most 20
  (`MOST_ENQUIRY_EVENTS`), the most seen first, after the key events.
  - **Each event carries two flags:** `keyEvent` and `perVisit`.
  - **Ticked for the client:** an event that is not a key event is ticked at
    first only when no key event is, so a key event built from it is never
    counted beside it.
  - **On the page:** the note under an event that is not a key event, and
    the copy note when two ticked events count the same day for day (`copies`,
    worked out with each health check, `COPY_DAYS` = 3).
  - **Wording of the copy note:** "X is a copy of Y" when a key event matches
    one that is not, otherwise "X and Y count the same, day for day". The
    drawing's wording, made safe for two key events.
  - **Check 11's fix** is now always "choose it on the Connection page".
- **The fresh collection (BT3, BT4).** Each connection carries `countedWith`
  and `listedWith`. A connection not yet counted this way is collected again,
  whole, on its next run: the 60 days and every list.
  - **Listed first:** one not yet listed this way has its events read first,
    which then starts the run.
  - **When it finishes:** the run marks the connection and forgets Insights'
    two month-by-month kinds (`forgetCountedHistory`), so they are asked
    again.
  - **When a newly listed event appears** on a connected website, it starts
    the same fresh collection.
- **One count everywhere (BT6).**
  - A page's story, Insights' history and Live's lists ask the same count.
  - Insights' "pages read before an enquiry" now asks visits by page and
    event, instead of Google's share of visits with a key event, which only a
    marked key event has.
  - Changing what counts also forgets Insights' month-by-month kinds.

**Phase 5, on ronins.co.uk (dev deployment, 2026-10-13):**
- **Listing:** its events listed the new way. Contact is listed as no key
  event, 3 in the last 30 days, and left unticked (Anthony's choice to make,
  §2).
- **Ronins' key events:** Form sent, Live chat, Phone and Email all turned
  out to be set to count once a visit in Google Analytics, so they are
  counted by their visits.
  - **Form sent over 12 months:** 209 times, 168 visits.
  - **Last 30 days:** still 7, so Conversions still reads 7 and £140.
- **The fresh collection:**
  - **First attempt:** collected the 60 days, then Google answered "too busy"
    during the lists. The next try is the design, and the failure now records
    Google's own words.
  - **Second attempt:** finished in about four minutes, 371 asks and 10,896
    rows, and the connection is now marked as counted the new way.
- **Contact's year is held on every row.** It totals 68 on the 12-month
  landing pages, channels and totals lists, the same as the 12-month events
  list. That's the 67 found earlier plus the enquiry of 12 Oct, United
  Kingdom only.
  - So ticking Contact re-prices the whole year by page and channel, with
    nothing collected.
- **No copy pair yet:** Google's figures run to 12 Oct, and Form sent only
  began copying Contact on 13 Oct. The note appears once 3 days match.
- **Screens checked in Chrome:**
  - Choose what counts, as drawn.
  - Tracking health's check 11: "Contact happened 68 times in the last 12
    months, but nothing counts it as a conversion", with "choose it on the
    Connection page" and its button.
  - Conversions, unchanged.

**Ronins switched (Anthony, "yes please", 2026-10-13):** Contact counted at
£20, Form sent no longer. Conversions for the last 30 days now read 3 and £60,
a 1.2% conversion rate, against 2.0% for the 30 days before. All three
enquiries landed on the homepage, where the link clicks had credited
/ai-agency/ and /venture-studio/.

## Change log

- **2026-10-13** — Proposed. Anthony chose option A over B and C.
- **2026-10-13** — Phase 0's drawing made (§6), for Anthony to agree.
