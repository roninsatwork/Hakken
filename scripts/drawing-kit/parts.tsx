// The drawing kit's parts catalogue (docs/plans/active/design-drift-plan.md, D2).
//
// Every part here is the real component, rendered to plain HTML, so a drawing
// copies the markup the app draws — its class names, icons and words — and
// never a description of it. `npm run drawing-kit` bundles this file with the
// stand-ins in ./stubs (no database, no router) and writes parts.html.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowUpRight, Globe, ListChecks, Pencil, Plus, Search, TextSearch, Trash2 } from "lucide-react";
import { ToastProvider } from "@/src/context/ToastContext";
import { UIProvider } from "@/src/context/UIContext";
import Header from "@/src/ui/components/layout/Header";
import { NavItem, SubNavItem } from "@/src/ui/components/layout/SidebarNavigation";
import { UserNavTree } from "@/src/ui/components/layout/SidebarNavTrees";
import { SectionMenu } from "@/src/app/(dashboard)/app/_components/SectionMenu";
import { IntentLabel, PageLinkCell, PositionCell, RecordLinkCell, TrendCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton } from "@/src/ui/components/screens/DownloadButton";
import { Field } from "@/src/ui/components/screens/Field";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader, PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SegmentedChoice, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";

const noop = () => {};

type Part = { id: string; name: string; source: string; use: string; render: () => ReactNode };

type KeywordRow = { keyword: string; intent: string; volume: number; position: number | null; trend: number[]; page: string };
const ROWS: KeywordRow[] = [
  { keyword: "web design agency", intent: "BUYING", volume: 3600, position: 18, trend: [2900, 3300, 3600, 3600, 3300, 2900, 2900, 3300, 3600, 4400, 3600, 3600], page: "/custom-web-design-agency/" },
  { keyword: "how much does a web design agency charge", intent: "RESEARCHING", volume: 320, position: null, trend: [260, 280, 300, 320, 340, 320, 300, 320, 340, 360, 320, 320], page: "" },
  { keyword: "web design agency surrey", intent: "BUYING", volume: 210, position: 2, trend: [170, 190, 210, 210, 230, 210, 190, 210, 230, 250, 210, 210], page: "/web-design-surrey/" },
];
const COLUMNS: DataTableColumn<KeywordRow>[] = [
  { key: "keyword", header: "Keyword", sortable: true, cell: (row) => <RecordLinkCell href="#">{row.keyword}</RecordLinkCell> },
  { key: "intent", header: "Intent", sortable: true, cell: (row) => <IntentLabel intent={row.intent} /> },
  { key: "position", header: "Position", sortable: true, align: "right", cell: (row) => <PositionCell position={row.position} /> },
  { key: "volume", header: "Volume", sortable: true, align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums">{row.volume.toLocaleString("en-GB")}</span> },
  { key: "trend", header: "Trend", cell: (row) => <TrendCell trend={row.trend} label="Searches a month over the last year" /> },
  { key: "page", header: "Page", cell: (row) => (row.page ? <PageLinkCell href="#" page={row.page} /> : <NoFigure />) },
  { key: "actions", header: "", cell: () => <RowIconButton label="Take it off this list" onClick={noop}><Trash2 className="h-4 w-4" /></RowIconButton> },
];

const PARTS: Part[] = [
  {
    id: "shell-sidebar",
    name: "Sidebar — the client's menu",
    source: "src/ui/components/layout/SidebarNavTrees.tsx (UserNavTree), SidebarNavigation.tsx",
    use: "The real menu, Discovery open on Websites. Copy it whole; a new item under Discovery is a SubNavItem (below).",
    render: () => (
      <aside className="w-[240px] bg-sidebar border-r border-border-dim/50 flex flex-col shadow-2xl">
        <div className="flex-1 flex flex-col pt-6 pb-8 px-4 gap-6">
          <section>
            <div className="mb-3 px-3"><span className="text-[11px] font-mono tracking-[0.15em] text-muted uppercase">Main navigation</span></div>
            <nav>
              <UserNavTree activeItem="Sites" setActiveItem={noop} openSections={{ sites: true }} toggleSection={noop} isSuperAdmin={false} hasCapability={() => false} user={undefined} />
            </nav>
          </section>
        </div>
      </aside>
    ),
  },
  {
    id: "shell-subnav",
    name: "Sidebar sub-item, current and not",
    source: "src/ui/components/layout/SidebarNavigation.tsx (SubNavItem, NavItem)",
    use: "A page under a menu section. The current one wears the pill.",
    render: () => (
      <div className="w-[240px] bg-sidebar p-4 flex flex-col gap-0.5">
        <NavItem icon={Globe} label="Discovery" isActive hasChildren isOpen onToggle={noop} onClick={noop}>
          <SubNavItem label="Websites" href="#" isActive={false} onClick={noop} />
          <SubNavItem label="Keyword research" href="#" isActive onClick={noop} />
        </NavItem>
      </div>
    ),
  },
  {
    id: "shell-header",
    name: "Top bar",
    source: "src/ui/components/layout/Header.tsx",
    use: "Across the top of every page, inside the page's p-8 column.",
    render: () => <div className="p-8 pb-0"><Header /></div>,
  },
  {
    id: "page-header",
    name: "Page header — a top-level page (ruled)",
    source: "src/ui/components/screens/PageHeader.tsx (PageHeader divider)",
    use: "A page opened from the sidebar. The icon is the brand colour, h-6 w-6.",
    render: () => <PageHeader divider icon={<TextSearch className="h-6 w-6 text-brand" />} title="Keyword research" description="Look up any search people make on Google." action={<PagePrimaryAction icon={<Plus className="h-4 w-4" />} onClick={noop}>New list</PagePrimaryAction>} />,
  },
  {
    id: "page-header-section",
    name: "Page header — a page inside a section (no rule)",
    source: "src/ui/components/screens/PageHeader.tsx (PageHeader)",
    use: "A tab's or section menu page's own title: the record header above already drew the rule.",
    render: () => <PageHeader icon={<ListChecks className="h-6 w-6 text-brand" />} title="Keyword ideas" description="Searches with every word of the keyword in them." />,
  },
  {
    id: "detail-header",
    name: "Record header",
    source: "src/ui/components/screens/PageHeader.tsx (DetailHeader)",
    use: "A record's page (a website, a keyword, a list): back row, title, what it is, status labels, its controls.",
    render: () => (
      <DetailHeader
        back={{ label: "Keyword research", href: "#" }}
        icon={<TextSearch className="h-6 w-6 text-brand" />}
        title="web design agency"
        description="Looked up in the United Kingdom · Measured against example.co.uk"
        pills={<StatusLabel tone="success">Looked up 01/10/2026, 09:14</StatusLabel>}
        action={<Select value="30" onChange={noop} className="w-[160px]"><option value="30">Last 30 days</option></Select>}
      />
    ),
  },
  {
    id: "section-menu",
    name: "Section menu",
    source: "src/app/(dashboard)/app/_components/SectionMenu.tsx",
    use: "The left menu of a record's pages, in the 240px column beside the content.",
    render: () => (
      <div className="w-[240px]">
        <SectionMenu
          label="This keyword"
          jump={{ label: "Look up another keyword", placeholder: "Look up another keyword…" }}
          groups={[
            { id: "keyword", label: "This keyword", items: [{ id: "overview", label: "Overview", href: "#" }, { id: "results", label: "Google's results", href: "#", count: "10" }, { id: "ai", label: "What the AI says", href: "#", count: "1/4" }] },
            { id: "ideas", label: "Ideas", items: [{ id: "terms", label: "Terms match", href: "#", count: "1,000" }, { id: "questions", label: "Questions", href: "#", count: "86" }] },
          ]}
          currentId="overview"
          openAtFirst={["keyword", "ideas"]}
        />
      </div>
    ),
  },
  {
    id: "record-layout",
    name: "Record layout — menu beside content",
    source: "src/app/(dashboard)/app/sites/[siteId]/layout.tsx",
    use: "The grid every record page uses: the section menu, then the page's content.",
    render: () => (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start"><div className="text-[12px] text-muted">Section menu</div></aside>
        <section className="flex min-w-0 flex-col gap-3"><div className="text-[12px] text-muted">The page</div></section>
      </div>
    ),
  },
  {
    id: "figures",
    name: "Figures — the headline numbers",
    source: "src/ui/components/screens/Figure.tsx (Figure, FigureRow), Change.tsx",
    use: "Four across. With href the box opens its records and says so with an arrow; emphasis for the one the eye lands on first.",
    render: () => (
      <FigureRow>
        <Figure label="Searches a month" value="3,600" detail={<span className="text-secondary">United Kingdom · CPC $6.20</span>} />
        <Figure label="Keywords" value="793" detail={<Change by={-3} />} href="#" />
        <Figure label="That you don't" value="2,310" detail={<span className="text-secondary">Listed below</span>} emphasis />
        <Figure label="Difficulty" value="64" detail={<Meter value={0.64} size="md" />} />
      </FigureRow>
    ),
  },
  {
    id: "chart-card",
    name: "Chart card",
    source: "src/ui/components/screens/ChartCard.tsx",
    use: "One chart: title, hint, the chart, its download top right. Series colours only from chartPalette.ts (first: #f97316).",
    render: () => (
      <ChartCard title="Searches a month in the United Kingdom" hint="The last 24 months, from Google Ads." exportName="searches-a-month" csv={() => ""}>
        <div className="h-[200px] rounded-lg border border-dashed border-border-dim" />
      </ChartCard>
    ),
  },
  {
    id: "notice",
    name: "Notice — an explanation box",
    source: "src/ui/components/screens/Notice.tsx",
    use: "A line or two above a list or in a panel; warning when something needs attention.",
    render: () => (
      <div className="flex flex-col gap-3">
        <Notice action={<Button variant="quiet" onClick={noop}>Ask again</Button>}>Asked 01/10/2026, about $0.40 for the four assistants.</Notice>
        <Notice tone="warning">This website has not been checked yet.</Notice>
      </div>
    ),
  },
  {
    id: "settings-card",
    name: "Settings card, fields and choices",
    source: "src/ui/components/screens/SettingsCard.tsx, Field.tsx, Select.tsx, Checkbox.tsx",
    use: "A form's card: label, field, hint; a dropdown; a view switch; a tick box.",
    render: () => (
      <SettingsCard title="Look up">
        <Field label="Keywords" placeholder="web design agency" hint="One per line." />
        <FieldLabel htmlFor="country">Country</FieldLabel>
        <Select id="country" value="uk" onChange={noop} className="w-[260px]"><option value="uk">United Kingdom (home)</option></Select>
        <FieldHint>About 1 cent a country.</FieldHint>
        <SegmentedChoice label="Kind of idea" value="terms" onChange={noop} size="compact" options={[{ value: "terms", label: "Terms match" }, { value: "questions", label: "Questions" }, { value: "also", label: "Also rank for" }]} />
        <Checkbox label="Track this keyword" checked onChange={noop} />
      </SettingsCard>
    ),
  },
  {
    id: "buttons",
    name: "Buttons",
    source: "src/ui/components/screens/Button.tsx, PageHeader.tsx (PagePrimaryAction), DownloadButton.tsx, Table.tsx (RowIconButton)",
    use: "One primary (white) action a page; the rest quiet. Row actions are icons with their label as tooltip.",
    render: () => (
      <div className="flex flex-wrap items-center gap-3">
        <PagePrimaryAction icon={<Search className="h-4 w-4" />} onClick={noop}>Look up</PagePrimaryAction>
        <Button variant="quiet" onClick={noop}>Look up again</Button>
        <Button variant="ghost" onClick={noop}>Cancel</Button>
        <DownloadButton label="Download CSV" busyLabel="Making the file…" onClick={noop} />
        <RowIconButton label="Rename this list" onClick={noop}><Pencil className="h-4 w-4" /></RowIconButton>
        <RowIconButton label="Delete this list" onClick={noop} tone="danger"><Trash2 className="h-4 w-4" /></RowIconButton>
      </div>
    ),
  },
  {
    id: "filter-chips",
    name: "Filters beside a search box",
    source: "src/ui/components/screens/Select.tsx (chip), Table.tsx (SearchBar)",
    use: "Grey, never the brand colour. A chosen filter dims its label and names its choice.",
    render: () => (
      <div className="flex flex-wrap items-center gap-3">
        <Select value="" onChange={noop} chip={{ label: "Intent" }}><option value="">Every intent</option></Select>
        <Select value="hard" onChange={noop} chip={{ label: "Difficulty", choice: "Hard, 50 and over" }}><option value="hard">Hard, 50 and over</option></Select>
      </div>
    ),
  },
  {
    id: "labels",
    name: "Status labels, tag labels, changes",
    source: "src/ui/components/screens/StatusLabel.tsx, TagLabel.tsx, Change.tsx, NoFigure.tsx, Meter.tsx",
    use: "A status: line icon in its colour, then words — never a pill. A kind: grey words. A move: ▲/▼ with its number.",
    render: () => (
      <div className="flex flex-wrap items-center gap-5">
        <StatusLabel tone="success">Already winning</StatusLabel>
        <StatusLabel tone="warning">Improve your page</StatusLabel>
        <StatusLabel tone="info">Worth a new page</StatusLabel>
        <StatusLabel tone="danger">Failed</StatusLabel>
        <StatusLabel tone="neutral">Too hard for now</StatusLabel>
        <TagLabel>Commercial</TagLabel>
        <Change by={12} />
        <Change by={-3} />
        <Change by={0} same />
        <NoFigure />
        <Meter value={0.64} />
        {/* A collection's progress: back, then out and waiting for answers (collection-progress-plan.md). */}
        <Meter value={0.57} then={0.15} />
      </div>
    ),
  },
  {
    id: "table",
    name: "Table — Websites' kind",
    source: "src/ui/components/screens/DataTable.tsx, TableBar.tsx, Table.tsx, app/sites/_components/SiteCells.tsx",
    use: "Search and filters above; the bar with its count and download; headings that sort; keywords white (RecordLinkCell), pages blue (PageLinkCell); numbered pages, 25/50/75/100 rows. Fits the page: never a minimum width.",
    render: () => (
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(row) => row.keyword}
        empty={{ icon: <Search className="h-5 w-5" />, label: "Nothing matches that." }}
        search={{ value: "", onChange: noop, placeholder: "Find a keyword…" }}
        filters={<Select value="" onChange={noop} chip={{ label: "Intent" }}><option value="">Every intent</option></Select>}
        cardHeader={<TableBar footer={{ isLoading: false, totalCount: 1000 }} noun="keywords" actions={<DownloadButton label="Download CSV" busyLabel="Making the file…" onClick={noop} />} />}
        sort={{ key: "volume", direction: "desc", onSort: noop }}
        footer={{ mode: "paged", page: 1, totalPages: 40, totalCount: 1000, pageSize: 25, isLoading: false, onPageChange: noop, numbered: true, rowsChoice: { choices: [25, 50, 75, 100], value: 25, onChange: noop } }}
        minWidthClassName=""
      />
    ),
  },
  {
    id: "hakken-sees",
    name: "What Hakken sees",
    source: "src/ui/components/screens/HakkenSees.tsx",
    use: "Under the title of every Discovery screen: what the page means, then up to three steps to do first.",
    render: () => (
      <HakkenSees
        says={[
          "Google's AI names you in 64 answers a month: 18% of the answers about you and your rivals, behind Brightside Digital's 34%.",
          "You are missing from the most-asked question, about website costs.",
        ]}
        steps={[
          { words: "Put plain prices at the top of your /pricing/ page.", link: "See the question", href: "#" },
          { words: "Get listed on clutch.co.", link: "See clutch.co", href: "#" },
        ]}
      />
    ),
  },
  {
    id: "link-arrow",
    name: "A quiet link onward",
    source: "src/ui/components/screens/Figure.tsx (href arrow), lucide ArrowUpRight",
    use: "Under a card: where to see the rest.",
    render: () => <a href="#" className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">See all 1,000<ArrowUpRight className="h-3.5 w-3.5" /></a>,
  },
];

export function renderParts(): { id: string; name: string; source: string; use: string; html: string }[] {
  return PARTS.map((part) => ({
    id: part.id,
    name: part.name,
    source: part.source,
    use: part.use,
    html: renderToStaticMarkup(<ToastProvider><UIProvider>{part.render()}</UIProvider></ToastProvider>),
  }));
}
