"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { isNoReplyAddress, parseAddress } from "./gmailConnector";

/**
 * The mailbox that answers itself: Phase C of the Gmail plan.
 *
 * Once a minute, every connected mailbox is polled. Each new message id is
 * recorded before anything acts on it (commitment 7), so double delivery or
 * an overlapping poll can never answer twice. Then the answer-versus-task
 * decision runs through the brain: an answer grounded in company knowledge
 * goes out through `gmail.reply` — inside the same rails as any other send —
 * and everything else becomes a task, a bell, and a short holding reply so
 * the sender knows a person is coming.
 *
 * Skip rules are fail-closed: bulk and no-reply senders, Gmail's own spam
 * and promotions categories, and anything the mailbox itself sent are
 * recorded as SKIPPED and never answered.
 */

/** What a human sees in Gmail on mail the agent handled. */
export const PROCESSED_LABEL_NAME = "Sonae";

/**
 * Sent only when the model call itself failed and no written reply exists —
 * the sender must still hear something rather than silence.
 */
const FALLBACK_HOLDING_REPLY =
  "Thanks for your email. A colleague will come back to you on this — " +
  "we've made sure it's in front of the right person.";

/**
 * Every outgoing reply is dressed here, in code, so its manners and its
 * honesty can never depend on the model's mood: a greeting by name when the
 * model didn't write one, and always the sign-off naming Ask Sonae, the
 * workspace, and the fact that the reply was written by AI and may contain
 * mistakes — the EU AI Act's transparency duty, kept where it cannot be
 * forgotten.
 */
/**
 * Undo the model's habit of hard-wrapping prose at a fixed column. An email
 * body should be full-width text the reading window wraps for itself —
 * newlines are kept only where they mean something: between paragraphs, and
 * in front of list items.
 */
export function unwrapParagraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => line.trim());
      const isList = lines.every((line) => /^([-*•>]|\d+[.)])\s/.test(line) || line === "");
      return isList ? lines.join("\n") : lines.filter(Boolean).join(" ");
    })
    .join("\n\n");
}

/**
 * The fixed lines around every reply, held as approved translations rather
 * than left to the model: the AI disclosure is a legal duty whose wording
 * must be exact in every language, and the greeting and thank-you must match
 * the language the customer wrote in — an Italian email with an English top
 * and tail reads as a template, which is what Anthony sent back.
 */
const MAIL_DRESSING_BY_LANGUAGE: Record<
  string,
  { greetingNamed: string; greeting: string; thanks: string; assistant: string; disclosure: string }
> = {
  en: {
    greetingNamed: "Hi {name},",
    greeting: "Hello,",
    thanks: "Thank you for your email.",
    assistant: "AI assistant",
    disclosure:
      "This reply was written by AI and may contain mistakes. " +
      "A colleague reads this inbox and will correct anything we got wrong.",
  },
  it: {
    greetingNamed: "Buongiorno {name},",
    greeting: "Buongiorno,",
    thanks: "Grazie per la sua email.",
    assistant: "Assistente IA",
    disclosure:
      "Questa risposta è stata scritta da un'IA e potrebbe contenere errori. " +
      "Un collega legge questa casella di posta e correggerà eventuali inesattezze.",
  },
  fr: {
    greetingNamed: "Bonjour {name},",
    greeting: "Bonjour,",
    thanks: "Merci pour votre e-mail.",
    assistant: "Assistant IA",
    disclosure:
      "Cette réponse a été rédigée par une IA et peut contenir des erreurs. " +
      "Un collègue lit cette boîte de réception et corrigera toute inexactitude.",
  },
  de: {
    greetingNamed: "Guten Tag {name},",
    greeting: "Guten Tag,",
    thanks: "Vielen Dank für Ihre E-Mail.",
    assistant: "KI-Assistent",
    disclosure:
      "Diese Antwort wurde von einer KI verfasst und kann Fehler enthalten. " +
      "Ein Kollege liest dieses Postfach und korrigiert etwaige Fehler.",
  },
  es: {
    greetingNamed: "Hola {name},",
    greeting: "Hola,",
    thanks: "Gracias por su correo.",
    assistant: "Asistente de IA",
    disclosure:
      "Esta respuesta fue escrita por una IA y puede contener errores. " +
      "Un compañero revisa esta bandeja de entrada y corregirá cualquier error.",
  },
  pt: {
    greetingNamed: "Olá {name},",
    greeting: "Olá,",
    thanks: "Obrigado pelo seu e-mail.",
    assistant: "Assistente de IA",
    disclosure:
      "Esta resposta foi escrita por uma IA e pode conter erros. " +
      "Um colega lê esta caixa de entrada e corrigirá qualquer erro.",
  },
  nl: {
    greetingNamed: "Beste {name},",
    greeting: "Goedendag,",
    thanks: "Bedankt voor uw e-mail.",
    assistant: "AI-assistent",
    disclosure:
      "Dit antwoord is geschreven door AI en kan fouten bevatten. " +
      "Een collega leest deze inbox en corrigeert eventuele fouten.",
  },
  pl: {
    greetingNamed: "Dzień dobry {name},",
    greeting: "Dzień dobry,",
    thanks: "Dziękujemy za wiadomość.",
    assistant: "Asystent AI",
    disclosure:
      "Ta odpowiedź została napisana przez AI i może zawierać błędy. " +
      "Kolega czyta tę skrzynkę odbiorczą i poprawi ewentualne błędy.",
  },
};

/**
 * A greeting the model wrote itself, in any language we dress — detected so
 * the code never staples a second hello on top of one.
 */
const GREETING_PATTERN =
  /^(hi|hello|dear|hey|good (morning|afternoon|evening)|ciao|salve|buongiorno|buonasera|gentile|bonjour|bonsoir|cher|chère|hallo|guten (tag|morgen|abend)|sehr geehrte[rs]?|hola|buenos días|buenas tardes|estimado|estimada|olá|bom dia|boa tarde|prezado|prezada|beste|geachte|dzień dobry|szanowny|szanowna|witam)\b/i;

export function dressReply(args: {
  body: string;
  senderFirstName?: string;
  companyName?: string;
  /** Two-letter code of the language the reply is written in; English otherwise. */
  language?: string;
}) {
  const dressing =
    MAIL_DRESSING_BY_LANGUAGE[args.language?.trim().toLowerCase() ?? "en"] ??
    MAIL_DRESSING_BY_LANGUAGE.en;
  const trimmed = unwrapParagraphs(args.body.trim());
  const hasGreeting = GREETING_PATTERN.test(trimmed);
  const greeting = args.senderFirstName
    ? dressing.greetingNamed.replace("{name}", args.senderFirstName)
    : dressing.greeting;
  const opening = hasGreeting ? trimmed : `${greeting}\n\n${dressing.thanks}\n\n${trimmed}`;
  const workspace = args.companyName?.trim();
  return (
    `${opening}\n\n` +
    `Ask Sonae\n` +
    `${workspace ? `${workspace} ` : ""}${dressing.assistant}\n` +
    dressing.disclosure
  );
}

/** The sender's first name, from a `Priya Shah <priya@...>` style header. */
export function senderFirstName(fromHeader: string) {
  const display = fromHeader.split("<")[0].trim().replace(/["']/g, "");
  const first = display.split(/\s+/)[0]?.trim();
  if (!first || first.includes("@")) return undefined;
  return first;
}

/** The once-a-minute entry point (crons.ts). */
export const pollMailboxes = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.runQuery(internal.gmailWatcherStore.listConnectedMailboxes, {});
    for (const connector of connectors) {
      try {
        await processMailbox(ctx, connector);
      } catch (error) {
        // One broken mailbox must not stop the others; the connection's own
        // error state (connectorOAuth) reports the cause honestly.
        console.error("Mailbox poll failed", connector._id, error);
      }
    }
  },
});

type MessageSummary = {
  id: string;
  threadId: string;
  labels: string[];
  from: string;
  subject: string;
  listUnsubscribe?: string;
};

function skipReason(summary: MessageSummary): string | null {
  if (summary.labels.includes("SENT")) return "Sent by the mailbox itself.";
  if (summary.labels.includes("SPAM")) return "Gmail marked it as spam.";
  if (summary.labels.includes("CATEGORY_PROMOTIONS")) return "Promotional mail.";
  if (summary.labels.includes("DRAFT")) return "A draft, not a received message.";
  if (summary.listUnsubscribe) return "Bulk mail (carries an unsubscribe header).";
  if (isNoReplyAddress(parseAddress(summary.from))) return "No-reply sender.";
  return null;
}

async function processMailbox(ctx: ActionCtx, connector: Doc<"toolConnectors">) {
  const listing = (await ctx.runAction(internal.gmailConnector.readMailbox, {
    connectorId: connector._id,
    query: "in:inbox",
  })) as { ok: boolean; error?: string; messages?: MessageSummary[] };
  if (!listing.ok || !listing.messages) return;

  for (const summary of listing.messages) {
    const verdict = await ctx.runMutation(internal.gmailWatcherStore.recordSeenMessage, {
      connectorId: connector._id,
      companyId: connector.companyId,
      gmailMessageId: summary.id,
      gmailThreadId: summary.threadId,
      sender: parseAddress(summary.from),
      subject: summary.subject || "(no subject)",
    });
    if (verdict !== "PROCESS") continue;

    try {
      await processMessage(ctx, connector, summary);
    } catch (error) {
      console.error("Mailbox message processing failed", summary.id, error);
      // The row stays PENDING; the next poll retries it.
    }
  }
}

async function processMessage(
  ctx: ActionCtx,
  connector: Doc<"toolConnectors">,
  summary: MessageSummary
) {
  const reasonToSkip = skipReason(summary);
  if (reasonToSkip) {
    await ctx.runMutation(internal.gmailWatcherStore.markDecision, {
      connectorId: connector._id,
      gmailMessageId: summary.id,
      decision: "SKIPPED",
      reason: reasonToSkip,
    });
    return;
  }

  // Read the whole conversation, not just the newest message. A follow-up
  // like "that wasn't helpful" says nothing about the topic — the first live
  // test searched the knowledge with exactly those words, found nothing, and
  // answered a pricing thread with a brush-off while the published prices
  // sat in the knowledge base. The conversation is the question.
  const threadResult = (await ctx.runAction(internal.gmailConnector.readMailbox, {
    connectorId: connector._id,
    threadId: summary.threadId,
  })) as {
    ok: boolean;
    messages?: Array<{ id: string; from: string; fromMailbox: boolean; body: string }>;
  };
  if (!threadResult.ok || !threadResult.messages?.length) {
    throw new Error("Conversation could not be read.");
  }

  const senderTexts = threadResult.messages
    .filter((message) => !message.fromMailbox)
    .map((message) => message.body.trim())
    .filter(Boolean);
  const newestBody = senderTexts.at(-1) ?? "";

  // The knowledge search hears everything the sender has said in the thread,
  // so the topic survives however the latest message is phrased.
  const retrievalQuery = `${summary.subject}\n\n${senderTexts.join("\n\n")}`.slice(0, 6000);

  const transcript = threadResult.messages
    .map((message) => `${message.fromMailbox ? "Sonae" : "Customer"}: ${message.body.trim()}`)
    .filter((line) => line.length > "Customer: ".length)
    .join("\n\n")
    .slice(-8000);

  // Two searches, deliberately. The whole-conversation query keeps the topic
  // when the newest message is a bare "that didn't help"; the newest-message
  // query keeps the point when the conversation has grown long enough to blur
  // it. The first live pricing thread proved the need: the conversation query
  // retrieved only general pages while the priced page sat one sharper query
  // away, and the reply talked around the number it should have given.
  const pointQuery = `${summary.subject}\n\n${newestBody}`.slice(0, 2000);
  const [topicKnowledge, pointKnowledge] = (await Promise.all([
    ctx.runAction(internal.ai.searchKnowledgeForVoiceInternal, {
      query: retrievalQuery,
      fallbackCompanyId: connector.companyId,
    }),
    ctx.runAction(internal.ai.searchKnowledgeForVoiceInternal, {
      query: pointQuery,
      fallbackCompanyId: connector.companyId,
    }),
  ])) as [{ context: string }, { context: string }];
  const knowledge = {
    context: [topicKnowledge.context, pointKnowledge.context]
      .filter(Boolean)
      .join("\n\n"),
  };

  const decision = await decideReply(ctx, {
    conversation: transcript,
    knowledgeContext: knowledge.context ?? "",
    companyId: connector.companyId,
  });

  // The reply always goes out (through the rails): either the written answer
  // — which uses published facts and figures exactly as the knowledge states
  // them — or, if the model call itself died, the plain fallback so the
  // sender never gets silence. Either way it is dressed in code: greeting,
  // sign-off, and the written-by-AI disclosure.
  const company = connector.companyId
    ? await ctx.runQuery(internal.companies.getCompanyByIdInternal, { id: connector.companyId })
    : null;
  const replyBody = dressReply({
    body: decision.reply?.trim() || FALLBACK_HOLDING_REPLY,
    senderFirstName: senderFirstName(summary.from),
    companyName: company?.name,
    // The fallback text is English, so its dressing must be too.
    ...(decision.reply ? { language: decision.language } : {}),
  });
  const sent = await ctx.runAction(internal.gmailConnector.replyToMessage, {
    connectorId: connector._id,
    messageId: summary.id,
    body: replyBody,
  });

  if (sent.ok && !decision.needsHuman) {
    await labelProcessed(ctx, connector, summary.id);
    // recordReply set REPLIED; nothing more to mark.
    return;
  }

  // A person is needed — because the question goes beyond the knowledge, or
  // because a rail refused the send (that path already filed its own task).
  let taskId: Id<"tasks"> | undefined;
  if (sent.ok && connector.companyId) {
    const assignee = await ctx.runQuery(internal.telephony.findCallAssignee, {
      companyId: connector.companyId,
    });
    // Bounded to the task field's own ceiling — a long email must shorten
    // the task, never fail it (the first over-length mail killed the filing
    // while the reply had already gone, leaving no task at all).
    const detail = (
      `Sonae replied with what the company knowledge covers and told the sender a ` +
      `colleague will follow up with the specifics.\n\nFrom: ${summary.from}\n` +
      `Their message:\n${newestBody.slice(0, 900)}\n\n` +
      `What Sonae sent:\n${replyBody.slice(0, 900)}`
    ).slice(0, 2000);
    taskId = await ctx.runMutation(internal.tasks.createTaskInternal, {
      companyId: connector.companyId,
      title: `Answer ${parseAddress(summary.from)}: "${(summary.subject || "(no subject)").slice(0, 120)}"`,
      detail,
      ...(assignee ? { assigneeUserId: assignee } : {}),
      createdBySource: "AGENT" as const,
    });
  }

  await ctx.runMutation(internal.gmailWatcherStore.markDecision, {
    connectorId: connector._id,
    gmailMessageId: summary.id,
    decision: "TASK",
    reason: sent.ok ? "A person follows up with the specifics." : sent.error,
    ...(taskId ? { taskId } : {}),
  });
  await labelProcessed(ctx, connector, summary.id);
}

/**
 * What goes back to the sender, and whether a person follows up — one model
 * call, structured. The reply must use the company's published facts and
 * figures exactly as the knowledge states them: the first live quote request
 * was answered with a canned brush-off while the published price range sat
 * in the retrieved knowledge, which is the failure this wording exists to
 * prevent. Fail-closed: a call that dies yields no reply text, and the
 * caller sends the plain fallback and files the task.
 */
async function decideReply(
  ctx: ActionCtx,
  args: {
    conversation: string;
    knowledgeContext: string;
    companyId?: Id<"companies">;
  }
): Promise<{ reply?: string; needsHuman: boolean; language?: string }> {
  try {
    // The cheap fast tier, resolved through the same catalogue door every
    // other headless caller uses (the phone's summary does exactly this).
    const config = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
      ...(args.companyId ? { companyId: args.companyId } : {}),
    });
    const response = await generateTextWithResolvedModel({
      model: config,
      systemInstruction:
        "You write the next reply in a customer email conversation for a company, using ONLY the company " +
        "knowledge provided. Answer with strict JSON, nothing else: " +
        '{"reply": string, "needsHuman": boolean, "language": string}. ' +
        'language is the two-letter ISO code of the language the reply is written in ("en", "it", "fr", ...). ' +
        "reply is a courteous, complete email answer to the customer's LATEST message, read in the light of " +
        "the whole conversation — in the sender's own language, plain text, no markdown. Do not add a " +
        "greeting line or a signature: both are added automatically around your text. Write each " +
        "paragraph as one unbroken line — never wrap prose at a fixed width; blank lines separate " +
        "paragraphs. " +
        "Use the knowledge fully: published facts, price ranges, and how the company works may be stated " +
        "exactly as the knowledge states them. Never invent a fact or figure, and never commit to a specific " +
        "bespoke price or delivery date — those are a colleague's to give. Never repeat what an earlier Sonae " +
        "message in the conversation already said; move the conversation forward. " +
        "needsHuman is true when the sender needs something beyond what the knowledge settles (a bespoke " +
        "quote, a complaint, anything account-specific); the reply must then still give whatever the knowledge " +
        "does cover and say a colleague will follow up with the specifics. " +
        "If the knowledge offers nothing useful at all, reply is a short, warm acknowledgement that names what " +
        "they asked about and says a colleague will come back to them; needsHuman is true.",
      contents: [
        {
          type: "text",
          text:
            `Company knowledge:\n${args.knowledgeContext || "(none found)"}\n\n` +
            `The email conversation so far (oldest first):\n${args.conversation}`,
        },
      ],
    });
    const text = response.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { needsHuman: true };
    const parsed = JSON.parse(jsonMatch[0]) as {
      reply?: string;
      needsHuman?: boolean;
      language?: string;
    };
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : undefined;
    const language = typeof parsed.language === "string" ? parsed.language.trim() : undefined;
    return { reply, needsHuman: parsed.needsHuman !== false || !reply, language };
  } catch (error) {
    console.error("Mailbox decision failed; routing to a person", error);
    return { needsHuman: true };
  }
}

/**
 * Label handled mail so a human opening Gmail sees at a glance what the
 * agent dealt with. Failure to label is never worth failing the message.
 */
async function labelProcessed(ctx: ActionCtx, connector: Doc<"toolConnectors">, messageId: string) {
  try {
    await ctx.runAction(internal.gmailConnector.applyProcessedLabel, {
      connectorId: connector._id,
      messageId,
      labelName: PROCESSED_LABEL_NAME,
    });
  } catch (error) {
    console.error("Mailbox labelling failed", messageId, error);
  }
}
