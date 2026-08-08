# Emails From Sonae

Sonae sends four kinds of email. All of them go to people who already have an
account — Sonae never emails anyone who has not been added to a workspace.

Every message is designed to be read on a phone, and every one of them tells you
what happened in its first line. If you only read the subject and the first
sentence, you should still know whether you need to do something.

Status is shown with words as well as colour. Important alert cards say things
like `Critical` or `Needs attention`, and the colours avoid green-vs-red
signalling so people with red/green colour blindness can still tell healthy,
warning, and failed states apart.

## Platform alert

**You get this when:** something on the platform needs attention — an agent
failing repeatedly, a tool that cannot reach the service it depends on, a budget
running close to its ceiling.

**It arrives:** once a day, and only if something actually needs you. A clean
day sends nothing at all.

**What it shows:** the number of things needing attention, then one card for
each. Repeats are grouped, so four failures of the same kind appear once, marked
"4 × same fault", rather than four times. Each card names what went wrong in
plain language, when it started and last happened, what to do about it, and a
link straight to the record in the app.

At the bottom it lists the checks that passed, so you can see what was looked at
and found clean.

**Who gets it:** the people your platform administrator has configured as alert
recipients. If that list is empty, it goes to whoever can act on it.

## Approval request

**You get this when:** an agent or a workflow has reached a step that needs a
person to say yes — sending a report, spending above a threshold, taking an
action that cannot be undone.

**What it shows:** what is about to happen, a summary of what was produced, and
two choices: approve it, or open it and read it first.

**If you ignore it:** nothing is sent. The run waits, and eventually expires.
Sonae will not proceed without an answer.

## Invitation

**You get this when:** a colleague adds you to a workspace.

**What it shows:** who added you, which workspace, and what you can do there.
There is no password to set — sign in with the address the invitation arrived
at and Sonae recognises you.

Magic-link sign-in emails may open a confirmation page first. Pressing the
button on that page proves a person, not a mail scanner, is spending the
one-use link. Some environments may instead use a typed one-time code.

**If you were not expecting it:** ignore it. Nothing happens until you sign in.

## Notification from an agent

**You get this when:** one of your agents has finished something worth telling
you about, and it has been set up to notify you.

**What it shows:** what the agent found or produced, and a link to the full
result.

**Worth knowing:** an agent can only email people who already have an account in
your workspace. It cannot introduce a new recipient and it cannot reach another
company, so a message like this can never be used to contact someone outside
your organisation. Every one of these says so in its footer.

## Changing what you receive

Alert recipients are managed by your platform administrator. Agent
notifications are controlled by the agent's own settings — whoever owns the
agent can change who it notifies, or turn notifications off. Approval requests
go to whoever is responsible for approving that agent or workflow.

## If an email looks wrong

Emails come from your organisation's own sending address, configured by your
administrator. If one arrives from an address you do not recognise, or asks you
to enter a password, treat it as suspicious — Sonae never asks for a password by
email, and the only links in these messages go into your own Sonae workspace.
