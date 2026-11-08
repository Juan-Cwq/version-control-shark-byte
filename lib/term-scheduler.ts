// lib/term-scheduler.ts
// Pure, browser-safe: lays a FinishPlan's remaining requirements into terms at the student's pace.
// Follows the catalog order, waits for prerequisites, keeps corequisites together, and never starts
// a later phase (e.g. the B.S.) until every earlier-phase class has been scheduled.

import { codesIn, needsWork, openBlockCredits, type FinishPlan, type Requirement } from "./finish-plan";
import type { CreditRange, RecordCourse, StoredAcademicRecord } from "./types";
import { normalizeRecordCode } from "./record-parse";

export type Season = "Spring" | "Summer" | "Fall";
const SEASONS: Season[] = ["Spring", "Summer", "Fall"];

export interface ScheduleSettings {
  perTerm: number; // classes in fall and spring
  summer: number; // classes in summer; 0 skips summer
  start: { season: Season; year: number };
  blockClasses: Record<string, number>; // requirement id -> classes to spread a credit block over
}

export interface PlannedClass {
  key: string;
  requirementId: string;
  label: string;
  title: string | null;
  credits: CreditRange | null;
  phase: number;
  retake: boolean;
  unlocks: string[]; // later classes in this plan that need this one
  warnings: string[]; // prerequisites outside the plan, placement, etc.
}

export interface PlannedTerm {
  label: string;
  season: Season;
  year: number;
  classes: PlannedClass[];
  credits: CreditRange;
  unknownCredits: number;
}

export interface Schedule {
  terms: PlannedTerm[];
  unscheduled: PlannedClass[]; // only if the plan hits the term limit
}

interface Unit extends PlannedClass {
  codes: string[];
  order: number;
  prereqGroups: { codes: string[]; text: string }[];
  coreqGroups: { codes: string[]; text: string }[];
}

const MAX_TERMS = 24;

export function defaultStart(now: Date): { season: Season; year: number } {
  const m = now.getMonth(); // 0 = January
  if (m < 3) return { season: "Summer", year: now.getFullYear() };
  if (m < 7) return { season: "Fall", year: now.getFullYear() };
  return { season: "Spring", year: now.getFullYear() + 1 };
}

/** Starting value for "how many classes" for a credit block (open credits ÷ 3); the student can change it. */
export function defaultBlockClasses(r: Requirement): number {
  return r.block ? Math.ceil(openBlockCredits(r.block) / 3) : 1;
}

// "CHM 1025 or CART exam" / "Networking knowledge recommended" have non-course alternatives: advisory only.
function groups(texts: string[]) {
  return texts.map((text) => {
    const codes = codesIn(text);
    const rest = text
      .replace(/\b[A-Z]{3}\s?\d{4}[A-Z]?\b/g, "")
      .replace(/\(pre\/co\)|\bor\b|\band\b|[,/()]/gi, "")
      .trim();
    return { codes: rest ? [] : codes, text };
  });
}

function toUnits(plan: FinishPlan, settings: ScheduleSettings): Unit[] {
  const units: Unit[] = [];
  for (const r of plan.requirements) {
    if (!needsWork(r)) continue;
    const base = {
      requirementId: r.id,
      title: r.title,
      phase: r.phase,
      retake: r.status === "low_grade",
      unlocks: [],
      warnings: [],
      // An area slot's options aren't courses the student takes, so it can't satisfy another class's prerequisite.
      codes: r.area ? [] : r.codes,
      order: r.order,
      prereqGroups: groups(r.prerequisites),
      coreqGroups: groups(r.corequisites),
    };
    if (r.block) {
      const open = openBlockCredits(r.block);
      if (!open) continue;
      const n = Math.min(open, Math.max(1, Math.floor(settings.blockClasses[r.id] ?? defaultBlockClasses(r))));
      for (let i = 0; i < n; i++) {
        // Whole credits: 5 credits over 2 classes -> 3 + 2.
        const per = Math.floor(open / n) + (i < open % n ? 1 : 0);
        units.push({
          ...base,
          key: `${r.id}#${i}`,
          label: `${r.label.replace(/\s*\(\d+\)/, "")}${n > 1 ? ` ${i + 1} of ${n}` : ""}`,
          title: r.block.prefixes.length ? `Any ${r.block.prefixes.join(", ")} course` : null,
          credits: { low: per, high: per },
          codes: [],
          prereqGroups: [],
          coreqGroups: [],
        });
      }
      continue;
    }
    units.push({
      ...base,
      key: r.id,
      label: r.status !== "low_grade" ? r.label : r.area ? `${r.label} (replaces ${r.match?.code})` : `Retake ${r.label}`,
      credits: r.credits,
    });
  }
  return units;
}

export function scheduleTerms(plan: FinishPlan, record: StoredAcademicRecord | null, settings: ScheduleSettings): Schedule {
  const units = toUnits(plan, settings);
  const lowGrade = new Set(
    plan.requirements
      .filter((r) => r.status === "low_grade")
      .flatMap((r) => (r.area ? (r.match ? [normalizeRecordCode(r.match.code)] : []) : r.codes))
  );
  const done = new Set(
    (record?.courses ?? [])
      .filter((c: RecordCourse) => c.status === "completed" || c.status === "in_progress")
      .map((c) => normalizeRecordCode(c.code))
      .filter((c) => !lowGrade.has(c))
  );

  // Who needs whom, for "unlocks" and for prioritizing long chains.
  for (const u of units) {
    for (const g of u.prereqGroups) {
      const providers = units.filter((p) => p !== u && p.codes.some((c) => g.codes.includes(c)));
      providers.forEach((p) => p.unlocks.push(u.label));
      if (!providers.length && g.codes.length && !g.codes.some((c) => done.has(c))) {
        u.warnings.push(`Needs ${g.text}, which isn't in this plan (placement or an earlier course may cover it; ask an advisor).`);
      }
      if (!g.codes.length) u.warnings.push(`Prerequisite: ${g.text}`);
    }
    for (const g of u.coreqGroups) {
      if (!g.codes.length || (!units.some((p) => p.codes.some((c) => g.codes.includes(c))) && !g.codes.some((c) => done.has(c)))) {
        u.warnings.push(`Take with or after: ${g.text}`);
      }
    }
  }

  // Longest chain of later classes waiting on this one; start long chains first so they don't add terms.
  const depth = new Map<Unit, number>();
  const depthOf = (u: Unit, seen: Set<Unit>): number => {
    if (depth.has(u)) return depth.get(u)!;
    if (seen.has(u)) return 0;
    seen.add(u);
    const next = units.filter((p) => p !== u && p.prereqGroups.some((g) => u.codes.some((c) => g.codes.includes(c))));
    const d = next.length ? 1 + Math.max(...next.map((p) => depthOf(p, seen))) : 0;
    depth.set(u, d);
    return d;
  };
  units.forEach((u) => depthOf(u, new Set()));

  const pending = new Set(units);
  const satisfied = new Set(done);
  const terms: PlannedTerm[] = [];
  let si = SEASONS.indexOf(settings.start.season);
  let year = settings.start.year;
  const perTerm = Math.max(1, Math.floor(settings.perTerm));

  const pendingHas = (codes: string[]) => [...pending].some((p) => p.codes.some((c) => codes.includes(c)));

  while (pending.size && terms.length < MAX_TERMS) {
    const season = SEASONS[si];
    const cap = season === "Summer" ? Math.max(0, Math.floor(settings.summer)) : perTerm;
    if (cap > 0) {
      const minPhase = Math.min(...[...pending].map((u) => u.phase));
      const taken: Unit[] = [];
      const takenCodes = new Set<string>();
      const ready = (u: Unit, together: Set<string>) =>
        u.phase === minPhase &&
        u.prereqGroups.every((g) => !g.codes.length || g.codes.some((c) => satisfied.has(c)) || !pendingHas(g.codes)) &&
        u.coreqGroups.every(
          (g) => !g.codes.length || g.codes.some((c) => satisfied.has(c) || together.has(c)) || !pendingHas(g.codes)
        );

      const candidates = [...pending].sort((a, b) => depth.get(b)! - depth.get(a)! || a.order - b.order);
      for (const u of candidates) {
        if (taken.length >= cap) break;
        if (taken.includes(u)) continue;
        if (ready(u, takenCodes)) {
          taken.push(u);
          u.codes.forEach((c) => takenCodes.add(c));
          continue;
        }
        // Bring a pending corequisite along if both fit this term.
        const partner = candidates.find(
          (p) => p !== u && !taken.includes(p) && u.coreqGroups.some((g) => p.codes.some((c) => g.codes.includes(c)))
        );
        if (partner && taken.length + 2 <= cap) {
          const both = new Set([...takenCodes, ...u.codes, ...partner.codes]);
          if (ready(u, both) && ready(partner, both)) {
            taken.push(u, partner);
            both.forEach((c) => takenCodes.add(c));
          }
        }
      }
      if (!taken.length) {
        // Nothing is ready (circular requirement in the data): take the next class in catalog order.
        const next = candidates.find((u) => u.phase === minPhase)!;
        next.warnings.push("Scheduled here because its requirements loop in the catalog data; confirm the order with an advisor.");
        taken.push(next);
      }

      let credits: CreditRange = { low: 0, high: 0 };
      let unknownCredits = 0;
      for (const u of taken) {
        pending.delete(u);
        if (u.credits) credits = { low: credits.low + u.credits.low, high: credits.high + u.credits.high };
        else unknownCredits++;
      }
      taken.forEach((u) => u.codes.forEach((c) => satisfied.add(c)));
      terms.push({
        label: `${season} ${year}`,
        season,
        year,
        classes: taken.map(toClass),
        credits,
        unknownCredits,
      });
    }
    si = (si + 1) % SEASONS.length;
    if (si === 0) year++;
  }

  return {
    terms,
    unscheduled: [...pending].map(toClass),
  };
}

function toClass(u: Unit): PlannedClass {
  return {
    key: u.key,
    requirementId: u.requirementId,
    label: u.label,
    title: u.title,
    credits: u.credits,
    phase: u.phase,
    retake: u.retake,
    unlocks: [...new Set(u.unlocks)],
    warnings: [...new Set(u.warnings)],
  };
}
