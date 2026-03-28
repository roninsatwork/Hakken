# Sonae — Product Vision

**備え — "to be prepared"**

---

## The Problem We Are Solving

CRMs track deals. They do not track people.

Every agency, every venture builder, every founder running multiple partnerships has the same problem — the relationships that actually drive business live in scattered places. Some context is in email threads, some in calendar invites, some in a transcript nobody tagged properly, some in your head because you remembered what someone said at dinner six months ago.

Day.ai handles the pipeline. It tracks where deals are, what stage they are in, what needs to happen next. That is its job and it does it well. But it does not know that the investor you are meeting on Thursday mentioned their daughter is starting university in September, or that the last time you spoke to a JV partner they were frustrated about their board composition, or that a contact you have not spoken to in four months just raised a Series B.

That gap — between managing deals and actually knowing people — is where Sonae lives.

## What Sonae Is

Sonae is a relationship intelligence platform for The Ronins Protocol. It sits alongside Day.ai and handles the human side of business relationships that no CRM was designed for.

Every contact becomes a living dossier. Not a row in a spreadsheet with a name and an email and a deal value, but a rich profile that accumulates everything you know about that person — every email exchanged, every meeting held, every transcript uploaded, every note taken, every piece of research gathered by AI agents running in the background.

You talk to Sonae the way you would talk to a colleague who has been in every meeting you have ever had. "When did I last speak to Sarah?" — it checks your email, your calendar, your notes, your transcripts and gives you the answer. "What did James say about the pricing model?" — it pulls from a transcript of your last call. "Draft an email to the Kando team about the Q2 roadmap" — it writes it using everything it knows about those people and that project.

## Who It Is For

The Ronins team. Under ten people across all ventures and JV partnerships. Sonae is an internal tool built for how we work — not a product we are selling to anyone else. That means we can be opinionated about the design, skip features we do not need and build exactly what makes our team faster and better prepared.

## The Core Belief

The quality of your relationships determines the quality of your opportunities. Most people leave relationship management to memory and good intentions. We are building a system that makes it impossible to drop the ball on a relationship that matters.

## How It Works — The Two Surfaces

Sonae has two primary interfaces and they serve different jobs.

**The Chat** is where you go to ask questions and get things done. It is a Claude-style conversational interface — multi-conversation, searchable history, voice input, document upload. You ask it anything about your network and it queries across every data source to answer. You tell it to draft an email or build an agenda and it creates using the full context of the relationship. It remembers every conversation you have ever had with it and auto-links discussions to the relevant contact dossiers.

**The Contacts** is where you go to browse, search and manage your network. Contacts are grouped by company, searchable with semantic understanding, and each one opens into a tabbed dossier — emails, meetings, notes, documents, research. You can edit inline, run bulk actions and see the full picture of any relationship at a glance.

## The Intelligence Layer

Sonae is not a database with a chatbot on top. The AI is the product.

**Research agents** enrich every contact from public sources — LinkedIn activity, company news, funding rounds, job changes — and surface a changelog so you know what has changed since you last looked. This runs on demand through MCP, not background sync. No mirrored data sitting in our database going stale.

**Memory** is per-user and infinite. Every conversation you have with the AI is persisted and searchable. When you ask about a contact, the AI pulls not just from their dossier but from every previous conversation you have had about that person. Context compounds over time.

**Content creation** uses the full relationship graph. When Sonae drafts an email, builds a meeting agenda, writes a proposal or generates a report, it draws on everything — the contact's dossier, your recent interactions, open items, the company context, your notes. The AI creates, you review and approve. Nothing goes out without a human saying yes.

## The Integration Philosophy

Sonae does not try to become your inbox or your calendar. It queries them.

All external integrations — Gmail, Google Calendar, WhatsApp, Day.ai, LinkedIn — work on demand via MCP. When the AI needs email data it goes and gets it. When you ask about your schedule it checks your calendar live. There is no background sync copying data into Sonae's database. This keeps the system clean, avoids stale data and means the integration surface area stays small and maintainable.

The Sonae database stores what you put in — contacts, notes, documents, transcripts, research. Everything else is a live lookup.

## The Tech Stack

- **Frontend:** Next.js / React
- **Database:** Convex
- **AI Models:** Google Gemini (Flash for speed, Pro for depth) with user-facing model switcher and thinking level control
- **Agent Orchestration:** Google ADK
- **Image Generation:** Google Imagen (inline in chat)
- **Integrations:** MCP for all external service connections
- **Auth:** Magic Link + Google OAuth
- **Voice:** Real-time voice conversation in the chat interface

## What Success Looks Like

Sonae is working when the team stops saying "I think I spoke to them about that" and starts saying "I know exactly where we left off." When every meeting starts with better context than the person across the table expects. When follow-ups happen on time because the system nudged you, not because you happened to remember. When a relationship that matters never goes cold because nobody was paying attention.

The measure is not features shipped or AI queries processed. It is whether the people using it feel more prepared, more informed and more confident in every business conversation they walk into.

That is what 備え means. To be prepared.

---

*Sonae is a product of The Ronins Protocol.*