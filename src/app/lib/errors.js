// What to show people when something fails.
//
// Database and server errors carry technical text — table, column and rule
// names ("violates row-level security policy for table …"). That text is
// logged for whoever is debugging (browser console, or the server log for
// /api routes) and never shown; people get a plain sentence instead.
//
// Kept as they are, because they were written for people:
//   • reasons raised by FaithSync's own database functions (SQLSTATE P0001,
//     e.g. "Say what needs fixing", "Upload at least one receipt first")
//   • sign-in messages from Supabase Auth ("Invalid login credentials")
//   • a UserError thrown by the app ("Please choose the Excel file …")

// An error whose message is meant for people and may be shown as it is.
export class UserError extends Error {}

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// friendlyError(error)                 → a plain sentence
// friendlyError(error, 'Upload failed.') → the fallback instead of the generic one
export function friendlyError(err, fallback = GENERIC_ERROR) {
  if (!err) return fallback;
  console.error(err);

  if (err instanceof UserError) return err.message;

  const message = String(err.message ?? err.error_description ?? err.error ?? '');
  const code = String(err.code ?? '');
  const status = Number(err.status ?? err.statusCode ?? 0);

  if (code === 'P0001' && message) return message;
  if (err.__isAuthError || err.name === 'AuthApiError' || err.name === 'AuthWeakPasswordError') {
    if (/jwt|refresh token|session/i.test(message)) return 'Your session has expired. Please sign in again.';
    return message || fallback;
  }

  if (code === '23505' || /duplicate key|already exists/i.test(message)) return 'This already exists.';
  if (code === '23503' || /foreign key/i.test(message)) {
    return "This is still linked to other records, so it can't be changed or removed.";
  }
  if (['23514', '23502', '22P02', '22001', '22003', '22007', '22008'].includes(code)
      || /check constraint|not-null|invalid input syntax|value too long|out of range/i.test(message)) {
    return "Some of the details aren't allowed. Please check them and try again.";
  }
  if (code === '42501' || status === 403 || /row-level security|permission denied|not allowed|unauthorized/i.test(message)) {
    return "You don't have permission to do this.";
  }
  if (code === 'PGRST301' || status === 401 || /jwt|token.*expired/i.test(message)) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 413 || /payload too large|maximum allowed size|too large/i.test(message)) return 'That file is too large.';
  if (status === 429 || /too many requests|rate limit/i.test(message)) return 'Too many tries. Please wait a moment and try again.';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  return fallback;
}
