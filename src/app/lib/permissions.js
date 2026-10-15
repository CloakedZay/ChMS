// User levels and what each one can do.
//
// This mirrors the "FaithSync User Roles & Permissions" doc — when one
// changes, change the other. Page checks (which pages open, what the sidebar
// shows) read from here. The database rules (db/*.sql) enforce the same
// thing on the data itself; this file alone does not protect anything.
//
// Leaders are limited to their own ministry / church by the data queries and
// database rules, not here: "edit" for a leader means "edit in their own".
// (The Ministry Head level was folded into Leader, db/050.)

export const ROLES = ['admin', 'pastor', 'leader', 'finance', 'secretary', 'member']

export const ROLE_LABELS = {
  admin: 'Admin',
  pastor: 'Pastor',
  leader: 'Leader / Elder',
  finance: 'Finance',
  secretary: 'Secretary',
  member: 'Member',
}

// Levels that use the staff dashboard (/dashboard); everyone else gets
// the member dashboard.
export const STAFF_ROLES = ['admin', 'pastor', 'leader', 'finance', 'secretary']

// Can switch between church branches; everyone else sees only their own.
export const GLOBAL_ROLES = ['admin', 'pastor']

// Access words, same as the doc:
//   view    — see, not change
//   own     — only their own records
//   names   — member names only (Finance, to record who gave)
//   submit  — make a request someone else approves
//   approve — sign off on others' requests
//   edit    — add, change, remove
// A role missing from a feature has no access.
export const PERMISSIONS = {
  // People and accounts
  users:              { admin: 'edit' },
  // Activity page: the change log is the Admin's audit trail (finance changes
  // excluded, as Admin has no finance); screen time for Admin and Pastor.
  changeLog:          { admin: 'view' },
  screenTime:         { admin: 'view', pastor: 'view' },
  members:            { pastor: 'view', leader: 'view', finance: 'names', secretary: 'edit', member: 'own' },
  memberImport:       { secretary: 'edit' },
  memberArchive:      { pastor: 'edit', secretary: 'edit' },
  // Inactive-member follow-up (db/032): own branch; Pastor every branch.
  followUp:           { pastor: 'edit', leader: 'edit', secretary: 'edit' },
  ministryEnrollment: { pastor: 'edit', leader: 'edit', secretary: 'view' },

  // Discipleship and AI assistant
  modules:            { admin: 'view', pastor: 'edit', leader: 'edit', member: 'view' },
  moduleProgress:     { admin: 'view', pastor: 'view', leader: 'view', member: 'own' },
  answerReview:       { pastor: 'approve', leader: 'approve', member: 'own' },
  aiDocuments:        { admin: 'view', pastor: 'edit', leader: 'edit' },
  aiAssistant:        { admin: 'view', pastor: 'view', leader: 'view', finance: 'view', secretary: 'view', member: 'view' },

  // Messages — one-to-one chat; everyone can write to the people the database
  // lists for them (own church, plus every Admin and Pastor). db/029.
  messages:           { admin: 'edit', pastor: 'edit', leader: 'edit', finance: 'edit', secretary: 'edit', member: 'edit' },

  // Events and announcements. Events (db/050): Leaders add them (approved on
  // save) and approve the Secretary's; the Secretary submits; the Pastor views.
  events:             { admin: 'view', pastor: 'view', leader: 'approve', finance: 'view', secretary: 'submit', member: 'view' },
  // Event attendance (db/041): Leaders / Secretary own branch. Members see
  // their own; members the Pastor or Secretary make "attendance helpers"
  // also take it — checked by the database.
  attendance:         { admin: 'view', pastor: 'edit', leader: 'edit', finance: 'view', secretary: 'edit', member: 'own' },
  announcements:      { admin: 'view', pastor: 'edit', leader: 'edit', finance: 'view', secretary: 'view', member: 'view' },
  bibleVerses:        { admin: 'view', pastor: 'edit', leader: 'edit', member: 'view' },

  // Devotional journal — private to each person: everyone writes their own,
  // nobody (Admin and Pastor included) reads anyone else's. db/027 enforces it.
  journal:            { admin: 'own', pastor: 'own', leader: 'own', finance: 'own', secretary: 'own', member: 'own' },

  // Finance — no Admin, no Secretary. Members' own giving history is still
  // an open question in the doc, so members have no access for now.
  finance:            { pastor: 'view', leader: 'view', finance: 'edit' },
  receipts:           { pastor: 'view', leader: 'view', finance: 'edit' },
  expenseRequests:    { pastor: 'approve', leader: ['submit', 'approve'], finance: 'edit' },
  financeReports:     { pastor: 'view', leader: 'view', finance: 'view' },

  // Reports — every level gets reports, each scoped to what they can see.
  reports:            { admin: 'view', pastor: 'view', leader: 'view', finance: 'view', secretary: 'view', member: 'own' },
}

// Having one of these also lets you see the thing.
const IMPLIES_VIEW = ['edit', 'approve', 'submit']

// Access words that let someone open a page for a feature ('names' doesn't:
// Finance gets member names inside the finance page, not the members page).
const OPENS_PAGE = ['view', 'own', 'submit', 'approve', 'edit']

// Every access word a role has on a feature, e.g. ['submit', 'approve'].
export function accessFor(role, feature) {
  const access = PERMISSIONS[feature]?.[role]
  if (!access) return []
  return Array.isArray(access) ? access : [access]
}

// can('leader', 'finance')          → true  (view)
// can('leader', 'finance', 'edit')  → false
// can('pastor', 'events', 'view')   → true  (approve implies view)
export function can(role, feature, access = 'view') {
  const granted = accessFor(role, feature)
  if (granted.includes(access)) return true
  return access === 'view' && granted.some(a => IMPLIES_VIEW.includes(a))
}

// Which features each page is for. A page opens when the role can open at
// least one of them; null = every role that uses that dashboard.
export const PAGE_FEATURES = {
  '/dashboard':                  null,
  '/dashboard/members':          ['members'],
  '/dashboard/follow-up':        ['followUp'],
  '/dashboard/events':           ['events'],
  '/dashboard/attendance':       ['attendance'],
  '/dashboard/finance':          ['finance'],
  '/dashboard/ministry':         ['ministryEnrollment', 'modules'],
  '/dashboard/training':         ['modules', 'moduleProgress', 'answerReview'],
  '/dashboard/bible-verses':     ['bibleVerses'],
  '/dashboard/announcements':    ['announcements'],
  '/dashboard/journal':          ['journal'],
  '/dashboard/messages':         ['messages'],
  '/dashboard/chatbot':          ['aiAssistant'],
  '/dashboard/reports':          ['reports'],
  '/dashboard/users':            ['users'],
  '/dashboard/profile':          null,
  '/dashboard/activity':         ['changeLog', 'screenTime'],

  '/member-dashboard':              null,
  '/member-dashboard/events':       ['events'],
  '/member-dashboard/attendance':   ['attendance'],
  '/member-dashboard/ministries':   ['modules'],
  '/member-dashboard/discipleship': ['moduleProgress'],
  '/member-dashboard/chatbot':      ['aiAssistant'],
  '/member-dashboard/journal':      ['journal'],
  '/member-dashboard/messages':     ['messages'],
  '/member-dashboard/profile':      null,
}

// The dashboard a role belongs on after login.
export function homePathFor(role) {
  return STAFF_ROLES.includes(role) ? '/dashboard' : '/member-dashboard'
}

// Whether a role may open a page. Unknown pages are closed by default, so
// a new page has to be added to PAGE_FEATURES before anyone can see it.
export function canOpenPage(role, path) {
  if (!(path in PAGE_FEATURES)) return false
  const onStaffDashboard = path === '/dashboard' || path.startsWith('/dashboard/')
  if (onStaffDashboard !== STAFF_ROLES.includes(role)) return false

  const features = PAGE_FEATURES[path]
  if (features === null) return true
  return features.some(f => accessFor(role, f).some(a => OPENS_PAGE.includes(a)))
}
