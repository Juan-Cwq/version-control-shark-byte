// lib/pdf-text.ts
// Pulls the text out of a PDF in the browser with PDF.js. Client-only; the file never leaves the device.
// Rebuilds one line per visual row so the line-based record parser sees "CODE title credits grade".

const ROW_TOLERANCE = 3; // PDF points; items this close vertically are on the same row

interface Piece {
  x: number;
  y: number;
  str: string;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const lines: string[] = [];
  try {
    const doc = await task.promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        pieces.push({ x: item.transform[4], y: item.transform[5], str: item.str.trim() });
      }
      // PDF y grows upward: read top to bottom, then left to right within a row.
      pieces.sort((a, b) => b.y - a.y || a.x - b.x);
      let row: Piece[] = [];
      const flush = () => {
        if (row.length) lines.push(row.sort((a, b) => a.x - b.x).map((r) => r.str).join(" "));
        row = [];
      };
      for (const piece of pieces) {
        if (row.length && Math.abs(row[0].y - piece.y) > ROW_TOLERANCE) flush();
        row.push(piece);
      }
      flush();
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return lines.join("\n");
}
