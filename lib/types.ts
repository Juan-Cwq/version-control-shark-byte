// lib/types.ts
// Single source of truth for data shapes. Matches /data/mdc_pathways.json.
// Design: facts come from the JSON; the AI only returns a PersonalizedPlan.

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Career ids — must match the "id" values in mdc_pathways.json        */
/* ------------------------------------------------------------------ */

export const CAREER_IDS = [
  "architect",
  "mechanical_engineer",
  "chef",
  "cybersecurity",
  "it_consultant",
] as const;
export const CareerId = z.enum(CAREER_IDS);
export type CareerId = z.infer<typeof CareerId>;

/* ------------------------------------------------------------------ */
/* Pathway data (validated at load; .passthrough() keeps extra fields) */
/* ------------------------------------------------------------------ */

// Some catalog entries list credits as a range string, e.g. "3-4".
const Credits = z.union([z.number(), z.string()]);

export const Course = z
  .object({
    code: z.string(),
    title: z.string(),
    credits: Credits,
    prerequisites: z.array(z.string()).default([]),
    corequisites: z.array(z.string()).default([]),
    fiu_equivalent: z.string().optional(),
    industry_cert: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();
export type Course = z.infer<typeof Course>;

export const SequenceTerm = z.object({
  term: z.string(),
  courses: z.array(z.string()), // codes AND placeholders like "Social science"
  credits: z.number(),
});
export type SequenceTerm = z.infer<typeof SequenceTerm>;

export const PrimaryProgram = z
  .object({
    code: z.string(),
    name: z.string(),
    degree: z.string(),
    credits: z.number(),
    effective_term: z.string().optional(),
    note: z.string().optional(),
    courses: z.array(Course),
    additional_prerequisites: z.array(Course).optional(),
    sequence_full_time: z.array(SequenceTerm),
    sources: z.array(z.string()).optional(),
  })
  .passthrough();

export const MdcBachelor = z
  .object({
    code: z.string(),
    name: z.string(),
    degree: z.string(),
    admission: z.array(z.string()).optional(),
    upper_division_courses: z.array(Course).optional(),
    // Present on some careers (e.g. cybersecurity BS after AS).
    sequence_from_as_full_time: z.array(SequenceTerm).optional(),
  })
  .passthrough();

export const FiuTransfer = z
  .object({
    degree: z.string(),
    catalog_year: z.string().optional(),
    min_gpa: z.number().optional(),
    admission: z.array(z.string()).default([]),
    prerequisites: z
      .array(
        z
          .object({ mdc: z.array(z.string()), fiu: z.array(z.string()), note: z.string().optional() })
          .passthrough()
      )
      .default([]),
    sources: z.array(z.string()).optional(),
    // FIU degree total and remaining credits after a 60-credit AA: conditional estimates, not a degree audit.
    total_credits: z.number().optional(),
    remaining_after_aa_estimate: z.number().optional(),
    remaining_note: z.string().optional(),
    credits_source: z.string().optional(),
    credit_split_assumption: z
      .object({ undergrad_credits: z.number(), grad_credits: z.number(), note: z.string() })
      .optional(),
    major_note: z.string().optional(),
  })
  .passthrough();

// A program a student on this career can switch into (keys of PathwaysFile.programs / career program codes).
export const ProgramSwitch = z.object({ from: z.string(), to: z.string(), label: z.string() });
export type ProgramSwitch = z.infer<typeof ProgramSwitch>;

export const CostStage = z.object({
  stage: z.string(),
  years: z.string(),
  cost_low_usd: z.number(),
  cost_high_usd: z.number(),
  note: z.string().optional(),
});

export const AltPathway = z.object({
  code: z.string(),
  name: z.string(),
  degree: z.string(),
  leads_to: z.string(),
  note: z.string().optional(),
});
export type AltPathway = z.infer<typeof AltPathway>;

export const Career = z
  .object({
    id: CareerId,
    title: z.string(),
    summary: z.string(),
    career_exploration: z
      .object({
        duties: z.array(z.string()),
        median_pay_usd: z.number().nullable(),
        pay_year: z.string(),
        outlook: z.string(),
        entry_education: z.string(),
        related_careers: z.array(
          z.object({ title: z.string(), median_pay_usd: z.number().nullable(), education: z.string() })
        ),
        source: z.string(),
      })
      .passthrough(),
    educational_pathway: z
      .object({
        primary_program: PrimaryProgram,
        mdc_bachelor: MdcBachelor.optional(),
        fiu_transfer: FiuTransfer.optional(),
        program_switches: z.array(ProgramSwitch).default([]),
        other_transfer: z.array(z.string()).optional(),
        graduate: z.array(z.string()).optional(),
      })
      .passthrough(),
    timeline_and_cost: z.object({
      stages: z.array(CostStage),
      total: z.object({
        years: z.string(),
        cost_low_usd: z.number(),
        cost_high_usd: z.number(),
        excludes: z.string().optional(),
      }),
    }),
    professional_development: z
      .object({
        licensure_steps: z.array(z.string()).optional(),
        certifications: z.array(z.string()).optional(),
        experience: z.array(z.string()).default([]),
        source: z.string().optional(),
      })
      .passthrough(),
    alternative_pathways: z.array(AltPathway),
    unverified: z.array(z.string()).default([]),
  })
  .passthrough();
export type Career = z.infer<typeof Career>;

// Credits for common gen-ed / shared courses that aren't in any one career's course list.
export const CourseCredits = z
  .object({
    notes: z.array(z.string()).default([]),
    sources: z.array(z.string()).default([]),
    courses: z.record(
      z.string(),
      z.object({ title: z.string(), credits: z.number(), corequisite: z.string().optional(), note: z.string().optional() }).passthrough()
    ),
  })
  .passthrough();

// MDC general education areas shared by every A.A. and A.S. degree (from the A.A. pathway guide).
const GenEdCourse = z.object({ code: z.string(), title: z.string().optional(), tags: z.array(z.string()).optional() }).passthrough();
export const GenEdArea = z
  .object({
    credits: z.number(),
    min_grade: z.string().optional(),
    rule: z.string().optional(),
    state_core: z.array(GenEdCourse).optional(),
    mdc_core: z.array(GenEdCourse).optional(),
    options: z.array(z.union([GenEdCourse, z.string()])).optional(),
    excluded: z.array(z.string()).optional(),
  })
  .passthrough();
export type GenEdArea = z.infer<typeof GenEdArea>;

export const GeneralEducation = z
  .object({
    meta: z.object({ program: z.string(), effective_term: z.string(), source: z.string() }).passthrough(),
    general_education: z.record(z.string(), GenEdArea),
    competencies: z
      .object({
        computer: z.object({ attempt_by_credit: z.number(), satisfy_by_credit: z.number(), options: z.array(z.string()) }).passthrough(),
        foreign_language: z.object({ options: z.array(z.string()), courses: z.array(z.string()) }).passthrough(),
        civic_literacy: z.object({ requirement: z.string(), applies_to: z.string() }).passthrough(),
      })
      .passthrough(),
    gordon_rule: z.record(z.string(), z.string()).default({}),
    official_requirements_note: z.string().optional(),
  })
  .passthrough();
export type GeneralEducation = z.infer<typeof GeneralEducation>;

export const ProgramCourse = Course.extend({ division: z.enum(["lower", "upper"]).optional() });
export type ProgramCourse = z.infer<typeof ProgramCourse>;

export const Occupation = z
  .object({
    title: z.string(),
    soc: z.string().optional(),
    median_pay: z.number(),
    outlook_pct: z.number().optional(),
    entry_education: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

// A full MDC program (beyond a career's primary program), e.g. the Applied AI A.S. and B.S.
export const Program = z
  .object({
    code: z.string(),
    name: z.string(),
    degree: z.string(),
    credits: z.number(),
    effective_term: z.string().optional(),
    description: z.string().optional(),
    sources: z.array(z.string()).default([]),
    admission: z.object({
      prior_degree: z.string().optional(),
      min_gpa: z.number().optional(),
      min_grade: z.string().optional(),
      prerequisites: z.array(z.string()).default([]),
      notes: z.array(z.string()).default([]),
    }),
    blocks: z.record(z.string(), z.number()).default({}),
    gen_ed: z
      .array(z.object({ label: z.string(), credits: z.number(), options: z.array(z.string()), note: z.string().optional() }))
      .default([]),
    courses: z.array(ProgramCourse),
    electives: z.object({
      credits_total: z.number(),
      slot_credits: z.number(),
      slot_credits_basis: z.string().optional(),
      options: z.array(Course.extend({ recommended_for_bs: z.boolean().optional() })).default([]),
      allowed_lists: z.array(z.object({ label: z.string(), patterns: z.array(z.string()) })).default([]),
      note: z.string().optional(),
    }),
    // "after_associate": the sequence covers only the credits after an associate degree.
    sequence_basis: z.enum(["full_program", "after_associate"]),
    entry_credits: z.number(),
    sequence: z.array(SequenceTerm),
    notes: z.array(z.string()).default([]),
    career: z
      .object({
        summary: z.string(),
        data_source: z.string().optional(),
        occupations: z.array(Occupation),
        with_bs: z.object({ note: z.string(), occupations: z.array(Occupation) }).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Program = z.infer<typeof Program>;

export const PathwaysFile = z
  .object({
    meta: z.object({ title: z.string(), as_of: z.string(), notes: z.string() }).passthrough(),
    cost_basis: z.record(z.string(), z.unknown()),
    transfer_rules: z.record(z.string(), z.unknown()),
    articulation_agreements: z.array(z.object({ mdc: z.string(), to: z.array(z.string()) }).passthrough()),
    course_credits: CourseCredits.optional(),
    general_education: GeneralEducation.optional(),
    programs: z.record(z.string(), Program).default({}),
    careers: z.array(Career),
  })
  .passthrough();
export type PathwaysFile = z.infer<typeof PathwaysFile>;

/* ------------------------------------------------------------------ */
/* Request from the UI → /api/personalize                              */
/* ------------------------------------------------------------------ */

export const PersonalizeRequest = z.object({
  careerId: CareerId,
  status: z.enum(["high-school", "new-mdc-student", "current-mdc-student", "career-changer"]),
  completedCourseCodes: z.array(z.string().max(12)).max(60).default([]),
  attendance: z.enum(["full-time", "part-time"]).default("full-time"),
  hoursWorkedPerWeek: z.number().int().min(0).max(80).optional(),
  goals: z.string().max(500).optional(),
});
export type PersonalizeRequest = z.infer<typeof PersonalizeRequest>;

/* ------------------------------------------------------------------ */
/* AI output (Plain-Language-Synthesizer) → validated, then sanitized  */
/* ------------------------------------------------------------------ */

export const PersonalizedPlan = z.object({
  pathwayChoice: z.object({
    code: z.string(), // must be the primary program, MDC bachelor, or an alternative_pathways code
    name: z.string(),
    reason: z.string(),
  }),
  summary: z.string(),
  adjustedTerms: z
    .array(
      z.object({
        label: z.string(), // "Term 1", "Term 2 (summer)", ...
        courseCodes: z.array(z.string()), // ONLY real course codes from the data
        otherRequirements: z.array(z.string()).default([]), // "Social science", "Electives (9)"
        note: z.string().default(""),
      })
    )
    .min(1)
    .max(16),
  warnings: z.array(z.string()).max(6).default([]),
  nextSteps: z.array(z.string()).min(1).max(3),
  advisorQuestions: z.array(z.string()).min(1).max(5),
});
export type PersonalizedPlan = z.infer<typeof PersonalizedPlan>;

export interface PersonalizeResponse {
  plan: PersonalizedPlan;
  unknownCodesRemoved: string[];
  fromCache: boolean;
}

/* ------------------------------------------------------------------ */
/* Tutor chat                                                          */
/* ------------------------------------------------------------------ */

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/* ------------------------------------------------------------------ */
/* Study buddy memory (stored in the browser's localStorage, no DB)    */
/* ------------------------------------------------------------------ */

const MemoryItem = z.string().min(1).max(160);

// What the Learner-Profiler agent returns. Also sent with every tutor request.
export const LearnerProfileFields = z.object({
  learningStyle: z.string().max(240).default(""), // e.g. "likes worked examples, short answers"
  goals: z.array(MemoryItem).max(5).default([]),
  strengths: z.array(MemoryItem).max(8).default([]),
  struggles: z.array(MemoryItem).max(8).default([]),
  topicsCovered: z.array(MemoryItem).max(15).default([]),
});
export type LearnerProfileFields = z.infer<typeof LearnerProfileFields>;

export const StoredLearnerProfile = LearnerProfileFields.extend({
  version: z.literal(1),
  questionsAsked: z.number().int().min(0).default(0),
  updatedAt: z.string(),
});
export type StoredLearnerProfile = z.infer<typeof StoredLearnerProfile>;

export const StudyArtifact = z.object({
  id: z.string(),
  careerId: CareerId,
  title: z.string().max(120),
  content: z.string().max(6000),
  createdAt: z.string(),
});
export type StudyArtifact = z.infer<typeof StudyArtifact>;

export const TutorRequest = z.object({
  careerId: CareerId,
  currentCourseCodes: z.array(z.string()).max(10).default([]),
  history: z.array(ChatMessage).max(40).default([]),
  question: z.string().min(1).max(4000),
  profile: LearnerProfileFields.optional(),
  questionsAsked: z.number().int().min(0).optional(),
});
export type TutorRequest = z.infer<typeof TutorRequest>;

export const ProfileUpdateRequest = z.object({
  careerId: CareerId,
  profile: LearnerProfileFields.optional(),
  history: z.array(ChatMessage).min(2).max(40),
});
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequest>;

/* ------------------------------------------------------------------ */
/* Storm alerts (NWS) + alert verification                             */
/* ------------------------------------------------------------------ */

// One official NWS alert, normalized from api.weather.gov GeoJSON.
export const AlertSchema = z.object({
  id: z.string(), // NWS URN, e.g. "urn:oid:2.49.0.1.840.0...."
  url: z.string(), // https://api.weather.gov/alerts/<id>
  event: z.string(), // "Hurricane Warning", "Flood Advisory", ...
  headline: z.string().nullable(),
  description: z.string(),
  instruction: z.string().nullable(),
  severity: z.string(),
  urgency: z.string(),
  certainty: z.string(),
  areaDesc: z.string(),
  senderName: z.string(),
  sent: z.string(),
  effective: z.string().nullable(),
  expires: z.string().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const AlertsSnapshot = z.object({
  alerts: z.array(AlertSchema),
  fetchedAt: z.string(), // ISO time the server fetched from NWS
});
export type AlertsSnapshot = z.infer<typeof AlertsSnapshot>;

export const VerifyLabel = z.enum(["verified", "suspicious", "unverified"]);
export type VerifyLabel = z.infer<typeof VerifyLabel>;

export interface VerifyResult {
  label: VerifyLabel;
  reasons: string[];
}

export const ExplainRequest = z.object({
  label: VerifyLabel,
  reasons: z.array(z.string().min(1).max(300)).min(1).max(12),
});
export type ExplainRequest = z.infer<typeof ExplainRequest>;

/* ------------------------------------------------------------------ */
/* Academic record (student's MAP / transcript, parsed in the browser) */
/* ------------------------------------------------------------------ */

export const RecordStatus = z.enum(["completed", "in_progress", "planned", "not_counted"]);
export type RecordStatus = z.infer<typeof RecordStatus>;

export const RecordCourse = z.object({
  code: z.string().regex(/^[A-Z]{3} \d{4}[A-Z]?$/), // "ENC 1101", "CGS 1060C"
  status: RecordStatus,
  grade: z.string().max(3).optional(),
  note: z.string().max(160).optional(),
});
export type RecordCourse = z.infer<typeof RecordCourse>;

// Only codes, statuses and grades are stored, never the pasted text (it can contain name / student ID).
export const StoredAcademicRecord = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  courses: z.array(RecordCourse).max(200),
});
export type StoredAcademicRecord = z.infer<typeof StoredAcademicRecord>;

export interface CreditRange {
  low: number;
  high: number;
}

// One semester of the primary program, prepared on the server for the progress tracker.
export interface PathProgressTerm {
  term: string;
  // codes normalized ("ENC1101"); empty = gen-ed/elective slot. title only for single-course entries.
  // credits from the catalog data; null when the data has no credit value for this entry.
  entries: {
    label: string;
    codes: string[];
    title: string | null;
    credits: CreditRange | null;
    prerequisites: string[]; // catalog text, e.g. "CTS 1134 or CTS 1650"
    corequisites: string[];
    area: GenEdAreaRule | null; // set when the entry is a gen-ed area slot ("Humanities")
  }[];
}

// A gen-ed area slot: any one listed option fills it, and each course fills only one slot.
// Codes may be prefix patterns ("CHM*").
export interface GenEdAreaRule {
  name: string; // "Humanities"
  rule: string | null;
  minGrade: string | null;
  source: string;
}

// One gen-ed requirement behind a "Gen-ed (15)" sequence slot, from the program's gen_ed list.
export interface GenEdRequirement {
  label: string; // "MAC 1105 or STA 2023", "Humanities"
  codes: string[]; // normalized; empty = any approved course in that area
  credits: CreditRange | null;
  area: GenEdAreaRule | null;
}

// One FIU prerequisite row: every part is required; a part is met by any one of its codes.
export interface FiuPrerequisite {
  parts: { label: string; codes: string[] }[];
  fiu: string;
  note: string | null;
}

export interface FiuPlan {
  degree: string;
  catalogYear: string | null;
  minGpa: number | null;
  admission: string[];
  prerequisites: FiuPrerequisite[];
  exception: string | null; // from transfer_rules.fiu_exceptions when it applies to this degree
  asNote: string | null; // transfer_rules.as_to_bachelors, shown when the primary program is an AS
  advising: string | null;
  // Conditional estimate (degree total minus a 60-credit AA), never a confirmed transfer award.
  remaining: {
    totalCredits: number;
    credits: number;
    note: string;
    source: string | null;
    ratePerCredit: number | null; // null when the credits span undergrad + grad rates
    rateTerm: string;
    splitAssumption: { undergrad: number; grad: number; note: string } | null;
  } | null;
  majorNote: string | null;
}

export type Division = "lower" | "upper";

export interface SwitchEntry {
  label: string;
  codes: string[]; // normalized; for gen-ed areas, the area's course options
  title: string | null;
  credits: CreditRange | null;
  division: Division | null;
  kind: "course" | "elective";
  prerequisites: string[];
}

export interface SwitchPrereq {
  code: string; // normalized
  label: string;
  title: string | null;
  credits: CreditRange | null;
  prerequisites: string[];
}

// Switching into another MDC program (e.g. Cybersecurity A.S. -> Applied AI A.S.), prepared on the server.
export interface SwitchPlan {
  label: string;
  fromLabel: string;
  fromCode: string;
  target: {
    code: string;
    name: string;
    degree: string;
    credits: number;
    label: string;
    effectiveTerm: string | null;
    basis: "full_program" | "after_associate";
    entryCredits: number;
  };
  admission: {
    priorDegree: string | null;
    minGpa: number | null;
    minGrade: string | null;
    prerequisites: SwitchPrereq[];
    notes: string[];
  };
  terms: { term: string; entries: SwitchEntry[] }[];
  electives: {
    slotCredits: number;
    slotCreditsBasis: string | null;
    division: Division | null; // null = could be either; cost shown as a range
    codes: string[]; // explicit options (normalized)
    lists: { label: string; patterns: string[] }[]; // a course counts for sure only if every list allows it
    note: string | null;
    recommended: string[];
  };
  genEdCredits: number | null;
  notes: string[];
  rates: { lower: number; upper: number; year: string };
  career: {
    summary: string;
    dataSource: string | null;
    occupations: { title: string; medianPay: number; outlookPct: number | null; entryEducation: string | null; source: string | null }[];
    withBs: { note: string; occupations: { title: string; medianPay: number; outlookPct: number | null }[] } | null;
  } | null;
  sources: string[];
}

// Everything the client needs to track one career's primary program against a student's record.
export interface ProgressPlan {
  careerId: CareerId;
  careerTitle: string;
  programLabel: string;
  programCredits: number;
  ratePerCredit: number; // MDC lower-division tuition per credit from cost_basis
  rateYear: string;
  terms: PathProgressTerm[];
  fiu: FiuPlan | null;
  switches: SwitchPlan[];
  knownCredits: Record<string, CreditRange>; // normalized code -> credits, across all catalog data
  knownTitles: Record<string, string>; // normalized code -> course title, across all catalog data
  knownPrerequisites: Record<string, string[]>; // normalized code -> catalog prerequisite text
  genEd: GenEdRequirement[]; // expands the "Gen-ed (N)" slot; empty when the program has none
  electives: { credits: number | null; prefixes: string[]; note: string | null } | null;
  competencies: string[]; // non-course graduation requirements (civic literacy, computer competency, ...)
}
