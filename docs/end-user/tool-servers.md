---
product: Hakken
documentation_type: user guide
feature_area: MCP tool servers
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/tool-servers.md
last_reviewed: '2026-10-26T10:03:16+00:00'
reviewed_against: current implementation
status: Current
---
# Tool Servers

> **Product:** Hakken · **Document type:** User guide · **Feature area:** MCP tool servers
> **Reviewed:** 26 October 2026, 10:03:16 GMT (Europe/London)
> **Source path:** `docs/end-user/tool-servers.md` · **Status:** Current

Some of the systems your business already uses can offer their tools to your
agents directly. Connect one, and your agents can use it — without anyone
building an integration first.

You will find this under **Artificial Intelligence → Tool servers**.

## What a tool server is

Think of it like adding a printer. You do not teach your computer how that
printer works. You give it an address, it asks the printer what it can do, and
the printer answers.

A tool server works the same way. A supplier publishes a list of things their
system can do — look up an invoice, check stock, raise a credit note. You give
Hakken the address, Hakken asks what is on offer, and those become tools your
agents can be given.

## Connecting one

Four steps, in this order. They are separate on purpose: nothing happens until
you decide it should.

**1. Connect the server.** Give it a name you will recognise and the address it
answers on. If it needs a login, enter the *reference* to that credential —
never the credential itself. Connecting does not contact the server.

**2. Ask what it offers.** Hakken contacts the server and records the list of
tools it publishes. Nothing is available to an agent yet.

**3. Add its tools.** The tools appear in your tool library, switched off.

**4. Switch the server on.**

You can then give any of those tools to an agent the same way you give it any
other tool.

## What happens if something goes wrong

Failures are recorded where the corresponding operation supports them and shown
on the screen: the server did not answer, it answered too slowly, the login is
missing, it speaks a version Hakken does not support, or it offers no tools at
all.

Connected servers also appear on your **Connections** screen, alongside other
external dependencies and AI providers — so a server that has stopped answering
turns up where you already look for things that need attention.

## What is switched on by default: nothing

Every tool that arrives from a server is switched off and set to always ask
before it runs.

That is deliberate. A server can describe its own tools however it likes, and a
supplier who wanted a tool to run without anyone looking would describe it
exactly the way a harmless one is described. So Hakken does not take a server's
word for it.

If you know a particular tool only *reads* information and changes nothing, you
can say so, and it will run without asking. That is your decision to make, not
the supplier's.

## Anything that changes something asks you first

If a tool on a connected server does anything other than look information up,
an agent must ask a person before it runs — **even an agent you have set to work
unattended**.

Every other tool in Hakken is one we built, so you can see what it does by
looking. A tool on somebody else's system is not: the supplier can change what
it does tomorrow without changing its name. So this one keeps a person in the
loop.

When you are asked to approve it, the message tells you the request is going
outside Hakken.

Looking things up is unaffected — an unattended agent can still read.

## What your agents are told

When a tool on a connected server answers, Hakken marks the answer as coming
from outside and tells the assistant to use the facts in it but not to follow
any instructions inside it.

This matters more than it sounds. If somebody wanted to trick your assistant,
the most convincing place to hide an instruction is in the answer to a question
it just asked. Hakken treats those answers the same way it treats an uploaded
document: useful information, not orders.

Images, audio and attachments a server sends back are not passed to the
assistant — it is told something came back and what kind of thing it was.

## Your data stays yours

A server you connect belongs to your workspace alone. No other company on the
platform can see it, use its tools, or reach it — and an agent working for
another company is never even offered them, whatever it has been set up with.

## Disconnecting

Disconnecting a server removes its tools from your library, and any agent using
them loses them. You will be told that before it happens.

## Access, Workspace And Credentials

The current screen is `/admin/ai/tool-servers`. It lives in platform Admin, where super admins and read-only accounts can enter permitted pages. Backend server list/read operations require an admin-reader role and an active company; writes require an admin write role. Company admins have scoped backend rights, but those rights do not grant access to the platform Admin route itself. A super admin should select the intended workspace before listing or creating servers. Do not assume a global agent automatically runs with that workspace merely because its tool binding was configured there.

For an authenticated server, entering a credential reference is only the first configuration step. The deployment operator must separately approve that company, server, exact normalized URL and reference in backend credential bindings. Without an exact approved binding, discovery and use fail before resolving the credential or contacting the destination. A server with no authentication has no such credential binding, but still faces URL and transport checks. Changing the address or credential reference can invalidate approval and needs an operator to review the new destination.

Never paste a bearer token, password or API key into the reference field. The reference points to a value held in the backend environment. The browser should not receive that value. Connecting stores the record disabled; discovery contacts the destination and can therefore use its credential. Discovery is an external operation even though it does not enable tools for agents. This documentation pass did not perform discovery or contact a server.

## Refreshing A Tool List

Discovery stores the server's current offerings. Adding them to the library rebuilds the imported tools rather than simply appending missing names. The existing imported tools and their agent bindings are removed within the implementation's bounds, and replacement tools start disabled with conservative approval settings. After refreshing, review schemas, re-enable only approved tools and reattach them where needed. Do not expect an old binding or operator classification to survive a rebuild automatically.

The displayed server name, model-facing tool name and supplier's original tool name have different jobs. Imported names are prefixed and bounded so separate servers can coexist; names that collide after normalization can be skipped. A successful discovery or import count is not a promise that every supplier offering became a distinct usable tool. Inspect the result and confirm that the intended functions are present before relying on an agent workflow.

Discovery follows at most ten list pages and admits at most two hundred tools. Responses have a size cap and individual requests have a deadline. A server that needs a different transport or protocol can fail despite having a valid-looking address. There is no automatic promise that the complete external catalog is supported. The recorded discovery note explains truncation or failure where implemented.

## Calls, Approval And Disconnecting

At execution, the run's company must match both imported tool ownership and server ownership. A run without a company receives no access to company-owned tools. The server must be connected, arguments must satisfy its published schema, and any credential grant must still match. A copied tool ID or an old binding does not bypass these checks. An allowed request still leaves Hakken and can create real effects in the supplier system after approval.

If an external call times out or returns an error, the agent receives failure information rather than a guaranteed successful result. A network failure does not prove the supplier did nothing. Check the remote system through an authorized operator process before repeating a data-changing action. Hakken's approval, timeout and untrusted-result wrapper are controls around execution, not rollback or universal exactly-once delivery.

Disconnecting removes the server, discovered entries and imported tools with bounded binding cleanup. Historical run evidence is not universally erased. If an unusually large number of agent bindings exists, the current cleanup cap requires manual verification; do not assume every historical reference vanished because the server row disappeared. Switching a server off is the less destructive choice when the intention is to pause future calls while preserving configuration.
