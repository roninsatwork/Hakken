# Add Company — its own page, with the company's website

**Planned 2026-10-19. Status: built on dev 2026-10-19 (go given the same day); the local check, coverage, lint, smoke tests and build all passed; not committed.**

## Where this came from

Anthony, 2026-10-19, on the Add Company pop-up: "i really hate this screen",
"The company system directives - WTF is that", "can we have a better UX than a
pop up". Three page designs were drawn on the canvas
[Add Company as a page](https://claude.ai/artifact/FQUDAwyanjvZWi1ppnws4K).
He chose board 3: "Go with board 3, name and website", then "Go. Build board 3
as planned."

A copy of board 3 and its picture is in
[docs/plans/assets/add-company-page/](../assets/add-company-page/). Change a
decision here, with a date, before building anything that disagrees with it.

## What it is (AC1–AC6)

- **AC1. A page, not a pop-up.** Manage Companies → Add Company opens
  `/admin/companies/new`: a back row to Manage Companies, **Company Name** and
  **Website address**, both needed, then Cancel and **Add company**. Under the
  address, the lines Add website already shows: what it will be saved as, and
  whether it is new to Hakken or already in it.
- **AC2. One save.** Adding creates the company and holds the website as its
  own, in one save: an address that is not a website creates nothing. The
  website is held the way the Websites tab's Add website holds one
  (`addCompanyWebsite`), through the same code, never a copy.
- **AC3. Then the company.** Adding opens the new company, as clicking its row
  on Manage Companies does.
- **AC4. Nothing else is asked.** A new company starts with no plan and with
  Tasks, Calls, Reception and Wiki switched on, as before. Plan is changed on
  its Overview tab, the four sections on its Features tab, and the assistant's
  extra instructions (the old "Company System Directives") on its AI tab.
- **AC5. The pencil opens Overview.** The pencil on a company's row opens its
  Overview tab, which edits its name and plan. The old Add/Edit pop-up is
  removed; the "Delete company?" yes/no pop-up stays.
- **AC6. It starts nothing new.** As for a website added on the Websites tab
  today: the company's paid search collection stays off until switched on, and
  the Insights team includes the website in its next weekly run, as it does
  every company's own website.

## Out of this build

The two Add website pop-ups (Admin → Websites, and a company's Websites tab)
also hold fields. They are to be drawn as pages separately, for Anthony to
decide.
