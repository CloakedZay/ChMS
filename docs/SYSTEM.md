# FaithSync — System Documentation

How FaithSync is built: its parts, its database, what each user level can do, and how the data is protected. For installation, see [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Overview

FaithSync is a web application for **God's Grace Christian Fellowship Global Ministries Inc.** and its branches. It serves six user levels from one code base: church staff use the **staff dashboard**, members use the **member portal**. Every branch's data is kept apart; the Pastor and the Admin see across branches.

## 2. Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages + React components<br/>(staff dashboard, member portal)"]
    PERM["lib/permissions.js<br/>which pages and buttons each level sees"]
  end
  subgraph Server["Next.js server (Vercel)"]
    API["/api routes<br/>create login · reset password ·<br/>assistant · document indexing"]
    EMB["Text embeddings<br/>(transformers.js)"]
  end
  subgraph Supabase
    AUTH["Auth<br/>email + Google"]
    DB[("PostgreSQL<br/>tables · row level security ·<br/>functions · triggers")]
    STO["Storage (private)<br/>handouts · receipts · sheet photos"]
    RT["Realtime<br/>messages"]
    CRON["pg_cron<br/>nightly status check"]
  end
  UI -- "signed-in user's token" --> DB
  UI --> AUTH
  UI --> STO
  UI <-- live --> RT
  UI --> API
  API -- "service key, after checking the caller" --> DB
  API --> EMB
  CRON --> DB
```

**Layers**

| Layer | Where | Role |
|---|---|---|
| Pages | `src/app/dashboard/*`, `src/app/member-dashboard/*`, `src/app/(auth)/*` | Screens for each feature; the layout checks `canOpenPage()` before showing a page |
| Shared components | `src/app/components/*` | Attendance sheet, spending requests, messenger, date / time pickers, dialogs, reminders, person profile, app shell |
| Helpers | `src/app/lib/*` | `permissions.js` (levels and features), Supabase clients (settings from the environment), `errors.js` (plain error messages), `format.js` (money), `theme.js` (shared colours), `useStoredValue.js` (settings remembered in the browser), Philippine dates, event series, the assistant's language and search helpers |
| Server routes | `src/app/api/*` | Actions that need the secret service key. Each route first checks the caller's session and level (`lib/apiAuth.ts`) |
| Database | `db/000 … 068` | Tables, **row level security**, functions for multi-step actions (approvals, attendance, follow-up), triggers (activity log, locks, automatic stamps), the nightly job |

**Two layers of permission.** `permissions.js` decides what each level **sees** (menu, pages, buttons). The database decides what each level can **actually read and change**, on every table, whatever screen or tool is used. The screens could be bypassed; the data rules cannot.

## 3. Database

PostgreSQL on Supabase. Every change is a numbered file in `db/` (run in order; each has a header explaining why, and a check query). `db/000` records the tables first made by hand in the Supabase dashboard.

### Main tables and how they connect

```mermaid
erDiagram
  churches ||--o{ profiles : "branch of"
  churches ||--o{ members : "branch of"
  churches ||--o{ ministries : has
  churches ||--o{ events : has
  churches ||--o{ transactions : has
  profiles ||--o| members : "login of"
  members ||--o{ ministry_assignments : in
  ministries ||--o{ ministry_assignments : has
  ministries ||--o{ discipleship_modules : "training of"
  events ||--o{ event_attendance : records
  members ||--o{ event_attendance : attends
  events ||--o{ event_visitors : records
  visitors ||--o{ event_visitors : attends
  events ||--o{ event_sheet_photos : "sheet photos"
  members ||--o{ member_followups : "followed up"
  expense_requests ||--o{ expense_approvals : "decided by"
  expense_requests ||--o{ expense_receipts : liquidated
  expense_requests |o--o| transactions : "released as"
  discipleship_modules ||--o{ discipleship_questions : has
  discipleship_questions ||--o{ discipleship_progress : answered
  discipleship_modules ||--o{ module_handouts : has
  profiles ||--o{ messages : sends
  chat_groups ||--o{ group_messages : has
```

| Group | Tables |
|---|---|
| People | `churches`, `profiles` (logins), `members`, `ministries`, `ministry_assignments`, `attendance_helpers` |
| Events and attendance | `events`, `event_attendance`, `visitors`, `event_visitors`, `event_sheet_photos` |
| Follow-up | `member_followups` |
| Finance | `transactions`, `finance_settings`, `expense_requests`, `expense_approvals`, `expense_receipts` |
| Training | `discipleship_modules`, `discipleship_questions`, `discipleship_progress`, `module_handouts`, `module_views` |
| Communication | `announcements`, `messages`, `chat_groups`, `chat_group_members`, `group_messages`, `message_hides` and `chat_states` (deleted for me, archived and cleared chats, db/073) |
| Assistant | `chatbot_documents`, `knowledge_chunks`, `assistant_chats`, `assistant_messages`, `assistant_usage` |
| Personal and system | `devotional_journal`, `bible_verses`, `activity_log`, `page_visits` |

**Views** give limited columns to people who may not read a whole table: `member_directory` (names, ministries), `member_names` (names only, for the Admin), `chat_contacts` (who you can message), `member_rows` (members with their ministries and login, for the Members page; follows the `members` rules).

**Design choices**
- **Never deleted, only closed:** members are *archived*, finance entries *voided*, events *cancelled* — the record stays traceable.
- **Some names are stored as text on purpose:** the payee on a transaction (can be a store, not a member), and the requester / approver names on spending requests (Finance can't read logins, but must see who asked).
- **Dates follow the Philippines:** `ph_today()` and `Asia/Manila` everywhere a "today" matters.
- **Long lists are paged by the database:** the ledger and the members list ask for one page at a time (`ledger_entries`, `member_list` with the page's search and filters), and their totals and counts are worked out in the database (`finance_summary`, `member_counts`, db/069). Supabase returns at most 1,000 rows per request, so adding up rows in the browser would go wrong on a large ledger. These run as the signed-in person, so the row rules still apply. The staff dashboard's total funds use `finance_summary` too; lists that need every row (Reports, the member import's duplicate check) read them 1,000 at a time with `lib/fetchAll.js`.

## 4. User levels and what each can do

| Feature | Admin | Pastor | Leader | Finance | Secretary | Member |
|---|---|---|---|---|---|---|
| Users (levels, branches, Elders, disable, reset password) | **Manage** | — | — | — | — | — |
| Members | names only | **Add, edit, archive** (all branches) | View | names in Finance | **Add, edit, import, logins, archive** | own |
| Follow-up | — | Manage (all) | Log follow-ups | — | Manage | — |
| Events | View | View; approve where a branch has no Leader | **Add, approve, cancel** | View | Add (for approval) | View approved |
| Attendance | View | View (all) | View | View | Take | Own; helpers take |
| Finance ledger | — | View (all) | View | **Record, void** | — | — |
| Spending requests | — | Request, approve, set limits | Request, approve (Elders: large, love gifts) | Release, check receipts | — | — |
| Ministries | View | **Manage**, pick each head (a Leader) | **Add / remove members** of the ministry they head | — | View | Own |
| Training | View | Manage, review | Manage (general + own ministry), review | — | — | Take |
| Announcements | View | Post (all branches) | Post (own branch) | View | View | View |
| Bible verses | View | Add, **delete** | Add | — | — | Verse of the day |
| Assistant | Ask, documents (all branches) | Ask, documents (all branches) | Ask, documents (own branch) | Ask | Ask | Ask (daily limit) |
| Activity | Change log, screen time | Screen time | — | — | — | — |
| Messages, journal, profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Branch scope: the **Admin and Pastor** see all branches (with a branch picker); everyone else only their own. An **attendance helper** is a Member the Pastor or Secretary allows to take attendance. An **Elder** is a Leader the Admin marks as Elder.

## 5. Security

| Area | How it's handled |
|---|---|
| **Authorization** | Row level security on every table; 150+ rules scoped by level and branch (`get_my_role()`, `get_my_church_id()`). Multi-step actions run in database functions that check the caller first (e.g. `pastor_review_events`, `set_attendance`). Triggers block what rules can't express (voided entries locked, released-request entries locked, only the Admin changes levels). |
| **Authentication** | Supabase Auth: hashed passwords, email or Google sign-in, a temporary password that must be changed on first sign-in, logins the Admin can disable (a disabled login loses all access at once) or, when made by mistake and without any church records, delete (`/api/users/delete`, db/074), archiving a member switches off their member login. **Password change**: the current password, then (with `NEXT_PUBLIC_PASSWORD_EMAIL_CODE=on` and email sending set up) a 6-digit code emailed through Supabase re-authentication; not on the first sign-in, and not for logins without a real email (`change-password/page.js`). **Idle logout**: after 30 minutes with no mouse, key, touch or scroll in any FaithSync tab, the person is signed out and the login page says why (`lib/IdleLogout.js`). |
| **Input** | All database access goes through Supabase's API with parameters (no SQL is built from text), so SQL injection isn't possible. The database checks values itself (allowed statuses, amounts above zero, lengths). React escapes all text it shows; no raw HTML is inserted. |
| **Server routes** | Need the signed-in user's token (so they can't be triggered from another site), check the caller's level, and read data as the caller so the database rules still apply. The service key never reaches the browser. |
| **Browser headers** | Set on every page and API reply in `next.config.mjs`: no framing by other sites (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, camera / microphone / location off (`Permissions-Policy`), HTTPS kept for a year once served over HTTPS (`Strict-Transport-Security`), no `X-Powered-By`. |
| **Signed-out visitors** | Read nothing: every read rule is for signed-in logins (`db/068` closed the last five early rules on verses, training modules, questions and handouts). |
| **Files** | Private storage buckets; files open through links that expire. Who may upload, open or delete follows the same rules as the record (e.g. receipts: the requester and Finance of that branch). |
| **Privacy** | Members never see other members' status or phone numbers; the Admin sees member names only; visitors and sign-in sheet photos are deleted 6 months after the last visit / the event; the activity log hides member phone, email and birthday values. |
| **Error messages** | `lib/errors.js` turns database and server errors into plain sentences ("You don't have permission to do this.", "This already exists."); table, column and rule names never reach the screen. The technical detail goes to the browser console or the server log. Reasons written for users by FaithSync's own database functions are shown as they are. |
| **Audit** | `activity_log` records who added, changed, archived, voided or deleted what, and when (finance hidden from the Admin). |

**Known gaps**: no two-step login (MFA) for staff yet; no full script-source CSP (Next.js needs inline scripts, so the CSP covers framing, plugins and `<base>` only).

## 6. Automatic work

| What | When | Where |
|---|---|---|
| Active → Inactive after 14 days unseen or 3 missed events in a row, and back when they return | Nightly, 1 AM (Philippine time) | `pg_cron` job → `auto_member_status()` (db/056, 072) |
| Approved events past their date become Done | When event pages load | `complete_past_events()` (db/042) |
| Visitors 6 months after their last visit are deleted | When attendance / visitor lists load | `purge_old_visitors()` (db/041) |
| Sign-in sheet photos older than 6 months are deleted | When the Attendance page loads | `purge_old_sheet_photos()` (db/060) |
| Released request → expense in the ledger; accepted receipts with change → income | When Finance acts | trigger `guard_expense_request` (db/019, 053) |

## 7. Outside services

| Service | Used for | If it is down |
|---|---|---|
| **Supabase** | Database, logins, files, live chat, nightly job | The app can't load data |
| **Google** | Optional sign-in / account linking | Email sign-in still works |
| **Hugging Face** (model download, first run only) | The assistant's text model | Only the assistant's meaning-based search is affected; keyword search still answers |
| **Vercel** | Hosting | Site offline |

The assistant uses **no outside AI service**: it understands the question itself (English and Tagalog, with spelling correction), searches the church's documents and handouts (keywords + meaning + typo-tolerant), and answers with the matching passages and their source.

## 8. Testing

Automated tests use Node's built-in test runner (`node:test`), so nothing extra is installed. Run them with:

```
npm test
```

They check the app's own rules in `src/app/lib/` without a database or browser:

| File | What it checks |
|---|---|
| `tests/permissions.test.mjs` | Each level's access matches the roles doc: only Finance edits finance, Leaders approve events and the Secretary submits, the journal is private to everyone, only the Admin manages logins, members can't open staff pages, unknown pages are closed |
| `tests/financeTotals.test.mjs` | Every saved entry counts in totals; voided entries never do |
| `tests/format.test.mjs` | Peso amounts (`₱1,234.50`, negatives, bad input → `₱0.00`, the PDF's `PHP` form) |
| `tests/errors.test.mjs` | Database errors become plain sentences with no table or rule names; messages written for people pass through; the technical error is still logged |
| `tests/eventSeries.test.mjs` | Weekly dates (across months, years, a leap day; at most 52), one card per series on its next date that's still on, notices grouped per series, the "Every Sunday · until …" label |
| `tests/dates.test.mjs` | Today's date in Manila (already the next day while UTC is still on the day before), event times as `6:00 PM` |
| `tests/verseOfDay.test.mjs` | One verse all day, changing at local midnight |
| `tests/fetchAll.test.mjs` | Reading every row past Supabase's 1,000-rows-per-request limit, and stopping on an error |
| `tests/contrast.test.mjs` | Grey text in `globals.css` is at least 4.5:1 against its backgrounds, in light, dark and member light mode |

The database rules (`db/*.sql`) are checked by hand per level in the app, since they need a live Supabase project.

## 9. Accessibility

Aimed at WCAG 2.1 level AA for the things a church app's users meet every day.

| Area | How it's handled |
|---|---|
| **Readable text** | Small text is at least 4.5:1 against its background. The slate greys are one palette for both themes, so the faintest ones are adjusted per theme in `globals.css` ("Readable greys"); `tests/contrast.test.mjs` checks them. Status is never shown by colour alone: badges also say Active, Void, Pending… |
| **Light and dark** | Every page follows the theme switch. Staff pages use `lib/theme.js`; the member pages are written with dark classes and `.member-light` in `globals.css` turns them ivory. |
| **Keyboard** | Everything works without a mouse. A gold outline shows where the cursor is. **Skip to main content** is the first Tab stop on every signed-in page (`AppShell`). Pop-ups (`lib/useDialog.js`) take the cursor when they open, keep Tab inside, close with Esc, and hand the cursor back to the button that opened them. The date picker moves by day and week with the arrow keys. |
| **Screen readers** | Form labels are tied to their fields (the `Field` / `Label` helpers wrap the field). Buttons that show only an icon have a name ("Close", "Edit entry", "Send", "Show password"). Pop-ups are announced as dialogs with their title; the menu and breadcrumb are named landmarks; the page language is set (`lang="en"`). |
| **Motion** | With "reduce motion" turned on in the device settings, animations stop; the landing photos only fade. |
| **Phones** | Pages are laid out for phone widths; several pop-ups (journal, announcements, follow-up, messages) open as bottom sheets, and on touch screens opening a pop-up doesn't throw up the keyboard. |

