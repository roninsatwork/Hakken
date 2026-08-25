# The Clean Cut — turning a clone into a client's own product

**Agreed 2026-08-23.** When Ronins builds a client-owned product on Sonae, the
client should receive *their* product — not a copy of everything Ronins has ever
built with a few menu items hidden. This plan closes the gap between those two
things.

It serves the client-owned lane described in [PRODUCT.md](../../../PRODUCT.md).

---

## The goal, in one sentence

Clone the repository, run one command naming what the client bought, and what
comes out is a working product containing only that.

The cut happens **after** the clone, on the copy. The Sonae working tree is
never modified — Ronins keeps the full framework, the client gets the subset.

---

## What already exists

More of this is built than it first appears.

**A registry of what the optional parts are.** Each optional product area is a
"vertical" — currently `salesReports`, `properties`, `salesData`, `movement`,
and `arcade`, with `base` meaning the platform itself. Verticals that a
workspace can switch on are declared in `convex/utils/companyModules.ts`; the
two demo verticals with no workspace switch (`movement`, `arcade`) are named in
the cut script.

**Markers around the lines a vertical leaves in shared files.** A vertical
cannot keep entirely to itself — it puts an entry in the menu, a table in the
schema, a route in the router. Those lines carry a start and end comment naming
the vertical that owns them. They nest correctly, so a marker inside another
marker behaves.

**A script that acts on them.** `scripts/strip-verticals.mjs --keep base,X --out <dir>`
copies the repository to a new directory with every marked block for an unkept
vertical removed, and prints a report. It never touches the working tree.

**A gate that stops the markers rotting.** `--check` validates every marker —
each start has an end, nesting closes in order, each names a real vertical — and
runs as part of the standard build checks. So a half-written marker fails the
day it is written, not the day someone tries to build a client product.

## What is missing

**Whole folders are never removed.** The script only removes marked *lines
inside* files. There are no file- or folder-level markers, so every vertical's
own directory survives the cut untouched. The script's own report says so.

The practical effect is that a client build today still ships with:

| Area | Roughly |
|---|---|
| The movement demo (`src/app/(dashboard)/demos`, `src/lib/movements`) | ~394 files |
| Property tools (`src/app/(dashboard)/app/properties` plus ~9 backend modules) | ~18 files |
| The sales-data workspace (~24 backend modules) | ~24 files |
| The arcade (`src/app/(dashboard)/app/arcade`) | ~8 files |

Of 662 non-test files under `src/`, around 260 belong to the movement and demo
areas alone — very close to four in every ten. A client who bought a customer
service assistant receives all of it.

Beyond size, three things matter more than the file count:

- **It reads badly.** A client browsing their own repository finds another
  client's work in it.
- **It carries risk.** Code that ships is code that can break, be scanned, or
  raise a question in a security review.
- **It undermines the story.** "This is your product" is weaker when four in ten
  files are somebody else's demo.

---

## The approach

Extend what exists rather than replace it. Two changes.

**1. Let a vertical own whole paths, not only lines.**

Add a declaration mapping each vertical to the directories and files it owns
outright. Keep it beside the existing registry so the two lists are read
together and cannot drift. A path may be owned by exactly one vertical; `base`
owns nothing, because the platform is what remains.

**2. Teach the cut to delete owned paths.**

When a vertical is not kept, its owned paths are not copied. Line-level markers
continue to work exactly as now — the two mechanisms are complementary, because
a vertical needs both: its own folder removed, and its few lines pulled out of
the shared menu and schema.

**3. Extend the existing gate to cover the new declaration.**

`--check` must also verify that every declared path exists, that no path is
claimed by two verticals, and — the one that matters — that nothing left behind
still refers to something removed. A cut that produces a product which does not
build is worse than no cut at all.

---

## Phases

**Phase 1 — Declare ownership.** Write the path map for all five verticals.
Nothing behaves differently yet. Ends when the declaration lists every folder
and file identified above and the check confirms each path exists.

**Phase 2 — Cut the paths.** Teach the script to skip unkept verticals' owned
paths, and report what it removed. Ends when a cut keeping only `base` produces
a directory with no movement, arcade, property, or sales-data folders in it.

**Phase 3 — Prove the result runs.** The real test is not what was removed but
whether what remains works. Ends when a `base`-only cut installs, typechecks,
lints, passes its tests, and starts.

**Phase 4 — Guard it.** Add the leftover-reference check to the standard build
gates, so a future vertical that forgets to declare its folder fails
immediately.

**Phase 5 — Write it down.** One page in the operator guides: clone, cut, verify,
hand over. Fold it into the existing
[Vertical App Packaging Checklist](../../operator/vertical-app-packaging-checklist.md).

---

## Acceptance

The plan is done when all of the following are true:

1. A cut keeping only `base` produces a product with none of the four optional
   areas present as files.
2. That product installs, typechecks, lints, passes tests, and starts.
3. A cut keeping `base` plus one vertical produces that vertical working, and
   the other three absent.
4. A vertical added later that declares no owned paths fails the build check
   rather than silently shipping to a client.
5. The Sonae working tree is byte-identical before and after any cut.

---

## Out of scope

- **Rebranding.** Naming and theming a client build is separate work, already
  partly handled by the platform-name settings.
- **Removing verticals from Sonae itself.** This plan cuts *copies*. The
  movement demo stays in Sonae until Anthony says otherwise.
- **Splitting the repository.** No separate framework package or submodule. One
  repository, cut on the way out.
