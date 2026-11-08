"use client";

import { formatUsd } from "@/lib/format";
import { prerequisiteMet, summarizeSwitch, type PrereqState } from "@/lib/program-switch";
import { recordByCode, type EntryState } from "@/lib/progress";
import type { CreditRange, StoredAcademicRecord, SwitchPlan } from "@/lib/types";

type Mark = EntryState | PrereqState;

const ICON: Record<Mark, { mark: string; className: string; label: string }> = {
  done: { mark: "✓", className: "text-emerald-700", label: "Done" },
  in_progress: { mark: "◐", className: "text-amber", label: "In progress" },
  remaining: { mark: "○", className: "text-mdc-muted", label: "Still needed" },
  low_grade: { mark: "!", className: "text-amber", label: "Grade below the minimum" },
  slot: { mark: "?", className: "text-mdc-blue", label: "Elective" },
};

function range({ low, high }: CreditRange, format: (n: number) => string = String) {
  return low === high ? format(low) : `${format(low)}–${format(high)}`;
}

const dollars = (n: number) => formatUsd(Math.round(n));
const outlook = (pct: number) => `${pct > 0 ? "+" : ""}${pct}%`;

function Icon({ state }: { state: Mark }) {
  const icon = ICON[state];
  return (
    <span className={`w-4 shrink-0 font-bold ${icon.className}`} title={icon.label} aria-label={icon.label}>
      {icon.mark}
    </span>
  );
}

export function SwitchDetail({
  plan,
  record,
  knownCredits,
}: {
  plan: SwitchPlan;
  record: StoredAcademicRecord;
  knownCredits: Record<string, CreditRange>;
}) {
  const s = summarizeSwitch(plan, record, knownCredits);
  const byCode = recordByCode(record);
  const { admission, electives, target } = plan;
  const afterAssociate = target.basis === "after_associate";
  const sureElectives = s.electives.matches.filter((m) => m.sure);
  const maybeElectives = s.electives.matches.filter((m) => !m.sure);

  return (
    <div className="mt-5">
      <p className="text-sm text-mdc-muted">
        {plan.fromLabel} → <span className="font-semibold text-mdc-ink">{target.label}</span> · {target.credits} credits
        {target.effectiveTerm ? ` · ${target.effectiveTerm}` : ""}
      </p>

      <div className="mt-4 border border-mdc-line bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">To enter the program</p>
        <ul className="mt-2 space-y-1 text-sm text-mdc-ink">
          {admission.priorDegree ? (
            <li className="flex gap-2">
              <span className="w-4 shrink-0 text-mdc-blue">☐</span> {admission.priorDegree}
            </li>
          ) : null}
          {admission.minGpa != null ? (
            <li className="flex gap-2">
              <span className="w-4 shrink-0 text-mdc-blue">☐</span> {admission.minGpa} cumulative GPA
            </li>
          ) : null}
          {admission.prerequisites.map((p, i) => (
            <li key={p.code} className="flex gap-2">
              <Icon state={s.prereqs[i].state} />
              <span className={s.prereqs[i].state === "done" ? "text-mdc-muted" : ""}>
                {p.label}
                {p.title ? <span className="text-mdc-muted"> {p.title}</span> : null}
                {s.prereqs[i].state === "low_grade" ? (
                  <span className="text-xs text-amber">
                    {" "}
                    (you have a {s.prereqs[i].match?.grade}; needs {admission.minGrade} or higher)
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {admission.minGrade && admission.prerequisites.length ? (
          <p className="mt-2 text-xs text-mdc-muted">Each prerequisite needs a grade of {admission.minGrade} or higher.</p>
        ) : null}
        {admission.notes.map((n) => (
          <p key={n} className="mt-2 text-sm text-mdc-muted">
            {n}
          </p>
        ))}
      </div>

      <div className="mt-4 border border-mdc-line bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Estimated cost to finish</p>
        <p className="mt-1 font-display text-2xl font-bold text-mdc-ink">{range(s.cost, dollars)}</p>
        <p className="mt-1 text-sm text-mdc-muted">
          About {range(s.remaining)} credits left
          {afterAssociate ? ` after your associate degree (the program's last ${target.credits - target.entryCredits} credits, plus any missing prerequisites)` : ""}{" "}
          × MDC tuition of {formatUsd(plan.rates.lower)}/credit lower division
          {afterAssociate ? ` and ${formatUsd(plan.rates.upper)}/credit upper division` : ""}
          {plan.rates.year ? `, ${plan.rates.year} rates` : ""}. In-progress courses count as covered. Excludes fees and
          books.
        </p>
        {electives.division == null && s.electives.required ? (
          <p className="mt-2 text-xs text-mdc-muted">
            Range: electives can be lower- or upper-division courses, which cost different amounts.
          </p>
        ) : null}
        {s.unknownCredits.length ? (
          <p className="mt-2 text-xs text-amber">
            Our data has no credits for {s.unknownCredits.join(", ")}, so they aren&apos;t included. Ask an MDC advisor.
          </p>
        ) : null}
        {s.carried.length ? (
          <p className="mt-2 text-sm text-mdc-ink">
            <span className="font-semibold">Carries over:</span> {s.carried.map((c) => c.code).join(", ")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-mdc-muted">None of your saved courses match this program yet.</p>
        )}
        {plan.genEdCredits ? (
          <p className="mt-2 text-xs text-mdc-muted">
            This degree needs {plan.genEdCredits} general-education credits in total. If your associate degree has fewer,
            you may need more gen-ed; ask an advisor.
          </p>
        ) : null}
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {plan.terms.map((term, ti) => (
          <li key={term.term} className="border border-mdc-line bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">{term.term}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {term.entries.map((entry, ei) => {
                const { state, match } = s.entries[ti][ei];
                return (
                  <li key={`${ti}-${ei}`} className="flex gap-2">
                    <Icon state={state} />
                    <span className={state === "done" ? "text-mdc-muted" : "text-mdc-ink"}>
                      {entry.label}
                      {entry.title ? <span className="text-mdc-muted"> {entry.title}</span> : null}
                      {entry.credits ? <span className="text-xs text-mdc-muted"> · {range(entry.credits)} cr</span> : null}
                      {match && entry.codes.length > 1 ? (
                        <span className="text-xs text-mdc-muted"> (you took {match.code})</span>
                      ) : null}
                      {state === "remaining" && entry.prerequisites.length ? (
                        <span className="block text-xs text-mdc-muted">
                          Needs:{" "}
                          {entry.prerequisites.map((p, pi) => (
                            <span key={p}>
                              {pi ? ", " : ""}
                              {p}
                              {prerequisiteMet(p, byCode) ? " ✓" : ""}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mt-4 border border-mdc-line bg-white/60 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Electives</p>
        <p className="mt-1 text-mdc-ink">
          {s.electives.required} elective credits in this plan ({electives.slotCredits} per slot
          {electives.slotCreditsBasis ? `; ${electives.slotCreditsBasis}` : ""}) · about {range(s.electives.covered)} covered
          by your courses
        </p>
        {sureElectives.length ? (
          <p className="mt-1 text-mdc-ink">Count: {sureElectives.map((m) => m.course.code).join(", ")}</p>
        ) : null}
        {maybeElectives.length ? (
          <p className="mt-1 text-amber">
            May count (
            {afterAssociate
              ? "only courses beyond your associate degree's credits count here; ask an advisor"
              : `allowed only by ${[...new Set(maybeElectives.flatMap((m) => m.lists))].join(", ")}`}
            ): {maybeElectives.map((m) => m.course.code).join(", ")}
          </p>
        ) : null}
        {electives.note ? <p className="mt-1 text-xs text-mdc-muted">{electives.note}</p> : null}
        {electives.recommended.length ? (
          <p className="mt-1 text-xs text-mdc-muted">
            Recommended if you plan on the B.S.: {electives.recommended.join(", ")}
          </p>
        ) : null}
      </div>

      {plan.notes.length ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-mdc-muted">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {plan.career ? (
        <div className="mt-4 border border-mdc-line bg-white/60 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Where it leads</p>
          <p className="mt-1 text-mdc-muted">{plan.career.summary}</p>
          <ul className="mt-2 space-y-1">
            {plan.career.occupations.map((o) => (
              <li key={o.title} className="text-mdc-ink">
                {o.source ? (
                  <a href={o.source} target="_blank" rel="noreferrer" className="font-semibold text-mdc-blue hover:underline">
                    {o.title}
                  </a>
                ) : (
                  <span className="font-semibold">{o.title}</span>
                )}{" "}
                · {formatUsd(o.medianPay)} median
                {o.outlookPct != null ? ` · ${outlook(o.outlookPct)} projected jobs` : ""}
                {o.entryEducation ? <span className="text-xs text-mdc-muted"> · entry: {o.entryEducation}</span> : null}
              </li>
            ))}
          </ul>
          {plan.career.withBs ? (
            <p className="mt-2 text-xs text-mdc-muted">
              {plan.career.withBs.note}{" "}
              {plan.career.withBs.occupations
                .map((o) => `${o.title} (${formatUsd(o.medianPay)}${o.outlookPct != null ? `, ${outlook(o.outlookPct)}` : ""})`)
                .join(", ")}
            </p>
          ) : null}
          {plan.career.dataSource ? <p className="mt-2 text-xs text-mdc-muted">{plan.career.dataSource}</p> : null}
        </div>
      ) : null}

      {plan.sources.length ? (
        <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-mdc-muted">
          Sources:
          {plan.sources.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="text-mdc-blue hover:underline">
              {new URL(src).pathname.split("/").pop() || new URL(src).hostname}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  );
}
