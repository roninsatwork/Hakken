export const THINKING_LEVELS = [
  { id: "NONE" },
  { id: "LOW" },
  { id: "MEDIUM" },
  { id: "HIGH" },
] as const;

export type ThinkingLevelId = (typeof THINKING_LEVELS)[number]["id"];

export function getGreetingKey(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function appendTranscript(content: string, text: string) {
  return content + (content && content.length > 0 ? " " : "") + text;
}

export function buildUnsupportedFileList(invalidFiles: string[]) {
  if (invalidFiles.length === 0) return null;

  return invalidFiles.join(", ");
}

export function canStartAssistantThread(content: string, pendingFileCount: number, isSubmitting: boolean) {
  return (content.trim().length > 0 || pendingFileCount > 0) && !isSubmitting;
}
