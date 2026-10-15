# FaithSync — Deployment Guide

How to set FaithSync up from zero: a new Supabase project, the database, sign-in, and hosting. For how the system is built, see [SYSTEM.md](SYSTEM.md).

## 1. What you need

| | |
|---|---|
| **Node.js 20 or newer** | to build and run the app |
| **A Supabase project** | database, logins, file storage (free plan is enough to start) |
| **A Vercel account** (or any Node.js host) | to put the app online |
| **A Google Cloud project** | only if staff and members should sign in with Google |

## 2. Create the Supabase project

1. At <https://supabase.com>, create a project. Choose a strong database password and the **Southeast Asia (Singapore)** region (closest to the Philippines).
2. In **Project Settings → API**, note:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / publishable key** (safe to put in the app)
   - **service_role / secret key** (server only — never put it in the app code or share it)
3. In **Database → Extensions**, turn on **`pg_cron`** (needed by `db/056` for the nightly *Inactive* check). `vector` and `pg_trgm` are turned on by `db/035` itself.

## 3. Build the database

In **SQL Editor → New query**, run the files in `db/` **one by one, in number order**, starting with `000_base_schema.sql` and ending with the last file (`067`). Open each file, copy all of it, paste, press **Run**.

- Every file is wrapped in `begin … commit`: if a line fails, nothing in that file is applied — fix the cause and run the same file again.
- Every file ends with a commented **Verify** query. Run it to confirm the file worked.
- If Supabase shows *"Potential issue detected … Row Level Security"*, choose **Run without RLS** — the files turn RLS on themselves; the warning is a false alarm triggered by the words `create table`.

| Files | What they set up |
|---|---|
| 000 | Base tables, `get_my_role()` / `get_my_church_id()`, sign-up trigger, `handouts` bucket |
| 001–009 | Access rules, user levels (Finance, Secretary), member privacy, Admin manages users |
| 010–016 | Activity log, screen time, disable a login, member logins, Elders |
| 017–019 | Spending requests, approvals, receipts (`receipts` bucket) |
| 020–028 | Ministries per branch, training modules per ministry, birthdays, journal |
| 029–040 | Messages, group chats, announcements, follow-up, the assistant's search index |
| 041–052 | Attendance and visitors, event approval, weekly events, cancel, reminders |
| 053–067 | Finance and member fixes, automatic status, sign-in sheet photos (`attendance-sheets` bucket), profiles, Pastor as backup, clean-up |

### Make the first Admin

1. Open the app's login page and sign up (or in **Authentication → Users → Add user**).
2. In the SQL Editor, give that login the Admin level and a branch:

```sql
insert into public.churches (name, location) values ('Main Church', 'Pandi, Bulacan')
on conflict (name) do nothing;

update public.profiles
   set role = 'admin',
       church_id = (select id from public.churches where name = 'Main Church')
 where email = 'admin@example.com';   -- your email
```

From then on, the Admin manages levels and branches on the **Users** page.

## 4. Configure the app

1. **Supabase address and public key** — in `src/app/lib/supabase.js`, set `supabaseUrl` and `supabaseAnonKey` to the values from step 2. (These two are public by design; access is protected by the database rules.)
2. **Secrets** — create a file `.env.local` in the project folder (it is ignored by git):

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # required: creating logins, resetting passwords, the assistant's index
ASSISTANT_DAILY_LIMIT=50                            # optional: questions per Member per day (staff have no limit)
```

3. Install and try it:

```bash
npm install
npm run dev        # http://localhost:3000
```

## 5. Sign-in settings (Supabase → Authentication)

- **URL Configuration**: set **Site URL** to the app's address (e.g. `https://faithsync.vercel.app`) and add it, and `http://localhost:3000`, to **Redirect URLs**.
- **Google** (optional):
  1. In Google Cloud Console → **APIs & Services → Credentials**, create an **OAuth client ID** (Web application). Add the redirect URI Supabase shows on its Google provider page (`https://<project>.supabase.co/auth/v1/callback`).
  2. In Supabase → **Authentication → Providers → Google**, turn it on and paste the client ID and secret.
  3. In **Authentication → Settings**, turn on **Allow manual linking**, so people can link Google to their existing login from their profile.

## 6. Put it online (Vercel)

1. Push the project to GitHub and **Import** it in Vercel (framework: Next.js; the defaults are right).
2. In **Settings → Environment Variables**, add `SUPABASE_SERVICE_ROLE_KEY` (and `ASSISTANT_DAILY_LIMIT` if wanted).
3. Deploy. Every push to the main branch deploys again.
4. Put the Vercel address in Supabase's Site URL / Redirect URLs (step 5).

The assistant downloads its text model (*multilingual-e5-small*, from Hugging Face) the first time it runs on a server, so the first question after a deploy can take longer.

## 7. After setup

1. **Users** page (Admin): create the branches' staff logins and set their levels; tick **Elder** for the Leaders who approve large spending.
2. **Members** (Secretary): import the members from Excel (template on the Import screen), then **Create login** for those who need one.
3. **Assistant → Documents**: upload the church documents and the Staff Guide (tick **Staff only**), then press **Rebuild search index** once.
4. **Bible Verses**: upload the verses for the verse of the day.

## 8. Troubleshooting

| What you see | Cause and fix |
|---|---|
| "… has not been set up yet. Ask the administrator to run db/0NN…" | That SQL file wasn't run. Run it (and any after it that failed). |
| A SQL file stops at `create extension if not exists pg_cron` | `pg_cron` is off. Turn it on in **Database → Extensions** and run the file again. |
| Nobody turns *Inactive* automatically | `db/056` didn't run, or the job is missing: `select * from cron.job where jobname = 'faithsync-auto-member-status';` should return one row. |
| "The server is missing SUPABASE_SERVICE_ROLE_KEY" | Add the key to `.env.local` (on your computer) or Vercel's Environment Variables, then restart / redeploy. |
| Google sign-in returns to the login page with an error | The app's address isn't in Supabase's Redirect URLs, or the Google provider isn't turned on. |
| "Link Google account" fails | Turn on **Allow manual linking** (step 5). |
| Someone can't sign in: "This account has been disabled" | The Admin disabled the login, or their member record was archived (`db/055`). Enable it on **Users**, or restore the member. |
| A page or button is missing for someone | Their level doesn't allow it (see the table in SYSTEM.md), or their login has no branch. The Admin sets both on **Users**. |
| The assistant finds nothing in a document that was uploaded | Press **Rebuild search index** (Assistant → Documents). Scanned PDFs (pictures of pages) have no text and can't be searched. |
| Pages hang after the tab was left open a long time | The app reloads itself when this happens (SessionWatcher). If not, refresh the page. |
