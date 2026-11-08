// lib/progress-plan.ts
// Server-side: turns a career's catalog data into a ProgressPlan for the progress tracker.
// Every number comes from mdc_pathways.json; missing values stay null instead of being guessed.

import "server-only";
import {
  extractCourseCodes,
  getCareer,
  getCourseCredits,
  getCourseObjects,
  getGeneralEducation,
  getProgram,
  getPrograms,
  getSharedRules,
  lookupCourse,
  normalizeCode,
} from "./pathways";
import {
  CAREER_IDS,
  type Career,
  type CareerId,
  type CreditRange,
  type Division,
  type FiuPlan,
  type GenEdAreaRule,
  type GenEdRequirement,
  type ProgramSwitch,
  type ProgressPlan,
  type SwitchEntry,
  type SwitchPlan,
} from "./types";

function toRange(credits: number | string): CreditRange | null {
  if (typeof credits === "number") return { low: credits, high: credits };
  const m = credits.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  const n = Number(credits);
  return Number.isFinite(n) ? { low: n, high: n } : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Florida course numbering: 1000/2000-level courses are lower division, 3000/4000-level upper.
function divisionFromCode(code: string): Division | null {
  const digit = normalizeCode(code).charAt(3);
  if (digit === "1" || digit === "2") return "lower";
  if (digit === "3" || digit === "4") return "upper";
  return null;
}

/** Alternatives ("CTS 1134 or CTS 1650") span the credits of their options; null if any option is unknown. */
function spanCredits(codes: string[], credits: Map<string, CreditRange>): CreditRange | null {
  const known = codes.map((c) => credits.get(c)).filter((r): r is CreditRange => r != null);
  if (!codes.length || known.length !== codes.length) return null;
  return { low: Math.min(...known.map((r) => r.low)), high: Math.max(...known.map((r) => r.high)) };
}

function careerCredits(career: Career): Map<string, CreditRange> {
  const map = new Map<string, CreditRange>();
  for (const course of getCourseObjects(career)) {
    const range = toRange(course.credits);
    if (!range) continue;
    for (const code of extractCourseCodes(course.code)) map.set(normalizeCode(code), range);
  }
  return map;
}

let knownCreditsCache: Map<string, CreditRange> | null = null;
/** Every credit value in the data: shared course credits, program courses, then each career's courses. */
function knownCredits(): Map<string, CreditRange> {
  if (knownCreditsCache) return knownCreditsCache;
  const map = new Map<string, CreditRange>();
  for (const [code, c] of Object.entries(getCourseCredits()?.courses ?? {})) {
    map.set(normalizeCode(code), { low: c.credits, high: c.credits });
  }
  for (const program of getPrograms()) {
    for (const c of [...program.courses, ...program.electives.options]) {
      const range = toRange(c.credits);
      if (range) map.set(normalizeCode(c.code), range);
    }
  }
  for (const id of CAREER_IDS) {
    for (const [code, range] of careerCredits(getCareer(id))) if (!map.has(code)) map.set(code, range);
  }
  knownCreditsCache = map;
  return map;
}

interface CourseFacts {
  titles: Map<string, string>;
  prerequisites: Map<string, string[]>;
  corequisites: Map<string, string[]>;
}

let courseFactsCache: CourseFacts | null = null;
/** Titles and prerequisite text for every course object in the data (careers first, then programs). */
function courseFacts(): CourseFacts {
  if (courseFactsCache) return courseFactsCache;
  const facts: CourseFacts = { titles: new Map(), prerequisites: new Map(), corequisites: new Map() };
  const add = (c: { code: string; title: string; prerequisites: string[]; corequisites: string[] }) => {
    for (const code of extractCourseCodes(c.code).map(normalizeCode)) {
      if (!facts.titles.has(code)) facts.titles.set(code, c.title);
      if (!facts.prerequisites.has(code) && c.prerequisites.length) facts.prerequisites.set(code, c.prerequisites);
      if (!facts.corequisites.has(code) && c.corequisites.length) facts.corequisites.set(code, c.corequisites);
    }
  };
  for (const id of CAREER_IDS) getCourseObjects(getCareer(id)).forEach(add);
  for (const program of getPrograms()) [...program.courses, ...program.electives.options].forEach(add);
  for (const [code, c] of Object.entries(getCourseCredits()?.courses ?? {})) {
    if (!facts.titles.has(normalizeCode(code))) facts.titles.set(normalizeCode(code), c.title);
  }
  for (const area of Object.values(getGeneralEducation()?.general_education ?? {})) {
    for (const c of [...(area.state_core ?? []), ...(area.mdc_core ?? []), ...(area.options ?? [])]) {
      if (typeof c === "string" || !c.title || c.code.includes("*")) continue;
      if (!facts.titles.has(normalizeCode(c.code))) facts.titles.set(normalizeCode(c.code), c.title);
    }
  }
  courseFactsCache = facts;
  return facts;
}

const AREA_KEYS: Record<string, string> = {
  communications: "communications",
  humanities: "humanities",
  mathematics: "mathematics",
  "natural science": "natural_sciences",
  "social science": "social_sciences",
  "oral communication": "oral_communications",
};

interface AreaSlot {
  codes: string[];
  credits: CreditRange | null;
  area: GenEdAreaRule;
}

/**
 * A bare gen-ed slot ("Humanities", "Natural science (1)") filled from the shared MDC gen-ed areas.
 * A.S. degrees take one State Core course per area; A.A. degrees take one State Core and one MDC Core course.
 */
function genEdArea(label: string, degree: string, credits: Map<string, CreditRange>): AreaSlot | null {
  const ge = getGeneralEducation();
  if (!ge) return null;
  const name = label.replace(/\s*\(\d+\)\s*$/, "").trim();
  const source = `${ge.meta.source}; ${ge.meta.effective_term}`;

  if (/^computer competency$/i.test(name)) {
    const comp = ge.competencies.computer;
    const codes = comp.options.flatMap((o) => extractCourseCodes(o)).map(normalizeCode);
    const course = spanCredits(codes, credits);
    return {
      codes,
      // The competency test awards no credit, so the slot can cost 0 credits.
      credits: course ? { low: 0, high: course.high } : null,
      area: {
        name,
        rule: `Attempt by ${comp.attempt_by_credit} credits, satisfy by ${comp.satisfy_by_credit}: ${comp.options.join(", ")}.`,
        minGrade: null,
        source,
      },
    };
  }

  const key = AREA_KEYS[name.toLowerCase()];
  const area = key ? ge.general_education[key] : undefined;
  if (!area) return null;
  const state = area.state_core ?? [];
  const mdc = area.mdc_core ?? [];
  const options = (area.options ?? []).map((o) => (typeof o === "string" ? { code: o } : o));
  const list = state.length ? (degree === "AA" ? [...state, ...mdc] : state) : options;
  const perSlot = area.credits / (state.length && mdc.length ? 2 : 1);
  const rule = area.rule && (degree === "AA" || !/MDC Core/.test(area.rule)) ? area.rule : null;
  return {
    codes: [...new Set(list.map((o) => normalizeCode(o.code)))],
    credits: { low: perSlot, high: perSlot },
    area: { name, rule, minGrade: area.min_grade ?? null, source },
  };
}

/** Every code an area lists (State Core, MDC Core and options), to recognize a program's own gen-ed entry for it. */
function areaUniverse(label: string): Set<string> {
  const key = AREA_KEYS[label.replace(/\s*\(\d+\)\s*$/, "").trim().toLowerCase()];
  const area = key ? getGeneralEducation()?.general_education[key] : undefined;
  if (!area) return new Set();
  const all = [...(area.state_core ?? []), ...(area.mdc_core ?? []), ...(area.options ?? [])];
  return new Set(all.map((o) => normalizeCode(typeof o === "string" ? o : o.code)));
}

// primary_program.gen_ed entries look like "ENC 1101", "Humanities (1)", "AMH 2010 / AMH 2020 / POS 2041".
function genEdRequirements(raw: unknown, degree: string, credits: Map<string, CreditRange>): GenEdRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((label) => {
      const codes = extractCourseCodes(label).map(normalizeCode);
      if (codes.length) return { label, codes, credits: spanCredits(codes, credits), area: null };
      const slot = genEdArea(label, degree, credits);
      return { label: label.replace(/\s*\(\d+\)\s*$/, ""), codes: slot?.codes ?? [], credits: slot?.credits ?? null, area: slot?.area ?? null };
    });
}

/** Graduation requirements that aren't courses, from the shared MDC gen-ed data. */
function competencies(degree: string, hasComputerSlot: boolean): string[] {
  const ge = getGeneralEducation();
  if (!ge) return [];
  const c = ge.competencies;
  const out = [`Civic literacy: ${c.civic_literacy.requirement} Applies to ${c.civic_literacy.applies_to}`];
  if (degree === "AA") {
    if (!hasComputerSlot) {
      out.push(`Computer competency: attempt by ${c.computer.attempt_by_credit} credits, satisfy by ${c.computer.satisfy_by_credit} (${c.computer.options.join(", ")}).`);
    }
    out.push(`Foreign language competency: ${c.foreign_language.options.join(", ")}, or one of ${c.foreign_language.courses.join(", ")}.`);
    const gordon = Object.entries(ge.gordon_rule).filter(([k]) => k !== "reference");
    if (gordon.length) {
      out.push(`Gordon Rule${ge.gordon_rule.reference ? ` (${ge.gordon_rule.reference})` : ""}: ${gordon.map(([k, v]) => `${k}: ${v}`).join(" ")}`);
    }
  }
  return out;
}

// primary_program.electives looks like "9 credits: any CAI, CGS, CIS, COP, CTS (e.g. ...)".
function electiveRule(raw: unknown): ProgressPlan["electives"] {
  if (typeof raw !== "string") return null;
  const credits = raw.match(/^(\d+)\s*credits/);
  const prefixes = raw.match(/any\s+((?:[A-Z]{3}(?:,\s*|\s+or\s+|\s+and\s+)?)+)/)?.[1].match(/[A-Z]{3}/g) ?? [];
  return { credits: credits ? Number(credits[1]) : null, prefixes, note: raw };
}

function sharedTitle(normalizedCode: string): string | null {
  const hit = Object.entries(getCourseCredits()?.courses ?? {}).find(([code]) => normalizeCode(code) === normalizedCode);
  return hit?.[1].title ?? null;
}

function programLabel(degree: string, name: string, code: string) {
  return `${degree === "AS" ? "A.S." : degree === "BS" ? "B.S." : degree} ${name} (${code})`;
}

function getSwitchPlan(career: Career, sw: ProgramSwitch): SwitchPlan | null {
  const target = getProgram(sw.to);
  if (!target) return null;
  const ep = career.educational_pathway;
  const from = [ep.primary_program, ep.mdc_bachelor].find((p) => p?.code === sw.from);
  const rules = getSharedRules();
  const credits = knownCredits();

  const courseByCode = new Map(target.courses.map((c) => [normalizeCode(c.code), c]));
  const genEdByLabel = new Map(target.gen_ed.map((g) => [g.label.toLowerCase(), g]));
  const isAssociate = target.degree === "AS";

  const terms = target.sequence.map((t) => ({
    term: t.term,
    entries: t.courses.map((label): SwitchEntry => {
      if (label === "Elective") {
        const c = target.electives.slot_credits;
        return { label, codes: [], title: null, credits: { low: c, high: c }, division: isAssociate ? "lower" : null, kind: "elective", prerequisites: [] };
      }
      const genEd = genEdByLabel.get(label.toLowerCase());
      if (genEd) {
        return {
          label,
          codes: genEd.options.map(normalizeCode),
          title: null,
          credits: { low: genEd.credits, high: genEd.credits },
          division: "lower",
          kind: "course",
          prerequisites: [],
        };
      }
      const codes = extractCourseCodes(label).map(normalizeCode);
      const courses = codes.map((c) => courseByCode.get(c)).filter((c) => c != null);
      const divisions = new Set(codes.map((c) => courseByCode.get(c)?.division ?? divisionFromCode(c)));
      return {
        label,
        codes,
        title: codes.length === 1 ? (courses[0]?.title ?? null) : null,
        credits: spanCredits(codes, credits),
        division: divisions.size === 1 ? [...divisions][0] : null,
        kind: "course",
        prerequisites: [...new Set(courses.flatMap((c) => c.prerequisites))],
      };
    }),
  }));

  const career_ = target.career;
  return {
    label: sw.label,
    fromLabel: from ? programLabel(from.degree, from.name, from.code) : sw.from,
    fromCode: sw.from,
    target: {
      code: target.code,
      name: target.name,
      degree: target.degree,
      credits: target.credits,
      label: programLabel(target.degree, target.name, target.code),
      effectiveTerm: target.effective_term ?? null,
      basis: target.sequence_basis,
      entryCredits: target.entry_credits,
    },
    admission: {
      priorDegree: target.admission.prior_degree ?? null,
      minGpa: target.admission.min_gpa ?? null,
      minGrade: target.admission.min_grade ?? null,
      prerequisites: target.admission.prerequisites.map((label) => {
        const code = normalizeCode(label);
        return {
          code,
          label,
          title: courseByCode.get(code)?.title ?? sharedTitle(code),
          credits: credits.get(code) ?? null,
          prerequisites: courseByCode.get(code)?.prerequisites ?? courseFacts().prerequisites.get(code) ?? [],
        };
      }),
      notes: target.admission.notes,
    },
    terms,
    electives: {
      slotCredits: target.electives.slot_credits,
      slotCreditsBasis: target.electives.slot_credits_basis ?? null,
      division: isAssociate ? "lower" : null,
      codes: target.electives.options.map((o) => normalizeCode(o.code)),
      lists: target.electives.allowed_lists.map((l) => ({ label: l.label, patterns: l.patterns })),
      note: target.electives.note ?? null,
      recommended: target.electives.options.filter((o) => o.recommended_for_bs).map((o) => o.code),
    },
    genEdCredits: target.sequence_basis === "after_associate" ? (target.blocks.general_education ?? null) : null,
    notes: target.notes,
    rates: {
      lower: Number(rules.cost_basis.mdc_lower_division_per_credit),
      upper: Number(rules.cost_basis.mdc_upper_division_per_credit),
      year: asString(rules.cost_basis.mdc_rates_year) ?? "",
    },
    career: career_
      ? {
          summary: career_.summary,
          dataSource: career_.data_source ?? null,
          occupations: career_.occupations.map((o) => ({
            title: o.title,
            medianPay: o.median_pay,
            outlookPct: o.outlook_pct ?? null,
            entryEducation: o.entry_education ?? null,
            source: o.source ?? null,
          })),
          withBs: career_.with_bs
            ? {
                note: career_.with_bs.note,
                occupations: career_.with_bs.occupations.map((o) => ({ title: o.title, medianPay: o.median_pay, outlookPct: o.outlook_pct ?? null })),
              }
            : null,
        }
      : null,
    sources: target.sources,
  };
}

export function getProgressPlan(id: CareerId): ProgressPlan {
  const career = getCareer(id);
  const ep = career.educational_pathway;
  const program = ep.primary_program;
  const rules = getSharedRules();
  const credits = knownCredits();
  const ownCredits = careerCredits(career);
  // The career's own catalog values win; shared values fill gen-ed gaps.
  const creditsByCode = new Map([...credits, ...ownCredits]);

  const facts = courseFacts();
  const ownCourses = new Map<string, { prerequisites: string[]; corequisites: string[] }>();
  for (const c of getCourseObjects(career)) {
    for (const code of extractCourseCodes(c.code).map(normalizeCode)) ownCourses.set(code, c);
  }
  const reqsFor = (codes: string[], key: "prerequisites" | "corequisites") =>
    [...new Set(codes.flatMap((c) => ownCourses.get(c)?.[key] ?? facts[key].get(c) ?? []))];

  const rawGenEd = (program as Record<string, unknown>).gen_ed;
  const sequenceCodes = new Set(program.sequence_full_time.flatMap((t) => t.courses.flatMap(extractCourseCodes)).map(normalizeCode));
  // Coded gen-ed entries the sequence only names by area ("Social science" = "AMH 2010 / AMH 2020 / POS 2041").
  const unplacedGenEd = (Array.isArray(rawGenEd) ? rawGenEd : [])
    .filter((v): v is string => typeof v === "string")
    .map((label) => ({ label, codes: extractCourseCodes(label).map(normalizeCode) }))
    .filter((g) => g.codes.length && !g.codes.some((c) => sequenceCodes.has(c)));

  const areaSlot = (label: string): AreaSlot | null => {
    const slot = genEdArea(label, program.degree, creditsByCode);
    if (!slot) return null;
    const universe = areaUniverse(label);
    const i = unplacedGenEd.findIndex((g) => g.codes.every((c) => universe.has(c)));
    if (i < 0) return slot;
    const [own] = unplacedGenEd.splice(i, 1);
    return { ...slot, codes: own.codes, credits: spanCredits(own.codes, creditsByCode) ?? slot.credits, area: { ...slot.area, rule: `Program gen-ed: ${own.label}` } };
  };

  const terms = program.sequence_full_time.map((t) => ({
    term: t.term,
    entries: t.courses.map((label) => {
      const codes = extractCourseCodes(label).map(normalizeCode);
      const slot = codes.length ? null : areaSlot(label);
      if (slot) {
        return { label, codes: slot.codes, title: null, credits: slot.credits, prerequisites: [], corequisites: [], area: slot.area };
      }
      return {
        label,
        codes,
        title: codes.length === 1 ? (lookupCourse(id, label)?.title ?? sharedTitle(codes[0])) : null,
        credits: spanCredits(codes, creditsByCode),
        // Alternatives ("CTS 1134 or CTS 1650") only carry requirements shared by every option.
        prerequisites: codes.length === 1 ? reqsFor(codes, "prerequisites") : [],
        corequisites: codes.length === 1 ? reqsFor(codes, "corequisites") : [],
        area: null,
      };
    }),
  }));

  let fiu: FiuPlan | null = null;
  if (ep.fiu_transfer) {
    const f = ep.fiu_transfer;
    const exceptions = (rules.transfer_rules.fiu_exceptions ?? {}) as Record<string, unknown>;
    const exceptionKey = Object.keys(exceptions).find((k) => f.degree.toLowerCase().includes(k.toLowerCase()));
    const split = f.credit_split_assumption;
    fiu = {
      degree: f.degree,
      catalogYear: f.catalog_year ?? null,
      minGpa: f.min_gpa ?? null,
      admission: f.admission,
      prerequisites: f.prerequisites.map((p) => ({
        parts: p.mdc.map((label) => ({ label, codes: extractCourseCodes(label).map(normalizeCode) })),
        fiu: p.fiu.join(", "),
        note: p.note ?? null,
      })),
      exception: exceptionKey ? asString(exceptions[exceptionKey]) : null,
      asNote: program.degree === "AS" ? asString(rules.transfer_rules.as_to_bachelors) : null,
      advising: asString(rules.transfer_rules.fiu_advising),
      remaining:
        f.total_credits != null && f.remaining_after_aa_estimate != null
          ? {
              totalCredits: f.total_credits,
              credits: f.remaining_after_aa_estimate,
              note: f.remaining_note ?? "",
              source: f.credits_source ?? null,
              ratePerCredit: split ? null : asNumber(rules.cost_basis.fiu_undergrad_per_credit),
              rateTerm: asString(rules.cost_basis.fiu_rates_term) ?? "",
              splitAssumption: split ? { undergrad: split.undergrad_credits, grad: split.grad_credits, note: split.note } : null,
            }
          : null,
      majorNote: f.major_note ?? null,
    };
  }

  return {
    careerId: id,
    careerTitle: career.title,
    programLabel: `${program.degree} · ${program.name} (${program.code}) · ${program.credits} credits`,
    programCredits: program.credits,
    ratePerCredit: Number(rules.cost_basis.mdc_lower_division_per_credit),
    rateYear: asString(rules.cost_basis.mdc_rates_year) ?? "",
    terms,
    fiu,
    switches: ep.program_switches.map((sw) => getSwitchPlan(career, sw)).filter((s): s is SwitchPlan => s != null),
    knownCredits: Object.fromEntries(credits),
    knownTitles: Object.fromEntries(facts.titles),
    knownPrerequisites: Object.fromEntries(facts.prerequisites),
    genEd: genEdRequirements(rawGenEd, program.degree, creditsByCode),
    electives: electiveRule((program as Record<string, unknown>).electives),
    competencies: competencies(program.degree, terms.some((t) => t.entries.some((e) => /computer competency|CGS 1060C/i.test(e.label)))),
  };
}

export function getAllProgressPlans(): ProgressPlan[] {
  return CAREER_IDS.map(getProgressPlan);
}
