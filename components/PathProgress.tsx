"use client";

import { formatUsd } from "@/lib/format";
import { summarizeProgress, type EntryState } from "@/lib/progress";
import { normalizeRecordCode } from "@/lib/record-parse";
import type { ProgressPlan, StoredAcademicRecord } from "@/lib/types";

const ICON: Record<EntryState, { mark: string; className: string; label: string }> = {
  done: { mark: "✓", className: "text-emerald-700", label: "Done" },
  in_progress: { mark: "◐", className: "text-amber", label: "In progress" },
  remaining: { mark: "○", className: "text-mdc-muted", label: "Still needed" },
  slot: { mark: "?", className: "text-mdc-blue", label: "Advisor matches your courses to this" },
};

function rangeText(low: number, high: number, format: (n: number) => string = String) {
  return low === high ? format(low) : `${format(low)}–${format(high)}`;
}

export function PathProgress({ record, plan }: { record: StoredAcademicRecord; plan: ProgressPlan }) {
  const s = summarizeProgress(plan, record);
  const pct = s.required ? Math.round((s.done / s.required) * 100) : 0;
  const pathCodes = new Set(plan.terms.flatMap((t) => t.entries.flatMap((e) => e.codes)));
  const lowGrades = record.courses.filter((c) => c.note && pathCodes.has(normalizeRecordCode(c.code)));

  return (
    <div className="mt-5">
      <p className="text-sm text-mdc-muted">{plan.programLabel}</p>
      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-mdc-line"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Required courses completed"
      >
        <div className="h-full bg-mdc-blue" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-mdc-ink">
        <span className="font-semibold">
          {s.done} of {s.required}
        </span>{" "}
        listed courses done{s.inProgress ? ` · ${s.inProgress} in progress` : ""}
        {s.slots ? ` · ${s.slots} gen-ed or elective slot${s.slots === 1 ? "" : "s"} for your advisor to match` : ""}
      </p>

      <div className="mt-5 border border-mdc-line bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Estimated cost to finish</p>
        <p className="mt-1 font-display text-2xl font-bold text-mdc-ink">{rangeText(s.cost.low, s.cost.high, formatUsd)}</p>
        <p className="mt-1 text-sm text-mdc-muted">
          About {rangeText(s.remaining.low, s.remaining.high)} of {plan.programCredits} credits left × MDC tuition of{" "}
          {formatUsd(plan.ratePerCredit)}/credit{plan.rateYear ? `, ${plan.rateYear} rate` : ""}. In-progress courses
          count as covered. Excludes fees and books.
        </p>
        {s.noCreditData.length ? (
          <p className="mt-2 text-xs text-amber">
            Our catalog data doesn&apos;t list credits for {s.noCreditData.join(", ")}, so they aren&apos;t
            subtracted. Your real cost is likely lower; ask an MDC advisor.
          </p>
        ) : null}
        {s.otherCompleted.length ? (
          <p className="mt-2 text-xs text-mdc-muted">
            Other completed courses (may count toward gen-ed or electives and lower this; ask an MDC advisor):{" "}
            {s.otherCompleted.map((c) => c.code).join(", ")}
          </p>
        ) : null}
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {plan.terms.map((term, ti) => (
          <li key={term.term} className="border border-mdc-line bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">{term.term}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {term.entries.map((entry, ei) => {
                const { state, match } = s.entries[ti][ei];
                const icon = ICON[state];
                return (
                  <li key={`${ti}-${ei}`} className="flex gap-2">
                    <span className={`w-4 shrink-0 font-bold ${icon.className}`} title={icon.label} aria-label={icon.label}>
                      {icon.mark}
                    </span>
                    <span className={state === "done" ? "text-mdc-muted" : "text-mdc-ink"}>
                      {entry.label}
                      {entry.title ? <span className="text-mdc-muted"> {entry.title}</span> : null}
                      {match && entry.codes.length > 1 ? (
                        <span className="text-xs text-mdc-muted"> (you took {match.code})</span>
                      ) : entry.area && entry.codes.length > 1 ? (
                        <span className="text-xs text-mdc-muted"> (gen-ed: pick 1 of {entry.codes.length} options)</span>
                      ) : entry.area && entry.codes.length === 1 ? (
                        <span className="text-xs text-mdc-muted"> ({entry.codes[0].replace(/^([A-Z]{3})/, "$1 ")} or another approved option)</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      {lowGrades.length ? (
        <ul className="mt-6 space-y-1 text-sm text-amber">
          {lowGrades.map((c) => (
            <li key={c.code}>
              {c.code}: {c.note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
