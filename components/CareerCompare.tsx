"use client";

import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { summarizeProgress } from "@/lib/progress";
import type { CareerId, ProgressPlan, StoredAcademicRecord } from "@/lib/types";

export function CareerCompare({
  plans,
  record,
  currentId,
}: {
  plans: ProgressPlan[];
  record: StoredAcademicRecord;
  currentId: CareerId;
}) {
  const rows = plans
    .map((plan) => ({ plan, s: summarizeProgress(plan, record) }))
    .sort((a, b) => a.s.remaining.low - b.s.remaining.low);

  return (
    <div className="mt-5 overflow-x-auto">
      <p className="text-sm text-mdc-muted">
        How your courses carry over if you switch. Each career uses its main MDC program; in-progress courses count
        as covered.
      </p>
      <table className="mt-3 w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-mdc-line text-mdc-muted">
            <th className="py-2 pr-4 font-medium">Career</th>
            <th className="py-2 pr-4 font-medium">Courses that carry over</th>
            <th className="py-2 pr-4 font-medium">Credits left</th>
            <th className="py-2 font-medium">Est. cost to finish</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ plan, s }) => (
            <tr key={plan.careerId} className="border-b border-mdc-line align-top">
              <td className="py-2 pr-4">
                {plan.careerId === currentId ? (
                  <span className="font-semibold text-mdc-ink">{plan.careerTitle} (this page)</span>
                ) : (
                  <Link href={`/career/${plan.careerId}#progress`} className="font-semibold text-mdc-blue hover:underline">
                    {plan.careerTitle}
                  </Link>
                )}
                <p className="text-xs text-mdc-muted">{plan.programLabel}</p>
              </td>
              <td className="py-2 pr-4 text-mdc-ink">
                {s.done + s.inProgress} of {s.required}
              </td>
              <td className="py-2 pr-4 text-mdc-ink">
                {s.remaining.low === s.remaining.high ? s.remaining.low : `${s.remaining.low}–${s.remaining.high}`}
                {s.noCreditData.length ? <span className="text-amber"> *</span> : null}
              </td>
              <td className="py-2 text-mdc-ink">
                {s.cost.low === s.cost.high ? formatUsd(s.cost.low) : `${formatUsd(s.cost.low)}–${formatUsd(s.cost.high)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.s.noCreditData.length) ? (
        <p className="mt-2 text-xs text-amber">
          * Includes courses our catalog data has no credit value for, so those aren&apos;t subtracted. Ask an MDC
          advisor for an exact count.
        </p>
      ) : null}
    </div>
  );
}
