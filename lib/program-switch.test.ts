import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProgressPlan } from "./progress-plan";
import { summarizeSwitch } from "./program-switch";
import type { RecordCourse, StoredAcademicRecord } from "./types";

const record = (courses: RecordCourse[]): StoredAcademicRecord => ({ version: 1, savedAt: "t", courses });
const plan = getProgressPlan("cybersecurity");
const toAs = plan.switches.find((s) => s.target.code === "25080")!;
const toBs = plan.switches.find((s) => s.fromLabel.includes("S9515"))!;

describe("cybersecurity program switches", () => {
  it("offers the three Applied AI paths", () => {
    assert.equal(plan.switches.length, 3);
    assert.deepEqual(
      plan.switches.map((s) => s.target.code),
      ["25080", "S9520", "S9520"]
    );
  });

  it("prices the whole Applied AI A.S. at 60 lower-division credits with no record", () => {
    const s = summarizeSwitch(toAs, null, plan.knownCredits);
    assert.deepEqual(s.remaining, { low: 60, high: 60 });
    assert.deepEqual(s.cost, { low: 7093.2, high: 7093.2 });
    assert.deepEqual(s.unknownCredits, []);
  });

  it("matches the B.S. tuition estimate in the program data after an associate degree", () => {
    const allPrereqs = toBs.admission.prerequisites.map((p): RecordCourse => ({ code: p.label, status: "completed", grade: "A" }));
    const s = summarizeSwitch(toBs, record(allPrereqs), plan.knownCredits);
    assert.deepEqual(s.remaining, { low: 60, high: 60 });
    assert.deepEqual(s.cost, { low: 7501.65, high: 7676.7 });
  });

  it("adds missing admission prerequisites and flags grades below C", () => {
    const s = summarizeSwitch(
      toBs,
      record([
        { code: "CAI 1001C", status: "completed", grade: "D" },
        { code: "MAC 1105", status: "in_progress" },
      ]),
      plan.knownCredits
    );
    assert.deepEqual(
      s.prereqs.map((p) => p.state),
      ["low_grade", "remaining", "remaining", "remaining", "in_progress", "remaining"]
    );
    // CAI 1001C 3 + CAI 2100C 3 + CAI 2300C 3 + COP 1047C 4 + STA 2023 3 = 16 on top of the 60.
    assert.deepEqual(s.remaining, { low: 76, high: 76 });
  });

  it("carries cybersecurity courses into Applied AI electives", () => {
    const s = summarizeSwitch(
      toAs,
      record([
        { code: "CTS 1120", status: "completed" },
        { code: "ENC 1101", status: "completed" },
        { code: "CTS 1134", status: "completed" },
      ]),
      plan.knownCredits
    );
    assert.deepEqual(
      s.carried.map((c) => c.code),
      ["CTS 1120", "ENC 1101"]
    );
    assert.deepEqual(s.electives.covered, { low: 4, high: 4 });
    assert.deepEqual(s.remaining, { low: 53, high: 53 });
  });

  it("treats electives allowed by only one B.S. list as a range", () => {
    // CIS courses are allowed by the 2026 sequence guide but not the 2024 program sheet.
    const s = summarizeSwitch(toBs, record([{ code: "CIS 3360", status: "completed" }]), plan.knownCredits);
    assert.equal(s.electives.matches[0].sure, false);
    assert.deepEqual(s.electives.covered, { low: 0, high: 4 });
  });
});
