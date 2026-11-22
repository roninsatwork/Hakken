/** Old approved suggestions were appended to the shared agent prompt. Their
 * company cannot be recovered from that text, so no company may receive them. */
export function stripLegacySharedLearningNotes(prompt: string | null | undefined) {
  if (!prompt) return prompt;
  const marker = /(?:^|\n\n)Approved learning note \d+:/g.exec(prompt);
  return marker ? prompt.slice(0, marker.index) : prompt;
}
