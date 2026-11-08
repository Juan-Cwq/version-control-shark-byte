"use client";

import { useEffect, useRef } from "react";
import { RequirementList } from "@/components/RequirementList";
import { SemesterPlanner } from "@/components/SemesterPlanner";
import { formatUsd } from "@/lib/format";
import { buildFinishPlan, needsWork, type PlanSource } from "@/lib/finish-plan";
import type { CreditRange, ProgressPlan, StoredAcademicRecord } from "@/lib/types";

const range = ({ low, high }: CreditRange, f: (n: number) => string = String) =>
  low === high ? f(low) : `${f(low)}–${f(high)}`;
const dollars = (n: number) => formatUsd(Math.round(n));

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-mdc-line bg-white/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-mdc-blue">{label}</p>
      <p className="mt-0.5 font-display text-xl font-bold text-mdc-ink">{value}</p>
      {sub ? <p className="text-xs text-mdc-muted">{sub}</p> : null}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold text-mdc-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mdc-blue text-xs text-white">{n}</span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PlanDrawer({
  plan,
  record,
  source,
  onClose,
  onAskAi,
}: {
  plan: ProgressPlan;
  record: StoredAcademicRecord;
  source: PlanSource;
  onClose: () => void;
  onAskAi: (() => void) | null;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const fp = buildFinishPlan(plan, record, source);
  const left = fp.requirements.filter(needsWork);
  const inProgress = fp.carried.filter((c) => c.course.status === "in_progress");

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close plan" onClick={onClose} className="absolute inset-0 bg-mdc-ink/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-drawer-title"
        className="relative flex h-full w-full max-w-2xl flex-col bg-mdc-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-mdc-line bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Your plan to finish</p>
            <h2 id="plan-drawer-title" className="font-display text-xl font-bold text-mdc-ink">
              {fp.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 border border-mdc-line px-3 py-1 text-sm text-mdc-muted hover:border-mdc-blue hover:text-mdc-blue"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-10 pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Carry over" value={String(fp.carried.length)} sub={inProgress.length ? `${inProgress.length} in progress` : "courses"} />
            <Stat label="Still needed" value={String(left.length)} sub="requirements" />
            <Stat label="Credits left" value={range(fp.totals.remaining)} sub="about" />
            <Stat label="Est. tuition" value={range(fp.totals.cost, dollars)} sub="MDC, before fees" />
          </div>
          <p className="mt-2 text-xs text-mdc-muted">{fp.totals.rateNote}</p>

          <Section n={1} title="Courses that carry over">
            {fp.carried.length ? (
              <div className="overflow-x-auto border border-mdc-line bg-white/70">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-mdc-muted">
                    <tr className="border-b border-mdc-line">
                      <th className="px-3 py-2 font-semibold">Course</th>
                      <th className="px-3 py-2 font-semibold">Credits</th>
                      <th className="px-3 py-2 font-semibold">Grade</th>
                      <th className="px-3 py-2 font-semibold">Counts as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fp.carried.map((c) => (
                      <tr key={c.course.code} className="border-b border-mdc-line/70 last:border-0 align-top">
                        <td className="px-3 py-2">
                          <span className="font-semibold text-mdc-ink">{c.course.code}</span>
                          {c.title ? <span className="block text-xs text-mdc-muted">{c.title}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-mdc-ink">{c.credits ? range(c.credits) : "—"}</td>
                        <td className="px-3 py-2">
                          {c.course.status === "in_progress" ? (
                            <span className="text-amber">In progress</span>
                          ) : (
                            <span className="text-mdc-ink">{c.course.grade ?? "—"}</span>
                          )}
                          {c.course.note ? <span className="block text-xs text-amber">{c.course.note}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-mdc-ink">{c.countsAs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-mdc-muted">None of your saved courses match this plan yet.</p>
            )}
            {fp.unused.length ? (
              <p className="mt-2 text-xs text-mdc-muted">
                Completed but not counted here: {fp.unused.map((c) => c.code).join(", ")}. An advisor may be able to
                apply some of them to gen-ed or electives.
              </p>
            ) : null}
          </Section>

          <Section n={2} title="What you still need">
            <RequirementList plan={fp} record={record} />
            {fp.notes.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-mdc-muted">
                {fp.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section n={3} title="Your semester-by-semester plan">
            <SemesterPlanner key={fp.title} plan={fp} record={record} />
          </Section>

          <div className="mt-8 border-t border-mdc-line pt-4">
            {onAskAi ? (
              <button
                type="button"
                onClick={onAskAi}
                className="rounded-full border border-mdc-blue px-4 py-1.5 text-sm font-semibold text-mdc-blue hover:bg-mdc-blue hover:text-white"
              >
                Get AI tips for this plan
              </button>
            ) : null}
            <p className="mt-3 text-xs text-mdc-muted">
              A planning aid built from MDC catalog data, not a degree audit. Confirm with an MDC advisor before
              registering.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
