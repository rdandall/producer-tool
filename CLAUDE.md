# PRDCR — Producer Tool

AI context file for Claude Code, Codex, and other AI assistants. Read this to understand the project before touching any files.

## What This Is

A management tool for video/creative producers. Replaces spreadsheets and context-switching across Gmail, Notion, Calendar, etc. The user is a freelance video producer who manages multiple client projects simultaneously.

**Core philosophy:** Minimal chrome, maximum utility. Every feature should reduce friction in a producer's actual workflow.

## Tech Stack

- **Framework:** Next.js 16 (App Router, server actions, server components)
- **Database:** Supabase (PostgreSQL + Row Level Security — permissive policies, single-user app)
- **Styling:** Tailwind v4 + shadcn/ui — zero border-radius (`radius: 0rem`), glass morphism aesthetic
- **AI:** `@anthropic-ai/sdk` — model `claude-sonnet-4-6` for all AI features
- **Icons:** Lucide React
- **Toasts:** Sonner
- **Animation:** Framer Motion
- **Email sending:** Resend API (for Notes exports)
- **Word export:** `docx` package

## Design System Rules

- **Zero border-radius everywhere** — `radius: 0rem` in globals
- Glass morphism: `bg-sidebar-accent/20`, `border-border/50`
- Monospace font for email/document bodies
- Muted foreground for secondary text
- No emojis in UI unless user explicitly adds them

## Project Structure

```
app/
  (dashboard)/
    layout.tsx          — dashboard shell + sidebar
    dashboard/
      page.tsx          — overview/home
      projects/         — project management
      tasks/            — task management
      calendar/         — Google Calendar integration
      email/            — email hub (Gmail)
        page.tsx        — server component, passes data to EmailClient
      notes/            — notes & briefs (AI document generation)
  api/
    auth/
      google/           — Google Calendar OAuth
      gmail/            — Gmail OAuth (separate from Calendar)
        route.ts        — initiates Gmail OAuth
        callback/route.ts — stores tokens in app_settings
    email/
      sync/route.ts     — fetch emails from Gmail, upsert to DB
      send/route.ts     — send reply via Gmail API
      generate-response/route.ts — 3 AI variants + smart inserts
      analyze-tone/route.ts      — build tone profile from sent history
      tasks/route.ts    — extract/approve/dismiss task suggestions
      style/route.ts    — tone profile + manual style note CRUD
    notes/
      generate/route.ts — AI document generation
      export/route.ts   — PDF + DOCX export
      email/route.ts    — send via Resend
  actions.ts            — ALL server actions (tasks, projects, phases, notes, email tasks)

components/
  layout/
    sidebar.tsx         — collapsible nav (Dashboard, Projects, Tasks, Calendar, Notes & Briefs, Email)
  email/
    email-client.tsx        — 3-panel state orchestrator
    email-list-panel.tsx    — left: thread list + task queue
    email-thread-panel.tsx  — center: messages + conflict banners
    email-compose-panel.tsx — right: AI reply + variants + send
    response-variants.tsx   — tabbed editable textareas (Punchy/Balanced/Detailed)
    smart-inserts-sidebar.tsx — AI-generated insert chips
    task-suggestion-queue.tsx — approve/dismiss extracted tasks
    gmail-connect.tsx       — OAuth connect screen
  notes/
    notes-client.tsx        — 3-panel orchestrator
    notes-list-panel.tsx    — left panel
    dictation-panel.tsx     — voice + text input
    document-editor.tsx     — markdown preview/edit
    send-panel.tsx          — export, email, task extraction

lib/
  gmail.ts              — Gmail REST API client (NO googleapis SDK — direct fetch)
  google-calendar.ts    — Google Calendar client (direct fetch)
  db/
    emails.ts           — getAllEmails, upsertEmails, getPendingTaskSuggestions
    notes.ts            — getAllNotes, getNoteById

supabase/
  schema.sql            — full DB schema (projects, phases, tasks, notes, app_settings)
  email-migration.sql   — emails + email_task_suggestions tables (run separately)
```

## Database Tables

- `projects` — client projects with color, status, budget
- `phases` — project phases with start/end dates and status
- `tasks` — tasks linked to projects/phases, with priority and due date
- `notes` — AI-generated documents (brief, meeting-notes, project-notes, client-brief)
- `app_settings` — key/value store for OAuth tokens, AI settings, tone profiles
- `emails` — Gmail message cache (synced on demand)
- `email_task_suggestions` — AI-extracted task suggestions pending approval

## Key Patterns

### Data flow
Server components fetch data → pass as props to `*Client` components → mutations via server actions in `app/actions.ts`.

### Auth tokens
Stored in `app_settings` table via `getSetting(key)` / `setSetting(key, value)` helpers in `lib/supabase.ts`.

- Calendar: `google_access_token`, `google_refresh_token`, `google_token_expiry`
- Gmail: `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expiry`, `gmail_user_email`
- Tone profile: `gmail_tone_profile` (JSON), `gmail_style_note` (text)

### Gmail (lib/gmail.ts)
Direct Gmail REST API — no googleapis SDK. Same pattern as `lib/google-calendar.ts`. `getValidGmailToken()` auto-refreshes using stored tokens.

Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `userinfo.email`

### AI generation
All AI calls use `claude-sonnet-4-6`. Pattern:
```ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const msg = await anthropic.messages.create({ model: "claude-sonnet-4-6", ... });
```

## Email Feature (main feature of this session)

The email hub replaces context-switching to Gmail. Key capabilities:

1. **Email sync** — pulls inbox from Gmail, stores in `emails` table
2. **Thread view** — collapsible messages, oldest→newest
3. **AI reply drafting** — 3 variants (Punchy/Balanced/Detailed), all fully editable textareas
4. **Smart inserts** — AI-generated contextual chips; inject at cursor position in textarea
5. **Task extraction** — AI reads incoming emails, suggests tasks for approval
6. **Phase signals** — AI detects approval/delivery language, suggests phase status updates
7. **Date conflicts** — client-side regex detects mentioned dates, cross-references phases/tasks
8. **Tone learning** — AI analyzes sent email history + manual style note

### Email compose architecture
- `ResponseVariants` exposes `insertText` via `insertRef` (MutableRef) to parent
- Smart insert chips call `insertRef.current(text)` → injects at `textarea.selectionStart`
- Each variant is an independent `<textarea>` — no locking, fully editable at all times
- Per-variant Regen button re-calls AI for just that variant type

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
GOOGLE_CLIENT_ID=          # for Calendar + Gmail OAuth
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=             # for Notes email export
RESEND_FROM_EMAIL=          # e.g. "PRDCR <noreply@prdcr.app>"
```

## DB Migration

Run `supabase/email-migration.sql` in Supabase SQL editor to create `emails` and `email_task_suggestions` tables. The main schema is in `supabase/schema.sql`.

## What's Built vs What's Planned

### Built ✓
- Projects, phases, tasks CRUD
- Google Calendar integration (read + event creation)
- Notes & Briefs (AI generation, PDF/DOCX export, email via Resend)
- Email hub (Gmail OAuth, sync, thread view, AI compose, smart inserts, task queue, tone analysis, phase signals, date conflict detection)
- Collapsible sidebar with mobile nav drawer

### Not built
- Team collaboration (sidebar item is disabled)
- Real-time notifications
- Multi-user / auth (single-user app currently)
