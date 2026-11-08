// lib/record-parse.ts
// Reads course codes and their status out of text a student pastes from their MDC MAP or transcript.
// Pure and browser-safe: the pasted text never leaves the device. The student reviews every result.

import type { RecordCourse, RecordStatus } from "./types";

const CODE_RE = /\b([A-Z]{3})\s?(\d{4})([A-Z]?)\b/g;
// Term labels and totals that look like course codes ("SUM 2025", "GPA 3500").
const NOT_COURSE_PREFIXES = new Set(["FAL", "SPR", "SUM", "WIN", "TRM", "GPA", "TOT"]);

const GRADE_RE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|U|W|WF|WP|WU|NC|IP|I|TR|T)$/;
const NUMBER_RE = /^\d+(\.\d+)?$/;

// Order matters: negative phrases ("not satisfied", "not taken") must win over their positive form.
const KEYWORDS: [RegExp, RecordStatus][] = [
  [/\b(withdr[a-z]*|dropped|failed|incomplete)\b/i, "not_counted"],
  [/\b(in[\s-]?progress|enrolled|registered|currently)\b/i, "in_progress"],
  [/\b(planned|not started|not completed|still needed|needed|not satisfied|not taken|future)\b/i, "planned"],
  [/\b(completed?|satisfied|passed|taken|earned|transfer(red)?)\b/i, "completed"],
  [/[✓✔☑]/, "completed"],
];

const LOW_GRADE_NOTE = "Grade below C, so it may not meet \"C or higher\" prerequisites.";

const RANK: Record<RecordStatus, number> = { completed: 3, in_progress: 2, planned: 1, not_counted: 0 };

export function normalizeRecordCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

function statusFromGrade(grade: string): { status: RecordStatus; note?: string } {
  if (/^(A|A-|B\+|B|B-|C\+|C|P|S|TR|T)$/.test(grade)) return { status: "completed" };
  if (/^(C-|D\+|D|D-)$/.test(grade)) return { status: "completed", note: LOW_GRADE_NOTE };
  if (grade === "IP") return { status: "in_progress" };
  if (/^(W|WF|WP)$/.test(grade)) return { status: "not_counted", note: "Withdrawn." };
  if (grade === "I") return { status: "not_counted", note: "Incomplete." };
  return { status: "not_counted", note: "Not passed, so it doesn't count toward requirements." };
}

// Grades sit after the credits column ("3.00 A"). A lone trailing token also counts, except "I",
// which is more often a Roman numeral in a course title.
function findGrade(segment: string): string | null {
  const tokens = segment
    .split(/\s+/)
    .map((t) => t.replace(/^[(,;:]+|[),;:.]+$/g, ""))
    .filter(Boolean);
  const firstNumber = tokens.findIndex((t) => NUMBER_RE.test(t));
  if (firstNumber >= 0) {
    const hit = tokens.slice(firstNumber + 1).find((t) => GRADE_RE.test(t));
    if (hit) return hit;
  }
  const last = tokens.at(-1);
  if (last && last !== "I" && GRADE_RE.test(last)) return last;
  return null;
}

function statusFromKeywords(text: string): RecordStatus | null {
  for (const [re, status] of KEYWORDS) if (re.test(text)) return status;
  return null;
}

export function parseAcademicRecord(text: string): RecordCourse[] {
  const found = new Map<string, { course: RecordCourse; order: number }>();
  let sectionStatus: RecordStatus | null = null;
  let order = 0;

  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(CODE_RE)].filter((m) => !NOT_COURSE_PREFIXES.has(m[1]));
    if (matches.length === 0) {
      // Headers like "Completed Courses" / "Planned Courses" apply to the lines below them.
      sectionStatus = statusFromKeywords(line) ?? sectionStatus;
      continue;
    }

    matches.forEach((m, i) => {
      const segment = line.slice(m.index + m[0].length, matches[i + 1]?.index ?? line.length);
      const grade = findGrade(segment);
      const fromGrade = grade ? statusFromGrade(grade) : null;
      const status =
        fromGrade?.status ?? statusFromKeywords(segment) ?? statusFromKeywords(line) ?? sectionStatus ?? "planned";

      const course: RecordCourse = { code: `${m[1]} ${m[2]}${m[3]}`, status };
      if (grade) course.grade = grade;
      if (fromGrade?.note) course.note = fromGrade.note;

      // Retakes: keep the attempt that counts most (a pass beats a W or F; a clean pass beats a D).
      const key = normalizeRecordCode(course.code);
      const prev = found.get(key);
      const score = (c: RecordCourse) => RANK[c.status] + (c.note ? 0 : 0.5);
      if (!prev) found.set(key, { course, order: order++ });
      else if (score(course) > score(prev.course)) found.set(key, { course, order: prev.order });
    });
  }

  return [...found.values()].sort((a, b) => a.order - b.order).map((f) => f.course);
}
