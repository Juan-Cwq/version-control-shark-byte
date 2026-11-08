"use client";

import { useCallback, useState } from "react";
import { CareerCompare } from "@/components/CareerCompare";
import { FiuTransferCheck } from "@/components/FiuTransferCheck";
import { PathProgress } from "@/components/PathProgress";
import { PlanDrawer } from "@/components/PlanDrawer";
import { ProgramSwitches } from "@/components/ProgramSwitches";
import { RecordImport } from "@/components/RecordImport";
import { clearAcademicRecord, requestPlanRemaining, useAcademicRecord } from "@/lib/academic-record";
import type { PlanSource } from "@/lib/finish-plan";
import type { ProgressPlan } from "@/lib/types";

type View = "path" | "compare" | "switch";

export function ProgressTracker({ plan, allPlans }: { plan: ProgressPlan; allPlans: ProgressPlan[] }) {
  const record = useAcademicRecord();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<View>("path");
  const [planningFiu, setPlanningFiu] = useState(false);
  const [switchIndex, setSwitchIndex] = useState(0);
  const [drawer, setDrawer] = useState<PlanSource | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const onSwitch = view === "switch" && plan.switches.length > 0;
  const openPlan = () =>
    setDrawer(onSwitch ? { kind: "switch", index: switchIndex } : { kind: "path", fiu: planningFiu && plan.fiu != null });

  const tab = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`px-3 py-1.5 text-sm font-medium ${
        view === v ? "bg-mdc-blue text-white" : "border border-mdc-line text-mdc-muted hover:border-mdc-blue hover:text-mdc-blue"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section id="progress" className="scroll-mt-20 my-10 border border-mdc-blue/40 bg-white/70 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-mdc-ink">Track my progress</h2>

      {editing ? (
        <RecordImport initial={record?.courses ?? null} onDone={() => setEditing(false)} />
      ) : record ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tab("path", "This path")}
            {tab("compare", "Compare careers")}
            {plan.switches.length ? tab("switch", "Switch programs") : null}
            {plan.fiu && view === "path" ? (
              <label className="ml-auto flex items-center gap-2 text-sm text-mdc-ink">
                <input
                  type="checkbox"
                  checked={planningFiu}
                  onChange={(e) => setPlanningFiu(e.target.checked)}
                  className="h-4 w-4 accent-mdc-blue"
                />
                I plan to transfer to FIU
              </label>
            ) : null}
          </div>

          {view === "path" ? (
            <>
              {planningFiu && plan.fiu ? <FiuTransferCheck fiu={plan.fiu} record={record} /> : null}
              <PathProgress record={record} plan={plan} />
            </>
          ) : view === "switch" ? (
            <ProgramSwitches
              switches={plan.switches}
              record={record}
              knownCredits={plan.knownCredits}
              selected={switchIndex}
              onSelect={setSwitchIndex}
            />
          ) : (
            <CareerCompare plans={allPlans} record={record} currentId={plan.careerId} />
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openPlan}
              className="rounded-full bg-mdc-blue px-5 py-2 text-sm font-bold text-white hover:bg-mdc-blue-bright"
            >
              Plan what&apos;s left
            </button>
            <span className="text-xs text-mdc-muted">
              {onSwitch
                ? `Full plan for: ${plan.switches[switchIndex]?.label}`
                : `Full plan for your ${plan.programLabel.split(" · ").slice(0, 2).join(" ")}${
                    planningFiu && plan.fiu ? " plus FIU prerequisites" : ""
                  }`}
              : what carries over, what&apos;s left, and a semester-by-semester schedule.
            </span>
          </div>

          <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mdc-muted">
            <span>
              {record.courses.length} courses saved on this device · updated{" "}
              {new Date(record.savedAt).toLocaleDateString()}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="text-mdc-blue hover:underline">
              Edit
            </button>
            <button type="button" onClick={clearAcademicRecord} className="text-mdc-blue hover:underline">
              Clear
            </button>
          </p>
          <p className="mt-2 text-xs text-mdc-muted">
            A planning aid, not a degree audit. Confirm with an MDC advisor before registering.
          </p>

          {drawer ? (
            <PlanDrawer
              plan={plan}
              record={record}
              source={drawer}
              onClose={closeDrawer}
              onAskAi={
                drawer.kind === "path"
                  ? () => {
                      setDrawer(null);
                      requestPlanRemaining({ goal: drawer.fiu && plan.fiu ? `Transfer to FIU for ${plan.fiu.degree}` : null });
                    }
                  : null
              }
            />
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-mdc-muted">
            Upload or paste your MAP or unofficial transcript to see which courses on this path you&apos;ve finished,
            what&apos;s left and what it may cost, how your courses carry over to other careers, and what you need to
            transfer to FIU.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-4 rounded-full bg-mdc-blue px-5 py-2 text-sm font-bold text-white hover:bg-mdc-blue-bright"
          >
            Import my MAP
          </button>
        </>
      )}
    </section>
  );
}
