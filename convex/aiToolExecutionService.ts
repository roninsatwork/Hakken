import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { BUILT_IN_TOOL_CONNECTORS } from "./toolConnectorDefinitions";
import {
  UNCONFIGURED_EMAIL_ADDRESS,
  buildEmailFromAddress,
  resolveEnvFromAddress,
} from "./emailBrandingService";
import { sendResendEmail } from "./resendEmailService";
import { resolveConnectorSecrets } from "./connectorSecretResolver";
import { isConnectorOAuthProviderConfigured } from "./connectorOAuthProviders";
import { isConnectorTokenEncryptionConfigured } from "./connectorTokenCrypto";
import {
  HTTP_CONNECTOR_TIMEOUT_MS,
  describeHttpConnectorResponse,
  resolveHttpConnectorBody,
  resolveHttpConnectorTarget,
  truncateHttpConnectorBody,
} from "./httpConnectorPolicy";
import {
  parseRecipients,
  buildAgentNotificationEmail,
  resolveNotificationContent,
  resolveNotificationRecipients,
} from "./aiToolNotificationService";
import { getErrorMessage, isRecord } from "./utils/lang";
import { appError } from "./utils/appError";

type JsonSchema = Record<string, unknown>;

export type ToolAccessRole = "ADMIN" | "SUPER_ADMIN";

/**
 * Whatever role the caller happens to hold, including ones that may not execute
 * anything. Deciding that is `canExecuteTool`'s job, not this type's.
 */
export type ToolExecutorRole = "USER" | "ADMIN" | "SUPER_ADMIN" | "READ_ONLY" | "AUDITOR";

/**
 * The only roles that may run a tool.
 *
 * An allowlist rather than a list of exclusions. The check here used to refuse
 * `USER` by name and admit everything else, which was correct while three roles
 * existed and became a privilege escalation the moment a fourth was added — the
 * oversight roles would have fallen through to the administrator path. Written
 * this way, a role added in future is refused until someone deliberately adds
 * it.
 */
const TOOL_EXECUTOR_ROLES: readonly ToolExecutorRole[] = ["ADMIN", "SUPER_ADMIN"];
export type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";
export type ToolHandlerExecutionInput = {
  ctx: Pick<ActionCtx, "runMutation" | "runQuery" | "runAction">;
  handlerMapping: string;
  args: Record<string, unknown>;
  agentId?: Id<"agents">;
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  runId?: Id<"agentRuns">;
  toolCallId?: Id<"agentToolCalls">;
  /**
   * The catalogue row the agent invoked.
   *
   * Carried so a handler can find the connector it belongs to, and through that
   * the secret references it was configured with. Looking the tool up by
   * handler mapping instead would guess at which install was meant when a
   * global and a tenant-specific one both exist.
   */
  toolId?: Id<"aiTools">;
  fallbackQuery?: string;
};

export type ToolDefinitionInput = {
  /** The administrator's label. Shown on screens; never offered to a model. */
  name: string;
  description: string;
  /** What the model is offered. Chosen per tool — see `toolModelName.ts`. */
  modelName?: string;
  /** Where the call is routed. Internal; never offered to a model. */
  handlerMapping: string;
  requiredRole: ToolAccessRole;
  inputSchema?: unknown;
};

export type ProviderToolDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema?: JsonSchema;
};

export type ToolCallPayload = {
  name: string;
  args: Record<string, unknown>;
};

export type ToolAccessDecision = {
  allowed: boolean;
  reason?: string;
};

export type ToolExecutionPolicyInput = {
  requiredRole: ToolAccessRole;
  sideEffectLevel?: ToolSideEffectLevel;
  confirmationRequired?: boolean;
};

export type NormalizedToolExecutionPolicy = {
  requiredRole: ToolAccessRole;
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
};

export type ToolArgumentValidationResult = {
  ok: boolean;
  errors: string[];
};



function getJsonSchemaType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function getStringToolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNumberToolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getOptionalStringToolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** A list of lines, dropping whatever in it is not a usable line. */
// template:remove:start salesData
function getOptionalStringArrayToolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return lines.length > 0 ? lines : undefined;
}
// template:remove:end


/**
 * A yes/no argument, however the model chose to spell it.
 *
 * Models send `false` for a boolean and `"false"` for a string, and which one
 * arrives varies by provider even when the schema is explicit. Reading only one
 * form meant a setting the agent believed it had changed silently kept its
 * default — found when a page reader instructed to include navigation returned
 * main content anyway, which is the whole page for some sites.
 */
function getOptionalBooleanToolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

export function normalizeToolFunctionName(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1");
  return normalized.length > 0 ? normalized : "tool";
}

export function parseToolInputSchema(value: unknown): JsonSchema | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;

  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!isRecord(parsed)) {
    throw appError("INVALID_INPUT", "Tool input schema must be a JSON object.");
  }

  return parsed;
}

export function validateToolJsonSchemaString(value: unknown, label = "Tool schema") {
  const parsed = parseToolInputSchema(value);
  if (!parsed) return undefined;

  if (parsed.type !== undefined && parsed.type !== "object") {
    throw appError("INVALID_INPUT", `${label} must use root type "object".`);
  }

  if (parsed.properties !== undefined && !isRecord(parsed.properties)) {
    throw appError("INVALID_INPUT", `${label} properties must be a JSON object.`);
  }

  if (parsed.required !== undefined) {
    if (!Array.isArray(parsed.required) || !parsed.required.every((entry) => typeof entry === "string")) {
      throw appError("INVALID_INPUT", `${label} required must be an array of strings.`);
    }
  }

  return parsed;
}

export function validateToolCallArgsAgainstSchema(args: {
  schema?: unknown;
  callArgs: Record<string, unknown>;
}): ToolArgumentValidationResult {
  const schema = parseToolInputSchema(args.schema);
  if (!schema) return { ok: true, errors: [] };

  const errors: string[] = [];
  const required = Array.isArray(schema.required) ? schema.required.filter((entry) => typeof entry === "string") : [];

  for (const field of required) {
    if (!(field in args.callArgs)) {
      errors.push(`Missing required tool argument '${field}'.`);
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [field, propertySchema] of Object.entries(properties)) {
    if (!(field in args.callArgs) || !isRecord(propertySchema)) continue;

    const expectedType = propertySchema.type;
    if (typeof expectedType !== "string") continue;

    const actualType = getJsonSchemaType(args.callArgs[field]);
    if (expectedType === "integer") {
      if (actualType !== "number" || !Number.isInteger(args.callArgs[field])) {
        errors.push(`Tool argument '${field}' must be an integer.`);
      }
      continue;
    }

    if (actualType !== expectedType) {
      errors.push(`Tool argument '${field}' must be a ${expectedType}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * What a model is told about one tool.
 *
 * The name comes from the tool's own `modelName` and from nowhere else. It used
 * to be derived from the routing key, which welded together where a call goes
 * and what the model calls it — so a tool could not be renamed without being
 * rerouted, and every tool's name was really a plumbing decision.
 *
 * **A tool with no `modelName` throws rather than falling back.** A fallback
 * would be a second answer to the question this field exists to answer, and the
 * caller skips a tool it cannot declare — so a nameless tool is simply never
 * offered. `toolModelName.test.ts` makes sure none exists to begin with.
 */
export function buildProviderToolDeclaration(tool: ToolDefinitionInput): ProviderToolDeclaration {
  const modelName = tool.modelName?.trim();
  if (!modelName) {
    throw appError("INVALID_INPUT", `Tool "${tool.name}" has no model name, so it cannot be offered to a model.`);
  }

  return {
    name: modelName,
    description: tool.description,
    parametersJsonSchema: parseToolInputSchema(tool.inputSchema),
  };
}

export function parseToolCallPayload(args: { name?: unknown; callArgs?: unknown }): ToolCallPayload {
  if (typeof args.name !== "string" || args.name.trim().length === 0) {
    throw appError("INVALID_INPUT", "Tool call payload must include a non-empty string name.");
  }

  if (typeof args.callArgs === "undefined" || args.callArgs === null) {
    return { name: normalizeToolFunctionName(args.name), args: {} };
  }

  if (!isRecord(args.callArgs)) {
    throw appError("INVALID_INPUT", "Tool call payload args must be a JSON object.");
  }

  return {
    name: normalizeToolFunctionName(args.name),
    args: args.callArgs,
  };
}

export function buildToolResultPayload(args: { status: "success" | "error"; data?: unknown; error?: string }) {
  if (args.status === "error") {
    return {
      status: "error",
      error: args.error || "Tool execution failed.",
    };
  }

  return {
    status: "success",
    data: args.data ?? null,
  };
}

export function buildToolFailureResult(error: unknown) {
  return buildToolResultPayload({
    status: "error",
    error: getErrorMessage(error, "Unknown tool execution error."),
  });
}

export function normalizeToolExecutionPolicy(tool: ToolExecutionPolicyInput): NormalizedToolExecutionPolicy {
  const sideEffectLevel = tool.sideEffectLevel ?? "READ";
  const confirmationRequired = sideEffectLevel === "READ"
    ? (tool.confirmationRequired ?? false)
    : true;

  return {
    requiredRole: tool.requiredRole,
    sideEffectLevel,
    confirmationRequired,
  };
}

/**
 * `autonomous` waives the confirmation requirement, and nothing else.
 *
 * `normalizeToolExecutionPolicy` forces `confirmationRequired` to true for
 * anything that is not a plain read, deliberately, because that is a true
 * statement about the tool. Autonomy is a property of the *agent*, so it cannot
 * be expressed by passing a different `confirmationRequired` — the normalizer
 * would overrule it and an agent set to run unattended would still park on
 * every write.
 *
 * It is checked at the confirmation branches rather than at the top on purpose:
 * an autonomous agent still cannot exceed its role or reach across a tenant
 * boundary. Autonomy removes the human, not the permissions.
 */
export function canExecuteTool(args: {
  requiredRole: ToolAccessRole;
  userRole?: ToolExecutorRole;
  userCompanyId?: string;
  targetCompanyId?: string;
  sideEffectLevel?: ToolSideEffectLevel;
  confirmationRequired?: boolean;
  confirmationGranted?: boolean;
  autonomous?: boolean;
}): ToolAccessDecision {
  const policy = normalizeToolExecutionPolicy({
    requiredRole: args.requiredRole,
    sideEffectLevel: args.sideEffectLevel,
    confirmationRequired: args.confirmationRequired,
  });

  if (!args.userRole) {
    return { allowed: false, reason: "Tool execution requires an authenticated user." };
  }

  if (!TOOL_EXECUTOR_ROLES.includes(args.userRole)) {
    return { allowed: false, reason: "Tool execution requires administrator privileges." };
  }

  if (policy.requiredRole === "SUPER_ADMIN" && args.userRole !== "SUPER_ADMIN") {
    return { allowed: false, reason: "Tool execution requires super-admin privileges." };
  }

  const needsConfirmation = policy.confirmationRequired
    && !args.confirmationGranted
    && args.autonomous !== true;

  if (args.userRole === "SUPER_ADMIN") {
    if (needsConfirmation) {
      return { allowed: false, reason: "Tool execution requires explicit user confirmation." };
    }

    return { allowed: true };
  }

  if (args.targetCompanyId && (!args.userCompanyId || args.userCompanyId !== args.targetCompanyId)) {
    return { allowed: false, reason: "Tool execution is not allowed across tenant boundaries." };
  }

  if (needsConfirmation) {
    return { allowed: false, reason: "Tool execution requires explicit user confirmation." };
  }

  return { allowed: true };
}

export function assertCanExecuteTool(args: Parameters<typeof canExecuteTool>[0]) {
  const decision = canExecuteTool(args);
  if (!decision.allowed) {
    throw appError("UNAUTHORIZED", decision.reason || "Tool execution denied.");
  }
}

type RegisteredToolHandler = (input: ToolHandlerExecutionInput) => Promise<unknown>;

export const NOT_IMPLEMENTED_TOOL_STATUS = "not_implemented";

/**
 * The result of calling a connector that is declared but has no implementation.
 *
 * The payload has always said so. What did not was the *record*: this returns
 * normally, so the runtime marked the call SUCCESS and the run log showed a
 * green tick against a tool that did nothing. Someone reading that log — or the
 * eval that grades it — had no way to tell a working connector from a declared
 * one. `isNotImplementedToolResult` is how the runtime now tells them apart.
 */
function buildConnectorStubResult(input: ToolHandlerExecutionInput, connectorName?: string) {
  const subject = connectorName ?? input.handlerMapping;
  return {
    ok: false,
    status: NOT_IMPLEMENTED_TOOL_STATUS,
    connectorName,
    handlerMapping: input.handlerMapping,
    companyId: input.companyId,
    message: `${subject} cannot run: nothing implements it on this deployment.`,
  };
}

/** Whether a handler result means "this connector does not exist yet". */
export function isNotImplementedToolResult(value: unknown): boolean {
  return (
    value !== null
    && typeof value === "object"
    && (value as { status?: unknown }).status === NOT_IMPLEMENTED_TOOL_STATUS
  );
}

const REGISTERED_TOOL_HANDLERS: Record<string, RegisteredToolHandler> = {
  /**
   * Read a web page.
   *
   * The first handler here that reaches outside the platform, which is why the
   * context type had to admit actions: everything before this read or wrote our
   * own database.
   */
  /**
   * Read the connected Gmail mailbox.
   *
   * Tenant comes from the run context, never from model args — the same rule
   * every handler here follows. The connector resolves through the invoked
   * tool's own install, so a global and a tenant install cannot be confused.
   */
  /**
   * Any tool on any server a company has connected.
   *
   * **One entry for all of them, and deny-by-default is untouched.** The
   * allowlist is still matched exactly; this is one deliberate addition, and
   * anything not on the list still refuses. Which tool and which server are read
   * from the invoked tool's own record — never from an argument, so an injected
   * instruction has no field to set.
   *
   * Briefly, during phase 3, each imported tool needed its own entry here:
   * the name a model was offered came from the handler mapping, so distinct
   * names meant distinct mappings, which would have forced this allowlist to
   * grow prefix matching. Phase 4 gave tools their own `modelName` and the need
   * went away.
   */
  "mcp.call": async (input) => {
    if (!input.toolId) {
      return { ok: false, error: "This tool cannot be identified, so it was not run." };
    }
    return await input.ctx.runAction(internal.mcpToolCall.callServerTool, {
      toolId: input.toolId,
      ...(input.companyId ? { companyId: input.companyId } : {}),
      args: input.args,
    });
  },
  "gmail.read": async (input) => {
    const messageId = getOptionalStringToolArg(input.args, "messageId");
    return await input.ctx.runAction(internal.gmailConnector.readMailbox, {
      ...(input.toolId ? { toolId: input.toolId } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(messageId ? { messageId } : {}),
    });
  },
  /**
   * Reply from the connected Gmail mailbox, inside the rails.
   *
   * The model supplies a message id and a body — never an address. Who
   * receives the reply is read off the original message server-side, and the
   * no-reply, per-thread and per-day rails live in the handler's action
   * (commitment 6 of the Gmail plan); a breached rail files a task instead.
   */
  "gmail.reply": async (input) => {
    const messageId = getStringToolArg(input.args, "messageId");
    const body = getStringToolArg(input.args, "body");
    return await input.ctx.runAction(internal.gmailConnector.replyToMessage, {
      ...(input.toolId ? { toolId: input.toolId } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      messageId,
      body,
    });
  },
  "web.scrape": async (input) => {
    const url = getStringToolArg(input.args, "url");
    const mainContentOnly = getOptionalBooleanToolArg(input.args, "mainContentOnly");

    return await input.ctx.runAction(internal.webScrapeActions.scrapeUrl, {
      url,
      ...(mainContentOnly === undefined ? {} : { mainContentOnly }),
    });
  },
  /**
   * Run an Apify job.
   *
   * The agent chooses the job and everything it is fed, so one installed tool
   * covers any Apify scraper without the platform learning about any of them.
   * The account token never reaches the model — it stays in the environment,
   * where the job is started.
   *
   * This is deliberately wider than "Call an API", which fixes its address in
   * configuration. Apify is billed per item collected, so an agent that picks
   * its own jobs can spend on work nobody asked for. What is still enforced,
   * because neither restricts a legitimate use: every address it is pointed at
   * is checked before the job starts, and a job must be traceable to a person.
   *
   * It reports back the moment Apify accepts the job rather than waiting for
   * results, which arrive later by webhook. The agent is told that outright: a
   * tool that answers "started" while its reader hears "finished" is worse than
   * one that is slow.
   */
  /**
   * Find an Apify job, or read what one needs.
   *
   * The reason the run tool can stay generic without a job id and a settings
   * shape being typed into an agent's instructions by hand. Apify publishes
   * both; the agent reads them itself.
   */
  "apify.actor.describe": async (input) => {
    const search = getOptionalStringToolArg(input.args, "search");
    const job = getOptionalStringToolArg(input.args, "job");

    return await input.ctx.runAction(internal.apify.describeApifyActorInternal, {
      ...(search ? { search } : {}),
      ...(job ? { actorId: job } : {}),
    });
  },
  "apify.actor.run": async (input) => {
    if (!input.userId) {
      throw appError("UNAUTHORIZED", "An Apify job has to be started by a person, so it can be traced back to one.");
    }

    const actorId = getStringToolArg(input.args, "job");
    const settings = getOptionalStringToolArg(input.args, "settings") ?? "{}";

    const runId: string = await input.ctx.runAction(internal.apify.startApifyActorInternal, {
      actorId,
      inputJson: settings,
      ...(input.companyId ? { companyId: input.companyId } : {}),
      startedBy: input.userId,
    });

    return {
      started: true,
      runId,
      message:
        "The job has started. Its results arrive separately a few minutes later; "
        + "they are not available in this reply.",
    };
  },
  // template:remove:start salesReports
  /**
   * Write the board report.
   *
   * The one way a runtime agent run produces the structured report the
   * Reports page shows. The generation itself gathers the same grounding the
   * interactive runtime injects — the agent's memories and its knowledge base
   * — so a scheduled "write the weekly report" objective ends in a saved,
   * grounded report rather than a chat reply describing one.
   */
  "salesReports.generate": async (input) => {
    if (!input.agentId) {
      throw appError("INVALID_INPUT", "The board report is written from an agent's knowledge, so the run needs an agent.");
    }

    const focus = getOptionalStringToolArg(input.args, "focus");

    const result = await input.ctx.runAction(internal.salesReportActions.generateReport, {
      agentId: input.agentId,
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(focus ? { focus } : {}),
    });

    if (!result) {
      return {
        saved: false,
        message: "No pipeline document in this agent's knowledge yet. Upload one, then run again.",
      };
    }

    return {
      saved: true,
      headline: result.headline,
      message: "The board report is written and filed on the Reports page.",
    };
  },
  // template:remove:end
  // template:remove:start salesData
  /**
   * Read a customer, so the agent knows what it is looking for.
   *
   * The company comes from the run's tenant context and never from the model,
   * which is what keeps one workspace's agent inside one workspace's customers
   * however it is instructed.
   */
  "salesCustomers.research.read": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Customer research needs a workspace, and this run has none.");
    }

    const accountNameKey = getOptionalStringToolArg(input.args, "accountNameKey");

    return await input.ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
      companyId: input.companyId,
      ...(accountNameKey ? { accountNameKey } : {}),
    });
  },
  /**
   * Record one detail the agent found.
   *
   * Deliberately narrow. It writes one named field on one customer in one
   * workspace, only when that field is empty, and only with a source — which is
   * why the agent can be left to run without stopping for approval on each
   * write. A general "update the database" tool could not be.
   */
  "salesCustomers.research.record": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Customer research needs a workspace, and this run has none.");
    }

    const notFound = input.args.notFound === true || input.args.notFound === "true";

    return await input.ctx.runMutation(internal.salesDataResearch.recordResearchFinding, {
      companyId: input.companyId,
      accountNameKey: getStringToolArg(input.args, "accountNameKey"),
      field: getStringToolArg(input.args, "field"),
      value: getOptionalStringToolArg(input.args, "value"),
      confidence: getOptionalStringToolArg(input.args, "confidence"),
      sourceUrl: getOptionalStringToolArg(input.args, "sourceUrl"),
      sourceName: getOptionalStringToolArg(input.args, "sourceName"),
      reasoning: getOptionalStringToolArg(input.args, "reasoning"),
      notFound,
      // The person who started the run authors the write. An agent's edit still
      // needs a name against it, and this is the honest one.
      ...(input.userId ? { actorId: input.userId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    });
  },
  /**
   * Read a group, so the agent knows what it is looking for and what it
   * already has.
   */
  "salesCustomers.prospects.read": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Customer research needs a workspace, and this run has none.");
    }

    const groupName = getOptionalStringToolArg(input.args, "groupName");

    return await input.ctx.runQuery(internal.salesDataResearch.readGroupForProspecting, {
      companyId: input.companyId,
      ...(groupName ? { groupName } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  /**
   * File a site the agent found in a group the workspace supplies.
   *
   * Narrower than it looks. It can only write a prospect, only in a group the
   * workspace already sells to, and only for a site that is not already a
   * customer — the matching rules refuse the rest rather than merging them,
   * because a wrongly merged record is the one mistake here that reaches a
   * customer by telephone.
   */
  "salesCustomers.prospects.record": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Customer research needs a workspace, and this run has none.");
    }

    const siteName = getStringToolArg(input.args, "siteName");
    const recorded = await input.ctx.runMutation(internal.salesDataResearch.recordProspect, {
      companyId: input.companyId,
      groupName: getStringToolArg(input.args, "groupName"),
      siteName,
      town: getOptionalStringToolArg(input.args, "town"),
      postcode: getOptionalStringToolArg(input.args, "postcode"),
      sourceUrl: getOptionalStringToolArg(input.args, "sourceUrl"),
      sourceName: getOptionalStringToolArg(input.args, "sourceName"),
      reasoning: getOptionalStringToolArg(input.args, "reasoning"),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    });

    // A prospect found by the chain pass is the third pass's work, and it is
    // queued the moment it is filed rather than waiting for somebody to press
    // anything. Only when a job is running: a one-off prospecting run outside a
    // job leaves the queue alone.
    const prospectKey = (recorded as { prospectKey?: string } | null)?.prospectKey;
    if (prospectKey) {
      await input.ctx.runMutation(internal.salesDataResearchJobs.appendProspectItemInternal, {
        companyId: input.companyId,
        prospectKey,
        siteName,
      });
    }

    return recorded;
  },
  /**
   * Hand the run its next piece of work.
   *
   * The only tool that knows there is a job at all. Everything else the agent
   * does is the same whether it was started by a person or by the queue, which
   * is what keeps a single manual run working exactly as it did.
   */
  "salesCustomers.job.next": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Customer research needs a workspace, and this run has none.");
    }

    const couldNot = input.args.couldNot === true || input.args.couldNot === "true";

    return await input.ctx.runMutation(internal.salesDataResearchJobs.claimNextTaskInternal, {
      companyId: input.companyId,
      previousOutcome: couldNot ? "COULD_NOT" : "DONE",
      note: getOptionalStringToolArg(input.args, "note"),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  "marketDiscovery.job.next": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Market discovery needs a workspace, and this run has none.");
    }

    const couldNot = input.args.couldNot === true || input.args.couldNot === "true";

    return await input.ctx.runMutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId: input.companyId,
      previousOutcome: couldNot ? "COULD_NOT" : "DONE",
      note: getOptionalStringToolArg(input.args, "note"),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  "marketDiscovery.groups.record": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Market discovery needs a workspace, and this run has none.");
    }

    return await input.ctx.runMutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId: input.companyId,
      groupName: getStringToolArg(input.args, "groupName"),
      customerType: getStringToolArg(input.args, "customerType"),
      website: getOptionalStringToolArg(input.args, "website"),
      sourceUrl: getStringToolArg(input.args, "sourceUrl"),
      sourceName: getOptionalStringToolArg(input.args, "sourceName"),
      reasoning: getStringToolArg(input.args, "reasoning"),
      confidence: getOptionalStringToolArg(input.args, "confidence") as "HIGH" | "MEDIUM" | "LOW" | undefined,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  "marketDiscovery.groups.review": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Market discovery needs a workspace, and this run has none.");
    }

    return await input.ctx.runMutation(internal.salesDataMarketDiscovery.reviewGroupInternal, {
      companyId: input.companyId,
      groupName: getStringToolArg(input.args, "groupName"),
      status: getStringToolArg(input.args, "status") as "ACCEPTED" | "NEEDS_CHECK" | "DUPLICATE" | "REJECTED",
    });
  },
  "marketDiscovery.locations.read": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Market discovery needs a workspace, and this run has none.");
    }

    const groupName = getOptionalStringToolArg(input.args, "groupName");
    return await input.ctx.runQuery(internal.salesDataMarketDiscovery.readLocationsTaskInternal, {
      companyId: input.companyId,
      ...(groupName ? { groupName } : {}),
    });
  },
  "marketDiscovery.locations.record": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Market discovery needs a workspace, and this run has none.");
    }

    return await input.ctx.runMutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId: input.companyId,
      groupName: getStringToolArg(input.args, "groupName"),
      siteName: getStringToolArg(input.args, "siteName"),
      town: getOptionalStringToolArg(input.args, "town"),
      postcode: getOptionalStringToolArg(input.args, "postcode"),
      sourceUrl: getStringToolArg(input.args, "sourceUrl"),
      sourceName: getOptionalStringToolArg(input.args, "sourceName"),
      reasoning: getStringToolArg(input.args, "reasoning"),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  /**
   * The opportunity report's three passes, in their fixed order.
   *
   * Each one runs a deterministic pass from `salesOpportunityService.ts` and
   * writes what it computed onto the report row. The agent orders the calls
   * and writes the prose; it never supplies a number, and the save pass
   * refuses prose naming a figure the passes did not compute.
   */
  "opportunityReport.matchProspects": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "The opportunity report needs a workspace, and this run has none.");
    }
    return await input.ctx.runMutation(internal.salesOpportunityReports.runMatchingPassInternal, {
      companyId: input.companyId,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    });
  },
  "opportunityReport.findGroupGaps": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "The opportunity report needs a workspace, and this run has none.");
    }
    return await input.ctx.runMutation(internal.salesOpportunityReports.runGapsPassInternal, {
      companyId: input.companyId,
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  "opportunityReport.saveSummary": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "The opportunity report needs a workspace, and this run has none.");
    }
    return await input.ctx.runMutation(internal.salesOpportunityReports.saveSummaryInternal, {
      companyId: input.companyId,
      summary: getStringToolArg(input.args, "summary"),
      exceptions: getOptionalStringArrayToolArg(input.args, "exceptions"),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  },
  // template:remove:end
  "knowledge.search": async (input) => {
    const query = getStringToolArg(input.args, "query") || input.fallbackQuery || "";
    const limit = getNumberToolArg(input.args, "limit");

    return await input.ctx.runQuery(internal.aiToolReadTools.searchKnowledge, {
      query,
      agentId: input.agentId,
      companyId: input.companyId,
      limit,
    });
  },
  "company.overview.update": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Company overview updates require a tenant context.");
    }
    if (!input.userId) {
      throw appError("UNAUTHENTICATED", "Company overview updates require an authenticated actor.");
    }

    const overview = getStringToolArg(input.args, "overview");
    const idempotencyKey = getOptionalStringToolArg(input.args, "idempotencyKey");

    return await input.ctx.runMutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId: input.companyId,
      actorId: input.userId,
      overview,
      runId: input.runId,
      toolCallId: input.toolCallId,
      idempotencyKey,
    });
  },
  /**
   * Raise a task for a person.
   *
   * The agent chooses the words; it does not choose the tenant. `companyId`
   * comes from the run's own context, and the assignee is checked against
   * that tenant inside the mutation — so an id a model invented, or lifted
   * from a document it read, cannot hand work to somebody in another
   * workspace.
   *
   * WRITE rather than READ, so it needs human approval unless the agent has
   * been given autonomy deliberately.
   */
  "task.create": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Creating a task requires a tenant context.");
    }

    const title = getStringToolArg(input.args, "title");
    const detail = getOptionalStringToolArg(input.args, "detail");
    const assigneeEmail = getOptionalStringToolArg(input.args, "assigneeEmail");
    const dueDate = getOptionalStringToolArg(input.args, "dueDate");

    // A date the model wrote is parsed here and dropped if it is nonsense,
    // rather than being stored as a wrong deadline somebody then works to.
    let dueAt: number | undefined;
    if (dueDate) {
      const parsed = Date.parse(`${dueDate}T12:00:00`);
      if (Number.isNaN(parsed)) {
        throw appError("INVALID_INPUT", "dueDate must be a calendar date, formatted YYYY-MM-DD.");
      }
      dueAt = parsed;
    }

    return await input.ctx.runMutation(internal.tasks.createTaskFromAgent, {
      companyId: input.companyId,
      title,
      detail,
      assigneeEmail,
      dueAt,
      runId: input.runId,
    });
  },
  "notification.send": async (input) => {
    if (!input.companyId) {
      throw appError("NO_ACTIVE_COMPANY", "Notifications require a tenant context.");
    }
    if (!input.userId) {
      throw appError("UNAUTHENTICATED", "Notifications require an authenticated actor.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Not a missing feature — a missing configuration. Saying so is the point:
      // the alternative used elsewhere in this codebase is to log a simulated
      // dispatch and report success, which would tell an agent it had notified
      // someone when nothing was sent.
      throw appError("NOT_CONFIGURED", "Email delivery is not configured for this deployment.");
    }

    const decision = resolveNotificationRecipients({
      requested: parseRecipients(getStringToolArg(input.args, "to")),
      tenantAddresses: await input.ctx.runQuery(
        internal.aiToolNotificationTools.getTenantNotificationRecipients,
        { companyId: input.companyId },
      ),
    });
    if (!decision.allowed) throw appError("UNAUTHORIZED", decision.reason);

    const content = resolveNotificationContent({
      subject: getStringToolArg(input.args, "subject"),
      body: getStringToolArg(input.args, "body"),
    });
    if (!content.ok) throw appError("INVALID_INPUT", content.reason);

    const emailBranding = await input.ctx.runQuery(internal.settings.getEmailBranding, {});
    const fromAddress = buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      settings: emailBranding,
    });
    if (fromAddress.includes(UNCONFIGURED_EMAIL_ADDRESS)) {
      // The placeholder sender exists so misconfigured deployments fail loudly
      // rather than sending from someone else's domain. Sending to it would be
      // an immediate bounce reported to the agent as a success.
      throw appError("NOT_CONFIGURED", "No sender address is configured for this deployment.");
    }

    const notification = buildAgentNotificationEmail(content, {
      platformName: emailBranding?.platformName,
    });

    const dispatch = await sendResendEmail({
      apiKey,
      operation: "agentNotificationSend",
      // Keyed on the tool call, so a resumed run that re-issues this call does
      // not send the same message twice at the provider either.
      idempotencyKey: input.toolCallId
        ? `agent-notification:${input.toolCallId}`
        : undefined,
      payload: {
        from: fromAddress,
        to: decision.recipients,
        subject: content.subject,
        html: notification.html,
        text: notification.text,
      },
    });

    await input.ctx.runMutation(internal.aiToolNotificationTools.recordNotificationDispatch, {
      companyId: input.companyId,
      actorId: input.userId,
      agentId: input.agentId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      recipients: decision.recipients,
      subject: content.subject,
      dispatchId: typeof dispatch === "string" ? dispatch : undefined,
    });

    return {
      delivered: true,
      recipients: decision.recipients,
      subject: content.subject,
    };
  },
  "http.request": async (input) => {
    if (!input.toolId) {
      throw appError("NOT_CONFIGURED", "Outbound requests require a configured connector tool.");
    }

    // The base URL and credential come from the connector's configuration, not
    // from the model. That is the whole safety story: the agent supplies a
    // method and a path, so an injected "call this other host" has no field to
    // express itself in.
    const refs = await input.ctx.runQuery(
      internal.aiToolNotificationTools.getConnectorSecretRefsForTool,
      { toolId: input.toolId },
    );
    if (!refs || refs.length === 0) {
      throw appError("NOT_CONFIGURED", "This connector has no configured credentials on this deployment.");
    }

    const secrets = resolveConnectorSecrets({ refs, env: process.env });
    if (!secrets.ok) throw appError("NOT_CONFIGURED", secrets.reason);

    const baseUrl = secrets.values.base_url;
    if (!baseUrl) throw appError("NOT_CONFIGURED", "This connector has no base URL configured.");

    const target = resolveHttpConnectorTarget({
      baseUrl,
      path: getStringToolArg(input.args, "path"),
      method: getStringToolArg(input.args, "method"),
    });
    if (!target.ok) throw appError("INVALID_INPUT", target.reason);

    const body = resolveHttpConnectorBody({
      method: target.method,
      bodyJson: getOptionalStringToolArg(input.args, "bodyJson"),
    });
    if (!body.ok) throw appError("INVALID_INPUT", body.reason);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (secrets.values.auth_header) headers.Authorization = secrets.values.auth_header;
    if (body.body) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_CONNECTOR_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(target.url, {
        method: target.method,
        headers,
        body: body.body,
        // Never followed. A redirect would let the endpoint forward the request,
        // and this connector's credential with it, somewhere the administrator
        // never scoped.
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      // The URL is safe to report — it is the administrator's own base plus the
      // agent's path. The headers are not, and are never included.
      throw appError(
        "UPSTREAM_FAILURE",
        `The request to ${target.url} failed: `
        + `${error instanceof Error ? error.message : "unknown transport error"}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const contentLength = Number(response.headers.get("content-length"));
    const check = describeHttpConnectorResponse({
      status: response.status,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    });
    if (!check.ok) throw appError("INVALID_INPUT", check.reason);

    const raw = await response.text();
    const { body: responseBody, truncated } = truncateHttpConnectorBody(raw);

    return {
      status: response.status,
      // A non-2xx is information the agent should reason about, not a transport
      // failure — a 404 means the record is not there, which is an answer.
      ok: response.ok,
      url: target.url,
      body: responseBody,
      truncated,
    };
  },
};

export function getRegisteredToolHandlerMappings() {
  return Object.keys(REGISTERED_TOOL_HANDLERS).sort();
}

/**
 * The connector each declared handler mapping belongs to.
 *
 * Presence in this map is what separates "the catalogue advertises this and
 * nobody has built it" from "something is misconfigured".
 */
const DECLARED_CONNECTOR_NAMES = new Map(
  BUILT_IN_TOOL_CONNECTORS.flatMap((connector) =>
    connector.toolDefinitions.map((tool) => [tool.handlerMapping, connector.name] as const)),
);

/**
 * Whether a handler mapping can actually do anything.
 *
 * Derived from the registry, deliberately: the single source of truth for
 * whether a connector works is whether an implementation exists. A list of
 * "these ones are stubs" maintained alongside it would drift, and it is exactly
 * that kind of drift — a catalogue describing capability the code does not have
 * — this item exists to remove.
 */
export function isExecutableToolMapping(handlerMapping: string) {
  return Boolean(REGISTERED_TOOL_HANDLERS[handlerMapping]);
}

/** Every handler mapping with a working implementation. */
export function getExecutableToolMappings() {
  return Object.keys(REGISTERED_TOOL_HANDLERS).sort();
}

/**
 * Whether the platform can actually take a connector through an OAuth flow.
 *
 * For a long time it could not — this was hard-coded `false` because the
 * authorize route led to a 404 and completion took a hand-typed token
 * reference. The routes, exchange, encrypted storage, refresh and revocation
 * now exist (`connectorOAuth.ts`), so the answer depends only on deployment
 * configuration: the provider's client credentials and the token encryption
 * key. An unconfigured deployment still gets told plainly instead of being
 * sent somewhere broken.
 */
export function isConnectorOAuthAvailable(provider: string) {
  return (
    isConnectorOAuthProviderConfigured(provider) && isConnectorTokenEncryptionConfigured()
  );
}

export const CONNECTOR_OAUTH_UNAVAILABLE_MESSAGE =
  "OAuth connections are not available on this deployment. Set the provider's "
  + "client credentials (e.g. CONNECTOR_GOOGLE_CLIENT_ID and "
  + "CONNECTOR_GOOGLE_CLIENT_SECRET) and CONNECTOR_TOKEN_ENCRYPTION_KEY, "
  + "then try again.";

export async function executeRegisteredTool(args: ToolHandlerExecutionInput) {
  const handler = REGISTERED_TOOL_HANDLERS[args.handlerMapping];

  if (!handler) {
    // Nothing implements this, which is a gap in the platform rather than a
    // fault in this run. Reporting it as an error made the two indistinguishable
    // in the log.
    //
    // It reports rather than throws whether or not the mapping was ever
    // declared. It used to throw for anything not in the catalogue — so when the
    // seventeen connectors nobody had built were removed, every tool already
    // installed from one of them would have started failing hard instead of
    // degrading. Whether a name is known changes the wording, never the outcome.
    return buildConnectorStubResult(args, DECLARED_CONNECTOR_NAMES.get(args.handlerMapping));
  }

  return await handler(args);
}

export function normalizeAiRuntimeError(error: unknown, fallback = "AI runtime request failed.") {
  const message = getErrorMessage(error, "Unknown tool execution error.");

  return {
    ok: false,
    error: message === "Unknown tool execution error." ? fallback : message,
  };
}
