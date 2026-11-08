"use client";

import { useMemo, useState } from "react";
import { openBlockCredits, type FinishPlan } from "@/lib/finish-plan";
import {
  defaultBlockClasses,
  defaultStart,
  scheduleTerms,
  type ScheduleSettings,
  type Season,
} from "@/lib/term-scheduler";
import type { StoredAcademicRecord } from "@/lib/types";

const SEASONS: Season[] = ["Spring", "Summer", "Fall"];

function upcomingTerms(count: number) {
  const first = defaultStart(new Date());
  const out: { season: Season; year: number }[] = [];
  let si = SEASONS.indexOf(first.season);
  let year = first.year;
  while (out.length < count) {
    out.push({ season: SEASONS[si], year });
    si = (si + 1) % 3;
    if (si === 0) year++;
  }
  return out;
}

const fieldClass = "mt-1 w-full border border-mdc-line bg-white px-2 py-1.5 text-sm text-mdc-ink focus:border-mdc-blue focus:outline-none";

export function SemesterPlanner({ plan, record }: { plan: FinishPlan; record: StoredAcademicRecord }) {
  const terms = useMemo(() => upcomingTerms(6), []);
  const blocks = plan.requirements.filter((r) => r.block && openBlockCredits(r.block) > 0);
  const [perTerm, setPerTerm] = useState("");
  const [summer, setSummer] = useState("0");
  const [start, setStart] = useState(0);
  const [blockClasses, setBlockClasses] = useState<Record<string, string>>({});
  const [built, setBuilt] = useState(false);

  const perTermN = Number(perTerm);
  const valid = Number.isInteger(perTermN) && perTermN >= 1 && perTermN <= 8;
  const settings: ScheduleSettings = {
    perTerm: perTermN,
    summer: Math.max(0, Math.min(6, Number(summer) || 0)),
    start: terms[start],
    blockClasses: Object.fromEntries(
      blocks.map((b) => [b.id, Math.max(1, Number(blockClasses[b.id] ?? defaultBlockClasses(b)) || 1)])
    ),
  };
  const schedule = built && valid ? scheduleTerms(plan, record, settings) : null;
  const total = schedule?.terms.reduce((n, t) => n + t.classes.length, 0) ?? 0;
  const last = schedule?.terms.at(-1);

  return (
    <div>
      <form
        className="grid gap-3 border border-mdc-line bg-white/70 p-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setBuilt(true);
        }}
      >
        <label className="text-xs font-semibold text-mdc-ink">
          Classes per fall/spring semester
          <input
            type="number"
            min={1}
            max={8}
            required
            inputMode="numeric"
            placeholder="e.g. 4"
            value={perTerm}
            onChange={(e) => setPerTerm(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-semibold text-mdc-ink">
          Summer classes (0 = no summer)
          <input
            type="number"
            min={0}
            max={6}
            inputMode="numeric"
            value={summer}
            onChange={(e) => setSummer(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-semibold text-mdc-ink">
          Start
          <select value={start} onChange={(e) => setStart(Number(e.target.value))} className={fieldClass}>
            {terms.map((t, i) => (
              <option key={`${t.season}${t.year}`} value={i}>
                {t.season} {t.year}
              </option>
            ))}
          </select>
        </label>
        {blocks.map((b) => (
          <label key={b.id} className="text-xs font-semibold text-mdc-ink sm:col-span-3">
            {b.label}: {openBlockCredits(b.block!)} credits still open. How many classes will you use for them?
            <input
              type="number"
              min={1}
              max={6}
              inputMode="numeric"
              value={blockClasses[b.id] ?? String(defaultBlockClasses(b))}
              onChange={(e) => setBlockClasses((prev) => ({ ...prev, [b.id]: e.target.value }))}
              className={`${fieldClass} sm:w-24`}
            />
          </label>
        ))}
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={!valid}
            className="rounded-full bg-mdc-blue px-5 py-2 text-sm font-bold text-white hover:bg-mdc-blue-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {built ? "Update my semester plan" : "Build my semester plan"}
          </button>
          {!valid && perTerm ? <span className="ml-3 text-xs text-amber">Enter 1 to 8 classes.</span> : null}
        </div>
      </form>

      {schedule ? (
        <div className="mt-4">
          <p className="text-sm text-mdc-ink">
            <span className="font-semibold">
              {total} classes over {schedule.terms.length} term{schedule.terms.length === 1 ? "" : "s"}
            </span>
            {last ? ` · last term ${last.label}` : ""}
          </p>
          <p className="mt-1 text-xs text-mdc-muted">
            Follows the catalog sequence at your pace, starts long prerequisite chains first, and waits for each
            course&apos;s prerequisites. In-progress courses are assumed passed. Class availability varies by term and
            campus.
          </p>
          <ol className="mt-3 space-y-3">
            {schedule.terms.map((t, ti) => {
              const phase = t.classes[0]?.phase ?? 0;
              const newPhase = ti > 0 && phase !== (schedule.terms[ti - 1].classes[0]?.phase ?? 0);
              return (
                <li key={t.label}>
                  {newPhase && plan.phases[phase] ? (
                    <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Starts here: {plan.phases[phase].label}
                    </p>
                  ) : null}
                  <div className="border border-mdc-line bg-white/70 p-3">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-base font-bold text-mdc-ink">{t.label}</span>
                      <span className="text-xs text-mdc-muted">
                        {t.classes.length} class{t.classes.length === 1 ? "" : "es"} ·{" "}
                        {t.credits.low === t.credits.high ? t.credits.low : `${t.credits.low}–${t.credits.high}`} credits
                        {t.unknownCredits ? ` + ${t.unknownCredits} with credits not listed` : ""}
                      </span>
                    </p>
                    <ul className="mt-2 space-y-2">
                      {t.classes.map((c) => (
                        <li key={c.key} className="text-sm">
                          <p className="text-mdc-ink">
                            <span className={`font-semibold ${c.retake ? "text-amber" : ""}`}>{c.label}</span>
                            {c.title ? <span className="text-mdc-muted"> · {c.title}</span> : null}
                            {c.credits ? (
                              <span className="text-xs text-mdc-muted">
                                {" "}
                                · {c.credits.low === c.credits.high ? c.credits.low : `${c.credits.low}–${c.credits.high}`} cr
                              </span>
                            ) : null}
                          </p>
                          {c.unlocks.length ? (
                            <p className="text-xs text-mdc-muted">Unlocks: {c.unlocks.join(", ")}</p>
                          ) : null}
                          {c.warnings.map((w) => (
                            <p key={w} className="text-xs text-amber">
                              {w}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
          {schedule.unscheduled.length ? (
            <p className="mt-3 text-sm text-amber">
              Couldn&apos;t fit within {schedule.terms.length} terms: {schedule.unscheduled.map((c) => c.label).join(", ")}.
              Try more classes per term.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-mdc-muted">
          Enter how many classes you&apos;ll take each semester to see exactly which classes go in each term.
        </p>
      )}
    </div>
  );
}
