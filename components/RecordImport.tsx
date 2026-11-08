"use client";

import { useState } from "react";
import { saveAcademicRecord } from "@/lib/academic-record";
import { extractPdfText } from "@/lib/pdf-text";
import { parseAcademicRecord } from "@/lib/record-parse";
import type { RecordCourse, RecordStatus } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const STATUS_OPTIONS: { value: RecordStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "planned", label: "Planned / still needed" },
  { value: "not_counted", label: "Doesn't count (W, F, I)" },
];

export function RecordImport({ initial, onDone }: { initial: RecordCourse[] | null; onDone: () => void }) {
  const [text, setText] = useState("");
  const [courses, setCourses] = useState<RecordCourse[] | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);

  function read(source: string): boolean {
    const parsed = parseAcademicRecord(source);
    if (parsed.length === 0) return false;
    setError(null);
    setText("");
    setCourses(parsed);
    return true;
  }

  function readPasted() {
    if (!read(text)) setError("No course codes found. Codes look like ENC 1101 or CGS 1060C.");
  }

  async function readPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("That file isn't a PDF. Upload your MAP or transcript PDF, or paste the text instead.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("That PDF is over 10 MB. Try pasting the text instead.");
      return;
    }
    setError(null);
    setReadingPdf(true);
    try {
      const pdfText = await extractPdfText(file);
      if (!read(pdfText)) {
        setError(
          pdfText.trim()
            ? "No course codes found in that PDF. Try copying and pasting the text instead."
            : "That PDF has no selectable text (it may be a scan or photo). Try pasting the text instead."
        );
      }
    } catch {
      setError("Couldn't read that PDF. It may be password-protected. Try pasting the text instead.");
    } finally {
      setReadingPdf(false);
    }
  }

  function setStatus(code: string, status: RecordStatus) {
    setCourses((prev) => prev?.map((c) => (c.code === code ? { ...c, status } : c)) ?? null);
  }

  function remove(code: string) {
    setCourses((prev) => prev?.filter((c) => c.code !== code) ?? null);
  }

  function save() {
    if (!courses) return;
    saveAcademicRecord(courses);
    onDone();
  }

  if (!courses) {
    return (
      <div className="mt-5">
        <p className="text-sm text-mdc-muted">
          Download your MAP or unofficial transcript as a PDF from your MDC student portal, then upload it here.
          You&apos;ll check every course before anything is saved.
        </p>
        <label
          className={`mt-4 inline-flex cursor-pointer items-center rounded-full bg-mdc-blue px-5 py-2 text-sm font-bold text-white hover:bg-mdc-blue-bright ${
            readingPdf ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {readingPdf ? "Reading PDF…" : "Upload PDF"}
          <input type="file" accept="application/pdf,.pdf" onChange={readPdf} className="sr-only" disabled={readingPdf} />
        </label>
        <p className="mt-6 text-sm text-mdc-muted">
          Or open the PDF, select all the text (⌘A on Mac, Ctrl+A on Windows), copy it and paste it here:
        </p>
        <textarea
          className="mt-2 h-32 w-full border border-mdc-line bg-white px-3 py-2 font-mono text-xs text-mdc-ink"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"ENC 1101  English Composition 1  3  Completed  A\nCTS 1134  Networking Technologies  4  Planned"}
          aria-label="Paste your MAP or transcript text"
        />
        <p className="mt-2 text-xs text-mdc-muted">
          Your PDF or text is read in your browser and never sent anywhere. Only course codes, statuses and grades
          are saved, on this device.
        </p>
        {error ? <p className="mt-2 text-sm text-mdc-blue">{error}</p> : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={readPasted}
            disabled={!text.trim()}
            className="rounded-full border border-mdc-blue px-5 py-2 text-sm font-bold text-mdc-blue hover:bg-mdc-blue/5 disabled:opacity-50"
          >
            Read pasted text
          </button>
          <button type="button" onClick={onDone} className="text-sm text-mdc-muted hover:text-mdc-blue">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-sm text-mdc-ink">
        Found {courses.length} course{courses.length === 1 ? "" : "s"}. Check each status. Your MAP is the source
        of truth, so fix anything we read wrong.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          onClick={() => setCourses(courses.map((c) => ({ ...c, status: "completed" })))}
          className="border border-mdc-line px-3 py-1 text-mdc-muted hover:border-mdc-blue hover:text-mdc-blue"
        >
          Mark all completed
        </button>
        <button
          type="button"
          onClick={() => setCourses(null)}
          className="border border-mdc-line px-3 py-1 text-mdc-muted hover:border-mdc-blue hover:text-mdc-blue"
        >
          Paste again
        </button>
      </div>
      <ul className="mt-4 max-h-96 divide-y divide-mdc-line overflow-y-auto border border-mdc-line bg-white">
        {courses.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="w-24 font-semibold text-mdc-blue">{c.code}</span>
            <select
              value={c.status}
              onChange={(e) => setStatus(c.code, e.target.value as RecordStatus)}
              className="border border-mdc-line bg-white px-2 py-1 text-xs text-mdc-ink"
              aria-label={`Status for ${c.code}`}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {c.grade ? <span className="text-xs text-mdc-muted">Grade {c.grade}</span> : null}
            <button
              type="button"
              onClick={() => remove(c.code)}
              className="ml-auto text-xs text-mdc-muted hover:text-mdc-blue"
              aria-label={`Remove ${c.code}`}
            >
              Remove
            </button>
            {c.note ? <p className="w-full text-xs text-amber">{c.note}</p> : null}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={courses.length === 0}
          className="rounded-full bg-mdc-blue px-5 py-2 text-sm font-bold text-white hover:bg-mdc-blue-bright disabled:opacity-50"
        >
          Save to this device
        </button>
        <button type="button" onClick={onDone} className="text-sm text-mdc-muted hover:text-mdc-blue">
          Cancel
        </button>
      </div>
    </div>
  );
}
