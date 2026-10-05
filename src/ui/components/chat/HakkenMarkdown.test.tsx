import { render, screen } from '@testing-library/react';
import { expect, test, describe } from 'vitest';
import { HakkenMarkdown } from './HakkenMarkdown';

describe("OWASP: Cross Site Scripting (XSS) Prevention", () => {
  test("Markdown renderer escapes malicious <script> tags", () => {
    const maliciousPayload = "This is a response and <script>console.log('hacked')</script>";
    const { container } = render(<HakkenMarkdown content={maliciousPayload} />);
    
    // The rendered HTML should literally display the script tag as text, 
    // or strip it completely, but it should NOT be an actual script element in the DOM.
    const scriptTag = container.querySelector('script');
    expect(scriptTag).toBeNull();
    
    // Ensure the text itself renders safely
    expect(screen.getByText(/This is a response and/)).toBeInTheDocument();
  });

  test("Markdown renderer escapes iframe injections", () => {
    const maliciousIframe = "Checkout this cool site: <iframe src='javascript:void(1)'></iframe>";
    const { container } = render(<HakkenMarkdown content={maliciousIframe} />);
    
    const iframeTag = container.querySelector('iframe');
    expect(iframeTag).toBeNull();
  });

  test("Renderer safely parses valid Markdown like links", () => {
    const validPayload = "Here is a [Google Link](https://google.com)";
    render(<HakkenMarkdown content={validPayload} />);
    
    const link = screen.getByRole('link', { name: "Google Link" });
    expect(link).toHaveAttribute('href', 'https://google.com');
    expect(link).toHaveAttribute('target', '_blank'); // Ensures our security overrides run
    expect(link).toHaveAttribute('rel', 'noopener noreferrer'); // Target _blank security
  });
});

/**
 * An AI assistant's answer read on a page (Keyword research's What the AI
 * says, 2026-10-05): its links in the outside-link blue, and its `[n]`
 * markers small links to the pages it cites.
 */
describe("An assistant's answer", () => {
  test("its links are drawn in the outside-link blue, a chat's in the brand colour", () => {
    const { container: answer } = render(<HakkenMarkdown content="See [Pocket App](https://pocketapp.co.uk/)" variant="answer" />);
    const { container: chat } = render(<HakkenMarkdown content="See [Pocket App](https://pocketapp.co.uk/)" />);

    expect(answer.querySelector("a")).toHaveClass("text-info");
    expect(chat.querySelector("a")).toHaveClass("text-brand");
  });

  test("each [n] becomes a small link to the nth page it cites, and nothing else does", () => {
    const { container } = render(
      <HakkenMarkdown
        content={"Apadmi is best for enterprise.[2] Purrweb for startups.[3][9] `[1]` stays code."}
        variant="answer"
        citations={["https://one.test/", "https://two.test/", "javascript:alert(1)"]}
      />,
    );

    const links = [...container.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["2", "https://two.test/"]]);
    // A page that is not a web page, a number past the list and a marker in code all stay words.
    expect(container).toHaveTextContent("[3][9]");
    expect(container.querySelector("code")).toHaveTextContent("[1]");
  });

  test("markers side by side read apart, and its tables are drawn in columns", () => {
    const { container } = render(
      <HakkenMarkdown
        content={"Ask for references.[1][2]\n\n| Need | Start with |\n| --- | --- |\n| MVP | Purrweb |"}
        variant="answer"
        citations={["https://one.test/", "https://two.test/"]}
      />,
    );

    expect(container.querySelector("p")).toHaveTextContent("Ask for references.1,2");
    expect(container.querySelector("th")).toHaveClass("border-b");
    expect([...container.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["MVP", "Purrweb"]);
  });
});
