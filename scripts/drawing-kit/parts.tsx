// The drawing kit's parts catalogue (docs/plans/active/design-drift-plan.md, D2).
//
// Every part here is the real component, rendered to plain HTML, so a drawing
// copies the markup the app draws — its class names, icons and words — and
// never a description of it. `npm run drawing-kit` bundles this file with the
// stand-ins in ./stubs (no database, no router) and writes parts.html.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowUpRight, Globe, ListChecks, Pencil, Plus, Search, Target, TextSearch, Trash2 } from "lucide-react";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_TEAL } from "@/src/ui/components/charts/chartPalette";
import { ToastProvider } from "@/src/context/ToastContext";
import { UIProvider } from "@/src/context/UIContext";
import Header from "@/src/ui/components/layout/Header";
import { NavItem, SubNavItem } from "@/src/ui/components/layout/SidebarNavigation";
import { UserNavTree } from "@/src/ui/components/layout/SidebarNavTrees";
import { SectionMenu } from "@/src/app/(dashboard)/app/_components/SectionMenu";
import { IntentLabel, PageLinkCell, PositionCell, RecordLinkCell, TrendCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { SiteMark } from "@/src/app/(dashboard)/app/sites/_components/SiteMark";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { ChangeBars } from "@/src/ui/components/screens/ChangeBars";
import { ChannelMap } from "@/src/ui/components/screens/ChannelMap";
import { ConversionsMap } from "@/src/ui/components/screens/ConversionsMap";
import { ConversionsByKindChart } from "@/src/ui/components/screens/ConversionsByKindChart";
import { ConversionsOverTimeChart } from "@/src/ui/components/screens/ConversionsOverTimeChart";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton } from "@/src/ui/components/screens/DownloadButton";
import { Field } from "@/src/ui/components/screens/Field";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { SeesBubble } from "@/src/ui/components/screens/HakkenSees";
import { SeesEye } from "@/src/ui/components/screens/HakkenSeesEye";
import { DatesMenu } from "@/src/ui/components/screens/DatesMenu";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader, PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { PageFlowChart } from "@/src/ui/components/screens/PageFlowChart";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SegmentedChoice, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TickSelect } from "@/src/ui/components/screens/TickSelect";
import { ChartReadoutTable } from "@/src/ui/components/charts/ChartReadoutTable";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TitleSwitch } from "@/src/ui/components/screens/TitleSwitch";

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
    use: "The real menu, Visibility open on Websites. Copy it whole; a new item under Visibility is a SubNavItem (below).",
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
        <NavItem icon={Globe} label="Visibility" isActive hasChildren isOpen onToggle={noop} onClick={noop}>
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
    id: "record-header-compact",
    name: "Website header — the standard one, the name is the switch",
    source: "src/ui/components/screens/PageHeader.tsx (DetailHeader layout=\"compact\"), TitleSwitch.tsx",
    use: "Every section that opens a website (2026-10-30): the name on its own row, then \"Updated …\" on the left and the page's filters on the right. No property line, no figures-to line; the eye is in the top bar. With more than one website the title opens the list.",
    render: () => (
      <DetailHeader
        layout="compact"
        back={{ label: "Back to Google Analytics", href: "#" }}
        icon={<SiteMark host="kordatacle.com" owned />}
        title={<TitleSwitch label="kordatacle.com" aria-label="Choose a website" value="1" onChange={noop}><option value="1">kordatacle.com</option></TitleSwitch>}
        pills={<StatusLabel tone="success">Updated 30/10/2026, 05:40:41</StatusLabel>}
        action={
          <div className="flex flex-wrap items-end gap-3">
            <Select aria-label="Country" value="gb" onChange={noop}><option value="gb">United Kingdom</option></Select>
            <Select aria-label="Device" value="all" onChange={noop}><option value="all">Every device</option></Select>
            <Select aria-label="Dates" value="30" onChange={noop}><option value="30">Last 30 days</option></Select>
            <Select aria-label="Chart step" value="day" onChange={noop}><option value="day">Daily</option></Select>
          </div>
        }
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
    source: "src/ui/components/screens/Select.tsx (chip), TickSelect.tsx, Table.tsx (SearchBar)",
    use: "Grey, never the brand colour. A chosen filter dims its label and names its choice. TickSelect is the same chip opening tick boxes, for any mix (a chart's conversions and channels).",
    render: () => (
      <div className="flex flex-wrap items-center gap-3">
        <Select value="" onChange={noop} chip={{ label: "Intent" }}><option value="">Every intent</option></Select>
        <Select value="hard" onChange={noop} chip={{ label: "Difficulty", choice: "Hard, 50 and over" }}><option value="hard">Hard, 50 and over</option></Select>
        <TickSelect label="Channels" everyWord="Every channel" choices={[{ key: "o", label: "Organic Search" }, { key: "p", label: "Paid Search" }, { key: "a", label: "AI assistants" }]} ticked={["o", "p"]} onChange={noop} />
      </div>
    ),
  },
  {
    id: "chart-toolbar",
    name: "A configurable chart's toolbar",
    source: "src/ui/components/screens/ChartExplorer.tsx (Select chips and TickSelects, changed={false})",
    use: "Every chip looks the same whatever is picked — no grey state; the words say the choice. Tick boxes open with Select all and Deselect all. Configurable Charts in screen-kit.md.",
    render: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Select value="conversions" onChange={noop} chip={{ label: "Show", choice: "Conversions", changed: false }}><option value="conversions">Conversions</option></Select>
        <TickSelect label="Conversions" everyWord="Every one" choices={[{ key: "p", label: "Prospectus form" }, { key: "v", label: "Book a visit" }]} ticked={["p", "v"]} onChange={noop} changed={false} />
        <TickSelect label="Channels" everyWord="Every channel" choices={[{ key: "o", label: "Organic Search" }, { key: "p", label: "Paid Search" }, { key: "d", label: "Direct" }, { key: "r", label: "Referral" }, { key: "a", label: "AI assistants" }]} ticked={["o", "p", "d", "r"]} onChange={noop} changed={false} />
        <Select value="channel" onChange={noop} chip={{ label: "Lines", choice: "A line per channel", changed: false }}><option value="channel">A line per channel</option></Select>
        <Select value="none" onChange={noop} chip={{ label: "Against", choice: "Nothing", changed: false }}><option value="none">Nothing</option></Select>
      </div>
    ),
  },
  {
    id: "chart-readout",
    name: "A chart's hover as a small table",
    source: "src/ui/components/charts/ChartReadoutTable.tsx",
    use: "A row for every line, noughts shown, and their total; the figure the chart is about on its band with an icon; the drawn column marked; 13px throughout. 0 is none, – is nothing to divide.",
    render: () => (
      <ChartReadoutTable
        heading="21 Sept – 27 Sept"
        columns={[
          { key: "visits", label: "Visits" },
          { key: "conversions", label: "Conversions", tone: "band", drawn: true, icon: <Target aria-hidden className="h-3.5 w-3.5 shrink-0" /> },
          { key: "one", label: "For one", tone: "quiet" },
        ]}
        rows={[
          { key: "o", name: "Organic Search", colour: CHART_SERIES_ORANGE, cells: { visits: { text: "456" }, conversions: { text: "14" }, one: { text: "33" } } },
          { key: "p", name: "Paid Search", colour: CHART_SERIES_BLUE, cells: { visits: { text: "187" }, conversions: { text: "4" }, one: { text: "47" } } },
          { key: "r", name: "Referral", colour: CHART_SERIES_TEAL, cells: { visits: { text: "29" }, conversions: { text: "0", quiet: true }, one: { text: "–", quiet: true } } },
        ]}
        total={{ visits: { text: "672" }, conversions: { text: "18" }, one: { text: "37" } }}
      />
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
    id: "change-bars",
    name: "ChangeBars — what gained and what lost",
    source: "src/ui/components/screens/ChangeBars.tsx",
    use: "Two columns either side of a centre line: gains run right in orange with their words to the left of the line, losses run left in grey with their words to the right. Each bar's figure on hover; the app's bar size (ga-channel-pages-plan.md CH6).",
    render: () => (
      <ChangeBars
        lostLabel="Lost visits"
        gainedLabel="Gained visits"
        rows={[
          { key: "a", label: "/hub/kapferer-brand-identity-prism/", detail: "9 → 17", change: 8, hover: "9 visits in the 30 days before, 17 in the last 30 days", href: "#" },
          { key: "b", label: "No page recorded", detail: "15 → 32", change: 17, hover: "15 visits in the 30 days before, 32 in the last 30 days", muted: true },
          { key: "c", label: "/ai-agency/", detail: "49 → 33", change: -16, hover: "49 visits in the 30 days before, 33 in the last 30 days", href: "#" },
        ]}
      />
    ),
  },
  {
    id: "conversions-map",
    name: "ConversionsMap — each conversion by page kind, channel, device or country",
    source: "src/ui/components/screens/ConversionsMap.tsx",
    use: "Conversions down the side, a kind across; a square in visits, as a rate of the column's visits, or in times, brighter for a bigger share of the row or a higher rate; Count, Columns and Compare dropdowns under the heading; a square's change against the month before when compared (conversion-charts-plan.md).",
    render: () => (
      <ConversionsMap
        title="Conversions"
        controls={<div className="flex flex-wrap items-center gap-2"><span className="text-[12px] text-secondary">Count: Visits · Columns: Page kind · Compare: The month before</span></div>}
        columns={[
          { key: "cupboards", name: "Cupboard Handles", visits: 6568, visitsBefore: 6100 },
          { key: "brand", name: "Brand", visits: 3534, visitsBefore: 3300 },
          { key: "unsorted", name: "Unclassified", visits: 6036, visitsBefore: 5800 },
        ]}
        rows={[
          { eventName: "purchase", name: "Purchase", counted: true, cells: [{ visits: 236, times: 236, visitsBefore: 205, timesBefore: 205 }, { visits: 201, times: 201, visitsBefore: 190, timesBefore: 190 }, { visits: 292, times: 292, visitsBefore: 260, timesBefore: 260 }] },
          { eventName: "add_to_cart", name: "Added to basket", counted: true, cells: [{ visits: 959, times: 4227, visitsBefore: 900, timesBefore: 4000 }, { visits: 640, times: 2818, visitsBefore: 700, timesBefore: 3100 }, { visits: 777, times: 3427, visitsBefore: 0, timesBefore: 0 }] },
        ]}
        count="visits"
        compare
        words={{ rowTotal: (row, total) => `${total.visits.toLocaleString("en-GB")} visits`, hover: (row, column, value) => `${row.name} → ${column.name}: ${value}`, hoverBefore: (before, change) => `, the month before ${before} (${change ?? "–"})`, shades: "a smaller to a bigger share of the row", empty: "none" }}
        newWord="new"
        exportName="conversions-map"
        csv={() => ""}
      />
    ),
  },
  {
    id: "conversions-by-kind",
    name: "ConversionsByKindChart — one conversion, a line a day per channel, device or country",
    source: "src/ui/components/screens/ConversionsByKindChart.tsx",
    use: "A tick box per line above the chart; one line alone fills the area under it; hover a day for every line's visits and conversions (conversion-charts-plan.md).",
    render: () => (
      <ConversionsByKindChart
        title="Conversions over time by kind"
        controls={<span className="text-[12px] text-secondary">Conversion: Purchase · Count: Visits · Columns: Channel</span>}
        columns={[{ key: "Organic Search", name: "Organic Search" }, { key: "Direct", name: "Direct" }]}
        points={["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"].map((day, at) => ({ day, cells: [{ visits: 400 + at * 20, did: 14 + at, times: 14 + at }, { visits: 150 + at * 5, did: 6, times: 6 }] }))}
        count="visits"
        step="day"
        words={{ detail: (visits, did) => `${visits} visits, ${did} with Purchase`, csvHead: { day: "day", visits: "Visits", did: "Converted", times: "Times", rate: "Rate" } }}
        exportName="conversions-by-kind"
      />
    ),
  },
  {
    id: "conversions-over-time",
    name: "ConversionsOverTimeChart — one conversion a day, as a rate or visits for one",
    source: "src/ui/components/screens/ConversionsOverTimeChart.tsx",
    use: "The share of each day's visits that converted, or the visits it took for one; the span before as a dashed grey line when compared; alone, the line fills the area under it (conversion-charts-plan.md).",
    render: () => (
      <ConversionsOverTimeChart
        title="Conversions over time"
        controls={<span className="text-[12px] text-secondary">Conversion: Purchase · Show: Conversion rate · Compare: Nothing</span>}
        points={["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"].map((day, at) => ({ day, visits: 1200 + at * 40, did: 40 + at * 3 }))}
        before={null}
        show="rate"
        step="day"
        words={{ now: "Last month", beforeName: "The month before", detail: (visits, did) => `${visits} visits, ${did} with Purchase`, csvHead: { day: "day", visits: "visits", did: "visits with it", figure: "Conversion rate" } }}
        exportName="conversions-over-time"
      />
    ),
  },
  {
    id: "channel-map",
    name: "ChannelMap — rows across columns, shaded by share",
    source: "src/ui/components/screens/ChannelMap.tsx",
    use: "Channels down the side, page groups across; each square a count, brighter for a bigger share of its row, its conversions beneath, figures on hover; a key under it (ga-channel-pages-plan.md CH9).",
    render: () => (
      <ChannelMap
        columns={["Service", "Content hub", "Brand", "No page recorded"]}
        rows={[
          { key: "o", label: "Organic Search", total: "192 visits", href: "#", cells: [{ visits: 69, conversions: 0, hover: "69 visits" }, { visits: 53, conversions: 0, hover: "53 visits" }, { visits: 26, conversions: 0, hover: "26 visits" }, { visits: 32, conversions: 0, hover: "32 visits" }] },
          { key: "d", label: "Direct", total: "40 visits", href: "#", cells: [{ visits: 6, conversions: 0, hover: "6 visits" }, { visits: 0, conversions: 0, hover: "No visits" }, { visits: 26, conversions: 3, hover: "26 visits, 3 conversions" }, { visits: 4, conversions: 0, hover: "4 visits" }] },
        ]}
        rowVisits={(row) => (row.key === "o" ? 192 : 40)}
        conversionsWord={(count) => `${count} conv.`}
        legend={{ visits: "69 · visits that started on that kind of page", conversions: "3 conv. · conversions those visits made", shades: "a smaller to a bigger share of the channel", empty: "no visits" }}
      />
    ),
  },
  {
    id: "page-flow",
    name: "PageFlowChart — how visits moved through a website",
    source: "src/ui/components/screens/PageFlowChart.tsx",
    use: "Landing pages, the next page, the page after: boxes as tall as their visits, grey bands for the routes, a red tail for the visits that left, orange dots for conversions; click a box to follow its routes (landing-pages-flow-plan.md LF2).",
    render: () => (
      <PageFlowChart
        columns={[{ title: "Landing pages", summary: "709 visits · ▼ 296 left · ● 3" }, { title: "Next page", summary: "413 visits · ▼ 183 left · ● 6" }, { title: "Page after", summary: "230 visits · ▼ 112 left · ● 4" }]}
        nodes={[
          { id: "0:/", column: 0, label: "/", visits: 159, left: 46, conversions: 1, hover: "/: 159 visits" },
          { id: "0:/ai-agency/", column: 0, label: "/ai-agency/", visits: 141, left: 52, conversions: 2, hover: "/ai-agency/: 141 visits" },
          { id: "0:~more", column: 0, label: "(74 more pages)", visits: 242, left: 58, conversions: 0, hover: "74 more pages" },
          { id: "1:/ai-agency/", column: 1, label: "/ai-agency/", visits: 96, left: 39, conversions: 4, hover: "/ai-agency/: 96 visits" },
          { id: "1:/about-us/", column: 1, label: "/about-us/", visits: 58, left: 22, conversions: 1, hover: "/about-us/: 58 visits" },
          { id: "2:/case-study/", column: 2, label: "/case-study/", visits: 28, left: 15, conversions: 0, hover: "/case-study/: 28 visits" },
        ]}
        bands={[
          { from: "0:/", to: "1:/ai-agency/", visits: 38, conversions: 2, landings: ["0:/"], hover: "/ → /ai-agency/: 38 visits, 2 conversions" },
          { from: "0:/", to: "1:/about-us/", visits: 22, conversions: 1, landings: ["0:/"], hover: "/ → /about-us/: 22 visits" },
          { from: "0:~more", to: "1:/ai-agency/", visits: 52, conversions: 1, landings: ["0:~more"], hover: "74 more pages → /ai-agency/: 52 visits" },
          { from: "1:/ai-agency/", to: "2:/case-study/", visits: 12, conversions: 0, landings: ["0:/"], hover: "/ai-agency/ → /case-study/: 12 visits" },
        ]}
        legend={{ conversions: "Conversions, on a page or the route that led to it — bigger for more", left: "Visits that left there" }}
        figuresOf={(node) => (node.conversions > 0 ? `${node.visits} · ● ${node.conversions}` : `${node.visits}`)}
      />
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
    name: "What Hakken sees — the speech bubble",
    source: "src/ui/components/screens/HakkenSees.tsx (SeesBubble), HakkenSeesEye.tsx",
    use: "Opened from the eye in the top bar (2026-10-30, the Conversions canvas): a speech bubble under the eye, over the page, its tail on the eye — what the page means, then up to three steps to do first. It grows with the words.",
    render: () => (
      <div className="flex justify-end pb-[280px] pr-8">
        <SeesEye
          open
          fresh={false}
          count={2}
          onClick={noop}
          bubble={(
            <SeesBubble
              says={[
                "6 of your 13 conversions did not happen once last month.",
                "Either nobody did them, or Google Analytics has stopped recording them.",
              ]}
              steps={[{ words: "Check the 6 are still set up in Google Analytics.", link: "See the 6", href: "#" }]}
            />
          )}
        />
      </div>
    ),
  },
  {
    id: "dates-menu",
    name: "The Dates menu",
    source: "src/ui/components/screens/DatesMenu.tsx",
    use: "Every section's date menu: a chip naming its choice, opening the seven periods with the days each covers, then custom dates.",
    render: () => <DatesMenu value={{ period: "lastMonth" }} newest="2026-10-28" onChange={noop} />,
  },
  {
    id: "sees-eye",
    name: "The eye, and its tooltip",
    source: "src/ui/components/screens/HakkenSeesEye.tsx, Tooltip.tsx",
    use: "After the page title in every header: opens What Hakken sees; the count of new steps beside it; the tooltip while the mouse rests on it.",
    render: () => (
      <div className="flex flex-col gap-10 pt-10">
        <div className="flex items-center gap-3"><span className="text-2xl font-bold tracking-tight text-foreground">kordatackle.com</span><SeesEye open={false} fresh count={2} onClick={noop} tooltipShown /></div>
        <div className="flex items-center gap-3"><span className="text-2xl font-bold tracking-tight text-foreground">kordatackle.com</span><SeesEye open fresh={false} count={2} onClick={noop} /></div>
      </div>
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
