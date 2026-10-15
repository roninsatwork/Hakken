# System Settings → Classification — one list of page types for every company

**Planned 2026-10-15. Status: built on dev 2026-10-15, not committed (see "Built").**

## Where this came from

Anthony was looking at a classification's Type dropdown (Informational
content, Service, Product, Case study, Company, Legal, Other). He asked "where
do I edit the content of this drop down", then "can we make this company
specific and set by company or is it better to have it globally".

The answer was global. A company already names its own classifications. The
type is the shared category Hakken's reports read, so it has to mean the same
thing on every website. He replied: "so we need a new tab in system settings
for it. Lets call it Classification."

The page is drawn on the canvas
[System Settings — Classification](https://claude.ai/artifact/3iwptk1hkCPzxCxxNTrkPY).
It has five boards: the list, Add a type, a built-in type, an added type, and
Remove. A copy of the boards, their pictures and their outlines is in
[docs/plans/assets/classification-types/](../assets/classification-types/).
Change a decision here, with a date, before building anything that disagrees
with it.

### Decided 2026-10-15: one field, the Type

The first version Anthony approved also gave each type a "Counts as" (Article,
Sells or Neither) for reports to read. Once built, he asked "what does counts
as mean", then "don't we have that already in the company detail" and "I
think we could be in danger in putting the same thing in 2 places".

Merging the classification types with Hakken's own page types was considered.
Those are Home page, Service, Product, Category, Article and the rest, which
Hakken guesses for every page. It was dropped because it would change saved
classifications and how Hakken sorts pages. He said: "I don't want to break
anything that exists as the way the current classification works is
incredible".

Then: **"Yes: keep one field, the Type. Drop Counts as, leave the current
classification working as before, and let System Settings rename and add
types."** The boards were redrawn from the built screens without Counts as.

## Why

The seven types were fixed in code, in four places:

- `pagesSchema.ts`, the values the database accepts
- `utils/pageKinds.ts`, the shared list
- the website Classification screens' own list
- Insights' return validator

Their names lived in `messages/*.json`. No one could rename a type or add one
without a code change.

## What the page is (CT1–CT6), the approved look

- **CT1. A tab of its own.** "Classification" sits after Limits in System
  Settings' tab strip, as one page with no dropdown. Like Limits, it is for
  super admins only.
- **CT2. The list.** The page header reads "Classification" with the layers
  icon and the description "The page types every company's classifications
  pick from. Rename one, or add your own." It has one orange action, **Add
  type**. Below it is one table with a count bar ("9 types"), columns
  **Type | Used by**, and row icons. The second heading was "Classifications"
  until 2026-10-15, when Anthony asked "WTF is this" and chose "call it 'Used
  by'".
  - A type's name stands alone in its row. The words "Built in" beside the
    seven shipped types were taken out on 2026-10-15. They had been added
    without being asked for: Anthony asked "who asked for it to be there",
    then "take 'Built in' out of the list". A shipped type's own page still
    says it can be renamed but not removed.
  - Used by counts the classifications that use the type, across every
    company.
  - The pencil, or the row, opens the type's page. The bin shows only on an
    added type that no classification uses.
  - The table uses the admin standard of fifteen rows to a page.
- **CT3. Add a type** is its own page, with the back row "Classification",
  the title "New type", and the description "Once added, every company's
  classifications can pick it. Reports count it on its own, apart from the
  seven built-in types."
  - It has one settings card, "Type", with one field, **Name**, and the hint
    "Write it in English. Hakken translates it for every language."
  - **Add type** stays greyed out until the field has a name.
- **CT4. A type's page.** It has the same card and Save. The description
  says how many classifications on how many websites use the type, and that
  a new name shows on all of them. An added type's description begins "Added
  on dd/mm/yyyy."
  - A built-in type says at the foot: "Built in, so it can be renamed but
    not removed."
  - An added type in use says it can't be removed until its classifications
    move to another type.
  - An added type that no classification uses has a red **Remove type** link
    at the foot.
- **CT5. Removing** asks yes or no, the one pop-up: "Remove Careers?" — "No
  classification uses it, so no page changes. Companies can no longer pick
  it." A type in use is refused on the server too.
- **CT6. Limits.** Each one is said to Anthony.
  - A name is at most 40 characters and unique among the types, whatever its
    case.
  - There are at most **50 types** in all, the seven included. At 50, Add
    type is greyed out and says why.
  - The Used by column counts up to **300** per type and then shows "300+",
    so the list stays one quick read.

## What stays exactly as it was

- **Every saved classification.** The seven shipped keys (INFORMATIONAL,
  SERVICE, …) are unchanged, and a classification still has one Type.
- **Every report.** Reports still read the seven by their keys, as before:
  - Informational content is what Insights and the competing-pages advice
    treat as an article.
  - Service is what the service-page figures read.
  A type added here is counted on its own.
- **Hakken's own page types** and how it sorts pages.
- **Renaming a type changes only its words.** A renamed type is still the
  same type to every report.

## What changes underneath

- **`classificationTypes`** (in `pagesSchema.ts`) holds a row for each added
  type, and for each built-in type once it has been renamed. A row has:
  - `key`: a built-in's own key, or an added type's own id
  - `nameEn` and `builtIn`
  - the times it was made and changed
  The shipped seven are written in code (`convex/utils/classificationTypes.ts`)
  with their names in every language. With no rows at all, everything reads
  as before, so no migration is needed.
- **`pageClassifications.type`** is the type's key (`v.string()`), checked
  against the list on every write, with a `by_type` index for the counts.
- **Names are written once, in English.** The Translator writes the rest
  (`contentTranslation.ts`, owner `classificationTypes`). A shipped type
  keeps the names it shipped with, in every language, until it is renamed.
  The old `admin.siteView.classification.types` words left `messages/*.json`.
- **The website Classification screens** take their Type dropdown and Type
  column from the list (`classificationTypeChoices`).

## Built (2026-10-15, on dev, not committed)

- **Backend**
  - `convex/classificationTypes.ts`, `convex/utils/classificationTypes.ts`
  - the table and index in `pagesSchema.ts`, and its keep rule
  - the Translator owner
  - the type check in `pageClassifications.ts`
- **Screens**
  - `admin/settings/(system)/classification/`: the list, `new`, `[typeKey]`,
    `ClassificationTypeEditor`, `RemoveClassificationTypeDialog`
  - the tab in `(system)/layout.tsx` and the menu route in
    `SidebarNavigation.tsx`
  - the `types` table noun
- **Tests**
  - `convex/classificationTypes.test.ts`
  - the list's and the editor's screen tests
  - the website Classification tests, updated for the list
  - the look test `classificationTypesLook.test.tsx`, holding boards Main,
    Add, Edit and EditAdded to `look/*.txt`
