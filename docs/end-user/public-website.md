---
product: Hakken
documentation_type: User guide
feature_area: public home page and contact entry points
audience: sales, support and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/public-website.md
last_reviewed: '2026-10-26T10:52:01+00:00'
reviewed_against: current implementation
status: Current
---
# Public Website

> **Product:** Hakken · **Document type:** User guide · **Feature area:** public home page and contact entry points
> **Reviewed:** 26 October 2026, 10:52:01 GMT (Europe/London)
> **Source path:** `docs/end-user/public-website.md` · **Status:** Current


## What The Public Website Is

The public website is the pre-login Hakken experience at `/`. It explains Hakken
to someone who has not signed in yet. The current repository public surface is a
single home page with a different visual style from the logged-in app: a warm
cream public layout, a forest-coloured hero panel, large editorial typography,
animated product-style visuals, and calls to talk to the team.

This page is not the authenticated Hakken dashboard. It does not expose customer
data, admin controls, agent configuration, workflows, reports, property records,
or Posture Studio recordings. It is a public sales and explanation surface.

The current page still presents an inherited framework message: Hakken is the production layer behind AI products. This is visible implementation copy, not a replacement for PRODUCT.md's business-asset discovery product intent. It describes the foundations that already exist in the
platform, including workspaces, knowledge, model routing, assistants, agents,
workflows, APIs, webhooks, widgets, evals, memory, approvals, observability, and
cost control.

## What The Current Home Page Contains

The implemented public site currently includes:

- the public home page at `/`
- a public navigation bar with the Hakken wordmark, Sign in, and Talk to us
- a mobile navigation drawer with Sign in and Talk to us
- a hero section explaining the product category
- a "What Hakken is" section that breaks the platform into five foundations
- a "Who it is for" section explaining which teams benefit from Hakken
- an inherited name-story block whose preparedness wording differs from PRODUCT.md
- a closing call to get in touch
- a footer with contact and sign-in links plus the configured company credit

The home page is read before a buyer or partner has seen the logged-in app. Its current framework positioning is a product-copy discrepancy to resolve separately; documentation maintenance does not approve a revised positioning or change the public page.

## Navigation And Calls To Action

The current navigation is intentionally short. It includes:

- Hakken wordmark, linking back to `/`
- Sign in, linking to `/login`
- Talk to us, using the configured contact destination

Public pages that are still planned, such as Platform, Built on Hakken, Trust &
Security, and Contact, are not part of the shipped public navigation yet. Those
pages are tracked in the active Public Website Plan and should not be described
to customers as available until the routes are implemented.

The Talk to us links use deployment configuration. If a deployment sets
`NEXT_PUBLIC_CONTACT_URL`, the link opens that external destination in a new
tab. If it is not set, the link falls back to `/contact`. The `/contact` page is
planned but not part of the current route list, so production deployments should
set the contact URL until the in-app contact page ships.

## The Home Page Story

The hero presents Hakken as a way to "Build agent-powered products with
governance built in." The supporting idea is that product teams should not have
to rebuild the difficult platform layer before building the customer-specific
experience.

The visual in the hero is a drawn product-style dashboard rather than a live
customer screenshot. It shows examples of agent activity, approval waiting
states, daily usage, runs, and a ledger of work. The numbers are illustrative
interface copy, not live operational data. This avoids leaking customer data and
avoids dependence on a particular demo workspace.

The "What Hakken is" section explains five foundations:

- launching AI products faster
- staying in control as AI takes action
- improving AI from evidence rather than guessing
- using the right model for the job
- seeing cost, approvals, failures, and activity

The current home-page composition no longer renders the old Properties, Reports or Posture Studio proof panels. Do not use this page as evidence that those experiences are available in this Hakken checkout. The older public website plan and dated records remain historical context; their broader route and showcase ideas are not delivered features merely because they were once described.

## Sign In

The Sign in link sends users to `/login`. The login page uses the public visual
tokens so it feels connected to the public site, but authentication behavior is
the normal Hakken sign-in behavior. Users still need the correct account and
workspace access before they can use the dashboard.

If someone cannot sign in, use the Login, Access, And Authentication guide
rather than treating the public site as the source of access rules.

## Footer And Ownership Credit

The footer explains the Hakken name and includes a company credit. The credit
text is "Powered by Ronins." If `NEXT_PUBLIC_COMPANY_URL` is configured, the
credit links externally. If it is not configured, the credit renders as plain
text.

The footer deliberately avoids hardcoded customer-specific or builder-specific
fallback URLs. This matters because Hakken can be packaged and deployed in
different contexts.

## Routes Not Found In This Checkout

The older public website plan lists the following routes, but their page files were not found in the current public route group:

- `/platform`
- `/showcase`
- `/showcase/properties`
- `/showcase/reports`
- `/showcase/studio`
- `/trust`
- `/contact`

Do not tell customers those pages are live until the routes exist. If a public
page links to one of these planned routes before the route ships, treat that as
implementation drift to resolve under the Public Website Plan.

## Related Documentation

- [Hakken Product Overview](./platform-overview.md)
- [Login, Access, And Authentication](./login-access-and-authentication.md)
- Property Research And Board Reports (not included in this copy)
- Temporary Posture Studio Demo (not included in this copy)
- [Historical public website plan](../plans/active/public-website-plan.md) — inherited design intent, not current availability

## Explain The Current Copy Without Changing Product Intent

PRODUCT.md identifies Hakken with discovery and the business goal of finding which digital assets make money, improving the broken stage and proving a result in leads and sales. The current public home page still carries framework-led language and a Japanese-name explanation about preparedness. That name explanation does not match PRODUCT.md. Support and sales should not repeat it as the approved Hakken definition. The discrepancy is recorded for a product decision; no public copy, acceptance criteria or roadmap was changed in this documentation review.

Similarly, a public illustration of a run or approval is not proof of a connected customer workflow. The drawn dashboard in the hero uses presentation numbers, labels and bars. It does not identify a real customer, show live revenue, establish a completed provider call or grant visitor access to the app. When discussing implemented functionality, use the relevant reviewed feature guide and distinguish the inherited foundation from a complete planned Hakken product outcome.

The current home-page section order is the hero, five-foundation explanation, audience section, name story and final contact call to action. The older showcase introduction and product panels are not part of that composition. A guide or sales handoff that still points to those panels is stale even if the illustration or plan once existed. Missing routes are not automatically promises of future delivery; the owner's product direction and current implementation must be reconciled separately.

## Contact, Access And Practical Limits

A visitor does not need to sign in to read the home page. Sign in opens the normal login route; it does not create a workspace, confer an admin role or enable every product area. Invite, company membership, billing and module permissions are handled after the public-site boundary. A support conversation that starts from the public page should use the authentication guide when the issue is account access.

Talk to us and Get in touch use the same configured destination. If the deployment was built with `NEXT_PUBLIC_CONTACT_URL`, the link opens that destination in another tab with the usual external-link isolation. If no destination was configured, the code falls back to `/contact`, whose page was not found. This means a displayed button can lead to an unavailable route; seeing the button is not evidence that an enquiry was submitted or received. There is no implemented contact form in the reviewed home-page group.

The footer uses product identity for its name and tagline and shows a Powered by Ronins credit. `NEXT_PUBLIC_COMPANY_URL` makes that credit an external link when present; absent configuration leaves it as text. The credit destination and contact destination serve different purposes and should not be assumed to be the same setting. Public configuration belongs to the deployment's browser build, so merely changing a runtime environment after building may not change an already shipped link.

A visitor with reduced motion enabled should receive the non-animated presentation on initial mount. The motion helper checks that preference and the generic page animation returns early; it is not a guarantee that every future dynamic preference change is observed without a reload. The public mobile menu is a small action row opened by its menu button. This guide was checked against the relevant components without running a browser or proving responsive rendering on a deployed device.

For an operator handoff, identify the actual website address, approved contact destination, responsible recipient and sign-in entry point. Keep the known missing-route and product-copy issues visible. Do not ask a customer to provide credentials, private analytics or payment information through an assumed contact flow that has not been verified. A separately authorized live acceptance check would establish reachability and delivery; this documentation pass did neither.

Implementation evidence for this review is `src/app/(public)/page.tsx`, its layout, navigation/footer/contact components, the three retained home sections and the public motion helper. Related public widget, reception, unsubscribe, login and verification routes have their own purpose and guides. The fact that a route is unauthenticated does not make it another marketing page or a proof that the Hakken product surface has been fully delivered.
