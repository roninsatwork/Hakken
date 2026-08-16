"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { ABOUT_PAGE_SUBJECT } from "./memoryMigration";

/**
 * The migration road's judged half (one-brain-plan.md, phase 1): each
 * searched memory is read against the wiki's index and pinned to its best
 * page; the mechanical about-this-company page catches what fits nowhere.
 * ALWAYS memories skip the model entirely — behaviour goes to the rules.
 * Fail-safe: a model failure sends the memory to the about page rather
 * than leaving it behind, because a pin on a defensible-but-general page
 * beats a shelf that never empties.
 */
export const migrateCompanyMemories = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    args
  ): Promise<{
    moved: number;
    toRules: number;
    stamped: boolean;
    blockedBy: string | null;
  }> => {
    const state = await ctx.runQuery(internal.memoryMigration.getMigrationStateInternal, {
      companyId: args.companyId,
    });

    let moved = 0;
    let toRules = 0;

    if (state.memories.length > 0) {
      const index = await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
        companyId: args.companyId,
        includeCustomerPages: false,
        includeSourceNotes: false,
      });
      const validKeys = new Set(
        index
          .map((entry) => entry.key)
          .filter(
            (key) =>
              !key.startsWith("CUSTOMER:") &&
              !key.endsWith("-index") &&
              key !== `POLICY:${ABOUT_PAGE_SUBJECT}`
          )
      );

      for (const memory of state.memories) {
        if (memory.applyMode === "ALWAYS") {
          const result = await ctx.runMutation(internal.memoryMigration.applyMigrationMoveInternal, {
            companyId: args.companyId,
            memoryId: memory.memoryId,
            target: { kind: "RULE" },
          });
          if (result.moved) {
            moved += 1;
            toRules += 1;
          }
          continue;
        }

        // The chooser's question, asked once per memory: which page does
        // this fact belong to? "none" is an honest answer and lands on the
        // about page — never invented, never dropped.
        let chosenKey: string | null = null;
        if (validKeys.size > 0) {
          try {
            const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
              useCase: "fast-chat",
            });
            const response = await generateTextWithResolvedModel({
              model,
              systemInstruction:
                'You file one company fact onto the wiki page it belongs to. Reply with strict JSON, nothing else: {"page": string} — one page key exactly as written in the index, or "none" if no page genuinely covers this fact.',
              contents: [
                {
                  type: "text",
                  text:
                    `Fact: ${memory.title}\n${memory.content.slice(0, 1000)}\n\nIndex:\n` +
                    index
                      .filter((entry) => validKeys.has(entry.key))
                      .map((entry) => `${entry.key} — ${entry.hint}`)
                      .join("\n"),
                },
              ],
            });
            const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { page?: unknown }) : {};
            if (typeof parsed.page === "string" && validKeys.has(parsed.page)) {
              chosenKey = parsed.page;
            }
          } catch (error) {
            console.error("Memory migration could not read the index; filing on the about page", error);
          }
        }

        if (!chosenKey) {
          await ctx.runMutation(internal.memoryMigration.ensureAboutPageInternal, {
            companyId: args.companyId,
          });
          chosenKey = `POLICY:${ABOUT_PAGE_SUBJECT}`;
        }

        const separator = chosenKey.indexOf(":");
        const result = await ctx.runMutation(internal.memoryMigration.applyMigrationMoveInternal, {
          companyId: args.companyId,
          memoryId: memory.memoryId,
          target: {
            kind: "PIN",
            pageKind: chosenKey.slice(0, separator) as "PRODUCT" | "POLICY" | "ISSUE",
            subjectKey: chosenKey.slice(separator + 1),
          },
        });
        if (result.moved) moved += 1;
      }
    }

    const stamp = await ctx.runMutation(internal.memoryMigration.stampMigrationInternal, {
      companyId: args.companyId,
    });
    return {
      moved,
      toRules,
      stamped: stamp.stamped,
      blockedBy: stamp.stamped ? null : stamp.reason,
    };
  },
});
