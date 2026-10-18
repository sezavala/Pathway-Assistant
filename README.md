# Smart Calendar

A personal scheduling assistant. Pick a learning goal, get a roadmap from Claude using your own API key, and let the app place study sessions around your Google Calendar. Sessions you miss move to your next free time.

This is V1, built for personal use: one Skills track, sessions shown in the app only (nothing is written to Google Calendar yet).

## How it fits together

- **Next.js** (`src/app`) serves the pages and the API routes.
- **Supabase** stores your data. Every table has row-level security, so each user can only reach their own rows (`supabase/migrations/0001_init.sql`).
- **Secrets** (your Claude key and Google refresh token) are encrypted with Supabase Vault and only ever decrypted on the server (`src/lib/supabase/admin.ts`).
- **Google Calendar** is read with the free/busy scope only. The app sees when you are busy, never event titles or details (`src/lib/google/calendar.ts`).
- **Claude** generates the placement quiz and roadmap with structured outputs (`src/lib/ai/claude.ts`).
- **Scheduler** is plain TypeScript with tests (`src/lib/scheduler.ts`). Missed sessions are caught up each time you open the dashboard, so no background job is needed.

## Setup

You need Node 20+, a [Supabase](https://supabase.com) project, a Google Cloud project, and a [Claude API key](https://platform.claude.com).

1. **Install**

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. **Supabase**
   - Create a project, then copy the URL, anon key and service role key into `.env.local`.
   - Open the SQL editor and run `supabase/migrations/0001_init.sql` (or `supabase db push` with the Supabase CLI).

3. **Google OAuth**
   - In Google Cloud, enable the **Google Calendar API**.
   - Configure the OAuth consent screen as **External**, in **Testing** mode, and add your own Google account under **Test users**.
   - Add the scope `https://www.googleapis.com/auth/calendar.freebusy`.
   - Create an **OAuth client ID** (Web application). Add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as an authorized redirect URI.
   - Put the client ID and secret in `.env.local`, and also in Supabase under **Authentication > Providers > Google**.
   - In Supabase **Authentication > URL Configuration**, add `http://localhost:3000/auth/callback` (and your Vercel URL later) to the redirect allow list.

   While the app is in Testing mode, Google expires sign-ins after 7 days. The app will ask you to sign in again when that happens.

4. **Run**

   ```bash
   npm run dev     # http://localhost:3000
   npm test        # scheduler tests
   ```

5. **Deploy** on Vercel: import the repo and add the same environment variables. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## What's next

- Screens for the placement quiz and roadmap (the API routes `/api/goals/[id]/quiz` and `/api/goals/[id]/roadmap` already exist).
- A calendar view with FullCalendar.
- Per-user rate limits on Claude calls.
- See the production-readiness checklist in the project plan before inviting other users.
