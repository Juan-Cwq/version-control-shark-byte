"use client";

import { formatUsd } from "@/lib/format";
import { prerequisiteProgress, recordByCode, type PrereqState } from "@/lib/progress";
import type { FiuPlan, StoredAcademicRecord } from "@/lib/types";

const ICON: Record<PrereqState, { mark: string; className: string; label: string }> = {
  done: { mark: "✓", className: "text-emerald-700", label: "Done" },
  in_progress: { mark: "◐", className: "text-amber", label: "In progress" },
  remaining: { mark: "○", className: "text-mdc-muted", label: "Still needed" },
};

function FiuRemaining({ remaining: r }: { remaining: NonNullable<FiuPlan["remaining"]> }) {
  return (
    <div className="mt-3 border-l-2 border-amber pl-3 text-sm">
      <p className="text-mdc-ink">
        <span className="font-semibold">About {r.credits} credits at FIU</span> after a 60-credit AA ({r.totalCredits}{" "}
        total)
        {r.ratePerCredit != null
          ? ` · roughly ${formatUsd(Math.round(r.credits * r.ratePerCredit))} at ${formatUsd(r.ratePerCredit)}/credit${
              r.rateTerm ? ` (${r.rateTerm})` : ""
            }, excluding fees`
          : ""}
      </p>
      {r.splitAssumption ? (
        <p className="mt-1 text-xs text-amber">
          Assumed split: {r.splitAssumption.undergrad} undergraduate + {r.splitAssumption.grad} graduate credits.{" "}
          {r.splitAssumption.note}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-mdc-muted">
        {r.note}{" "}
        {r.source ? (
          <a href={r.source} target="_blank" rel="noreferrer" className="text-mdc-blue hover:underline">
            FIU source
          </a>
        ) : null}
      </p>
    </div>
  );
}

export function FiuTransferCheck({ fiu, record }: { fiu: FiuPlan; record: StoredAcademicRecord }) {
  const byCode = recordByCode(record);
  const states = fiu.prerequisites.map((p) => prerequisiteProgress(p, byCode));
  const done = states.filter((s) => s === "done").length;
  const remaining = fiu.prerequisites.filter((_, i) => states[i] === "remaining");

  return (
    <div className="mt-5 border border-mdc-line bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">
        FIU transfer · {fiu.degree}
        {fiu.catalogYear ? ` · ${fiu.catalogYear} catalog` : ""}
      </p>
      <p className="mt-2 text-sm text-mdc-ink">
        <span className="font-semibold">
          {done} of {fiu.prerequisites.length}
        </span>{" "}
        FIU prerequisites done{remaining.length ? ` · ${remaining.length} still needed` : ""}
      </p>
      {fiu.majorNote ? <p className="mt-1 text-xs text-mdc-muted">{fiu.majorNote}</p> : null}
      {fiu.remaining ? <FiuRemaining remaining={fiu.remaining} /> : null}

      {fiu.prerequisites.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {fiu.prerequisites.map((p, i) => {
            const icon = ICON[states[i]];
            return (
              <li key={i} className="flex gap-2">
                <span className={`w-4 shrink-0 font-bold ${icon.className}`} title={icon.label} aria-label={icon.label}>
                  {icon.mark}
                </span>
                <span className={states[i] === "done" ? "text-mdc-muted" : "text-mdc-ink"}>
                  {p.parts.map((part) => part.label).join(" + ")}
                  <span className="text-xs text-mdc-muted">
                    {" "}
                    (FIU {p.fiu}
                    {p.note ? `; ${p.note}` : ""})
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-mdc-muted">Our data has no prerequisite list for this degree. Ask an advisor.</p>
      )}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-mdc-muted">Also required to apply</p>
      <ul className="mt-1 space-y-1 text-sm text-mdc-ink">
        {fiu.admission.map((a) => (
          <li key={a} className="flex gap-2">
            <span className="text-mdc-blue">☐</span> {a}
          </li>
        ))}
        {fiu.minGpa != null && !fiu.admission.some((a) => /gpa/i.test(a)) ? (
          <li className="flex gap-2">
            <span className="text-mdc-blue">☐</span> Minimum GPA {fiu.minGpa}
          </li>
        ) : null}
      </ul>
      {fiu.exception ? <p className="mt-3 text-sm text-amber">Program rule: {fiu.exception}</p> : null}
      {fiu.asNote ? <p className="mt-2 text-sm text-amber">{fiu.asNote}</p> : null}
      {fiu.advising ? <p className="mt-3 text-xs text-mdc-muted">FIU transfer advising: {fiu.advising}</p> : null}
    </div>
  );
}
