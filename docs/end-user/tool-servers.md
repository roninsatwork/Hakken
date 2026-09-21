# Tool Servers

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

Nothing breaks. Whatever the reason, it is written against the server and shown
on the screen: the server did not answer, it answered too slowly, the login is
missing, it speaks a version Hakken does not support, or it offers no tools at
all.

Connected servers also appear on your **Connections** screen, alongside your
mailbox, phone line and AI providers — so a server that has stopped answering
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
