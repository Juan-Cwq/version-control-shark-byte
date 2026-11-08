import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAcademicRecord } from "./record-parse";

const statusOf = (text: string) => Object.fromEntries(parseAcademicRecord(text).map((c) => [c.code, c.status]));

describe("parseAcademicRecord: transcript style", () => {
  it("reads grades after the credits column", () => {
    const courses = parseAcademicRecord(
      [
        "Fall 2024",
        "ENC1101 ENGLISH COMPOSITION 1 3.00 3.00 A 12.00",
        "MAC 1105 COLLEGE ALGEBRA 3.00 3.00 D 3.00",
        "CTS 1134 NETWORKING TECHNOLOGIES 4.00 0.00 W 0.00",
        "SLS 1106 FIRST YEAR EXPERIENCE 1.00 1.00 P",
      ].join("\n")
    );
    assert.deepEqual(
      courses.map((c) => [c.code, c.status, c.grade]),
      [
        ["ENC 1101", "completed", "A"],
        ["MAC 1105", "completed", "D"],
        ["CTS 1134", "not_counted", "W"],
        ["SLS 1106", "completed", "P"],
      ]
    );
    assert.match(courses[1].note ?? "", /below C/);
  });

  it("keeps the passing attempt of a retaken course", () => {
    const courses = parseAcademicRecord("MAC 1105 COLLEGE ALGEBRA 3.00 F\nMAC 1105 COLLEGE ALGEBRA 3.00 B+");
    assert.equal(courses.length, 1);
    assert.equal(courses[0].grade, "B+");
    assert.equal(courses[0].status, "completed");
  });

  it("marks IP grades as in progress", () => {
    assert.deepEqual(statusOf("CIS 1531 INTRO TO SECURE SCRIPTING 3.00 IP"), { "CIS 1531": "in_progress" });
  });
});

describe("parseAcademicRecord: MAP style", () => {
  it("reads status words on each line", () => {
    assert.deepEqual(
      statusOf(
        [
          "Term 1  ENC 1101 English Composition 1  3  Completed",
          "Term 2  ENC 1102 English Composition 2  3  In Progress",
          "Term 3  CGS 1060C Intro to Computer Technology  4  Planned",
          "Term 3  SPC 2608 Public Speaking  3  Still needed",
        ].join("\n")
      ),
      { "ENC 1101": "completed", "ENC 1102": "in_progress", "CGS 1060C": "planned", "SPC 2608": "planned" }
    );
  });

  it("applies section headers to the courses listed under them", () => {
    assert.deepEqual(
      statusOf(
        [
          "Completed Courses",
          "CTS 1111 Linux+",
          "CTS 1120 Cybersecurity Fundamentals",
          "Planned Courses",
          "CIS 2350 Cybersecurity Analysis",
        ].join("\n")
      ),
      { "CTS 1111": "completed", "CTS 1120": "completed", "CIS 2350": "planned" }
    );
  });

  it("treats checkmarks as completed and 'not satisfied' as planned", () => {
    assert.deepEqual(statusOf("✓ PHY 2053 Physics 1\nPHY 2053L Physics 1 Lab - Not Satisfied"), {
      "PHY 2053": "completed",
      "PHY 2053L": "planned",
    });
  });
});

describe("parseAcademicRecord: edge cases", () => {
  it("ignores term labels and does not read a Roman numeral title as a grade", () => {
    assert.deepEqual(statusOf("SUM 2025\nFAL 2025\nARC 1301 ARCHITECTURAL DESIGN I"), { "ARC 1301": "planned" });
  });

  it("reads several codes on one line separately", () => {
    assert.deepEqual(statusOf("MAC 1105 3.00 A   STA 2023 3.00 W"), { "MAC 1105": "completed", "STA 2023": "not_counted" });
  });

  it("returns nothing for text without course codes", () => {
    assert.deepEqual(parseAcademicRecord("Name: Jane Doe\nStudent ID 1234567\nGPA 3.5"), []);
  });
});
