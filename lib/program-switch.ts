// lib/program-switch.ts
// Pure, browser-safe math for switching programs: which of a student's courses carry over into the
// target program, what's left (admission prerequisites + program courses + electives), and its cost.

import { entryProgress, recordByCode, type EntryProgress } from "./progress";
import { normalizeRecordCode } from "./record-parse";
import type { CreditRange, Division, RecordCourse, StoredAcademicRecord, SwitchPlan } from "./types";

const CODE_RE = /\b[A-Z]{3}\s?\d{4}[A-Z]?\b/g;
const BELOW_C = /^(C-|D[+-]?|F)$/;

export type PrereqState = "done" | "in_progress" | "low_grade" | "remaining";

export interface ElectiveMatch {
  course: RecordCourse;
  credits: CreditRange | null;
  sure: boolean; // allowed by every elective list; otherwise only by `lists`
  lists: string[];
}

export interface SwitchSummary {
  entries: EntryProgress[][];
  prereqs: { state: PrereqState; match: RecordCourse | null }[];
  electives: { matches: ElectiveMatch[]; required: number; covered: CreditRange };
  carried: RecordCourse[];
  remaining: CreditRange;
  cost: CreditRange;
  unknownCredits: string[]; // remaining entries the data has no credit value for (not priced)
}

function matchesPattern(code: string, pattern: string): boolean {
  const p = normalizeRecordCode(pattern.replace("*", ""));
  return pattern.endsWith("*") ? code.startsWith(p) : code === p;
}

function rate(plan: SwitchPlan, division: Division | null, end: "low" | "high"): number {
  if (division === "lower") return plan.rates.lower;
  if (division === "upper") return plan.rates.upper;
  return end === "low" ? Math.min(plan.rates.lower, plan.rates.upper) : Math.max(plan.rates.lower, plan.rates.upper);
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Codes in a prerequisite line ("COP 1047C or COP 1334") the student has done or is taking. */
export function prerequisiteMet(text: string, byCode: Map<string, RecordCourse>): boolean {
  return (text.match(CODE_RE) ?? []).some((c) => {
    const hit = byCode.get(normalizeRecordCode(c));
    return hit?.status === "completed" || hit?.status === "in_progress";
  });
}

export function summarizeSwitch(
  plan: SwitchPlan,
  record: StoredAcademicRecord | null,
  knownCredits: Record<string, CreditRange>,
  usedElsewhere: Set<string> = new Set() // normalized codes already counted toward another program
): SwitchSummary {
  const byCode = recordByCode(record);
  const used = new Set<string>(usedElsewhere);
  // After an associate degree, only courses beyond its 60 credits count here, which a record can't show.
  const electivesNeedAdvisor = plan.target.basis === "after_associate";
  const remaining: CreditRange = { low: 0, high: 0 };
  const cost: CreditRange = { low: 0, high: 0 };
  const unknownCredits: string[] = [];

  const add = (credits: CreditRange | null, division: Division | null, label: string) => {
    if (!credits) return unknownCredits.push(label);
    remaining.low += credits.low;
    remaining.high += credits.high;
    cost.low += credits.low * rate(plan, division, "low");
    cost.high += credits.high * rate(plan, division, "high");
  };

  const prereqs = plan.admission.prerequisites.map((p) => {
    const hit = entryProgress([p.code], byCode);
    if (hit.match) used.add(normalizeRecordCode(hit.match.code));
    const lowGrade = hit.state === "done" && plan.admission.minGrade === "C" && BELOW_C.test(hit.match?.grade ?? "");
    const state: PrereqState = lowGrade ? "low_grade" : hit.state === "done" || hit.state === "in_progress" ? hit.state : "remaining";
    if (state === "remaining" || state === "low_grade") add(p.credits, p.credits ? "lower" : null, p.label);
    return { state, match: hit.match };
  });

  let electiveSlots = 0;
  const entries = plan.terms.map((t) =>
    t.entries.map((e) => {
      if (e.kind === "elective") {
        electiveSlots++;
        return { state: "slot" as const, match: null };
      }
      const p = entryProgress(e.codes, byCode);
      if (p.match) used.add(normalizeRecordCode(p.match.code));
      if (p.state === "remaining") add(e.credits, e.division, e.label);
      return p;
    })
  );

  const matches: ElectiveMatch[] = [];
  for (const course of record?.courses ?? []) {
    const code = normalizeRecordCode(course.code);
    if (used.has(code) || (course.status !== "completed" && course.status !== "in_progress")) continue;
    const explicit = plan.electives.codes.includes(code);
    const lists = plan.electives.lists.filter((l) => l.patterns.some((p) => matchesPattern(code, p))).map((l) => l.label);
    if (!explicit && lists.length === 0) continue;
    used.add(code);
    matches.push({
      course,
      credits: knownCredits[code] ?? null,
      sure: !electivesNeedAdvisor && (explicit || lists.length === plan.electives.lists.length),
      lists,
    });
  }

  const required = electiveSlots * plan.electives.slotCredits;
  const sum = (ms: ElectiveMatch[]) => ms.reduce((n, m) => n + (m.credits?.low ?? 0), 0);
  const sure = sum(matches.filter((m) => m.sure));
  const covered = { low: Math.min(required, sure), high: Math.min(required, sure + sum(matches.filter((m) => !m.sure))) };
  if (required > 0) {
    add({ low: required - covered.high, high: required - covered.low }, plan.electives.division, "Electives");
  }

  const carried = (record?.courses ?? []).filter((c) => {
    const code = normalizeRecordCode(c.code);
    return used.has(code) && !usedElsewhere.has(code) && c.status !== "planned";
  });

  return {
    entries,
    prereqs,
    electives: { matches, required, covered },
    carried,
    remaining,
    cost: { low: cents(cost.low), high: cents(cost.high) },
    unknownCredits,
  };
}
