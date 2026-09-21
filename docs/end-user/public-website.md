# Public Website

Last reviewed: 2026-07-30 17:39 BST +0100
Status: current for the implemented home page; broader public site still in progress
Audience: sales, support, operators, and customer-facing teams explaining the pre-login Hakken site.

## What The Public Website Is

The public website is the pre-login Hakken experience at `/`. It explains Hakken
to someone who has not signed in yet. The current live public surface is a
single home page with a different visual style from the logged-in app: a warm
cream public layout, a forest-coloured hero panel, large editorial typography,
animated product-style visuals, and calls to talk to the team.

This page is not the authenticated Hakken dashboard. It does not expose customer
data, admin controls, agent configuration, workflows, reports, property records,
or Posture Studio recordings. It is a public sales and explanation surface.

The public site currently focuses on one message: Hakken is the production layer
behind AI products. It describes the foundations that already exist in the
platform, including workspaces, knowledge, model routing, assistants, agents,
workflows, APIs, webhooks, widgets, evals, memory, approvals, observability, and
cost control.

## What Is Live Today

The implemented public site currently includes:

- the public home page at `/`
- a public navigation bar with the Hakken wordmark, Sign in, and Talk to us
- a mobile navigation drawer with Sign in and Talk to us
- a hero section explaining the product category
- a "What Hakken is" section that breaks the platform into five foundations
- a proof section showing three product examples: Properties, Reports, and
  Posture Studio
- a "Who it is for" section explaining which teams benefit from Hakken
- the name story: Hakken means preparedness
- a closing call to get in touch
- a footer with contact and sign-in links plus the configured company credit

The home page is designed to be read before a buyer or partner has seen the
logged-in app. It presents Hakken as a foundation for building governed AI
products rather than as a single-purpose assistant.

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

The product proof section shows three built product areas:

- Properties, showing property collection and analysis
- Reports, showing board-report style output
- Posture Studio, showing movement and posture proof

These are examples of what can be built on Hakken. They should be explained as
proof that the foundation exists, not as the only possible uses of the platform.

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

## What Is Not Live Yet

The broader public website is still active work. The plan includes:

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
- [Public Website Plan](../plans/active/public-website-plan.md)
