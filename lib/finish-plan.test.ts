import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFinishPlan, needsWork } from "./finish-plan";
import { getProgressPlan } from "./progress-plan";
import { scheduleTerms } from "./term-scheduler";
import type { RecordCourse, StoredAcademicRecord } from "./types";

const record = (courses: RecordCourse[]): StoredAcademicRecord => ({ version: 1, savedAt: "t", courses });
const plan = getProgressPlan("cybersecurity");
const student = record([
  { code: "CTS 1111", status: "completed", grade: "A" },
  { code: "CTS 1134", status: "completed", grade: "B" },
  { code: "CTS 1120", status: "in_progress" },
  { code: "ENC 1101", status: "completed", grade: "A" },
  { code: "COP 1047C", status: "completed", grade: "B" },
]);
const settings = { perTerm: 4, summer: 0, start: { season: "Spring" as const, year: 2027 }, blockClasses: {} };
const asToBs = plan.switches.findIndex((s) => s.target.code === "S9520" && s.fromCode === "25079");

describe("buildFinishPlan: own path", () => {
  const fp = buildFinishPlan(plan, student, { kind: "path", fiu: false });

  it("expands the Gen-ed (15) slot into the program's gen-ed list", () => {
    assert.deepEqual(
      fp.requirements.filter((r) => r.group === "gen_ed").map((r) => r.label),
      ["ENC 1101", "Humanities", "MAC 1105 or STA 2023", "Natural science", "AMH 2010 / AMH 2020 / POS 2041"]
    );
  });

  it("counts an off-path course toward electives when its prefix is allowed", () => {
    const electives = fp.requirements.find((r) => r.block)!;
    assert.deepEqual(electives.block?.fillers, ["COP 1047C"]);
    assert.equal(electives.block?.covered, 4);
    assert.ok(fp.carried.some((c) => c.course.code === "COP 1047C"));
  });

  it("subtracts carried credits: 60 - (4+4+4 program + 4 elective + 3 ENC 1101) = 41", () => {
    assert.deepEqual(fp.totals.remaining, { low: 41, high: 41 });
  });
});

describe("buildFinishPlan: Cybersecurity A.S. then Applied AI B.S.", () => {
  const fp = buildFinishPlan(plan, student, { kind: "switch", index: asToBs });

  it("finishes the A.S. first, then the B.S.", () => {
    assert.equal(fp.phases.length, 2);
    assert.ok(fp.requirements.filter((r) => r.phase === 1).every((r) => r.group !== "admission"));
  });

  it("folds B.S. prerequisites into the A.S. electives and gen-ed choice", () => {
    const cai = fp.requirements.find((r) => r.label === "CAI 1001C")!;
    assert.equal(cai.group, "electives");
    assert.equal(cai.phase, 0);
    const mac = fp.requirements.find((r) => r.group === "admission" && r.label === "MAC 1105")!;
    assert.match(mac.mergedInto ?? "", /MAC 1105 or STA 2023/);
  });

  it("doesn't reuse A.S. courses as B.S. electives", () => {
    const bsElectives = fp.requirements.filter((r) => r.phase === 1 && r.group === "electives");
    assert.ok(bsElectives.every((r) => r.status === "remaining"));
  });

  it("schedules every B.S. class after every A.S. class, respecting prerequisites", () => {
    const s = scheduleTerms(fp, student, settings);
    assert.equal(s.unscheduled.length, 0);
    const termOf = new Map(s.terms.flatMap((t, i) => t.classes.map((c) => [c.label, i] as const)));
    const lastPhase0 = Math.max(...s.terms.flatMap((t, i) => t.classes.filter((c) => c.phase === 0).map(() => i)));
    const firstPhase1 = Math.min(...s.terms.flatMap((t, i) => t.classes.filter((c) => c.phase === 1).map(() => i)));
    assert.ok(lastPhase0 < firstPhase1);
    assert.ok(termOf.get("CAI 1001C")! < termOf.get("CAI 2100C")!);
    assert.ok(termOf.get("CAI 2100C")! < termOf.get("CAI 2300C")!);
    assert.ok(termOf.get("COP 2800")! < termOf.get("COP 3530")!);
    assert.ok(s.terms.every((t) => t.classes.length <= 4));
  });
});

describe("gen-ed areas from the shared MDC gen-ed data", () => {
  it("fills an A.S. Humanities slot from the State Core list, 3 credits", () => {
    const hum = plan.genEd.find((g) => g.label === "Humanities")!;
    assert.deepEqual(hum.codes, ["ARH1000", "HUM1020", "LIT2000", "MUL1010", "PHI2010", "THE2000"]);
    assert.deepEqual(hum.credits, { low: 3, high: 3 });
    const fp = buildFinishPlan(plan, record([{ code: "PHI 2010", status: "completed", grade: "B" }]), { kind: "path", fiu: false });
    assert.equal(fp.requirements.find((r) => r.label === "Humanities")?.status, "done");
  });

  it("flags a gen-ed course below C", () => {
    const fp = buildFinishPlan(plan, record([{ code: "PHI 2010", status: "completed", grade: "D" }]), { kind: "path", fiu: false });
    assert.equal(fp.requirements.find((r) => r.label === "Humanities")?.status, "low_grade");
    assert.ok(!fp.carried.some((c) => c.course.code === "PHI 2010"));
  });

  it("uses the program's own gen-ed entry for a bare A.S. slot", () => {
    const social = getProgressPlan("it_consultant").terms.flatMap((t) => t.entries).find((e) => e.label === "Social science")!;
    assert.deepEqual(social.codes, ["AMH2010", "AMH2020", "POS2041"]);
  });

  it("needs a different course for each of two A.A. Humanities slots", () => {
    const mech = getProgressPlan("mechanical_engineer");
    const one = buildFinishPlan(mech, record([{ code: "PHI 2010", status: "completed", grade: "A" }]), { kind: "path", fiu: false });
    assert.deepEqual(one.requirements.filter((r) => r.label === "Humanities").map((r) => r.status), ["done", "remaining"]);
    const two = buildFinishPlan(
      mech,
      record([
        { code: "PHI 2010", status: "completed", grade: "A" },
        { code: "ARH 2050", status: "completed", grade: "A" },
      ]),
      { kind: "path", fiu: false }
    );
    assert.deepEqual(two.requirements.filter((r) => r.label === "Humanities").map((r) => r.status), ["done", "done"]);
  });

  it("lists civic literacy for every program and A.A. competencies only for the A.A.", () => {
    assert.ok(plan.competencies.some((c) => c.startsWith("Civic literacy")));
    assert.ok(!plan.competencies.some((c) => c.startsWith("Foreign language")));
    assert.ok(getProgressPlan("architect").competencies.some((c) => c.startsWith("Foreign language")));
  });
});

describe("scheduleTerms", () => {
  const fp = buildFinishPlan(plan, student, { kind: "path", fiu: false });

  it("uses the student's pace and skips summer when summer is 0", () => {
    const s = scheduleTerms(fp, student, { ...settings, perTerm: 2 });
    assert.ok(s.terms.every((t) => t.classes.length <= 2 && t.season !== "Summer"));
    assert.equal(
      s.terms.reduce((n, t) => n + t.classes.length, 0),
      fp.requirements.filter(needsWork).length - 1 + 2 // the 5 open elective credits default to 2 classes
    );
  });

  it("adds summer terms when asked", () => {
    const s = scheduleTerms(fp, student, { ...settings, summer: 1 });
    assert.equal(s.terms[1].season, "Summer");
    assert.equal(s.terms[1].classes.length, 1);
  });

  it("splits a credit block into whole-credit classes", () => {
    const block = fp.requirements.find((r) => r.block)!;
    const s = scheduleTerms(fp, student, { ...settings, blockClasses: { [block.id]: 2 } });
    const parts = s.terms.flatMap((t) => t.classes).filter((c) => c.requirementId === block.id);
    assert.deepEqual(
      parts.map((c) => c.credits?.low),
      [3, 2]
    );
  });
});
