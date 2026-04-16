import { render, screen } from '@testing-library/react';
import { expect, test, describe } from 'vitest';
import { SonaeMarkdown } from './SonaeMarkdown';

describe("OWASP: Cross Site Scripting (XSS) Prevention", () => {
  test("Markdown renderer escapes malicious <script> tags", () => {
    const maliciousPayload = "This is a response and <script>alert('hacked')</script>";
    const { container } = render(<SonaeMarkdown content={maliciousPayload} />);
    
    // The rendered HTML should literally display the script tag as text, 
    // or strip it completely, but it should NOT be an actual script element in the DOM.
    const scriptTag = container.querySelector('script');
    expect(scriptTag).toBeNull();
    
    // Ensure the text itself renders safely
    expect(screen.getByText(/This is a response and/)).toBeInTheDocument();
  });

  test("Markdown renderer escapes iframe injections", () => {
    const maliciousIframe = "Checkout this cool site: <iframe src='javascript:alert(1)'></iframe>";
    const { container } = render(<SonaeMarkdown content={maliciousIframe} />);
    
    const iframeTag = container.querySelector('iframe');
    expect(iframeTag).toBeNull();
  });

  test("Renderer safely parses valid Markdown like links", () => {
    const validPayload = "Here is a [Google Link](https://google.com)";
    render(<SonaeMarkdown content={validPayload} />);
    
    const link = screen.getByRole('link', { name: "Google Link" });
    expect(link).toHaveAttribute('href', 'https://google.com');
    expect(link).toHaveAttribute('target', '_blank'); // Ensures our security overrides run
    expect(link).toHaveAttribute('rel', 'noopener noreferrer'); // Target _blank security
  });
});
