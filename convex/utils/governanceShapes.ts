import { v } from "convex/values";

import { rowShape } from "./rowShape";

/** What the governance, connection and job screens hand back. */

const riskLevelShape = v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"));
const sideEffectLevelShape = v.union(
  v.literal("READ"),
  v.literal("WRITE"),
  v.literal("DESTRUCTIVE"),
  v.literal("EXTERNAL"),
);

export const authEventListShape = v.array(v.object({
  ...rowShape.authEvents.fields,
  companyName: v.union(v.string(), v.null()),
}));

export const companyEngagementShape = v.object({
  daysBack: v.number(),
  people: v.object({ total: v.number(), active: v.number(), quiet: v.number() }),
  questions: v.object({ asked: v.number(), byPeople: v.number() }),
  signIns: v.object({ total: v.number(), onDays: v.number() }),
  invitations: v.object({ pending: v.number(), accepted: v.number(), revoked: v.number() }),
  daily: v.array(v.object({
    day: v.string(),
    didNotSignIn: v.number(),
    oneSession: v.number(),
    twoSessions: v.number(),
    threeSessions: v.number(),
    fourSessions: v.number(),
    fivePlusSessions: v.number(),
    questions: v.number(),
  })),
  everyone: v.array(v.object({
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    isAdmin: v.boolean(),
    lastSeenAt: v.optional(v.number()),
    signIns: v.number(),
    questions: v.number(),
    agentRuns: v.number(),
  })),
});

export const connectionListShape = v.array(v.object({
  id: v.string(),
  name: v.string(),
  kind: v.union(
    v.literal("MAILBOX"),
    v.literal("PHONE"),
    v.literal("PROVIDER"),
    v.literal("WIDGET"),
    v.literal("TOOL_SERVER"),
  ),
  working: v.union(v.boolean(), v.null()),
  detail: v.string(),
  checkedAt: v.union(v.number(), v.null()),
  lastHeardAt: v.union(v.number(), v.null()),
}));

export const governanceActivityShape = v.object({
  days: v.number(),
  timeline: v.array(v.object({
    date: v.string(),
    finished: v.number(),
    waited: v.number(),
    unfinished: v.number(),
  })),
  runs: v.object({ total: v.number(), perDay: v.number(), unfinished: v.number() }),
  actions: v.object({
    read: v.number(),
    write: v.number(),
    external: v.number(),
    destructive: v.number(),
    total: v.number(),
    readShare: v.number(),
  }),
  oversight: v.object({
    decided: v.number(),
    approved: v.number(),
    refused: v.number(),
    waiting: v.number(),
    medianMinutes: v.union(v.number(), v.null()),
  }),
  busiest: v.array(v.object({
    id: v.string(),
    name: v.string(),
    risk: v.string(),
    runs: v.number(),
  })),
  truncated: v.boolean(),
});

export const governanceDashboardShape = v.object({
  conformance: v.array(v.object({
    agentId: v.string(),
    agentName: v.string(),
    rating: riskLevelShape,
    observed: v.array(sideEffectLevelShape),
    suggested: riskLevelShape,
  })),
  scope: v.union(v.literal("PLATFORM"), v.literal("WORKSPACE")),
  attention: v.number(),
  state: v.union(
    v.literal("NEEDS_ATTENTION"),
    v.literal("SETTLED"),
    v.literal("NOT_SET_UP"),
  ),
  systems: v.number(),
  riskMix: v.object({
    high: v.number(),
    medium: v.number(),
    low: v.number(),
    unrated: v.number(),
  }),
  checks: v.array(v.object({
    key: v.string(),
    state: v.union(
      v.literal("NEEDS_ATTENTION"),
      v.literal("SETTLED"),
      v.literal("NOT_SET_UP"),
    ),
    count: v.optional(v.number()),
    href: v.string(),
  })),
  retentionTooShort: v.array(v.string()),
});

export const jobLedgerShape = v.array(v.object({
  job: v.string(),
  lastRanAt: v.union(v.number(), v.null()),
  lastOk: v.union(v.boolean(), v.null()),
  lastSucceededAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  consecutiveFailures: v.number(),
  expectedEveryMinutes: v.union(v.number(), v.null()),
  isOverdue: v.boolean(),
}));

export const mailboxListShape = v.object({
  page: v.array(v.object({
    _id: v.id("mailboxMessages"),
    sender: v.string(),
    subject: v.optional(v.string()),
    decision: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    repliedAt: v.optional(v.number()),
    createdAt: v.number(),
    /** The Decisions that ran on this email, oldest first; empty before Phase D or with every mode off. */
    decisions: v.array(v.object({
      key: v.string(),
      copyKey: v.string(),
      answer: v.string(),
      certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
      source: v.union(v.literal("TYPESAFE"), v.literal("TEXT_MODEL"), v.literal("RULES")),
      probabilities: v.optional(v.string()),
    })),
  })),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(
    v.literal("SplitRecommended"),
    v.literal("SplitRequired"),
    v.null(),
  )),
});

export const documentEvidenceShape = v.array(v.object({
  documentId: v.id("knowledgeDocuments"),
  positiveEvidence: v.number(),
  negativeEvidence: v.number(),
  lastEvidenceAt: v.number(),
}));

export const messageEvidenceShape = v.union(v.null(), v.object({
  documents: v.array(v.object({ id: v.string(), title: v.string() })),
  memories: v.array(v.object({ id: v.string(), title: v.string(), alwaysOn: v.boolean() })),
  skills: v.array(v.object({ id: v.string(), name: v.string() })),
  wikiPages: v.array(v.object({ title: v.string(), isPlatform: v.boolean() })),
  /** The Decisions that ran on the turn this answer replied to. */
  checks: v.array(v.object({
    key: v.string(),
    copyKey: v.string(),
    answer: v.string(),
    certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
    source: v.union(v.literal("TYPESAFE"), v.literal("TEXT_MODEL"), v.literal("RULES")),
    probabilities: v.optional(v.string()),
  })),
  hasAny: v.boolean(),
}));

export const intentRouteShape = v.object({
  matchedAgentId: v.union(v.string(), v.null()),
  confidence: v.number(),
});

export const erasureShape = v.object({
  email: v.optional(v.string()),
  summary: v.array(v.string()),
  tallies: v.array(v.object({
    table: v.string(),
    treatment: v.union(v.literal("ERASE"), v.literal("DISSOCIATE"), v.literal("RETAIN")),
    rows: v.number(),
  })),
});

export const platformOverviewShape = v.object({
  windowDays: v.number(),
  coverage: v.object({ complete: v.boolean(), incomplete: v.array(v.string()) }),
  clients: v.object({
    total: v.number(),
    healthy: v.number(),
    needsAttention: v.number(),
    unused: v.number(),
  }),
  money: v.object({
    projectedMrrGBP: v.number(),
    aiSpendGBP: v.number(),
    spendAsPercentOfRevenue: v.union(v.number(), v.null()),
  }),
  seats: v.object({ total: v.number(), active: v.number(), utilisation: v.number() }),
  todo: v.object({ pendingInvitations: v.number(), companiesWithNoPlan: v.number() }),
  planDistribution: v.array(v.object({ name: v.string(), companies: v.number() })),
  daily: v.array(v.object({
    day: v.string(),
    questions: v.number(),
    aiCalls: v.number(),
    spendGBP: v.number(),
  })),
  signInBands: v.array(v.object({
    day: v.string(),
    didNotSignIn: v.number(),
    oneSession: v.number(),
    twoSessions: v.number(),
    threeSessions: v.number(),
    fourSessions: v.number(),
    fivePlusSessions: v.number(),
  })),
  portfolio: v.array(v.object({
    companyId: v.id("companies"),
    name: v.string(),
    planName: v.optional(v.string()),
    mrrGBP: v.number(),
    people: v.number(),
    activeRecently: v.number(),
    quiet: v.number(),
    state: v.union(v.literal("HEALTHY"), v.literal("NEEDS_ATTENTION"), v.literal("UNUSED")),
  })),
});

export const marketDiscoveryJobShape = v.union(v.null(), v.object({
  status: v.string(),
  phase: v.string(),
  phaseLabel: v.string(),
  percent: v.number(),
  customerType: v.string(),
  targetGroupCount: v.number(),
  groupsAccepted: v.number(),
  groupsRejected: v.number(),
  groupsDuplicate: v.number(),
  groupsNeedsCheck: v.number(),
  locationsFiled: v.number(),
  locationsDuplicate: v.number(),
  locationsNeedsCheck: v.number(),
  currentLabel: v.union(v.string(), v.null()),
  spentGBP: v.number(),
  maxCostGBP: v.optional(v.number()),
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  endedReason: v.union(v.string(), v.null()),
}));

export const callListShape = v.object({
  page: v.array(v.object({
    _id: v.id("phoneCalls"),
    fromMasked: v.string(),
    status: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    summary: v.optional(v.string()),
    matchedCustomerKey: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    turnCount: v.number(),
  })),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(
    v.literal("SplitRecommended"),
    v.literal("SplitRequired"),
    v.null(),
  )),
});

export const personalMemoryListShape = v.array(v.object({
  memoryId: v.id("userMemories"),
  content: v.string(),
  sourceType: v.string(),
  autoApplied: v.boolean(),
  createdAt: v.number(),
  usageCount: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
}));

export const voicePreviewTicketShape = v.object({
  relayUrl: v.string(),
  ticket: v.string(),
});

export const spokenVoiceShape = v.object({
  voice: v.string(),
  options: v.array(v.object({ key: v.string(), description: v.string() })),
});

export const workflowNodeConfigShape = v.object({
  mapping: v.string(),
  template: v.string(),
  agentName: v.optional(v.string()),
  agentSystemPrompt: v.optional(v.string()),
  agentInputFields: v.optional(v.string()),
  agentOutputFields: v.optional(v.string()),
  agentAllowInternet: v.optional(v.boolean()),
});

/**
 * The three `governanceAction` surfaces.
 *
 * These were invisible until 2026-08-27: `governanceAction` was missing from the
 * drift guard's builder list, so three client-callable declarations were never
 * counted and the population read 11 when it was 14. The guard now checks its
 * own list against the builders `tenantFunctions.ts` actually exports.
 */

const aiSystemEntryLikeShape = v.object({
  id: v.string(),
  kind: v.string(),
  name: v.string(),
  purpose: v.string(),
  ownerName: v.string(),
  risk: v.string(),
  humanApproves: v.boolean(),
  facesPublic: v.boolean(),
  model: v.optional(v.string()),
  lastActiveAt: v.optional(v.number()),
  missing: v.array(v.string()),
});

export const evidencePackShape = v.object({
  register: v.array(aiSystemEntryLikeShape),
  runs: v.array(v.object({
    id: v.string(),
    at: v.number(),
    agentName: v.string(),
    lines: v.array(v.string()),
    blockedCount: v.number(),
  })),
  decisions: v.array(v.object({
    id: v.string(),
    at: v.number(),
    agentName: v.string(),
    status: v.string(),
    decidedBy: v.string(),
    reason: v.string(),
  })),
  policies: v.array(v.object({
    id: v.string(),
    name: v.string(),
    priority: v.string(),
    instruction: v.string(),
    scope: v.string(),
  })),
  models: v.array(v.string()),
  summary: v.string(),
  counts: v.object({
    systems: v.number(),
    runs: v.number(),
    decisions: v.number(),
    policies: v.number(),
    blocked: v.number(),
  }),
  runsOmitted: v.number(),
  scope: v.union(v.literal("PLATFORM"), v.literal("WORKSPACE")),
});

export const subjectAccessShape = v.object({
  person: v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.string(),
  }),
  sections: v.array(v.object({
    table: v.string(),
    treatment: v.string(),
    reason: v.string(),
    /** Whole rows from whichever table the rule names; there is no one shape. */
    rows: v.array(v.any()),
    truncated: v.optional(v.boolean()),
  })),
});

export const retainedExceptionListShape = v.array(v.object({
  table: v.string(),
  reason: v.string(),
}));
