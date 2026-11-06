---
product: Hakken
documentation_type: end-user guide
feature_area: public home page and sign-in entry
audience: visitors, support and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/public-website.md
last_reviewed: '2026-11-05T08:51:08+00:00'
reviewed_against: current implementation
status: Current
---
# Public Website

> **Product:** Hakken · **Document type:** end-user guide · **Feature area:** public home page and sign-in entry
> **Reviewed:** 5 November 2026, 08:51:08 GMT (Europe/London)
> **Source path:** `docs/end-user/public-website.md` · **Status:** Current

## What the public website is

The public Hakken website is the page at `/`, before you enter a company workspace. It introduces Hakken and provides Sign in links. The current page uses the application's dark look, with the words on one side and an animated rain field on the other. On a narrower display the two areas stack. The earlier cream landing page, multi-section navigation and contact footer have been removed from the active page. Instructions referring to those old elements no longer describe the current visitor journey.

The home page is public: reading it does not show customer data, private reports, conversations, company settings or platform administration. It explains the product rather than performing an analysis for an anonymous visitor. A description of what Hakken aims to do is not proof that every part is available in a particular account or that a live integration has been accepted. [PRODUCT.md](../../PRODUCT.md) remains the authority for intent and the implemented/planned distinction; the [documentation inventory](../index.md#documentation-coverage-inventory) records known discrepancies for separate decisions.

This guide reflects static source review on 5 November 2026. No browser was opened, account was created, sign-in email was requested or live service was tested for this documentation pass. Use it to understand the current entry points, then check account-specific availability inside the application. Local implementation and a successful customer login are different kinds of evidence.

## What the home page contains

The page names Hakken and shows the progression Found, Visited, Converted, Won. Its introductory words describe agents doing the work of an SEO firm and examining pages, listings and feeds. Treat that paragraph as public positioning. It is not a public report of your website's performance and does not display a personal score, estimated return or account entitlement. Nothing on this home page connects a Google account or purchases a supplier observation.

There are two Sign in links: the main action below the introduction and a quieter link over the rain area. Both go to `/login`. There is no longer a public navigation drawer with a separate contact action, a row of product foundation sections, a pricing comparison, or a contact form on the home page. The copyright remains visible. If you remember an old screenshot showing those earlier sections, begin with the current link rather than trying to find a hidden mobile version of them.

The page is intended to occupy a single desktop screen, but screen size, zoom and text settings can change how much scrolling is needed. On a phone, stacked content can extend below the first screen. That is not evidence of a second product flow. The decorative rain does not accept account information or change the business state. With reduced motion enabled, it becomes still rather than requiring you to interact with an animation before signing in.

## Sign in to the correct workspace

Choose Sign in to reach the login page. The reviewed login offers Google sign-in and email-based paths, including a sign-in link and a six-digit code. Use the identity associated with your Hakken account and company. The public page cannot tell you which private company access you have, and seeing a login option does not grant company-admin or super-admin privileges. Those permissions are determined after authentication by the account and backend policies.

For local development, the normal application address is `http://hakken.localhost:3000`. Its distinct hostname is required by the configured development sign-in return and keeps these cookies separate from other local apps. A browser test server using its own port and hostname is a separate controlled testing setup. Support should not tell a normal user to switch to plain localhost as a general login repair. Production users should use the deployment address supplied for their actual account.

A protected link can carry a return destination so you reach the relevant application area after sign-in. Use the application's own links. If a destination cannot be accepted, the application sanitizes it rather than treating arbitrary return text as authority to send someone to another site. Signing in still does not bypass company ownership, plan checks or website connection prerequisites on the page you ultimately reach.

## Use an email link or code

When choosing the email-link path, enter your address and follow the login screen's instructions. Delivery depends on the configured sign-in provider and email service. A completion message is not confirmation that a particular inbox has received the mail, nor does it disclose whether an address belongs to an existing user. This is intentional: sign-in feedback should not let a stranger enumerate accounts.

The code path offers six digits that can be entered in separate boxes. Typing moves between boxes; pasting a complete code can fill them together. Check that the code belongs to the current request and email address. A code is time limited and cannot be retried indefinitely. The reviewed service allows ten minutes and limits failed attempts. The interface can refuse a code without saying whether it was wrong, expired or already used, so do not interpret a general refusal as proof that the company account was removed.

If a fresh request is needed, use the login controls rather than repeatedly submitting an old code. Requests are throttled, and an apparently normal acknowledgement can still occur when another message is not sent. Repeatedly requesting mail can make troubleshooting harder. Never share the code, sign-in link or session token in a support ticket; explain the visible state and approximate time instead.

The email-link verification page and the code path are different entry mechanics for the same account system. The verification page has its own state and confirmation behaviour. Opening an email link is not the same as granting a new company permission or changing a subscription. For the complete account workflow and permission model, read [Login, Access, And Authentication](./login-access-and-authentication.md).

## Contact links and deployment settings

The current home page has no Talk to us action and does not read the old contact destination setting. It therefore does not offer a fallback `/contact` page. A deployment setting left from the earlier public site does not restore that removed button or create a route. If sales or support wants a contact flow, that is a product change requiring its own discussion and implementation; documentation maintenance cannot create it by promising a link.

Likewise, the home page is not a billing portal, demo launcher or public client directory. Company administrators manage subscriptions through the user application's Billing settings where enabled. Platform setup is separate. Do not send someone looking for an invoice to a nonexistent home-page pricing or contact section, and do not infer paid status from being able to load the public page.

## Related pre-sign-in pages

Some other screens share the rain layout without being part of the marketing home page. Login, email verification and unsubscribe have their own purposes and security rules. An unsubscribe link can work without a signed-in session because its token supplies the required proof. The browser page asks for confirmation before changing the selected communication preference; merely loading that page is not the same as confirming it. A mail client's one-click unsubscribe uses a separate backend endpoint.

For email preferences and delivery, use [Emails](./emails.md). Changing a communication preference does not sign you out, delete a company, remove saved reports or cancel a subscription. A copied link can also become incomplete or unusable. Describe that state plainly to support without posting its token. The public home page cannot diagnose or repair an unsubscribe token.

## Practical support and accessibility checks

If Sign in appears to lead back to login, record the hostname, whether you used Google, a link or a code, and the safe path you intended to reach. Do not record query parameters that contain credentials. Check that you are using the intended deployment and account before attempting another setup. Operators need to distinguish a frontend navigation problem, a failed email delivery and a backend authorization refusal; the same final screen can arise from different causes.

For a display problem, note the device size, browser zoom and reduced-motion setting. Both Sign in actions should remain understandable without relying on the animation. The source includes look tests for the home and login states, but this review did not execute them or claim every browser is visually verified. Engineers should use [Public Website Developer Guide](../developer/public-website.md) for component ownership, configuration boundaries and the relevant verification sources.
