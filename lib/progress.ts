// lib/progress.ts
// Pure, browser-safe progress math: matches a student's record against a ProgressPlan.
// Remaining cost = (program credits - credits the data confirms are covered) x MDC per-credit rate.

import { normalizeRecordCode } from "./record-parse";
import type { CreditRange, FiuPrerequisite, ProgressPlan, RecordCourse, StoredAcademicRecord } from "./types";

export type EntryState = "done" | "in_progress" | "remaining" | "slot";

export interface EntryProgress {
  state: EntryState;
  match: RecordCourse | null;
}

export interface ProgressSummary {
  entries: EntryProgress[][]; // same shape as plan.terms[].entries
  required: number;
  done: number;
  inProgress: number;
  slots: number;
  covered: CreditRange; // credits of done + in-progress entries the data has values for
  noCreditData: string[]; // done/in-progress entries the data has no credits for (not subtracted)
  remaining: CreditRange;
  cost: CreditRange;
  otherCompleted: RecordCourse[]; // completed courses not on this path
}

export function recordByCode(record: StoredAcademicRecord | null): Map<string, RecordCourse> {
  return new Map((record?.courses ?? []).map((c) => [normalizeRecordCode(c.code), c]));
}

export const belowC = (grade: string | undefined) => /^(C-|D[+-]?|F)$/.test(grade ?? "");

/** A completed course whose grade is below a gen-ed area's minimum C doesn't satisfy that area. */
export function belowAreaMinimum(area: { minGrade: string | null } | null, p: EntryProgress): boolean {
  return area?.minGrade === "C" && p.state === "done" && belowC(p.match?.grade);
}

// Prefix patterns ("CHM*") only come from gen-ed areas that don't allow lab units, so labs never match them.
function hitsFor(code: string, byCode: Map<string, RecordCourse>): RecordCourse[] {
  if (!code.endsWith("*")) {
    const hit = byCode.get(code);
    return hit ? [hit] : [];
  }
  const prefix = code.slice(0, -1);
  return [...byCode].filter(([c]) => c.startsWith(prefix) && !c.endsWith("L")).map(([, course]) => course);
}

// Alternatives ("CTS 1134 or CTS 1650", "Social science (AMH 2010/POS 2041)") need any one code.
// Codes in `used` are already counted elsewhere and are skipped.
export function entryProgress(codes: string[], byCode: Map<string, RecordCourse>, used?: Set<string>): EntryProgress {
  if (codes.length === 0) return { state: "slot", match: null };
  const hits = codes.flatMap((c) => hitsFor(c, byCode)).filter((c) => !used?.has(normalizeRecordCode(c.code)));
  const done = hits.find((c) => c.status === "completed");
  if (done) return { state: "done", match: done };
  const going = hits.find((c) => c.status === "in_progress");
  if (going) return { state: "in_progress", match: going };
  return { state: "remaining", match: null };
}

/**
 * Matches every entry. Fixed courses match first; gen-ed area slots then share the rest,
 * one course per slot, so two "Humanities" slots need two different courses.
 */
export function matchEntries<E extends { codes: string[]; area: unknown }>(
  entries: E[],
  byCode: Map<string, RecordCourse>,
  used = new Set<string>()
): EntryProgress[] {
  const out: EntryProgress[] = entries.map((e) => (e.area ? { state: "slot", match: null } : entryProgress(e.codes, byCode)));
  out.forEach((p) => {
    if (p.match) used.add(normalizeRecordCode(p.match.code));
  });
  entries.forEach((e, i) => {
    if (!e.area) return;
    out[i] = entryProgress(e.codes, byCode, used);
    if (out[i].match) used.add(normalizeRecordCode(out[i].match!.code));
  });
  return out;
}

export function summarizeProgress(plan: ProgressPlan, record: StoredAcademicRecord | null): ProgressSummary {
  const byCode = recordByCode(record);
  const covered: CreditRange = { low: 0, high: 0 };
  const noCreditData: string[] = [];
  let required = 0;
  let done = 0;
  let inProgress = 0;
  let slots = 0;

  const flat = matchEntries(plan.terms.flatMap((t) => t.entries), byCode);
  let next = 0;
  const entries = plan.terms.map((t) =>
    t.entries.map((e) => {
      const matched = flat[next++];
      const p: EntryProgress = belowAreaMinimum(e.area, matched) ? { state: "remaining", match: null } : matched;
      if (p.state === "slot") slots++;
      else required++;
      if (p.state === "done") done++;
      if (p.state === "in_progress") inProgress++;
      if (p.state === "done" || p.state === "in_progress") {
        if (e.credits) {
          covered.low += e.credits.low;
          covered.high += e.credits.high;
        } else {
          noCreditData.push(p.match?.code ?? e.label);
        }
      }
      return p;
    })
  );

  const remaining = {
    low: Math.max(0, plan.programCredits - covered.high),
    high: Math.max(0, plan.programCredits - covered.low),
  };
  const cost = {
    low: Math.round(remaining.low * plan.ratePerCredit),
    high: Math.round(remaining.high * plan.ratePerCredit),
  };

  const pathCodes = new Set([
    ...plan.terms.flatMap((t) => t.entries.filter((e) => !e.area).flatMap((e) => e.codes)),
    ...flat.flatMap((p) => (p.match ? [normalizeRecordCode(p.match.code)] : [])),
  ]);
  const otherCompleted = (record?.courses ?? []).filter(
    (c) => c.status === "completed" && !pathCodes.has(normalizeRecordCode(c.code))
  );

  return { entries, required, done, inProgress, slots, covered, noCreditData, remaining, cost, otherCompleted };
}

export type PrereqState = "done" | "in_progress" | "remaining";

export function prerequisiteProgress(prereq: FiuPrerequisite, byCode: Map<string, RecordCourse>): PrereqState {
  const states = prereq.parts.map((part) => {
    if (part.codes.length === 0) return "remaining" as const;
    const p = entryProgress(part.codes, byCode).state;
    return p === "slot" ? ("remaining" as const) : p;
  });
  if (states.every((s) => s === "done")) return "done";
  if (states.every((s) => s === "done" || s === "in_progress")) return "in_progress";
  return "remaining";
}

/** Codes on the record that count as done for planning: completed, plus in progress if asked. */
export function plannedDoneCodes(record: StoredAcademicRecord | null, includeInProgress: boolean): Set<string> {
  return new Set(
    (record?.courses ?? [])
      .filter((c) => c.status === "completed" || (includeInProgress && c.status === "in_progress"))
      .map((c) => normalizeRecordCode(c.code))
  );
}
