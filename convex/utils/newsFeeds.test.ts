import { describe, expect, test } from "vitest";

import {
  articleLinks,
  feedGuesses,
  feedLinksIn,
  looksLikeFeed,
  parseFeed,
  textOf,
  youtubeFeedFromAddress,
  youtubeFeedFromPage,
} from "./newsFeeds";

/**
 * Reading a News source (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 5): the feeds sources really publish — RSS with CDATA and entities,
 * Atom, a YouTube channel's — and finding a feed or a channel from a page.
 */

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Search Engine Land</title>
  <atom:link href="https://searchengineland.com/feed" rel="self" type="application/rss+xml" />
  <item>
    <title><![CDATA[Google&#8217;s March core update: what changed]]></title>
    <link>https://searchengineland.com/google-march-core-update-123</link>
    <guid isPermaLink="false">https://searchengineland.com/?p=123</guid>
    <pubDate>Thu, 13 Mar 2025 18:04:00 +0000</pubDate>
    <description><![CDATA[<p>Short teaser.</p>]]></description>
    <content:encoded><![CDATA[<p>Google rolled out its <strong>March</strong> core update &amp; it took two weeks.</p><script>track()</script>]]></content:encoded>
  </item>
  <item>
    <title>Bing adds AI answers</title>
    <link>/bing-ai-answers-456</link>
    <pubDate>not a date</pubDate>
    <description>Bing &lt;b&gt;now&lt;/b&gt; answers.</description>
  </item>
  <item>
    <title>No link at all</title>
    <description>Nowhere to send a reader.</description>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Google Search Central Blog</title>
  <entry>
    <title type="html">Spam update &amp;amp; you</title>
    <link rel="replies" href="https://developers.google.com/search/blog/comments" />
    <link rel="alternate" type="text/html" href="https://developers.google.com/search/blog/2025/08/spam-update" />
    <id>tag:developers.google.com,2025:spam-update</id>
    <published>2025-08-26T10:00:00Z</published>
    <updated>2025-08-27T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;We are rolling out a spam update.&lt;/p&gt;</summary>
  </entry>
</feed>`;

const YOUTUBE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Ahrefs</title>
 <entry>
  <id>yt:video:abc123</id>
  <yt:videoId>abc123</yt:videoId>
  <title>How to rank in AI Overviews</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
  <published>2026-09-30T15:00:00+00:00</published>
  <media:group>
   <media:title>How to rank in AI Overviews</media:title>
   <media:description>In this video we look at what AI Overviews cite.</media:description>
  </media:group>
 </entry>
</feed>`;

describe("reading a feed", () => {
  test("RSS: CDATA and entities unwrapped, the full content preferred, HTML and scripts stripped, links made absolute", () => {
    const entries = parseFeed(RSS, "https://searchengineland.com/feed");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: "Google’s March core update: what changed",
      url: "https://searchengineland.com/google-march-core-update-123",
      key: "https://searchengineland.com/google-march-core-update-123",
      publishedAt: Date.parse("2025-03-13T18:04:00Z"),
      text: "Google rolled out its March core update & it took two weeks.",
    });
    expect(entries[1]).toMatchObject({
      url: "https://searchengineland.com/bing-ai-answers-456",
      publishedAt: null,
      text: "Bing now answers.",
    });
  });

  test("Atom: the alternate link, the published date, the summary as words", () => {
    expect(parseFeed(ATOM, "https://developers.google.com/search/blog/feeds/posts/default")).toEqual([{
      title: "Spam update & you",
      url: "https://developers.google.com/search/blog/2025/08/spam-update",
      key: "https://developers.google.com/search/blog/2025/08/spam-update",
      publishedAt: Date.parse("2025-08-26T10:00:00Z"),
      text: "We are rolling out a spam update.",
    }]);
  });

  test("a YouTube channel's feed: the video's page and its description", () => {
    expect(parseFeed(YOUTUBE, "https://www.youtube.com/feeds/videos.xml?channel_id=UC")).toEqual([{
      title: "How to rank in AI Overviews",
      url: "https://www.youtube.com/watch?v=abc123",
      key: "https://www.youtube.com/watch?v=abc123",
      publishedAt: Date.parse("2026-09-30T15:00:00Z"),
      text: "In this video we look at what AI Overviews cite.",
    }]);
  });

  test("tells a feed from a page", () => {
    expect(looksLikeFeed(RSS)).toBe(true);
    expect(looksLikeFeed(ATOM)).toBe(true);
    expect(looksLikeFeed("<!doctype html><html><head><title>Blog</title></head></html>")).toBe(false);
  });

  test("keeps a page's words readable", () => {
    expect(textOf("<h2>One</h2><p>Two &nbsp; three</p><style>p{}</style>")).toBe("One\nTwo three");
  });
});

describe("finding a source's feed", () => {
  test("a page's announced feeds, RSS before Atom, absolute and once each", () => {
    const html = `<head>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml">
      <link rel="alternate" type="application/rss+xml" title="Posts" href="https://blog.example/feed/">
      <link rel="alternate" type="application/rss+xml" href="https://blog.example/feed/">
      <link rel="stylesheet" href="/site.css">
    </head>`;
    expect(feedLinksIn(html, "https://blog.example/news/")).toEqual(["https://blog.example/feed/", "https://blog.example/atom.xml"]);
  });

  test("guesses a feed under the page's own path before the site's root", () => {
    const guesses = feedGuesses("https://developers.google.com/search/blog");
    expect(guesses.indexOf("https://developers.google.com/search/blog/feed.xml")).toBeLessThan(guesses.indexOf("https://developers.google.com/feed.xml"));
    expect(feedGuesses("https://blog.example/")).toEqual([
      "https://blog.example/feed", "https://blog.example/rss.xml", "https://blog.example/feed.xml",
      "https://blog.example/atom.xml", "https://blog.example/rss", "https://blog.example/index.xml",
    ]);
  });

  test("a YouTube channel's feed from its own address, or from an @handle page", () => {
    expect(youtubeFeedFromAddress("https://www.youtube.com/channel/UCWquNQV8Y0_defMKnGKrFOQ"))
      .toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ");
    expect(youtubeFeedFromAddress("https://www.youtube.com/@AhrefsCom")).toBeNull();
    expect(youtubeFeedFromAddress("https://example.com/channel/UCWquNQV8Y0_defMKnGKrFOQ")).toBeNull();

    const announced = `<link rel="alternate" type="application/rss+xml" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ">`;
    expect(youtubeFeedFromPage(announced)).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ");
    expect(youtubeFeedFromPage(`<script>var x = {"externalId":"UCWquNQV8Y0_defMKnGKrFOQ"}</script>`))
      .toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ");
    expect(youtubeFeedFromPage("<html>no channel here</html>")).toBeNull();
  });
});

describe("a website with no feed", () => {
  test("its articles are the links on its page that look like articles, under that page, once each", () => {
    const links = [
      "https://www.blog.example/news/google-changes-how-it-ranks-local-results",
      "https://blog.example/news/google-changes-how-it-ranks-local-results#comments",
      "/news/2026/09/what-we-learned",
      "https://blog.example/news/tag/seo-and-ai",
      "https://blog.example/news/page/2",
      "https://blog.example/news",
      "https://blog.example/about-our-company-and-team",
      "https://other.example/news/someone-elses-big-story",
      "https://blog.example/news/report-2026-final-version.pdf",
      "https://blog.example/news/short",
    ];
    expect(articleLinks(links, "https://blog.example/news/")).toEqual([
      "https://www.blog.example/news/google-changes-how-it-ranks-local-results",
      "https://blog.example/news/2026/09/what-we-learned",
    ]);
  });
});
