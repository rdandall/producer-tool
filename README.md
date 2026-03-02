# PRDCR — The Producer's Operating System

Built for film and video producers who are tired of losing hours to admin work.

PRDCR is a production management platform designed around a single idea: every tool should cut the time it takes to do a task in half. Not just marginally faster — genuinely half. Because when producers spend less time buried in spreadsheets, email threads, and status chasing, they get something irreplaceable back: the space to be fully present with their clients and their teams.

This platform is built for the producer who wants to lead — not administrate.

---

## What it does

- **Projects** — Track every production from idea to delivery. Status, brief, client contacts, Frame.io and Drive links, all in one place.
- **Tasks** — A smarter task list with priority strips, assignee tagging, resource links, and a slide-in detail panel so you can act on anything in seconds.
- **Calendar** — Shoot days, deadlines, and milestones synced directly with Google Calendar. No more double entry.
- **AI Brief Editor** — Speak or type your brief, and Claude refines it into a clean, shareable production document.
- **Edit Versions** — Track every client feedback round (v1, v2, v3) with status, notes, and Frame.io links per version.
- **Phases** — Run overlapping production stages with their own timelines — pre-production, filming, editing, colour, delivery.

---

## Philosophy

Time is the only resource a producer can't get more of. PRDCR is built on the belief that automation and good design should give that time back — not add more screens to manage. Every feature is held to one standard: does it make the producer faster, clearer, or more present?

If it doesn't, it doesn't ship.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS + shadcn/ui + Framer Motion
- **AI:** Anthropic Claude API (brief generation)
- **Calendar:** Google Calendar OAuth + Events API
- **Deployment:** Vercel

---

## Getting Started

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create a `.env.local` file at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

3. Run the schema in your Supabase SQL editor (`supabase/schema.sql`)

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running.

---

## Creator

Built by **Robert Deary-Andall** — producer, builder, and firm believer that the best creative work happens when the logistics get out of the way.
