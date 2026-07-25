type ChatTranscriptThread = {
  title?: string | null;
  createdAt?: number;
  sourceUrl?: string | null;
  user?: {
    name?: string | null;
  } | null;
};

type ChatTranscriptMessage = {
  role: string;
  content: string;
  _creationTime: number;
};

type BuildChatTranscriptArgs = {
  thread?: ChatTranscriptThread | null;
  messages: ChatTranscriptMessage[];
  userLabel: string;
  /**
   * Display name for the assistant. Required rather than defaulted, so a
   * transcript can never be labelled with the platform's original product name
   * on a deployment that has been rebranded.
   */
  assistantLabel: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTranscriptDate(thread?: ChatTranscriptThread | null) {
  return thread?.createdAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(thread.createdAt))
    : new Date().toLocaleString();
}

function formatTranscriptTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export function formatMessageContentForTranscriptHtml(content: string) {
  let formattedHtml = escapeHtml(content)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`{3}([\s\S]*?)`{3}/g, '<pre style="background: #f4f5f7; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px;">$1</pre>')
    .replace(/`(.*?)`/g, '<code style="background: #f4f5f7; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 12px;">$1</code>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  formattedHtml = formattedHtml.replace(/(<br\/>)?- (.*)/g, "<li>$2</li>");
  return formattedHtml.replace(/(<li>[\s\S]*<\/li>)/, '<ul style="margin-top: 4px; margin-bottom: 4px; padding-left: 20px;">$1</ul>');
}

export function buildChatTranscript({ thread, messages, userLabel, assistantLabel }: BuildChatTranscriptArgs) {
  const title = thread?.title || "Unknown";
  const dateStr = formatTranscriptDate(thread);
  let htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 800px; line-height: 1.5; color: #333;">`;
  let textContent = "";

  htmlContent += `<h2 style="margin-bottom: 4px;">Chat Log: ${escapeHtml(title)}</h2>`;
  htmlContent += `<p style="color: #666; font-size: 13px; margin-top: 0;">${escapeHtml(dateStr)}</p>`;

  if (thread?.sourceUrl) {
    htmlContent += `<p style="color: #666; font-size: 13px; margin-top: 0;">Source: ${escapeHtml(thread.sourceUrl)}</p>`;
  }

  htmlContent += `<hr style="border: none; border-bottom: 1px solid #eaeaea; margin: 20px 0;" />`;

  textContent += `Chat Log: ${title}\n`;
  textContent += `Date: ${dateStr}\n`;
  if (thread?.sourceUrl) textContent += `Source: ${thread.sourceUrl}\n`;
  textContent += `-------------------------------------------------\n\n`;

  let msgHtml = "";

  messages.forEach((msg) => {
    const isUser = msg.role === "user";
    const senderName = isUser ? thread?.user?.name || userLabel : assistantLabel;
    const time = formatTranscriptTime(msg._creationTime);
    const formattedHtml = formatMessageContentForTranscriptHtml(msg.content);

    msgHtml += `<div style="margin-bottom: 24px;">`;
    msgHtml += `<div style="margin-bottom: 4px;">`;
    msgHtml += `<strong style="color: ${isUser ? "#000" : "#4f46e5"}">${escapeHtml(senderName)}</strong> <span style="color: #999; font-size: 11px; margin-left: 8px;">${time}</span>`;
    msgHtml += `</div>`;
    msgHtml += `<div style="font-size: 14px; background: ${isUser ? "#f9f9f9" : "#fff"}; border: 1px solid ${isUser ? "#eee" : "#e0e7ff"}; padding: 12px; border-radius: 8px;">`;
    msgHtml += `<p style="margin: 0;">${formattedHtml}</p>`;
    msgHtml += `</div></div>`;

    textContent += `[${time}] ${senderName}:\n${msg.content}\n\n`;
  });

  htmlContent += msgHtml;
  htmlContent += `</div>`;

  return { htmlContent, textContent };
}
