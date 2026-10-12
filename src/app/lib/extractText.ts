import { stripPageMarkers } from "@/app/lib/pdfText";

// Pull the plain text out of an uploaded file (PDF, Word .docx or .txt).
// Shared by assistant documents and discipleship handouts. Scanned PDFs
// (pictures of pages) contain no text and come back empty.
export async function extractText(buffer: Buffer, fileName: string, mimeType = ""): Promise<string> {
  const name = fileName.toLowerCase();

  if (name.endsWith(".pdf") || mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return stripPageMarkers(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (
    name.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (name.endsWith(".txt") || mimeType === "text/plain") {
    return buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
}

export function canExtract(fileName: string): boolean {
  return /\.(pdf|docx|txt)$/i.test(fileName);
}
