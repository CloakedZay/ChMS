// Today's date in the Philippines as "YYYY-MM-DD", the same day as the
// database's ph_today() (db/041). new Date().toISOString() is UTC, which is
// still yesterday here until 8 AM.
export const phToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
