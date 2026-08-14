type ConnectorCategory = "KNOWLEDGE" | "PROFILE" | "WORKFLOW" | "HTTP" | "EMAIL" | "CUSTOM";
type ConnectorAuthMode = "NONE" | "SECRET_REF" | "OAUTH";
type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

export type ConnectorToolDefinition = {
  name: string;
  description: string;
  handlerMapping: string;
  requiredRole: "ADMIN" | "SUPER_ADMIN";
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
  inputSchema?: string;
  outputSchema?: string;
  secretRefKeys?: string[];
};

export type ToolConnectorDefinition = {
  key: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  authMode: ConnectorAuthMode;
  oauthProvider?: string;
  tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
  requiredScopes: string[];
  requiredSecretRefs: string[];
  toolDefinitions: ConnectorToolDefinition[];
};

export const BUILT_IN_TOOL_CONNECTORS: ToolConnectorDefinition[] = [
  {
    key: "apify-actor",
    name: "Apify",
    description:
      "Lets an agent run any job on Apify. The agent chooses which scraper to use, what to "
      + "point it at, and what settings to give it.",
    category: "HTTP",
    // The account token stays in the environment, so the agent can start work
    // without ever seeing the credential. Which job runs, and what it is
    // pointed at, is the agent's decision — that is the point of the tool, and
    // it is what lets one connector serve any use case without the platform
    // learning about any of them.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["apify:run"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Find an Apify job",
        description:
          "Looks up jobs on Apify. Give it something to search for — 'rightmove property listings' "
          + "— to see what jobs exist, or give it a job id to see exactly what settings that job "
          + "needs. Use this before running a job rather than guessing its settings.",
        handlerMapping: "apify.actor.describe",
        requiredRole: "ADMIN",
        // Reads the public catalogue. Nothing runs and nothing is charged.
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "What kind of job you are looking for, in plain words.",
            },
            job: {
              type: "string",
              description: "A known job id, to read its settings — for example 'apify/web-scraper'.",
            },
          },
        }),
      },
      {
        name: "Apify",
        description:
          "Runs a job on Apify. Give it the job's id from the Apify store and the settings that "
          + "job expects, including any addresses to visit. It starts the job and reports back "
          + "straight away — the results arrive a few minutes later, so do not expect them in "
          + "the same answer.",
        handlerMapping: "apify.actor.run",
        requiredRole: "ADMIN",
        // It leaves the platform and it costs money per item collected.
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["job"],
          properties: {
            job: {
              type: "string",
              description:
                "The id of the Apify job to run, as it appears in the Apify store — for example "
                + "'apify/website-content-crawler'.",
            },
            settings: {
              type: "string",
              description:
                "The settings for this job, as JSON. What goes in here is decided by the job "
                + "itself — for a property scraper it might be the search address and how many "
                + "listings to collect.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-firecrawl",
    name: "Firecrawl",
    description: "Lets an agent read a page on the web and use what it says.",
    category: "KNOWLEDGE",
    // The key lives in the environment, as it already does for document
    // ingestion, rather than being typed in here.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Firecrawl",
        description:
          "Fetches a web page and returns its readable text. Use it to look something up on a "
          + "site rather than answering from memory. Give it the full address of one page.",
        handlerMapping: "web.scrape",
        requiredRole: "ADMIN",
        // Nothing is written, but it leaves the platform and it costs money,
        // which is not the same as reading our own data.
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "The full address of the page to read." },
            mainContentOnly: {
              type: "boolean",
              description:
                "Defaults to true, which returns the article and drops navigation. Set it to "
                + "false when the page's real content is a list or a directory — on some sites "
                + "those sit outside the main article and are dropped otherwise.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-knowledge",
    name: "Knowledge search",
    description: "Lets an agent search the documents you have uploaded, and quote from them.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["knowledge:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Knowledge Search",
        description: "Searches your approved documents and returns short quotes with their source.",
        handlerMapping: "knowledge.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-company-profile",
    name: "Company profile",
    description: "Lets an agent read and update the company details it is working for.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["company:read", "company:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Update Company Overview",
        description: "Updates the company overview, once a person has approved it.",
        handlerMapping: "company.overview.update",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["overview"],
          properties: {
            overview: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-tasks",
    name: "Tasks",
    description: "Lets an agent leave a job for a person, instead of only writing an answer nobody returns to.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["task:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Raise a task",
        description:
          "Creates a task for someone in this workspace. Give the person's email address to assign it; leave it out and the task waits for whoever picks it up.",
        handlerMapping: "task.create",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", description: "What needs doing, in one line." },
            detail: { type: "string", description: "Any context the person will need. Optional." },
            assigneeEmail: {
              type: "string",
              description: "The email address of the person in this workspace it is for. Optional.",
            },
            dueDate: { type: "string", description: "When it is due, as YYYY-MM-DD. Optional." },
          },
        }),
      },
    ],
  },
  {
    key: "http-rest",
    name: "Call an API",
    description: "Lets an agent call another system over the web. You set the address and the credentials; the agent only chooses what to ask for.",
    category: "HTTP",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["http:request"],
    requiredSecretRefs: ["base_url", "auth_header"],
    toolDefinitions: [
      {
        name: "HTTP Request",
        description: "Calls the API you have set up. The address and credentials come from your settings, never from the agent.",
        handlerMapping: "http.request",
        requiredRole: "SUPER_ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["base_url", "auth_header"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string" },
            path: { type: "string" },
            bodyJson: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "email-notification",
    name: "Email and notifications",
    description: "Lets an agent email or notify people in your workspace.",
    category: "EMAIL",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["notification:send"],
    requiredSecretRefs: ["provider_api_key", "from_address"],
    toolDefinitions: [
      {
        name: "Send Notification",
        description: "Sends an email or notification to approved recipients.",
        handlerMapping: "notification.send",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["provider_api_key", "from_address"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["to", "subject", "body"],
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  // template:remove:start salesReports
  {
    key: "sales-reports",
    name: "Board Reports",
    description:
      "Lets an agent write the weekly board report from the pipeline it has been given, "
      + "grounded in the company knowledge and memories it carries.",
    category: "WORKFLOW",
    // The report is written from what the agent already holds — its pipeline
    // document, its knowledge base, its memories. Nothing leaves the platform
    // and no credential is involved.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Write the board report",
        description:
          "Writes the eight-section board report from the pipeline document in this agent's "
          + "knowledge, drawing on company knowledge and what the agent remembers, and files it "
          + "on the Reports page. Give it a focus when this run should pay particular attention "
          + "to something — a deal, a rep, a question from the board.",
        handlerMapping: "salesReports.generate",
        requiredRole: "ADMIN",
        // Writes a report into the tenant's own workspace; nothing external.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            focus: {
              type: "string",
              description:
                "Anything to pay particular attention to in this run, in plain words.",
            },
          },
        }),
      },
    ],
  },
  // template:remove:end
  // template:remove:start salesData
  {
    key: "sales-customer-research",
    // Named for the client at Anthony's request, 2026-08-01. It sits inside the
    // `salesData` fence, so the framework template strips it wholesale rather
    // than shipping a client's name to the next product built on this.
    name: "Comax Customer Research",
    description:
      "Lets an agent read a customer's record to see which details are missing, and record what "
      + "it finds on the web against that customer — with the page it came from.",
    category: "WORKFLOW",
    // Reads and writes the workspace's own customer records. Reaching the web
    // is a separate capability: search comes from the model provider, and
    // pages are read through Firecrawl.
    authMode: "NONE",
    // Restricted rather than global: these tools read and write one client's
    // customer records, and the screens they serve only exist for a workspace
    // with the sales data section switched on. Offering them to every company
    // would put a tool in the marketplace that most of them cannot use.
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Comax — Read a customer's record",
        description:
          "Returns one customer or prospect: the individual business name, its account code, the "
          + "chain it belongs to, its type, the details already known, the details still missing, "
          + "and the details already searched for and not published anywhere. Give it an account "
          + "name key for a particular one, or call it with nothing to get the next record that "
          + "still has gaps. A prospect needs the same details as a customer — it is a site "
          + "somebody has to be able to ring — so both kinds come back from this.",
        handlerMapping: "salesCustomers.research.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            accountNameKey: {
              type: "string",
              description:
                "The customer or prospect to read. Leave it out to be given the next record with "
                + "gaps, of either kind.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a customer detail",
        description:
          "Records one detail you found about a customer, with the page you took it from. One "
          + "call per detail. A confident value on an empty field is saved to the record; "
          + "anything less certain, or anything contradicting what is already there, is kept for "
          + "a person to check. Set notFound when the detail is not published anywhere you "
          + "looked — that is a useful answer and stops the customer being searched again.",
        handlerMapping: "salesCustomers.research.record",
        requiredRole: "ADMIN",
        // Writes into the workspace's own customer records, and only into
        // fields that are empty. Nothing external, and nothing overwritten.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["accountNameKey", "field"],
          properties: {
            accountNameKey: {
              type: "string",
              description: "The customer this detail belongs to, exactly as you were given it.",
            },
            field: {
              type: "string",
              description:
                "Which detail: addressLine1, addressLine2, town, postcode, country, phone, "
                + "mobile, email, accountsEmail, website, contactName, contactRole, bedrooms "
                + "or pupils.",
            },
            value: {
              type: "string",
              description: "What you found, as it appears on the page. Omit when notFound is true.",
            },
            confidence: {
              type: "string",
              enum: ["HIGH", "MEDIUM", "LOW"],
              description:
                "HIGH only when the page names this exact business and this exact detail with no "
                + "ambiguity. Anything less is not a failure — it goes to a person instead.",
            },
            sourceUrl: {
              type: "string",
              description:
                "The web address of the page you took this from. Required for every value. "
                + "When bedrooms or pupils are not found, give the exact page you checked.",
            },
            sourceName: {
              type: "string",
              description: "What to call that page on screen, for example the site's name.",
            },
            reasoning: {
              type: "string",
              description:
                "One line: why you believe this page is about this individual business and not "
                + "its parent chain.",
            },
            notFound: {
              type: "boolean",
              description:
                "True when this detail is not published anywhere you looked. For bedrooms or "
                + "pupils, only use this after checking the strongest likely source for that "
                + "site and citing the page in sourceUrl.",
            },
          },
        }),
      },
      {
        name: "Comax — Read a group",
        description:
          "Returns one group the workspace supplies: its name, its customer type, the sites in "
          + "it already supplied, and the sites an earlier run already found. Give it a group "
          + "name, or call it with nothing to get the next group nobody has looked through yet.",
        handlerMapping: "salesCustomers.prospects.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            groupName: {
              type: "string",
              description: "The group to look through. Leave it out to be given the next one.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a site in a group",
        description:
          "Records one site you found in a group the workspace supplies. Report every site you "
          + "find, including ones you think are already supplied — you will be told which those "
          + "are, and that is how the count stays honest. A site that is already a customer is "
          + "refused and named back to you, so you can stop offering it.",
        handlerMapping: "salesCustomers.prospects.record",
        requiredRole: "ADMIN",
        // Writes a prospect into the workspace's own records. It cannot touch a
        // customer: a site that matches one is refused rather than merged.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["groupName", "siteName"],
          properties: {
            groupName: {
              type: "string",
              description: "The group this site belongs to, exactly as you were given it.",
            },
            siteName: {
              type: "string",
              description: "The site's name, as the register or the group's own page publishes it.",
            },
            town: { type: "string", description: "The town it is in." },
            postcode: {
              type: "string",
              description:
                "Its postcode. Worth finding: it is the strongest signal that a site is or is "
                + "not one the workspace already supplies.",
            },
            sourceUrl: {
              type: "string",
              description: "The web address of the page that lists this site. Required.",
            },
            sourceName: { type: "string", description: "What to call that page on screen." },
            reasoning: {
              type: "string",
              description: "One line: why you believe this site belongs to this group.",
            },
          },
        }),
      },
      {
        name: "Comax — Ask for the next research task",
        description:
          "Gives you the next thing to research and closes off the last one. Each task is one "
          + "customer, one chain, or one prospect, and it says which and what to do. Call it "
          + "again the moment you have finished a task; keep going until it tells you there is "
          + "nothing left, then stop. Say couldNot if you could not finish a task — it will be "
          + "given to another run rather than lost, and saying so is better than moving on "
          + "quietly.",
        handlerMapping: "salesCustomers.job.next",
        requiredRole: "ADMIN",
        // Writes only to the job's own queue — which item is in hand, which is
        // finished. It cannot touch a customer, a prospect or a finding.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            couldNot: {
              type: "boolean",
              description:
                "True when you could not finish the task you were last given. Leave it out when "
                + "you finished it.",
            },
            note: {
              type: "string",
              description:
                "One line on why you could not finish it. Only read when couldNot is true.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "sales-market-discovery",
    name: "Comax Market Discovery",
    description:
      "Lets an agent find new parent companies outside the current customer import, prove them, "
      + "and file their locations as clearly labelled market-discovery prospects.",
    category: "WORKFLOW",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Comax — Market discovery next task",
        description:
          "Gives the next market-discovery task for the running job. It says whether to find "
          + "more parent groups or locations for an accepted group. Call it first, then call it "
          + "again after each group or group-location pass until it says the job is complete.",
        handlerMapping: "marketDiscovery.job.next",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            couldNot: {
              type: "boolean",
              description:
                "True when the task you were last given could not be finished. Leave it out "
                + "when it was completed.",
            },
            note: {
              type: "string",
              description: "One line explaining what could not be completed.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a market parent group",
        description:
          "Records one parent company candidate for the selected customer type. The source page "
          + "must have been opened in this run and must prove the parent exists and belongs to "
          + "that customer type. High-confidence groups are accepted; lower confidence is parked "
          + "for review.",
        handlerMapping: "marketDiscovery.groups.record",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["groupName", "customerType", "sourceUrl", "reasoning"],
          properties: {
            groupName: { type: "string", description: "The parent company name." },
            customerType: {
              type: "string",
              description: "The selected customer type this parent company belongs to.",
            },
            website: { type: "string", description: "The parent company's website, when known." },
            sourceUrl: {
              type: "string",
              description:
                "The exact page opened in this run that proves the parent company and type.",
            },
            sourceName: { type: "string", description: "What to call that source on screen." },
            reasoning: {
              type: "string",
              description:
                "One line explaining why this is a real parent company of the selected type.",
            },
            confidence: {
              type: "string",
              enum: ["HIGH", "MEDIUM", "LOW"],
              description:
                "HIGH only when the source page plainly proves the parent and customer type.",
            },
          },
        }),
      },
      {
        name: "Comax — Review a market parent group",
        description:
          "Changes a discovered parent group's outcome: accepted, needs check, duplicate or "
          + "rejected. Use this only when later evidence changes the first outcome.",
        handlerMapping: "marketDiscovery.groups.review",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["groupName", "status"],
          properties: {
            groupName: { type: "string" },
            status: {
              type: "string",
              enum: ["ACCEPTED", "NEEDS_CHECK", "DUPLICATE", "REJECTED"],
            },
          },
        }),
      },
      {
        name: "Comax — Read a market parent group's locations task",
        description:
          "Returns the accepted parent group currently being expanded, plus the customers and "
          + "prospects already on file so duplicate locations are not re-filed.",
        handlerMapping: "marketDiscovery.locations.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            groupName: {
              type: "string",
              description: "The accepted parent group to read. Leave it out for the current task.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a market-discovery location",
        description:
          "Records one UK location under an accepted market-discovery parent group. The location "
          + "source page must have been opened in this run, and the site must have a full UK "
          + "postcode — Comax delivers from England, so sites abroad are refused. Existing "
          + "customers and existing prospects are skipped and counted as duplicates.",
        handlerMapping: "marketDiscovery.locations.record",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["groupName", "siteName", "postcode", "sourceUrl", "reasoning"],
          properties: {
            groupName: { type: "string", description: "The accepted parent group name." },
            siteName: { type: "string", description: "The location name as published." },
            town: { type: "string", description: "The town it is in." },
            postcode: {
              type: "string",
              description:
                "The site's full UK postcode, from the page you opened. Required: a site "
                + "without one, or with a postcode from another country, will be refused.",
            },
            sourceUrl: {
              type: "string",
              description: "The exact page opened in this run that lists this location.",
            },
            sourceName: { type: "string", description: "What to call that source on screen." },
            reasoning: {
              type: "string",
              description: "One line explaining why this location belongs to this parent group.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "sales-opportunity-report",
    // Named for the client, like the research connector above, and inside the
    // same `salesData` fence so the framework template strips it wholesale.
    name: "Comax Opportunity Report",
    description:
      "Lets an agent build the opportunity report: price every prospect from the spend of "
      + "similar customers, find the categories a chain member is not buying that its siblings "
      + "are, and file the report with its own summary on top.",
    category: "WORKFLOW",
    // Reads the workspace's own sales data and writes one report row. Every
    // figure comes from a deterministic pass in code; nothing external.
    authMode: "NONE",
    // Restricted for the same reason as the research connector: these tools
    // serve screens that only exist for a workspace with the sales data
    // section switched on.
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Comax — Price the prospects",
        description:
          "Prices every prospect on file against the customers most like it — same kind of "
          + "business, similar size in beds or pupils, its own chain first — and writes the "
          + "report's first section. Returns every priced row with the customers it was "
          + "compared to, so you can read the results. Call this first; it opens the report.",
        handlerMapping: "opportunityReport.matchProspects",
        requiredRole: "ADMIN",
        // Writes the computed section onto the workspace's own report row.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Comax — Find the gaps inside the chains",
        description:
          "Finds every product category a chain member's siblings buy that it does not, prices "
          + "each gap from what the siblings spend, and writes the report's second section and "
          + "its headline totals. Call it after the prospects are priced.",
        handlerMapping: "opportunityReport.findGroupGaps",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Comax — Save the report summary",
        description:
          "Saves your executive summary onto the report and finishes it. Quote every pound "
          + "figure exactly as the pricing tools returned it — a summary naming a figure the "
          + "report does not hold is refused, with the offending figures listed so you can "
          + "correct it. List anything that could not be priced as an exception.",
        handlerMapping: "opportunityReport.saveSummary",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["summary"],
          properties: {
            summary: {
              type: "string",
              description:
                "The executive summary as markdown: which opportunities matter most and why, "
                + "naming chains and sites, in plain sentences a salesperson can act on.",
            },
            exceptions: {
              type: "array",
              items: { type: "string" },
              description:
                "One line each for anything the report could not do — a prospect that could "
                + "not be priced, a chain too small to compare.",
            },
          },
        }),
      },
    ],
  },
  // template:remove:end
  {
    key: "google-gmail",
    name: "Gmail Mailbox",
    description:
      "Connects one dedicated Gmail mailbox by consent — never a person's own. Sonae can read "
      + "new mail in it and reply from it, so the whole exchange sits in the inbox for any "
      + "colleague to open and inspect. The platform holds a scoped, revocable key, never a "
      + "password; disconnecting revokes the key at Google.",
    category: "EMAIL",
    // The platform's first OAuth connector: the consent flow, encrypted token
    // storage, refresh, and revocation in connectorOAuth.ts exist because of
    // this definition, and every later connector reuses them.
    authMode: "OAUTH",
    oauthProvider: "google",
    // Restricted to one tenant: the mailbox belongs to a company, and its
    // mail must never be readable from another.
    tenantAvailability: "TENANT_RESTRICTED",
    // One scope covering read, send, and label changes on the connected
    // mailbox — the minimum the reply loop needs, and exactly what the admin
    // screen and Google's consent screen both display (commitment 3).
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read mailbox",
        description:
          "Reads mail from the connected Gmail mailbox: new messages, or one message in full. "
          + "Reads only — nothing is sent, marked, or deleted.",
        handlerMapping: "gmail.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "A Gmail message id, to read that message in full.",
            },
          },
        }),
      },
      {
        name: "Reply to a sender",
        description:
          "Replies from the connected mailbox, in the sender's own thread. It can only answer "
          + "the sender of a message the mailbox received — it cannot start new mail, add "
          + "recipients, or send twice to the same thread within an hour. The reply lands in "
          + "the mailbox's Sent folder like any colleague's mail.",
        handlerMapping: "gmail.reply",
        requiredRole: "ADMIN",
        // WRITE, with the rails in the handler beyond the model's reach:
        // reply-to-sender-only, no no-reply addresses, per-thread hourly
        // cap, and a per-day ceiling (commitment 6). Autonomy comes from the
        // mailbox agent's own flag, not from this definition.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The Gmail message id being replied to.",
            },
            body: {
              type: "string",
              description: "The reply text, plain.",
            },
          },
          required: ["messageId", "body"],
        }),
      },
    ],
  },
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
