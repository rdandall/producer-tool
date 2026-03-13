# PRDCR Producer Tool — Memory

## Project Overview
Next.js 16 + Supabase + Tailwind v4 producer management tool for video producers.
Main repo: `/Users/rob/Desktop/github/producer-tool`

## Tech Stack
- Next.js 16.1.6 (App Router, server actions)
- Supabase (Postgres + RLS)
- Tailwind v4 + shadcn/ui
- Framer Motion, Sonner (toasts), Lucide icons
- @anthropic-ai/sdk (claude-sonnet-4-6)
- docx (Word export)
- Design: glass morphism, zero border-radius (radius: 0rem)

## Key Files
- `app/actions.ts` — all server actions (tasks, projects, phases, notes)
- `app/(dashboard)/layout.tsx` — dashboard shell with Sidebar
- `components/layout/sidebar.tsx` — nav (Dashboard, Projects, Tasks, Calendar, Notes & Briefs, Team[disabled])
- `supabase/schema.sql` — full DB schema + seed data

## Notes & Briefs Feature
**Files:**
- `lib/db/notes.ts` — DB queries (getAllNotes, getNoteById)
- `app/api/notes/generate/route.ts` — Claude AI generation (claude-sonnet-4-6)
- `app/api/notes/export/route.ts` — PDF (HTML blob) + DOCX (docx package)
- `app/api/notes/email/route.ts` — Resend API email sender (accepts array of recipients)
- `components/notes/notes-client.tsx` — 3-panel orchestrator (mobile stack nav)
- `components/notes/notes-list-panel.tsx` — left panel (search, filter, list); w-full md:w-64
- `components/notes/dictation-panel.tsx` — voice (Web Speech API) + text input
- `components/notes/document-editor.tsx` — preview/edit markdown document
- `components/notes/send-panel.tsx` — export (PDF/DOCX), links, email w/ contact autocomplete, task extraction; w-full md:w-72
- `components/notes/contact-autocomplete.tsx` — multi-recipient picker: avatar chips, dropdown from Gmail sent history + manual input
- `app/api/contacts/route.ts` — GET: pulls unique contacts from Gmail sent history via lib/gmail.ts

**DB table needed (run in Supabase):** `notes` table — see schema.sql
**Env vars needed:** `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
**Document types:** brief, meeting-notes, project-notes, client-brief
**Task extraction:** AI detects tasks in notes → pushed to Tasks section via createTaskAction

## Email Feature
**OAuth:** Gmail-only, separate from Calendar OAuth. Routes at `app/api/auth/gmail/` + `/callback/`.
Tokens stored in `app_settings`: `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expiry`, `gmail_user_email`.
Tone profile stored in `app_settings`: `gmail_tone_profile`, `gmail_style_note`, `gmail_tone_sample_count`.

**Files:**
- `lib/gmail.ts` — Gmail REST API client (list, thread, send, search sent, OAuth)
- `lib/db/emails.ts` — DB queries (getAllEmails, upsertEmails, getPendingTaskSuggestions, etc.)
- `app/api/email/sync/route.ts` — POST: fetch 50 inbox messages, upsert to DB
- `app/api/email/send/route.ts` — POST: send reply via Gmail API
- `app/api/email/generate-response/route.ts` — POST: 3 variants + smart inserts + phase signal + dates
- `app/api/email/analyze-tone/route.ts` — POST: analyze 150 sent emails → tone profile
- `app/api/email/tasks/route.ts` — POST: extract tasks | PATCH: approve/dismiss suggestion
- `app/api/email/style/route.ts` — GET/POST/DELETE: tone profile + style note
- `app/(dashboard)/dashboard/email/page.tsx` — server page (checks Gmail connected)
- `components/email/gmail-connect.tsx` — OAuth connect screen (shown when not connected)
- `components/email/email-client.tsx` — 3-panel orchestrator (state + conflict detection + mobile stack nav)
- `components/email/email-list-panel.tsx` — left: thread list + sync + search
- `components/email/email-thread-panel.tsx` — center: messages + phase/conflict banners
- `components/email/email-compose-panel.tsx` — right: AI compose + send
- `components/email/response-variants.tsx` — tabbed editable textareas (Punchy/Balanced/Detailed)
- `components/email/smart-inserts-sidebar.tsx` — clickable insert chips (inject at cursor)
- `components/email/task-suggestion-queue.tsx` — approve/dismiss pending tasks

**DB tables (run supabase/email-migration.sql):** `emails`, `email_task_suggestions`
**Server actions added:** `approveEmailTaskSuggestionAction`, `dismissEmailTaskSuggestionAction`
**Sidebar:** Email nav item added between Notes & Briefs and Team

**Key design decisions:**
- Regex-based date extraction (instant, no API call) on thread select → conflict check vs phases/tasks
- Smart inserts are AI-unrestricted (any relevant content, not just producer context)
- Response variants: tabbed UI, all 3 editable textareas, per-variant Regen button
- Smart insert injects at textarea cursor position (selectionStart/requestAnimationFrame)
- Task extraction triggered non-blocking on thread select for latest inbox email

## DB Tables
- projects, edit_versions, phases, tasks, notes, emails, email_task_suggestions

## Global Executive Assistant
**Philosophy:** The assistant handles EVERY function on the site — universal control layer. User wants it to grow to cover all features as added.

**Files:**
- `components/assistant/global-assistant.tsx` — floating mic button, bottom-right, on all pages
- `app/api/assistant/route.ts` — AI intent parser (claude-sonnet-4-6), returns structured JSON action
- Added to `components/layout/dashboard-shell.tsx` via `<GlobalAssistant projects={projects} />`

**Server action:** `createTaskDirectAction(params)` in `app/actions.ts` — takes plain object (not FormData)

**Flow:** mic click → Web Speech API → POST /api/assistant → confirmation panel → user approves → execute. Always confirms before acting.

**Text fallback:** If speech unavailable, shows text textarea in panel.

**Current intents:** create_task, reply_email, compose_email, add_calendar_event, create_note, navigate, unknown

**Email integration:** Stores action in `prdcr_assistant_email` sessionStorage. EmailClient reads on mount after emails load, auto-selects thread + opens compose.

**Extension pattern:** When adding new features, update system prompt in `/api/assistant/route.ts` + add case in `executeAction` switch in global-assistant.tsx.

## Responsive Design
The entire app is fully responsive (mobile-first). Key patterns used:

### Mobile Stack Navigation
Multi-panel pages show one panel at a time on mobile, with back buttons to navigate:

**Email (`email-client.tsx`):**
- State: `mobileView: "list" | "thread" | "compose"`
- List → Thread: selecting a thread sets `mobileView("thread")`, shows "← Inbox" back button
- Thread → Compose: clicking Reply sets `mobileView("compose")`, shows "← Thread" back button
- Each panel: `mobileView === X ? "flex" : "hidden md:flex"`

**Notes (`notes-client.tsx`):**
- State: `mobilePanelView: "list" | "editor" | "send"`
- List → Editor: selecting/creating a note sets `mobilePanelView("editor")`, shows "← Notes" back button + "Actions" (Share2) button
- Editor → Send Panel: tapping Actions sets `mobilePanelView("send")`, shows "← Back to editor"
- Each panel: conditional `flex` / `hidden md:flex`

### Responsive Padding
All pages use: `px-4 py-4 sm:px-8 sm:py-6 lg:px-10 lg:py-10` (adjust as needed per page)

### Panel Widths
Fixed-width side panels use `w-full md:w-[N]` pattern:
- Task detail panel: `w-full md:w-[360px]`
- Notes list panel: `w-full md:w-64`
- Notes send panel: `w-full md:w-72`
- Email list panel: `w-full md:w-72`
- Email compose panel: `w-full md:w-[460px]`

### Other Mobile Fixes
- Dashboard stat strip: `grid grid-cols-2 sm:grid-cols-4` (2×2 on mobile → 4-col on desktop)
- Projects table: `min-w-[640px]` inside `overflow-x-auto` for horizontal scroll
- Filter chips: `overflow-x-auto scrollbar-none` so they scroll horizontally on mobile
- Tasks: task list gets `hidden md:block` when a task detail panel is open on mobile

## Contact Autocomplete (Notes Email)
**Files:**
- `components/notes/contact-autocomplete.tsx` — multi-select picker component
- `app/api/contacts/route.ts` — GET endpoint, parses Gmail sent history for unique name+email pairs

**Behaviour:**
- Fetches contacts from `/api/contacts` on mount (deduped from Gmail sent headers)
- Type-to-filter dropdown with avatar initials + colour coding
- Selected recipients shown as removable chips
- Falls back gracefully if Gmail not connected (empty contact list, still accepts manual input)
- `send-panel.tsx` uses `emailRecipients: Contact[]` state; sends `emailRecipients.map(c => c.email)` array to `/api/notes/email`

## Design Patterns
- Server components fetch data, pass to `*Client` components
- Server actions in `app/actions.ts` for all mutations
- API routes for AI/export/email (streaming not used here, just JSON)
- Sidebar items: disabled = `{ disabled: true }` prop → greyed out, no link
- Collapsible sidebar with mobile nav drawer
- Gmail API: direct fetch (no googleapis SDK), same pattern as google-calendar.ts
