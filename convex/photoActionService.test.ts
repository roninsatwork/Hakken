import { describe, expect, test } from "vitest";
import { extractPhotoActionProposal, PHOTO_ACTION_PROPOSAL_INSTRUCTION } from "./photoActionService";

/**
 * The extractor sits between the model's reply and what a person is asked to
 * confirm, so what matters is fidelity — the proposal that is stored is the
 * one the model wrote — and tolerance: a broken block must cost only the
 * proposal, never the answer it rides on.
 */
describe("extracting a photo-action proposal", () => {
  const BLOCK =
    '```photo-action\n{"title": "Reorder printer toner", "detail": "The photo shows an empty toner box for a HP 305A.", "reasoning": "The box in the photo is marked empty."}\n```';

  test("a well-formed block becomes the proposal and leaves the answer clean", () => {
    const { content, proposal } = extractPhotoActionProposal(
      `That looks like an empty toner box.\n\n${BLOCK}`
    );
    expect(content).toBe("That looks like an empty toner box.");
    expect(proposal).toEqual({
      title: "Reorder printer toner",
      detail: "The photo shows an empty toner box for a HP 305A.",
      reasoning: "The box in the photo is marked empty.",
    });
  });

  test("text after the block survives extraction", () => {
    // The vision notice is appended after the model's text, so the block is
    // not always the last thing in the saved reply.
    const { content, proposal } = extractPhotoActionProposal(
      `Answer first.\n\n${BLOCK}\n\n*Answered with a seeing model.*`
    );
    expect(proposal?.title).toBe("Reorder printer toner");
    expect(content).toContain("Answer first.");
    expect(content).toContain("*Answered with a seeing model.*");
    expect(content).not.toContain("photo-action");
  });

  test("a reply with no block passes through untouched", () => {
    const { content, proposal } = extractPhotoActionProposal("Just an answer.");
    expect(content).toBe("Just an answer.");
    expect(proposal).toBeUndefined();
  });

  test("malformed JSON costs the proposal, not the answer", () => {
    const { content, proposal } = extractPhotoActionProposal(
      "The answer.\n\n```photo-action\n{not json at all\n```"
    );
    expect(content).toBe("The answer.");
    expect(proposal).toBeUndefined();
  });

  test("a proposal missing its reasoning is not offered", () => {
    // Commitment 4: the person confirming must be shown what in the photo led
    // to the suggestion.
    const { proposal } = extractPhotoActionProposal(
      '```photo-action\n{"title": "Do something", "detail": "Something."}\n```'
    );
    expect(proposal).toBeUndefined();
  });

  test("an unterminated block is left alone rather than guessed at", () => {
    const text = 'The answer.\n\n```photo-action\n{"title": "Half';
    const { content, proposal } = extractPhotoActionProposal(text);
    expect(content).toBe(text);
    expect(proposal).toBeUndefined();
  });

  test("overlong fields are capped, not refused", () => {
    const long = "x".repeat(5000);
    const { proposal } = extractPhotoActionProposal(
      `\`\`\`photo-action\n{"title": "${long}", "detail": "${long}", "reasoning": "${long}"}\n\`\`\``
    );
    expect(proposal?.title).toHaveLength(200);
    expect(proposal?.detail).toHaveLength(2000);
    expect(proposal?.reasoning).toHaveLength(500);
  });

  test("the instruction names the exact fields the extractor reads", () => {
    for (const field of ['"title"', '"detail"', '"reasoning"']) {
      expect(PHOTO_ACTION_PROPOSAL_INSTRUCTION).toContain(field);
    }
    expect(PHOTO_ACTION_PROPOSAL_INSTRUCTION).toContain("photo-action");
  });
});
