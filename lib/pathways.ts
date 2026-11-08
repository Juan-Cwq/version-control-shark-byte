// lib/pathways.ts
// The only module that reads /data/Courses_data/mdc_pathways.json. Validates once at load.

import raw from "../data/Courses_data/mdc_pathways.json";
import { PathwaysFile, type Career, type CareerId, type Course, type PersonalizedPlan } from "./types";

const parsed = PathwaysFile.safeParse(raw);
if (!parsed.success) {
  throw new Error(`mdc_pathways.json failed validation:\n${parsed.error.toString()}`);
}
const DATA = parsed.data;

/* ------------------------------------------------------------------ */
/* Course codes                                                        */
/* ------------------------------------------------------------------ */

// Matches "CTS 1134", "CGS 1060C", "PHY 2053L", "ENC1101".
const CODE_RE = /\b[A-Z]{3}\s?\d{4}[A-Z]?\b/g;

export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function extractCourseCodes(text: string): string[] {
  return [...new Set((text.match(CODE_RE) ?? []).map((c) => c.trim()))];
}

/** Every course object in a career (with titles). */
export function getCourseObjects(career: Career): Course[] {
  const ep = career.educational_pathway;
  return [
    ...ep.primary_program.courses,
    ...(ep.primary_program.additional_prerequisites ?? []),
    ...(ep.mdc_bachelor?.upper_division_courses ?? []),
  ];
}

/**
 * Index of every course code that appears ANYWHERE in a career's data
 * (course lists, sequences, gen-ed, transfer prerequisites...). Value = title if known.
 */
const careerIndexCache = new Map<CareerId, Map<string, { code: string; title: string | null }>>();
export function getCareerCourseIndex(id: CareerId) {
  const hit = careerIndexCache.get(id);
  if (hit) return hit;
  const career = getCareer(id);
  const index = new Map<string, { code: string; title: string | null }>();
  for (const code of extractCourseCodes(JSON.stringify(career))) {
    index.set(normalizeCode(code), { code, title: null });
  }
  for (const c of getCourseObjects(career)) {
    // Catalog sometimes stores compounds like "CTS 1134 or CTS 1650".
    const parts = extractCourseCodes(c.code);
    if (parts.length === 0) {
      index.set(normalizeCode(c.code), { code: c.code, title: c.title });
    } else {
      for (const part of parts) {
        index.set(normalizeCode(part), { code: part, title: c.title });
      }
    }
  }
  careerIndexCache.set(id, index);
  return index;
}

export function lookupCourse(id: CareerId, code: string) {
  return getCareerCourseIndex(id).get(normalizeCode(code)) ?? null;
}

export function stripUnknownCodes(id: CareerId, codes: string[]) {
  const index = getCareerCourseIndex(id);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of codes) {
    const hit = index.get(normalizeCode(c));
    if (hit) known.push(hit.code);
    else unknown.push(c);
  }
  return { known, unknown };
}

/* ------------------------------------------------------------------ */
/* Careers                                                             */
/* ------------------------------------------------------------------ */

export function getAllCareers() {
  return DATA.careers.map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    medianPay: c.career_exploration.median_pay_usd,
    payYear: c.career_exploration.pay_year,
    outlook: c.career_exploration.outlook,
  }));
}

export function getCareer(id: CareerId): Career {
  const c = DATA.careers.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown career id: ${id}`);
  return c;
}

export function getSharedRules() {
  return {
    transfer_rules: DATA.transfer_rules,
    articulation_agreements: DATA.articulation_agreements,
    cost_basis: DATA.cost_basis,
    meta: DATA.meta,
  };
}

/** Standalone programs (e.g. Applied AI A.S. 25080 / B.S. S9520) by program code. */
export function getProgram(code: string) {
  return DATA.programs[code] ?? null;
}

export function getPrograms() {
  return Object.values(DATA.programs);
}

/** Shared credit values for gen-ed and common courses, keyed by code ("ENC 1101"). */
export function getCourseCredits() {
  return DATA.course_credits ?? null;
}

export function getGeneralEducation() {
  return DATA.general_education ?? null;
}

/** Program codes the AI may choose as pathwayChoice.code. */
export function getAllowedPathwayCodes(id: CareerId) {
  const ep = getCareer(id).educational_pathway;
  const opts = [
    { code: ep.primary_program.code, name: ep.primary_program.name },
    ...(ep.mdc_bachelor ? [{ code: ep.mdc_bachelor.code, name: ep.mdc_bachelor.name }] : []),
    ...getCareer(id).alternative_pathways.map((a) => ({ code: a.code, name: a.name })),
  ];
  return opts;
}

/* ------------------------------------------------------------------ */
/* Sanitize AI output: nothing unverified reaches the UI as fact       */
/* ------------------------------------------------------------------ */

export function sanitizePlan(id: CareerId, plan: PersonalizedPlan) {
  const index = getCareerCourseIndex(id);
  const removed = new Set<string>();

  const scrubText = (s: string) =>
    s.replace(CODE_RE, (m) => {
      if (index.has(normalizeCode(m))) return m;
      removed.add(m);
      return "(confirm course with an advisor)";
    });

  // Pathway choice must be a real program for this career; otherwise fall back to the primary.
  const allowed = getAllowedPathwayCodes(id);
  const choice = allowed.find((a) => a.code === plan.pathwayChoice.code) ?? allowed[0];

  const clean: PersonalizedPlan = {
    pathwayChoice: { code: choice.code, name: choice.name, reason: scrubText(plan.pathwayChoice.reason) },
    summary: scrubText(plan.summary),
    adjustedTerms: plan.adjustedTerms.map((t) => {
      const { known, unknown } = stripUnknownCodes(id, t.courseCodes);
      unknown.forEach((u) => removed.add(u));
      return {
        label: t.label,
        courseCodes: known,
        otherRequirements: t.otherRequirements.map(scrubText),
        note: scrubText(t.note),
      };
    }),
    warnings: plan.warnings.map(scrubText),
    nextSteps: plan.nextSteps.map(scrubText),
    advisorQuestions: plan.advisorQuestions.map(scrubText),
  };

  return { plan: clean, unknownCodesRemoved: [...removed] };
}
