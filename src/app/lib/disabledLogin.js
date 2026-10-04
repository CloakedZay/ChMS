// Disabled logins (db/013). The database already shuts a disabled user out
// of everything; the app signs them out and shows this on the login page.
export const DISABLED_MESSAGE = 'This account has been disabled. Please contact the church admin.';

// Set before signing a disabled user out, so the login page can explain why.
export const DISABLED_FLAG = 'faithsync-disabled';
