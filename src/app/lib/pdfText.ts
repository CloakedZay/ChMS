// pdf-parse puts a page marker like "-- 1 of 3 --" between pages of the
// extracted text. Remove them so they don't end up inside Bible verses or
// chatbot documents.
const PAGE_MARKER = /[ \t]*--[ \t]*\d+[ \t]+of[ \t]+\d+[ \t]*--[ \t]*/g;

export function stripPageMarkers(text: string): string {
  return text.replace(PAGE_MARKER, "\n");
}
