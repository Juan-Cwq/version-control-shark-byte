// lib/finish-plan.ts
// Pure, browser-safe: turns a student's record plus a ProgressPlan (or one of its program switches)
// into a full list of requirements: what carries over, what's left, and what else must be met.
// Every course, credit and rule comes from the plan (built from mdc_pathways.json); nothing is guessed.

import { summarizeSwitch } from "./program-switch";
import { belowAreaMinimum, entryProgress, matchEntries, recordByCode } from "./progress";
import { normalizeRecordCode } from "./record-parse";
import type { CreditRange, GenEdAreaRule, ProgressPlan, RecordCourse, StoredAcademicRecord, SwitchPlan } from "./types";

export type ReqStatus = "done" | "in_progress" | "remaining" | "low_grade";
export type ReqGroup = "admission" | "program" | "gen_ed" | "electives" | "fiu";

export interface CreditBlock {
  credits: number; // credits the block requires
  covered: number; // credits already covered by the record
  planned: number; // credits that planned courses (e.g. B.S. prerequisites) will fill
  prefixes: string[]; // course prefixes that count, e.g. ["CAI", "CGS"]
  fillers: string[]; // record courses counted toward it
  plannedFillers: string[];
}

/** Credits of a block still to be scheduled as open elective classes. */
export const openBlockCredits = (b: CreditBlock) => Math.max(0, b.credits - b.covered - b.planned);

export interface Requirement {
  id: string;
  phase: number; // phases run in order; a later phase can't start until earlier ones are scheduled
  group: ReqGroup;
  label: string;
  title: string | null;
  codes: string[]; // normalized options; empty = any approved course in that area
  credits: CreditRange | null;
  status: ReqStatus;
  match: RecordCourse | null;
  prerequisites: string[];
  corequisites: string[];
  order: number;
  notes: string[];
  block: CreditBlock | null;
  extra: "none" | "maybe" | "yes"; // credits beyond the program total (FIU or B.S. prerequisites)
  mergedInto: string | null; // label of the requirement that already covers this one
  area: GenEdAreaRule | null; // gen-ed area slot: codes are its options, any one fills it
}

export const needsWork = (r: Requirement) => !r.mergedInto && (r.status === "remaining" || r.status === "low_grade");

export interface CarriedCourse {
  course: RecordCourse;
  title: string | null;
  credits: CreditRange | null;
  countsAs: string;
}

export interface FinishPlan {
  title: string;
  phases: { label: string; detail: string | null }[];
  requirements: Requirement[];
  carried: CarriedCourse[];
  unused: RecordCourse[]; // completed courses that don't match any requirement here
  other: { phase: number; text: string }[];
  totals: { remaining: CreditRange; cost: CreditRange; rateNote: string };
  notes: string[];
}

const CODE_RE = /\b[A-Z]{3}\s?\d{4}[A-Z]?\b/g;
export const codesIn = (text: string) => (text.match(CODE_RE) ?? []).map(normalizeRecordCode);
const prefixOf = (code: string) => normalizeRecordCode(code).slice(0, 3);

const add = (a: CreditRange, b: CreditRange | null, times = 1): CreditRange =>
  b ? { low: a.low + b.low * times, high: a.high + b.high * times } : a;

function statusOf(p: ReturnType<typeof entryProgress>): ReqStatus {
  return p.state === "done" ? "done" : p.state === "in_progress" ? "in_progress" : "remaining";
}

const displayCode = (c: string) => c.replace(/^([A-Z]{3})(?=[\d*])/, "$1 ").replace(/^([A-Z]{3}) \*$/, "any $1");

/** Status and notes for a gen-ed area slot, including its minimum grade. */
function areaRequirement(area: GenEdAreaRule, codes: string[], hit: ReturnType<typeof entryProgress>) {
  const lowGrade = belowAreaMinimum(area, hit);
  const notes = [
    ...(area.rule ? [area.rule] : []),
    codes.length ? `Options: ${codes.map(displayCode).join(", ")}.` : "Any approved course in this area; an advisor can match courses you've taken.",
    ...(area.minGrade ? [`General education courses need a ${area.minGrade} or higher.`] : []),
    ...(lowGrade ? [`You have a ${hit.match?.grade} in ${hit.match?.code}; retake it or take another option.`] : []),
  ];
  return { status: lowGrade ? ("low_grade" as const) : statusOf(hit), notes };
}

function creditsFor(codes: string[], known: Record<string, CreditRange>): CreditRange | null {
  const hits = codes.map((c) => known[c]).filter((r): r is CreditRange => r != null);
  if (!codes.length || hits.length !== codes.length) return null;
  return { low: Math.min(...hits.map((r) => r.low)), high: Math.max(...hits.map((r) => r.high)) };
}

/* ------------------------------------------------------------------ */
/* The career's own program                                            */
/* ------------------------------------------------------------------ */

function pathRequirements(plan: ProgressPlan, byCode: Map<string, RecordCourse>, phase: number): Requirement[] {
  const reqs: Requirement[] = [];
  let order = 0;
  const base = (id: string, label: string): Requirement => ({
    id,
    phase,
    group: "program",
    label,
    title: null,
    codes: [],
    credits: null,
    status: "remaining",
    match: null,
    prerequisites: [],
    corequisites: [],
    order: order++,
    notes: [],
    block: null,
    extra: "none",
    mergedInto: null,
    area: null,
  });

  const isGenEdBlock = (label: string) => /^gen-ed/i.test(label) && plan.genEd.length > 0;
  const matchable = plan.terms.flatMap((t) => t.entries.flatMap((e) => (isGenEdBlock(e.label) ? plan.genEd : [e])));
  const hits = matchEntries(matchable, byCode);
  let next = 0;

  plan.terms.forEach((term, ti) =>
    term.entries.forEach((e, ei) => {
      const id = `p${phase}-${ti}-${ei}`;
      if (isGenEdBlock(e.label)) {
        plan.genEd.forEach((g, gi) => {
          const hit = hits[next++];
          const area = g.area ? areaRequirement(g.area, g.codes, hit) : null;
          reqs.push({
            ...base(`${id}-${gi}`, g.label),
            group: "gen_ed",
            codes: g.codes,
            credits: g.credits,
            title: g.codes.length === 1 ? (plan.knownTitles[g.codes[0]] ?? null) : null,
            status: area?.status ?? (g.codes.length ? statusOf(hit) : "remaining"),
            match: hit.match,
            notes: area?.notes ?? (g.codes.length ? [] : ["Any approved course in this area; an advisor can match courses you've taken."]),
            area: g.area,
          });
        });
        return;
      }
      const hit = hits[next++];
      if (e.area) {
        const area = areaRequirement(e.area, e.codes, hit);
        reqs.push({
          ...base(id, e.label),
          group: "gen_ed",
          codes: e.codes,
          credits: e.credits,
          status: area.status,
          match: hit.match,
          notes: area.notes,
          area: e.area,
        });
        return;
      }
      if (/^electives?\b/i.test(e.label)) {
        const n = e.label.match(/\((\d+)\)/);
        const prefixes = plan.electives?.prefixes ?? [];
        reqs.push({
          ...base(id, e.label),
          group: "electives",
          credits: n ? { low: Number(n[1]), high: Number(n[1]) } : e.credits,
          block: n ? { credits: Number(n[1]), covered: 0, planned: 0, prefixes, fillers: [], plannedFillers: [] } : null,
          notes: plan.electives?.note ? [plan.electives.note] : [],
        });
        return;
      }
      if (!e.codes.length) {
        reqs.push({
          ...base(id, e.label),
          group: "gen_ed",
          notes: ["Any approved course in this area; an advisor can match courses you've taken."],
        });
        return;
      }
      reqs.push({
        ...base(id, e.label),
        title: e.title,
        codes: e.codes,
        credits: e.credits,
        status: statusOf(hit),
        match: hit.match,
        prerequisites: e.prerequisites,
        corequisites: e.corequisites,
      });
    })
  );
  return reqs;
}

/** Fill credit blocks (e.g. "Electives (9)") with record courses that no other requirement used. */
function fillBlocks(reqs: Requirement[], record: StoredAcademicRecord | null, known: Record<string, CreditRange>) {
  const used = new Set(reqs.flatMap((r) => (r.match ? [normalizeRecordCode(r.match.code)] : [])));
  for (const r of reqs) {
    if (!r.block) continue;
    let anyInProgress = false;
    for (const c of record?.courses ?? []) {
      const code = normalizeRecordCode(c.code);
      if (r.block.covered >= r.block.credits) break;
      if (used.has(code) || (c.status !== "completed" && c.status !== "in_progress")) continue;
      if (!r.block.prefixes.includes(prefixOf(code)) || !known[code]) continue;
      used.add(code);
      r.block.covered = Math.min(r.block.credits, r.block.covered + known[code].low);
      r.block.fillers.push(c.code);
      if (c.status === "in_progress") anyInProgress = true;
    }
    if (r.block.covered >= r.block.credits) r.status = anyInProgress ? "in_progress" : "done";
  }
}

/* ------------------------------------------------------------------ */
/* Switching into another program                                      */
/* ------------------------------------------------------------------ */

function switchRequirements(
  sw: SwitchPlan,
  record: StoredAcademicRecord | null,
  known: Record<string, CreditRange>,
  admissionPhase: number,
  programPhase: number,
  usedElsewhere: Set<string>
) {
  const s = summarizeSwitch(sw, record, known, usedElsewhere);
  const reqs: Requirement[] = [];
  let order = 1000;
  const base = (id: string, phase: number, group: ReqGroup, label: string): Requirement => ({
    id,
    phase,
    group,
    label,
    title: null,
    codes: [],
    credits: null,
    status: "remaining",
    match: null,
    prerequisites: [],
    corequisites: [],
    order: order++,
    notes: [],
    block: null,
    extra: "none",
    mergedInto: null,
    area: null,
  });

  sw.admission.prerequisites.forEach((p, i) => {
    const st = s.prereqs[i];
    reqs.push({
      ...base(`a-${i}`, admissionPhase, "admission", p.label),
      title: p.title,
      codes: [p.code],
      credits: p.credits,
      status: st.state,
      match: st.match,
      prerequisites: p.prerequisites,
      notes: [
        `Required to enter the ${sw.target.label}${sw.admission.minGrade ? ` with a ${sw.admission.minGrade} or higher` : ""}.`,
        ...(st.state === "low_grade" ? [`You have a ${st.match?.grade}; retake it for a ${sw.admission.minGrade} or higher.`] : []),
      ],
      extra: sw.target.basis === "after_associate" ? "yes" : "none",
    });
  });

  let electiveCredits = s.electives.covered.low;
  sw.terms.forEach((t, ti) =>
    t.entries.forEach((e, ei) => {
      const id = `t-${ti}-${ei}`;
      if (e.kind === "elective") {
        const filled = electiveCredits >= sw.electives.slotCredits;
        if (filled) electiveCredits -= sw.electives.slotCredits;
        reqs.push({
          ...base(id, programPhase, "electives", "Elective"),
          credits: e.credits,
          status: filled ? "done" : "remaining",
          notes: [
            sw.electives.lists.length
              ? `Pick from: ${sw.electives.lists.map((l) => `${l.label}: ${l.patterns.join(", ")}`).join(" | ")}`
              : `Pick from: ${sw.electives.codes.join(", ")}`,
          ],
        });
        return;
      }
      const st = s.entries[ti][ei];
      const isArea = e.codes.length > 1 && !e.label.match(CODE_RE);
      reqs.push({
        ...base(id, programPhase, isArea ? "gen_ed" : "program", e.label),
        title: e.title,
        codes: e.codes,
        credits: e.credits,
        status: st.state === "done" ? "done" : st.state === "in_progress" ? "in_progress" : "remaining",
        match: st.match,
        prerequisites: e.prerequisites,
        notes: isArea ? [`Any of: ${e.codes.join(", ")}`] : [],
      });
    })
  );
  return { reqs, summary: s };
}

/* ------------------------------------------------------------------ */
/* Assemble                                                            */
/* ------------------------------------------------------------------ */

function carriedFrom(reqs: Requirement[], plan: ProgressPlan, record: StoredAcademicRecord | null) {
  const carried: CarriedCourse[] = [];
  const used = new Set<string>();
  const groupName: Record<ReqGroup, string> = {
    admission: "admission prerequisite",
    program: "program course",
    gen_ed: "gen-ed",
    electives: "elective",
    fiu: "FIU prerequisite",
  };
  for (const r of reqs) {
    if (r.match && (r.match.status === "completed" || r.match.status === "in_progress")) {
      const code = normalizeRecordCode(r.match.code);
      if (used.has(code)) continue;
      used.add(code);
      // A grade too low to count is shown on the requirement as a retake, not as carried over.
      if (r.status === "low_grade") continue;
      carried.push({
        course: r.match,
        title: plan.knownTitles[code] ?? r.title,
        credits: plan.knownCredits[code] ?? r.credits,
        countsAs: r.codes.length > 1 ? `${r.label} (${groupName[r.group]})` : groupName[r.group],
      });
    }
    for (const f of r.block?.fillers ?? []) {
      const code = normalizeRecordCode(f);
      if (used.has(code)) continue;
      used.add(code);
      const course = record?.courses.find((c) => normalizeRecordCode(c.code) === code);
      if (course) {
        carried.push({ course, title: plan.knownTitles[code] ?? null, credits: plan.knownCredits[code] ?? null, countsAs: `${r.label} (elective)` });
      }
    }
  }
  for (const c of record?.courses ?? []) {
    if (c.status === "in_progress" && !used.has(normalizeRecordCode(c.code))) used.add(normalizeRecordCode(c.code));
  }
  const unused = (record?.courses ?? []).filter((c) => c.status === "completed" && !used.has(normalizeRecordCode(c.code)));
  return { carried, unused };
}

function coveredCredits(reqs: Requirement[]): CreditRange {
  let covered: CreditRange = { low: 0, high: 0 };
  for (const r of reqs) {
    if (r.extra !== "none") continue;
    if (r.block) covered = add(covered, { low: r.block.covered, high: r.block.covered });
    else if (r.status === "done" || r.status === "in_progress") covered = add(covered, r.credits);
  }
  return covered;
}

/** Remaining admission prerequisites that the current program can absorb (same course, a choice, or an elective block). */
function absorbPrerequisites(own: Requirement[], prereqs: Requirement[], targetLabel: string): CreditRange {
  let absorbed: CreditRange = { low: 0, high: 0 };
  for (const p of prereqs) {
    if (p.status === "done" || p.status === "in_progress") continue;
    const code = p.codes[0];
    const same = own.find((r) => r.status === "remaining" && r.codes.length === 1 && r.codes[0] === code);
    if (same) {
      same.notes.push(`Also a ${targetLabel} prerequisite.`);
      p.extra = "none";
      p.mergedInto = same.label;
      absorbed = add(absorbed, p.credits);
      continue;
    }
    const choice = own.find(
      (r) => !r.area && r.status === "remaining" && r.codes.length > 1 && r.codes.includes(code) && !r.notes.some((n) => n.startsWith("Choose "))
    );
    if (choice) {
      choice.notes.push(`Choose ${p.label}: it's also a ${targetLabel} prerequisite.`);
      choice.label = `${p.label} (for ${choice.label})`;
      choice.codes = [code];
      choice.title = p.title;
      choice.prerequisites = p.prerequisites;
      p.extra = "none";
      p.mergedInto = choice.label;
      absorbed = add(absorbed, p.credits);
      continue;
    }
    const block = own.find(
      (r) => r.block && p.credits && openBlockCredits(r.block) >= p.credits.high && r.block.prefixes.includes(code.slice(0, 3))
    );
    if (block?.block && p.credits) {
      block.block.planned += p.credits.high;
      block.block.plannedFillers.push(p.label);
      p.phase = block.phase;
      p.group = "electives";
      p.extra = "none";
      p.notes.unshift(`Take it as one of your ${block.label} in your current program (${block.block.prefixes.join(", ")} courses count).`);
      block.notes.push(`${p.label} (${p.credits.high} cr) fills part of this and is a ${targetLabel} prerequisite.`);
      absorbed = add(absorbed, p.credits);
      continue;
    }
    p.notes.push("Not part of your current program, so it adds credits.");
  }
  for (const r of own) {
    if (r.block && r.block.planned && !openBlockCredits(r.block) && r.block.covered < r.block.credits) {
      r.mergedInto = `${[...r.block.fillers, ...r.block.plannedFillers].join(", ")} (planned)`;
    }
  }
  return absorbed;
}

export type PlanSource = { kind: "path"; fiu: boolean } | { kind: "switch"; index: number };

export function buildFinishPlan(plan: ProgressPlan, record: StoredAcademicRecord | null, source: PlanSource): FinishPlan {
  const byCode = recordByCode(record);
  const lower = plan.ratePerCredit;
  const rateNote = `MDC tuition ${plan.rateYear ? `(${plan.rateYear}) ` : ""}per credit; excludes fees and books.`;

  if (source.kind === "path") {
    const reqs = pathRequirements(plan, byCode, 0);
    fillBlocks(reqs, record, plan.knownCredits);
    const other: FinishPlan["other"] = plan.competencies.map((text) => ({ phase: 0, text }));
    const notes: string[] = [];

    if (source.fiu && plan.fiu) {
      let order = 2000;
      for (const prereq of plan.fiu.prerequisites) {
        for (const part of prereq.parts) {
          const onPath = reqs.find((r) => !r.area && r.codes.length && part.codes.some((c) => r.codes.includes(c)));
          if (onPath) {
            onPath.notes.push(`Also an FIU prerequisite (FIU ${prereq.fiu}).`);
            continue;
          }
          // An open gen-ed area slot that lists this course can take it instead of adding credits.
          const slot = reqs.find(
            (r) => r.area && needsWork(r) && !r.notes.some((n) => n.startsWith("Pick ")) && part.codes.some((c) => r.codes.includes(c))
          );
          if (slot) {
            slot.notes.unshift(`Pick ${part.label} here: it's also an FIU prerequisite (FIU ${prereq.fiu}).`);
            continue;
          }
          const hit = entryProgress(part.codes, byCode);
          reqs.push({
            id: `fiu-${order}`,
            phase: 0,
            group: "fiu",
            label: part.label,
            title: part.codes.length === 1 ? (plan.knownTitles[part.codes[0]] ?? null) : null,
            codes: part.codes,
            credits: creditsFor(part.codes, plan.knownCredits),
            status: statusOf(hit),
            match: hit.match,
            prerequisites: part.codes.length === 1 ? (plan.knownPrerequisites[part.codes[0]] ?? []) : [],
            corequisites: [],
            order: order++,
            notes: [`FIU ${prereq.fiu}${prereq.note ? `; ${prereq.note}` : ""}. Not on your MDC path; it may fit a gen-ed or elective slot, so ask an advisor.`],
            block: null,
            extra: "maybe",
            mergedInto: null,
            area: null,
          });
        }
      }
      plan.fiu.admission.forEach((a) => other.push({ phase: 0, text: `FIU: ${a}` }));
      if (plan.fiu.exception) other.push({ phase: 0, text: `FIU program rule: ${plan.fiu.exception}` });
      if (plan.fiu.asNote) notes.push(plan.fiu.asNote);
    }

    const covered = coveredCredits(reqs);
    const extra = reqs
      .filter((r) => r.extra === "maybe" && (r.status === "remaining" || r.status === "low_grade"))
      .reduce<CreditRange>((n, r) => ({ low: n.low, high: n.high + (r.credits?.high ?? 0) }), { low: 0, high: 0 });
    const remaining = {
      low: Math.max(0, plan.programCredits - covered.high) + extra.low,
      high: Math.max(0, plan.programCredits - covered.low) + extra.high,
    };
    const unknownDone = reqs.filter((r) => (r.status === "done" || r.status === "in_progress") && !r.credits && !r.block);
    if (unknownDone.length) notes.push(`No credit data for ${unknownDone.map((r) => r.label).join(", ")}, so they aren't subtracted.`);
    if (extra.high) notes.push("The cost range's high end assumes FIU prerequisites add credits beyond your program.");

    const { carried, unused } = carriedFrom(reqs, plan, record);
    return {
      title: `Finish ${plan.programLabel.split(" · ").slice(0, 2).join(" ")}`,
      phases: [{ label: plan.programLabel, detail: null }],
      requirements: reqs,
      carried,
      unused,
      other,
      totals: {
        remaining,
        cost: { low: Math.round(remaining.low * lower * 100) / 100, high: Math.round(remaining.high * lower * 100) / 100 },
        rateNote: `${remaining.low === remaining.high ? "" : "Range reflects courses whose credits vary. "}${rateNote}`,
      },
      notes,
    };
  }

  const sw = plan.switches[source.index];
  const fromOwnProgram = sw.target.basis === "after_associate" && plan.programLabel.includes(`(${sw.fromCode})`);
  const afterAssociate = sw.target.basis === "after_associate";
  const own = fromOwnProgram ? pathRequirements(plan, byCode, 0) : [];
  if (own.length) fillBlocks(own, record, plan.knownCredits);
  // Courses that count toward the current program can't also count toward the program after it.
  const usedByOwn = new Set(
    own.flatMap((r) => [...(r.match ? [r.match.code] : []), ...(r.block?.fillers ?? [])]).map(normalizeRecordCode)
  );
  const { reqs: target, summary } = switchRequirements(sw, record, plan.knownCredits, 0, afterAssociate ? 1 : 0, usedByOwn);
  const prereqs = target.filter((r) => r.group === "admission");
  const absorbed = own.length ? absorbPrerequisites(own, prereqs, sw.target.label) : { low: 0, high: 0 };
  const reqs = [...own, ...target];

  let remaining = { low: summary.remaining.low - absorbed.high, high: summary.remaining.high - absorbed.low };
  let cost = { low: summary.cost.low - absorbed.high * sw.rates.lower, high: summary.cost.high - absorbed.low * sw.rates.lower };
  if (own.length) {
    const covered = coveredCredits(own);
    const ownLeft = { low: Math.max(0, plan.programCredits - covered.high), high: Math.max(0, plan.programCredits - covered.low) };
    remaining = add(remaining, ownLeft);
    cost = { low: cost.low + ownLeft.low * plan.ratePerCredit, high: cost.high + ownLeft.high * plan.ratePerCredit };
  }

  const other: FinishPlan["other"] = own.length ? plan.competencies.map((text) => ({ phase: 0, text })) : [];
  const entryPhase = afterAssociate ? 1 : 0;
  if (sw.admission.priorDegree) {
    other.push({ phase: entryPhase, text: `To enter: ${sw.admission.priorDegree}${fromOwnProgram ? " (finishing your A.S. covers this)" : ""}` });
  }
  if (sw.admission.minGpa != null) other.push({ phase: entryPhase, text: `To enter: ${sw.admission.minGpa} cumulative GPA` });
  if (sw.admission.minGrade && sw.admission.prerequisites.length) {
    other.push({ phase: entryPhase, text: `To enter: ${sw.admission.minGrade} or higher in every admission prerequisite` });
  }
  sw.admission.notes.forEach((n) => other.push({ phase: 0, text: n }));
  if (sw.genEdCredits) {
    other.push({ phase: entryPhase, text: `${sw.genEdCredits} general-education credits in total for the degree; if your associate degree has fewer, ask an advisor what to add` });
  }

  const notes = [...sw.notes];
  if (sw.electives.note) notes.push(sw.electives.note);
  const maybe = summary.electives.matches.filter((m) => !m.sure);
  if (maybe.length) {
    const why = afterAssociate
      ? "only courses beyond your associate degree's credits count toward this program; ask an advisor"
      : `allowed only by ${[...new Set(maybe.flatMap((m) => m.lists))].join(", ")}`;
    notes.push(`May count as electives (${why}): ${maybe.map((m) => m.course.code).join(", ")}.`);
  }
  for (const m of summary.electives.matches.filter((x) => x.sure)) {
    const req = reqs.find((r) => r.group === "electives" && r.status === "done" && !r.match);
    if (req) req.match = m.course;
  }
  if (summary.unknownCredits.length) notes.push(`No credit data for ${summary.unknownCredits.join(", ")}, so they aren't priced.`);

  const { carried, unused } = carriedFrom(reqs, plan, record);
  const phases = fromOwnProgram
    ? [
        { label: `Phase 1 · Finish your ${sw.fromLabel}`, detail: "Plus the Applied AI admission prerequisites, folded into your electives and gen-ed where they fit." },
        { label: `Phase 2 · ${sw.target.label}`, detail: `The program's last ${sw.target.credits - sw.target.entryCredits} credits after your associate degree.` },
      ]
    : afterAssociate
      ? [
          { label: "Phase 1 · Admission prerequisites", detail: null },
          { label: `Phase 2 · ${sw.target.label}`, detail: `The program's last ${sw.target.credits - sw.target.entryCredits} credits after your associate degree.` },
        ]
      : [{ label: sw.target.label, detail: `${sw.target.credits} credits` }];

  return {
    title: `${sw.fromLabel} → ${sw.target.label}`,
    phases,
    requirements: reqs,
    carried,
    unused,
    other,
    totals: {
      remaining,
      cost: { low: Math.round(cost.low * 100) / 100, high: Math.round(cost.high * 100) / 100 },
      rateNote: `${afterAssociate ? `Lower division ${formatRate(sw.rates.lower)}, upper division ${formatRate(sw.rates.upper)}; electives may be either, hence the range. ` : ""}${rateNote}`,
    },
    notes,
  };
}

const formatRate = (n: number) => `$${n.toFixed(2)}/credit`;
