# FaithSync

**Church management system for God's Grace Christian Fellowship Global Ministries Inc. (GGCF-GMI)** — one web app for the church's members, events, attendance, follow-up, finances, training and communication, across all branches.

Staff use the **staff dashboard** (`/dashboard`); members use the **member portal** (`/member-dashboard`). Each user level sees only what it is allowed to, and the database enforces the same rules on the data itself.

## Features

| Area | What it does |
|---|---|
| **Members** | Congregation records per branch, Excel import, member logins (created or linked), archive / restore, automatic *Inactive* after 14 days unseen |
| **Follow-up** | Lists members who haven't been seen or missed events, logs each follow-up, visitors list, "make member" |
| **Events** | Add, approve / send back, weekly series, cancel / restore, month calendar, notices |
| **Attendance** | Tick members from the paper sheet, visitors (with returning-visitor lookup), photos of the sign-in sheet, attendance helpers, reminders |
| **Finance** | Ledger (income / expenses, funds, void instead of delete), spending requests with approval rules (limit, Elders), release, receipts and liquidation |
| **Ministries & Training** | Ministries per branch, discipleship modules with questions and handouts, answer review, progress |
| **Communication** | Announcements, one-to-one and group messages, person profiles |
| **Assistant** | Answers questions from the church's own documents and handouts (English and Tagalog). No outside AI service: it finds and quotes the matching passages, never makes text up |
| **Other** | Verse of the day, private devotional journal, birthdays, reports with PDF export, activity log and screen time |

User levels: **Admin, Pastor, Leader (Elder), Finance, Secretary, Member** — see [docs/SYSTEM.md](docs/SYSTEM.md#user-levels-and-what-each-can-do).

## Built with

- **Next.js 16** (App Router) and **React 19**, **Tailwind CSS 4**
- **Supabase**: PostgreSQL database with row level security, authentication (email + Google), file storage, realtime, `pg_cron`
- **Search for the assistant**: PostgreSQL full-text + `pg_trgm` + `pgvector`, with text embeddings computed on the server by `@huggingface/transformers` (model *multilingual-e5-small*)
- `pdf-parse`, `mammoth` (Word), `read-excel-file`, `jspdf` (report export), `lucide-react` (icons)

## Run it on your computer

Requirements: **Node.js 20+** and access to the Supabase project.

```bash
npm install
# create .env.local with the service-role key (see docs/DEPLOYMENT.md)
npm run dev
```

Open <http://localhost:3000>. Other commands: `npm run build`, `npm start`, `npm run lint`.

To set FaithSync up from zero (new Supabase project, database, Google sign-in, hosting), follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Project layout

```
db/                      Database changes, run in order: 000_base_schema.sql … 067
docs/                    DEPLOYMENT.md (setup), SYSTEM.md (architecture, roles, security)
public/                  Logo, images, Excel template
src/app/
  (auth)/                Login, change password
  dashboard/             Staff pages (members, events, finance, …)
  member-dashboard/      Member portal pages
  api/                   Server routes that need the secret key (logins, passwords, assistant)
  components/            Shared parts (attendance sheet, dialogs, date picker, profiles, …)
  lib/                   Helpers: permissions.js (who sees what), Supabase clients, dates, …
  context/               Signed-in user and light / dark theme
```

## Documentation

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — installation, configuration, troubleshooting
- **[docs/SYSTEM.md](docs/SYSTEM.md)** — architecture, database, user levels, security model
- **db/*.sql** — every database change, each with a header explaining why and a check query at the bottom
- **Staff Guide** — the how-to for church staff, kept in the assistant's documents (Staff only)
