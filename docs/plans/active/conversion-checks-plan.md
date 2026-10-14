# Google Analytics — Tracking health checks what each conversion really is

**Proposed and built 2026-10-13, on dev, not committed (§6).** Anthony: "do
it", then "yes" to the one-voice change in §6. Change a decision here, with a
date, before building anything that disagrees with it.

## Why

Anthony, 2026-10-13: an enquiry came through the ronins.co.uk contact form on
12 Oct (13:07) "but i dont see it as a coverison in teh google analytics
seciton", then "can you check hat all conversion are wired up correctly please
as i am sure we are missign live chats from coming through too". Asked whether
Hakken should catch this on its own: "plana it".

**What was wrong on ronins.co.uk** (found and fixed the same day, Tag Manager
version 19 and one Google Analytics rule):

- **Form sent counted link clicks.** `form_submission` was a Google Analytics
  "created event" built from any event called "Click", which is Google's own
  event for a click on a link to another website. Over 12 months the two
  matched exactly: 342 times, 270 people. So the 7 conversions and £140
  Hakken showed for the last 30 days were 7 link clicks.
- **The real forms were never counted.** Contact Form 7 sends `contact`
  (through Site Kit) when a form is actually sent: 179 times in 12 months,
  including the enquiry on 12 Oct. It was not a key event, so Hakken never
  offered it.
- **Chat, phone and email never reached Google Analytics.** They were still
  sent by Universal Analytics tags, which Google switched off. Hakken counted
  all three, and all three were zero for a year.

**What Hakken said about it.** Conversions and Events said "Live chat started,
Phone number clicked and Email address clicked are counted too, but none
happened … try them yourself" and linked to Tracking health. Tracking health
said nothing about them: its nine checks look at visits, referrals, addresses
and page views, and none asks whether a conversion is what its name says.
Nothing said that "Form sent" was link clicks, or that real forms were being
missed.

## 1. Decisions

- **CC1 — Three new checks on Tracking health**, run with the other nine
  (when a website first connects and every week), read from the lists Hakken
  already keeps. Nothing new is asked of Google, and no new list is collected.
- **CC2 — Check 10, "A conversion is really something else".** A counted
  conversion whose count matches an event that is never a conversion, day
  for day:
  - **The rule.** Over the last 30 days, on every day either of them
    happened, the conversion's count equals the other event's, on at least
    **5** such days.
  - **"Never a conversion"** is Hakken's existing list (`NEVER_TICKED`):
    clicks on links to other websites, scrolls, page views, visits starting,
    first visits, engagement, file downloads, video plays, site searches.
  - **A conversion copying another conversion passes.** `form_submission`
    built from `contact`, as ronins.co.uk now is, is correct.
  - **It names both, in the reader's words.** For example: "Form sent is
    counting Clicked a link to another website: they match on all 7 days they
    happened."
  - **Why it matters:** the conversions and their value count something else,
    so every conversion figure for the website is wrong.
  - **How to fix it:** the conversion is built from the wrong event, either in
    Google Analytics (Admin → Events → Custom configurations → Customised
    events) or by a tag that fires on the wrong click. Rebuild it from the real
    enquiry.
- **CC3 — Check 11, "An enquiry is happening but isn't counted".** An event
  that Hakken knows is nearly always an enquiry (its existing
  `LIKELY_CONVERSIONS` list: `contact`, `generate_lead`, `form_submit`,
  `chat_started`, `click_to_call`, `request_quote`…) happened in the last 30
  days, isn't counted, and no counted conversion copies it (the CC2 rule).
  The fix depends on where it stands:
  - **It is a key event in Google Analytics, just not ticked in Hakken.** The
    row offers the existing "Choose what counts" button, as check 1 does.
  - **It is not a key event.** It must be starred as a key event in Google
    Analytics (Admin → Events), then chosen on Connection. Hakken can't do this
    itself, because its access to Google Analytics is read-only; the words say
    so as access Hakken lacks, not as the client's job.
- **CC4 — Check 12, "A conversion never happens".** A counted conversion with
  no times in the last **90 days**, on a website with at least **300 visits**
  in those 90 days.
  - **Why 90 days and 300 visits:** a real but rare conversion (a phone call a
    month on a small website) is not flagged.
  - **How to fix it:** try it as a visitor, in a private window (some
    WordPress setups switch Google Analytics off for anyone logged in), and
    look for it in Google Analytics' Realtime report. If it doesn't arrive, the
    tag that sends it is missing or broken.
  - **One voice:** this is the check that Conversions, Events and Connection
    already point to ("try them yourself", "check the silent ones"), so their
    link finally lands on a check that says the same thing.
- **CC5 — Shown where the other checks are.** Each new check is a Tracking
  health row in today's layout (what's wrong, why it matters, how to fix it)
  with no new parts. They also appear in What Hakken sees on Tracking health,
  in the tracking line on Overview and the Google Analytics list, and in the
  bell. The bell tells the platform's super admins once when a check starts
  failing, never the company's own admins, as with the other checks.
- **CC6 — Words.** Plain, a conversion's own name ("Form sent", "Clicked a
  link to another website"), never "key event" on its own. English and
  Italian together.

## 2. Limits — every one, said up front

- **The numbers:** 5 matching days in 30 (check 10); the last 30 days (check
  11); 90 days and 300 visits (check 12). All are named constants beside the
  existing ones in `convex/googleAnalyticsHealth.ts`.
- **Check 11 only knows the names on its list.** An enquiry event a website
  names in its own way (`ronins_enquiry_sent`) isn't recognised until the name
  is added. The list grows as new names are met, as it did for Ronins' four on
  10 Oct.
- **Check 10 only compares against events that are never conversions.** A
  conversion built from another real conversion passes, by design.
- **Hakken only sees what reaches Google Analytics.** A tag that sends
  nothing at all, for an event Hakken has never seen and doesn't count, is
  invisible to it. Visitors who refuse cookies are never counted, as now.
- **Extra page views from clicks** (ronins.co.uk sent two on every click until
  today) get no new check. The existing check 9, "Counted again", catches it
  page by page where it shows.
- **The past stays as Google counted it.** Fixing a conversion corrects the
  figures from the day of the fix. See the question in §5.

## 3. What ronins.co.uk would have shown

On the data up to 12 Oct, before today's fix:

| Check | Result |
|---|---|
| 10 · A conversion is really something else | Failing: Form sent matches Clicked a link to another website |
| 11 · An enquiry is happening but isn't counted | Failing: Contact, 3 times in 30 days, not a key event |
| 12 · A conversion never happens | Failing: Live chat started, Phone number clicked, Email address clicked |

After the fix, all three should pass once the new data comes in. Check 12 may
keep failing for a while if nobody calls, emails or chats.

## 4. Phases and man-days

| Phase | What | Days |
|---|---|---|
| 1 | The three checks in `googleAnalyticsHealth.ts`, their names in `HEALTH_CHECKS`, tests with Ronins' shape (a copy of clicks, an uncounted `contact`, three silent conversions) and a website that passes | 1 |
| 2 | Words: each row's what's wrong, why and how to fix; What Hakken sees on Tracking health (order and steps); the bell; English and Italian | 0.5 |
| 3 | Screen: check 11's two fixes (the button, or the access note); Overview's and the list's tracking line count; the drift tests that hold the words | 0.5 |
| 4 | Run the checks on ronins.co.uk's kept data, compare with §3, look at every screen in Chrome | 0.25 |
| | **Total** | **about 2¼ days** |

Verification: the affected tests while building, then `npm run check` and
GitHub's own steps once before any commit. Nothing is committed or pushed
without Anthony asking.

## 5. One question before building

**Should Hakken count conversions back in time?** Today Hakken counts a
conversion with Google's key-event count, which Google starts only on the day
an event is starred and never works out for the past. So the enquiry of 12 Oct,
and the 179 forms of the last year, will never show as conversions, even now
they are counted.

Hakken also keeps every event's plain count, every day, for a year. Counting
conversions from that would mean:
- any event can be counted without changing Google Analytics
- choosing what counts re-prices the whole year at once, Fiona's form included

It changes how every conversion figure is worked out on every screen, and the
lists would need collecting again. So it's its own piece of work: **a separate
plan, sized then** (recommended). It isn't part of the 2¼ days above.

## 6. Built — 2026-10-13

**Changed while building, agreed with Anthony the same day ("yes").** Insights'
Measurement check already worked out two of these itself, with other rules
(12 months), so the two pages could have disagreed about one website. So:

- **CC7 — Tracking health is the one place these are worked out.** Insights'
  "Every way to enquire is counted" reads check 12, and "Every way to enquire
  is ticked" reads check 11, as it already read value, unknown visits and
  referrals. Until a website's Tracking health has run once with the new
  checks, Insights works them out from its facts as before.
- **CC3 changed: an enquiry is known by the words in its name**, as Insights
  knew it (`readsAsEnquiry`, `convex/utils/analyticsEvents.ts`: contact,
  enquiry, quote, call, phone, email, chat, book…, never Google's own events).
  A website's own name (`ronins_enquiry_sent`) is now found too.
  - **The window and floor are now Insights' too:** 10 times or more in 12
    months, so one stray test event says nothing.
- **CC4 changed: none in 90 days on a website with 300 visits or more in
  them, or none in 12 months on a quieter one.** That way a small website is
  still judged.
- **CC2 and CC3 made exact: "day for day" is counted back from the newest
  day either event happened, to the last day they differed.** Check 10 needs
  5 such days. A conversion rebuilt today passes from the first day it differs
  from the clicks, and check 11 treats an enquiry as counted once a counted
  conversion matches it on the newest day it happened.
- **Check 9's missing words.** "Counted again" had no sentence or fix in What
  Hakken sees, so a failing check 9 would have shown a gap there. Added. The
  test now goes through every check Tracking health has, so the next one
  can't miss its words.

**Where it lives:**
- `convex/googleAnalyticsHealth.ts`: the three checks, each a function of
  its own, and their bell words.
- `convex/googleAnalyticsSchema.ts`: the checks' names, plus `others`, the
  event a conversion really is.
- `convex/utils/sees/analytics.ts`: What Hakken sees.
- `convex/utils/insightMeasurement.ts`: Insights reading the checks.
- `useHealthWords.ts` and the Tracking health page: the words, and "Choose
  what counts" when the enquiry is already a key event in Google Analytics.
- Words in English and Italian.

**Checked on ronins.co.uk's own data**, up to 12 Oct, by running Tracking
health on the dev deployment: 6 of 12 checks failing.
- **Check 10:** "Form sent" matches "Clicked a link to another website" on
  each of the last 6 days.
- **Check 11:** "Contact", 67 times in 12 months. That's the United Kingdom
  only, as every figure here; Google's own 179 counts every country.
- **Check 12:** Live chat, phone and email, none in 90 days.
- **Check 9 failing too:** 7 pages, most likely the two extra page views a
  click sent until Tag Manager version 19.

**Tests:**
- the three rules on Ronins' shape before and after the fix
- What Hakken sees for every check
- Insights reading the checks, and its fallback
- the screen's words and button
- the collection run end to end (a counted "sign_up" that never happens)

**Not run yet:** the full `npm run check` and GitHub's steps, which come once
before any commit. Nothing is committed.

**Row order on the page** (Anthony, "yes"): failing rows used to show in the
order the checks were added, so the conversion checks came last. They now
follow the same costliest-first order What Hakken sees uses, from one list
(`inCheckOrder`, `convex/utils/sees/analytics.ts`). On ronins.co.uk: Each
conversion is what it says, Little is unknown, Every enquiry is counted,
Every conversion happens, then the rest.

## Change log

- **2026-10-13** — Proposed, after the ronins.co.uk tracking was found and
  fixed the same day (Tag Manager version 19; `form_submission` rebuilt from
  `contact`).
- **2026-10-13** — Built, with CC7 and the changes to CC2–CC4 in §6. Anthony
  agreed them before any code was written.
- **2026-10-13** — Anthony: "Backfilling past enquiries is a separate plan" —
  §5's question answered; to be discussed after this build.
- **2026-10-13** — Built that plan, [conversions-back-in-time-plan.md](./conversions-back-in-time-plan.md).
  Every event that reads as an enquiry is now listed on the Connection page
  and counted from Google's own figures, so CC3's fix is always "choose it on
  the Connection page". The "mark it as a key event; Hakken's access is
  read-only" wording has gone (BT2).
- **2026-10-13** — Anthony: "can you fix that". Check 11 advised counting
  Ronins' "Form sent" (209 in 12 months), which was still its link clicks in
  the days kept, and another session began building on that advice. Check 11
  now passes over an event that matches one never an enquiry on 5 days in a
  row (check 10's rule, `lookalikeOf`). Choose what counts says so on that
  event's row, ticked or not ("Form sent counts the same as Clicked a link to
  another website…"), and its What Hakken sees no longer says to tick it.
  Ronins' Tracking health re-run on dev: 4 of 12 checks need a look, check 11
  passing.
