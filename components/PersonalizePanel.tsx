"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CareerId, PersonalizedPlan, PersonalizeResponse } from "@/lib/types";
import { CourseChip } from "@/components/CourseChip";
import { onPlanRemaining, useAcademicRecord, type PlanRemainingRequest } from "@/lib/academic-record";
import { plannedDoneCodes } from "@/lib/progress";
import { normalizeRecordCode } from "@/lib/record-parse";

const STATUSES = [
  { value: "high-school", label: "High school" },
  { value: "new-mdc-student", label: "New MDC student" },
  { value: "current-mdc-student", label: "Current MDC student" },
  { value: "career-changer", label: "Career changer" },
] as const;

type Status = (typeof STATUSES)[number]["value"];

interface RunParams {
  status: Status;
  completedCourseCodes: string[];
  goals: string;
}

const AGENTS = ["Interpreting your profile", "Adjusting your path", "Writing your plan"] as const;

export function PersonalizePanel({
  careerId,
  courseOptions,
}: {
  careerId: CareerId;
  courseOptions: string[];
}) {
  const uniqueCourses = useMemo(() => [...new Set(courseOptions)].sort(), [courseOptions]);
  const [status, setStatus] = useState<Status>("new-mdc-student");
  const [attendance, setAttendance] = useState<"full-time" | "part-time">("full-time");
  const record = useAcademicRecord();
  const fromRecord = useMemo(() => {
    const done = plannedDoneCodes(record, true);
    return new Set(uniqueCourses.filter((c) => done.has(normalizeRecordCode(c))));
  }, [record, uniqueCourses]);
  const sectionRef = useRef<HTMLElement>(null);
  // Manual chip toggles win over the saved record.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isCompleted = (code: string) => overrides[code] ?? fromRecord.has(code);
  const completed = uniqueCourses.filter(isCompleted);
  const [hours, setHours] = useState("");
  const [goals, setGoals] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(PersonalizeResponse & { plan: PersonalizedPlan }) | null>(null);

  function toggleCourse(code: string) {
    setOverrides((prev) => ({ ...prev, [code]: !isCompleted(code) }));
  }

  async function run({ status, completedCourseCodes, goals }: RunParams) {
    setError(null);
    setLoading(true);
    setAgentStep(0);
    const timer = setInterval(() => {
      setAgentStep((s) => Math.min(s + 1, AGENTS.length - 1));
    }, 1200);

    try {
      const res = await fetch("/api/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careerId,
          status,
          attendance,
          completedCourseCodes,
          hoursWorkedPerWeek: hours === "" ? undefined : Number(hours),
          goals: goals.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Personalization failed");
      setResult(data);
      setAgentStep(AGENTS.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Personalization failed");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run({ status, completedCourseCodes: completed, goals });
  }

  // "Plan what's left" in the progress tracker: use the whole record and run right away.
  const planRemaining = useEffectEvent(({ goal }: PlanRemainingRequest) => {
    const nextGoals = goal ?? goals;
    setStatus("current-mdc-student");
    setOverrides({});
    setGoals(nextGoals);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    void run({ status: "current-mdc-student", completedCourseCodes: [...fromRecord], goals: nextGoals });
  });
  useEffect(() => onPlanRemaining(planRemaining), []);

  return (
    <section ref={sectionRef} className="scroll-mt-20 my-10 border border-mdc-blue/40 bg-white/70 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-mdc-ink">Personalize my path</h2>
      <p className="mt-2 text-sm text-mdc-muted">
        A three-agent Swarms pipeline adjusts the catalog path to your situation. Results are labeled AI and
        course codes are verified.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-mdc-muted">Status</span>
          <select
            className="mt-1 w-full border border-mdc-line bg-white px-3 py-2 text-mdc-ink"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-mdc-muted">Attendance</span>
          <select
            className="mt-1 w-full border border-mdc-line bg-white px-3 py-2 text-mdc-ink"
            value={attendance}
            onChange={(e) => setAttendance(e.target.value as "full-time" | "part-time")}
          >
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-mdc-muted">Hours worked / week</span>
          <input
            type="number"
            min={0}
            max={80}
            className="mt-1 w-full border border-mdc-line bg-white px-3 py-2 text-mdc-ink"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-mdc-muted">Goal (optional)</span>
          <input
            className="mt-1 w-full border border-mdc-line bg-white px-3 py-2 text-mdc-ink"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            maxLength={500}
            placeholder="e.g. Transfer to FIU while working nights"
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm text-mdc-muted">
            Already completed (from this pathway)
            {fromRecord.size ? ` · ${fromRecord.size} filled in from your saved MAP (completed or in progress)` : ""}
          </legend>
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {uniqueCourses.map((code) => {
              const on = isCompleted(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCourse(code)}
                  className={`px-2 py-1 text-xs ${
                    on ? "bg-mdc-blue text-white" : "border border-mdc-line text-mdc-muted hover:border-mdc-blue"
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={loading}
          className="sm:col-span-2 rounded-full bg-mdc-blue px-4 py-3 font-bold text-white hover:bg-mdc-blue-bright disabled:opacity-60"
        >
          {loading ? "Running swarm…" : "Personalize"}
        </button>
      </form>

      {loading ? (
        <ol className="mt-6 space-y-2 text-sm">
          {AGENTS.map((label, i) => (
            <li key={label} className={i <= agentStep ? "agent-lit font-semibold" : "text-mdc-muted/50"}>
              {label}
              {i < AGENTS.length - 1 ? " →" : ""}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <p className="mt-4 text-sm text-mdc-blue">{error}</p> : null}

      {result ? (
        <div className="mt-8 border border-mdc-blue/50 bg-white/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-amber">
            Your personalized plan (AI){result.fromCache ? " · cached" : ""}
          </p>
          <h3 className="mt-2 font-display text-lg font-bold text-mdc-ink">
            {result.plan.pathwayChoice.name}{" "}
            <span className="text-sm font-normal text-mdc-muted">({result.plan.pathwayChoice.code})</span>
          </h3>
          <p className="mt-1 text-sm text-mdc-muted">{result.plan.pathwayChoice.reason}</p>
          <p className="mt-4 text-mdc-ink">{result.plan.summary}</p>
          <ol className="mt-6 space-y-4">
            {result.plan.adjustedTerms.map((t) => (
              <li key={t.label}>
                <p className="font-semibold text-mdc-blue">{t.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.courseCodes.map((c) => (
                    <CourseChip key={c} careerId={careerId} codeOrLabel={c} />
                  ))}
                  {t.otherRequirements.map((r) => (
                    <span key={r} className="border border-mdc-line px-2 py-1 text-xs text-mdc-muted">
                      {r}
                    </span>
                  ))}
                </div>
                {t.note ? <p className="mt-1 text-xs text-mdc-muted">{t.note}</p> : null}
              </li>
            ))}
          </ol>
          {result.plan.warnings.length ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber">
              {result.plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <h4 className="mt-4 text-sm font-semibold text-mdc-ink">Next steps</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-mdc-muted">
            {result.plan.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <h4 className="mt-4 text-sm font-semibold text-mdc-ink">Ask an advisor</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mdc-muted">
            {result.plan.advisorQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          {result.unknownCodesRemoved.length ? (
            <p className="mt-3 text-xs text-mdc-muted">
              Removed unverified codes: {result.unknownCodesRemoved.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
