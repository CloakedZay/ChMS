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

In **SQL Editor → New query**, run the files in `db/` **one by one, in number order**, starting with `000_base_schema.sql` and ending with the last file (`068`). Open each file, copy all of it, paste, press **Run**.

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
| 068 | Verses, training modules, questions and handouts readable by signed-in logins only |

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

1. Create a file `.env.local` in the project folder (it is ignored by git) with the values from step 2:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co   # required
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key                  # required (public by design; the database rules protect the data)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key              # required, secret: creating logins, resetting passwords, the assistant's index
ASSISTANT_DAILY_LIMIT=50                                     # optional: questions per Member per day (staff have no limit)
NEXT_PUBLIC_PASSWORD_EMAIL_CODE=on                           # optional: email a 6-digit code before a password change (needs email sending, step 5)
SMTP_USER=yourchurch@gmail.com                               # for "Forgot password?" and recovery emails (step 5): the Gmail sender
SMTP_PASS=abcdefghijklmnop                                   # its app password (secret)
# SMTP_HOST=smtp-relay.brevo.com                             # optional: another sender such as Brevo (also SMTP_PORT=587)
# SMTP_FROM=yourchurch@gmail.com                             # optional: the From address, if SMTP_USER isn't one (Brevo); verify it there
NEXT_PUBLIC_SITE_URL=https://faithsync.vercel.app            # optional: the app's address for reset links (default: the address the request came to)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA...                    # optional: "Verify you are human" check (step 5); public
TURNSTILE_SECRET_KEY=0x4AAAA...                              # its secret key (secret); set both or neither
```

   The `NEXT_PUBLIC_` values are built into the app, so after changing them restart `npm run dev` or build again.

2. Install and try it:

```bash
npm install
npm run dev        # http://localhost:3000
```

## 5. Sign-in settings (Supabase → Authentication)

- **URL Configuration**: set **Site URL** to the app's address (e.g. `https://faithsync.vercel.app`) and add it, and `http://localhost:3000`, to **Redirect URLs**.
- **Password rules**: in **Authentication → Sign In / Providers**, open **Email**, set **Minimum password length** to `8` and **Password Requirements** to **Letters and digits**, and save. Turn on **Leaked password protection** too if the plan offers it (Pro only). The app checks the same rules (plus common passwords and the username) before sending, in `src/app/lib/passwordRules.js`; this setting makes the server refuse a weak password even if someone skips the app.
- **"Verify you are human" check** (Cloudflare Turnstile, optional but recommended): it stops scripts from guessing passwords on the sign-in, Forgot password and Change password pages.
  1. At <https://dash.cloudflare.com>, open **Application security → Turnstile → Add widget**. Name it FaithSync, add the hostnames `localhost` and the app's domain (e.g. `faithsync.vercel.app`, no `https://`), mode **Managed**, and create it. Copy the site key and secret key. If the domain changes later, add the new one to the widget's hostnames first; the keys stay the same.
  2. Put both keys in `.env.local` and Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, step 4) and redeploy. The check now shows (`src/app/components/Turnstile.js`). "Forgot password?" checks it at once (`src/app/lib/turnstile.ts`); for sign-in and Change password, Supabase ignores the token until the next step.
  3. Only after the new version is live: in Supabase → **Authentication → Attack Protection**, turn on **CAPTCHA protection**, choose **Turnstile**, paste the secret key and save. Doing this before step 2 is live stops every sign-in.
- **Google** (optional):
  1. In Google Cloud Console → **APIs & Services → Credentials**, create an **OAuth client ID** (Web application). Add the redirect URI Supabase shows on its Google provider page (`https://<project>.supabase.co/auth/v1/callback`).
  2. In Supabase → **Authentication → Providers → Google**, turn it on and paste the client ID and secret.
  3. In **Authentication → Settings**, turn on **Allow manual linking**, so people can link Google to their existing login from their profile.
- **Email sending** (needed for the password-change code; recommended anyway). Supabase's built-in email only reaches the project's own team members and a few messages an hour, so add your own sender. With a Gmail account:
  1. In the Google account, turn on **2-Step Verification**, then create an **App password** (<https://myaccount.google.com/apppasswords>), name it FaithSync, and copy the 16 letters.
  2. In Supabase → **Authentication → Emails → SMTP Settings**, turn on **Custom SMTP**: sender email = the Gmail address, sender name = FaithSync, host `smtp.gmail.com`, port `587`, username = the Gmail address, password = the app password. Save.
  3. In **Authentication → Rate Limits**, raise **emails per hour** (for example 30). Gmail sends up to about 500 emails a day.
  4. In **Authentication → Emails → Templates → Reauthentication**, keep `{{ .Token }}` in the message: that is the 6-digit code.
- **Forgot password** (db/080): put the same Gmail address and app password in `SMTP_USER` / `SMTP_PASS` (step 4, and Vercel). The app sends recovery-email codes and reset links itself, because most logins are made-up usernames that Supabase can't email. Members add a recovery email on **Password & Google** (or Profile); then "Forgot password?" on the sign-in page emails them a reset link. Without a recovery email they still ask the Admin.
- **Password-change code**: after email sending works, turn on **Secure password change** (Authentication → Providers → Email), so the server itself refuses a password change without a recent sign-in or code. Then add `NEXT_PUBLIC_PASSWORD_EMAIL_CODE=on` to `.env.local` (and Vercel) and restart / redeploy. From then on, changing a password asks for the current password and then a code sent to the person's email. Not asked: the first sign-in with a temporary password, and logins with a made-up username (`…@members.faithsync.app`, no real email), which keep the current-password check.

## 6. Put it online (Vercel)

1. Push the project to GitHub and **Import** it in Vercel (framework: Next.js; the defaults are right).
2. In **Settings → Environment Variables**, add the same values as `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and `ASSISTANT_DAILY_LIMIT`, `NEXT_PUBLIC_PASSWORD_EMAIL_CODE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` if wanted).
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
| "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" | Add both to `.env.local` (or Vercel's Environment Variables) and restart / redeploy. |
| "The server is missing SUPABASE_SERVICE_ROLE_KEY" | Add the key to `.env.local` (on your computer) or Vercel's Environment Variables, then restart / redeploy. |
| Google sign-in returns to the login page with an error | The app's address isn't in Supabase's Redirect URLs, or the Google provider isn't turned on. |
| "Link Google account" fails | Turn on **Allow manual linking** (step 5). |
| Someone can't sign in: "This account has been disabled" | The Admin disabled the login, or their member record was archived (`db/055`). Enable it on **Users**, or restore the member. |
| A page or button is missing for someone | Their level doesn't allow it (see the table in SYSTEM.md), or their login has no branch. The Admin sets both on **Users**. |
| The assistant finds nothing in a document that was uploaded | Press **Rebuild search index** (Assistant → Documents). Scanned PDFs (pictures of pages) have no text and can't be searched. |
| Pages hang after the tab was left open a long time | The app reloads itself when this happens (SessionWatcher). If not, refresh the page. |
