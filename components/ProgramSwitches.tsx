"use client";

import { SwitchDetail } from "@/components/SwitchDetail";
import type { CreditRange, StoredAcademicRecord, SwitchPlan } from "@/lib/types";

export function ProgramSwitches({
  switches,
  record,
  knownCredits,
  selected,
  onSelect,
}: {
  switches: SwitchPlan[];
  record: StoredAcademicRecord;
  knownCredits: Record<string, CreditRange>;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const plan = switches[selected];

  return (
    <div className="mt-5">
      <p className="text-sm text-mdc-muted">
        Pick a path to see what you need to get in, which of your courses carry over, and what&apos;s left.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {switches.map((sw, i) => (
          <label
            key={sw.label}
            className={`flex cursor-pointer items-start gap-2 border p-3 text-sm ${
              i === selected ? "border-mdc-blue bg-mdc-blue/5" : "border-mdc-line hover:border-mdc-blue"
            }`}
          >
            <input
              type="radio"
              name="program-switch"
              checked={i === selected}
              onChange={() => onSelect(i)}
              className="mt-0.5 h-4 w-4 accent-mdc-blue"
            />
            <span>
              <span className="font-semibold text-mdc-ink">{sw.label}</span>
              <span className="block text-xs text-mdc-muted">
                {sw.fromLabel} → {sw.target.label}
              </span>
            </span>
          </label>
        ))}
      </div>
      {plan ? <SwitchDetail key={plan.label} plan={plan} record={record} knownCredits={knownCredits} /> : null}
    </div>
  );
}
