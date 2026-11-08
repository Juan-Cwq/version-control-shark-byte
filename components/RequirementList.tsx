"use client";

import { needsWork, openBlockCredits, type FinishPlan, type ReqGroup, type Requirement } from "@/lib/finish-plan";
import { prerequisiteMet } from "@/lib/program-switch";
import { recordByCode } from "@/lib/progress";
import type { StoredAcademicRecord } from "@/lib/types";

const GROUPS: { id: ReqGroup; label: string }[] = [
  { id: "admission", label: "Admission prerequisites" },
  { id: "program", label: "Program courses" },
  { id: "gen_ed", label: "General education" },
  { id: "electives", label: "Electives" },
  { id: "fiu", label: "FIU transfer prerequisites" },
];

function credits(r: Requirement) {
  if (!r.credits) return "credits not listed";
  return r.credits.low === r.credits.high ? `${r.credits.low} cr` : `${r.credits.low}–${r.credits.high} cr`;
}

function StatusLine({ r }: { r: Requirement }) {
  if (r.mergedInto) return <span className="text-emerald-700">Covered by {r.mergedInto}</span>;
  if (r.status === "in_progress") return <span className="text-amber">In progress{r.match ? ` (${r.match.code})` : ""}</span>;
  if (r.status === "low_grade") return <span className="text-amber">Retake needed: you have a {r.match?.grade}</span>;
  return <span className="text-mdc-muted">Still needed</span>;
}

function Row({ r, byCode, shared }: { r: Requirement; byCode: ReturnType<typeof recordByCode>; shared: Set<string> }) {
  const mark = r.mergedInto ? "↪" : r.status === "in_progress" ? "◐" : r.status === "low_grade" ? "!" : "○";
  const markClass = r.mergedInto ? "text-emerald-700" : r.status === "remaining" ? "text-mdc-muted" : "text-amber";
  return (
    <li className="flex gap-3 border-b border-mdc-line/70 py-2.5 last:border-0">
      <span className={`w-4 shrink-0 font-bold ${markClass}`} aria-hidden>
        {mark}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-mdc-ink">
          <span className="font-semibold">{r.label}</span>
          {r.title ? <span className="text-mdc-muted"> · {r.title}</span> : null}
          <span className="text-xs text-mdc-muted"> · {credits(r)}</span>
        </p>
        <p className="text-xs">
          <StatusLine r={r} />
        </p>
        {r.block ? (
          <p className="mt-1 text-xs text-mdc-ink">
            {r.block.covered} of {r.block.credits} credits covered
            {r.block.fillers.length ? ` by ${r.block.fillers.join(", ")}` : ""}
            {r.block.planned ? ` · ${r.block.planned} planned (${r.block.plannedFillers.join(", ")})` : ""} ·{" "}
            <span className="font-semibold">{openBlockCredits(r.block)} credits open</span>
          </p>
        ) : null}
        {r.prerequisites.length && needsWork(r) ? (
          <p className="mt-1 text-xs text-mdc-muted">
            Prerequisites:{" "}
            {r.prerequisites.map((p, i) => (
              <span key={p}>
                {i ? "; " : ""}
                {p}
                {prerequisiteMet(p, byCode) ? <span className="text-emerald-700"> ✓</span> : null}
              </span>
            ))}
          </p>
        ) : null}
        {r.corequisites.length && needsWork(r) ? (
          <p className="text-xs text-mdc-muted">Take with: {r.corequisites.join("; ")}</p>
        ) : null}
        {r.notes
          .filter((n) => !shared.has(n))
          .map((n) => (
            <p key={n} className="mt-1 text-xs text-mdc-muted">
              {n}
            </p>
          ))}
      </div>
    </li>
  );
}

export function RequirementList({ plan, record }: { plan: FinishPlan; record: StoredAcademicRecord }) {
  const byCode = recordByCode(record);
  const open = plan.requirements.filter((r) => needsWork(r) || r.status === "in_progress" || r.mergedInto);

  return (
    <div className="space-y-6">
      {plan.phases.map((phase, pi) => {
        const inPhase = open.filter((r) => r.phase === pi);
        const other = plan.other.filter((o) => o.phase === pi);
        if (!inPhase.length && !other.length) return null;
        return (
          <div key={phase.label}>
            {plan.phases.length > 1 ? (
              <div className="mb-2">
                <p className="font-display text-base font-bold text-mdc-ink">{phase.label}</p>
                {phase.detail ? <p className="text-xs text-mdc-muted">{phase.detail}</p> : null}
              </div>
            ) : null}
            {GROUPS.map((g) => {
              const rows = inPhase.filter((r) => r.group === g.id);
              if (!rows.length) return null;
              const left = rows.filter(needsWork).length;
              // Notes every row repeats (e.g. the elective list) are shown once for the group.
              const counts = new Map<string, number>();
              rows.forEach((r) => r.notes.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1)));
              const shared = new Set([...counts].filter(([, c]) => c > 1).map(([n]) => n));
              return (
                <div key={g.id} className="mt-3 border border-mdc-line bg-white/70 px-3">
                  <p className="pt-2.5 text-xs font-semibold uppercase tracking-wide text-mdc-blue">
                    {g.label} · {left} left
                  </p>
                  {[...shared].map((n) => (
                    <p key={n} className="mt-1 text-xs text-mdc-muted">
                      {n}
                    </p>
                  ))}
                  <ul>
                    {rows.map((r) => (
                      <Row key={r.id} r={r} byCode={byCode} shared={shared} />
                    ))}
                  </ul>
                </div>
              );
            })}
            {other.length ? (
              <div className="mt-3 border border-mdc-line bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">Other requirements</p>
                <ul className="mt-1.5 space-y-1 text-sm text-mdc-ink">
                  {other.map((o) => (
                    <li key={o.text} className="flex gap-2">
                      <span className="text-mdc-blue">☐</span> {o.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
