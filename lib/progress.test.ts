import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entryProgress, plannedDoneCodes, prerequisiteProgress, recordByCode, summarizeProgress } from "./progress";
import type { FiuPrerequisite, ProgressPlan, RecordCourse, StoredAcademicRecord } from "./types";

// Test-only fixture shaped like a ProgressPlan; real plans are built from mdc_pathways.json.
const PLAN: ProgressPlan = {
  careerId: "it_consultant",
  careerTitle: "Fixture career",
  programLabel: "AS · Fixture (00000) · 20 credits",
  programCredits: 20,
  ratePerCredit: 100,
  rateYear: "test",
  fiu: null,
  switches: [],
  knownCredits: {},
  knownTitles: {},
  knownPrerequisites: {},
  genEd: [],
  electives: null,
  competencies: [],
  terms: [
    {
      term: "Term 1",
      entries: [
        { label: "AAA 1000", codes: ["AAA1000"], title: null, credits: { low: 3, high: 3 }, prerequisites: [], corequisites: [], area: null },
        { label: "BBB 1000 or BBB 2000", codes: ["BBB1000", "BBB2000"], title: null, credits: { low: 3, high: 4 }, prerequisites: [], corequisites: [], area: null },
        { label: "CCC 1000", codes: ["CCC1000"], title: null, credits: null, prerequisites: [], corequisites: [], area: null },
        { label: "Electives (9)", codes: [], title: null, credits: null, prerequisites: [], corequisites: [], area: null },
      ],
    },
  ],
};

const record = (courses: RecordCourse[]): StoredAcademicRecord => ({ version: 1, savedAt: "t", courses });

describe("summarizeProgress", () => {
  it("counts done, in progress and slots, and prices the credits left", () => {
    const s = summarizeProgress(
      PLAN,
      record([
        { code: "AAA 1000", status: "completed" },
        { code: "BBB 2000", status: "in_progress" },
      ])
    );
    assert.equal(s.required, 3);
    assert.equal(s.done, 1);
    assert.equal(s.inProgress, 1);
    assert.equal(s.slots, 1);
    assert.deepEqual(s.covered, { low: 6, high: 7 });
    assert.deepEqual(s.remaining, { low: 13, high: 14 });
    assert.deepEqual(s.cost, { low: 1300, high: 1400 });
  });

  it("doesn't subtract courses the data has no credits for, and names them", () => {
    const s = summarizeProgress(PLAN, record([{ code: "CCC 1000", status: "completed" }]));
    assert.deepEqual(s.remaining, { low: 20, high: 20 });
    assert.deepEqual(s.noCreditData, ["CCC 1000"]);
  });

  it("ignores withdrawn courses and lists completed courses outside the path", () => {
    const s = summarizeProgress(
      PLAN,
      record([
        { code: "AAA 1000", status: "not_counted", grade: "W" },
        { code: "ZZZ 1000", status: "completed" },
      ])
    );
    assert.equal(s.done, 0);
    assert.deepEqual(
      s.otherCompleted.map((c) => c.code),
      ["ZZZ 1000"]
    );
  });
});

describe("prerequisiteProgress", () => {
  const prereq: FiuPrerequisite = {
    parts: [
      { label: "PHY 2053", codes: ["PHY2053"] },
      { label: "PHY 2053L", codes: ["PHY2053L"] },
    ],
    fiu: "PHY 2053, PHY 2048L",
    note: null,
  };

  it("needs every part of a multi-part prerequisite", () => {
    const partial = recordByCode(record([{ code: "PHY 2053", status: "completed" }]));
    assert.equal(prerequisiteProgress(prereq, partial), "remaining");
    const full = recordByCode(
      record([
        { code: "PHY 2053", status: "completed" },
        { code: "PHY 2053L", status: "in_progress" },
      ])
    );
    assert.equal(prerequisiteProgress(prereq, full), "in_progress");
  });
});

describe("entryProgress with prefix patterns", () => {
  it("matches any course with the prefix except lab units, and skips used courses", () => {
    const byCode = recordByCode(record([{ code: "CHM 1045L", status: "completed" }, { code: "CHM 2210", status: "completed" }]));
    assert.equal(entryProgress(["CHM*"], byCode).match?.code, "CHM 2210");
    assert.equal(entryProgress(["CHM*"], byCode, new Set(["CHM2210"])).state, "remaining");
  });
});

describe("plannedDoneCodes", () => {
  it("adds in-progress courses only when asked", () => {
    const r = record([
      { code: "AAA 1000", status: "completed" },
      { code: "BBB 1000", status: "in_progress" },
      { code: "CCC 1000", status: "planned" },
    ]);
    assert.deepEqual([...plannedDoneCodes(r, false)], ["AAA1000"]);
    assert.deepEqual([...plannedDoneCodes(r, true)], ["AAA1000", "BBB1000"]);
  });
});
