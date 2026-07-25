import { describe, expect, test } from "vitest";
import { buildChatTranscript, formatMessageContentForTranscriptHtml } from "./chatTranscript";

describe("chat transcript helpers", () => {
  test("builds plain text transcript metadata and messages", () => {
    const transcript = buildChatTranscript({
      thread: {
        title: "Website enquiry",
        createdAt: Date.UTC(2026, 4, 31, 16, 37),
        sourceUrl: "https://example.com",
        user: { name: "Anthony" },
      },
      userLabel: "Visitor",
      assistantLabel: "Acme Copilot",
      messages: [
        { role: "user", content: "Hello", _creationTime: Date.UTC(2026, 4, 31, 16, 38) },
        { role: "assistant", content: "Hi there", _creationTime: Date.UTC(2026, 4, 31, 16, 39) },
      ],
    });

    expect(transcript.textContent).toContain("Chat Log: Website enquiry");
    expect(transcript.textContent).toContain("Source: https://example.com");
    expect(transcript.textContent).toContain("Anthony:\nHello");
    // Uses the configured platform name, not a hardcoded product name.
    expect(transcript.textContent).toContain("Acme Copilot:\nHi there");
  });

  test("builds escaped HTML transcript output", () => {
    const transcript = buildChatTranscript({
      thread: {
        title: "Danger <script>",
        createdAt: Date.UTC(2026, 4, 31, 16, 37),
        user: { name: "Visitor <A>" },
      },
      userLabel: "Visitor",
      assistantLabel: "Acme Copilot",
      messages: [
        { role: "user", content: "Use **bold** and <tags>", _creationTime: Date.UTC(2026, 4, 31, 16, 38) },
      ],
    });

    expect(transcript.htmlContent).toContain("Danger &lt;script&gt;");
    expect(transcript.htmlContent).toContain("Visitor &lt;A&gt;");
    expect(transcript.htmlContent).toContain("<strong>bold</strong>");
    expect(transcript.htmlContent).toContain("&lt;tags&gt;");
  });

  test("formats simple markdown features for transcript HTML", () => {
    const html = formatMessageContentForTranscriptHtml("**Bold**\n- item\n`code`");

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<li>item");
    expect(html).toContain("<code");
  });
});
