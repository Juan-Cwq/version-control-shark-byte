import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseChip } from "@/components/CourseChip";
import { PersonalizePanel } from "@/components/PersonalizePanel";
import { ProgressTracker } from "@/components/ProgressTracker";
import { StudyBuddy } from "@/components/StudyBuddy";
import { UnverifiedBadge } from "@/components/UnverifiedBadge";
import { formatPay, formatUsd } from "@/lib/format";
import { CAREER_IDS, type CareerId } from "@/lib/types";
import { extractCourseCodes, getCareer, getCourseObjects, lookupCourse } from "@/lib/pathways";
import { getAllProgressPlans } from "@/lib/progress-plan";

export function generateStaticParams() {
  return CAREER_IDS.map((id) => ({ id }));
}

export default async function CareerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CAREER_IDS.includes(id as CareerId)) notFound();
  const careerId = id as CareerId;
  const career = getCareer(careerId);
  const explore = career.career_exploration;
  const ep = career.educational_pathway;
  const program = ep.primary_program;
  const firstTermCodes = program.sequence_full_time[0]?.courses.filter((c) => lookupCourse(careerId, c)) ?? [];
  const starterChips = firstTermCodes.slice(0, 3).map((code) => {
    const hit = lookupCourse(careerId, code);
    const short = hit?.title ? ` (${hit.title.split(" ").slice(0, 4).join(" ")})` : "";
    return { code, label: `Quiz me on ${code}${short} basics` };
  });

  const allPlans = getAllProgressPlans();
  const progressPlan = allPlans.find((p) => p.careerId === careerId)!;
  // Split compounds ("CTS 1134 or CTS 1650") so each course is its own chip.
  const courseOptions = getCourseObjects(career).flatMap((c) => {
    const parts = extractCourseCodes(c.code);
    return parts.length ? parts : [c.code];
  });

  const sections = [
    { id: "progress", label: "My Progress" },
    { id: "explore", label: "Explore" },
    { id: "path", label: "Your Path" },
    { id: "cost", label: "Time & Cost" },
    { id: "levelup", label: "Level Up" },
    { id: "routes", label: "Other Routes" },
  ];

  return (
    <main className="flex-1 bg-background">
      <div className="mx-auto max-w-5xl px-5 pb-28 pt-8">
        <Link href="/#careers" className="text-sm font-medium text-mdc-muted hover:text-mdc-blue">
          ← All careers
        </Link>
        <header className="mt-6 border-b border-mdc-line pb-8">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-mdc-blue">
            Cone of Uncertainty
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-mdc-ink sm:text-5xl">{career.title}</h1>
          <p className="mt-4 max-w-3xl text-mdc-muted">{career.summary}</p>
          <p className="mt-4 font-semibold text-mdc-blue">{formatPay(explore.median_pay_usd, explore.pay_year)}</p>
        </header>

        <nav className="sticky top-0 z-30 -mx-5 mt-0 flex gap-1 overflow-x-auto border-b border-mdc-line bg-white px-5 py-3 shadow-sm">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-mdc-muted hover:bg-mdc-blue/5 hover:text-mdc-blue"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <ProgressTracker plan={progressPlan} allPlans={allPlans} />

        <PersonalizePanel careerId={careerId} courseOptions={courseOptions} />

        <section id="explore" className="scroll-mt-20 border-b border-mdc-line py-12">
          <h2 className="font-display text-2xl font-bold text-mdc-ink">Explore</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-mdc-blue">Day-to-day</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-mdc-muted">
                {explore.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-4 text-mdc-muted">
              <p>
                <span className="text-mdc-ink">Outlook:</span> {explore.outlook}
              </p>
              <p>
                <span className="text-mdc-ink">Entry education:</span> {explore.entry_education}
              </p>
              <a
                href={explore.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-mdc-blue underline-offset-4 hover:underline"
              >
                BLS source →
              </a>
            </div>
          </div>
          <h3 className="mt-10 text-sm font-semibold uppercase tracking-wide text-mdc-blue">Related careers</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-mdc-line text-mdc-muted">
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Median pay</th>
                  <th className="py-2 font-medium">Education</th>
                </tr>
              </thead>
              <tbody>
                {explore.related_careers.map((r) => (
                  <tr key={r.title} className="border-b border-mdc-line">
                    <td className="py-2 pr-4 text-mdc-ink">{r.title}</td>
                    <td className="py-2 pr-4 text-mdc-muted">
                      {r.median_pay_usd == null ? "—" : formatUsd(r.median_pay_usd)}
                    </td>
                    <td className="py-2 text-mdc-muted">{r.education}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="path" className="scroll-mt-20 border-b border-mdc-line py-12">
          <h2 className="font-display text-2xl font-bold text-mdc-ink">Your Path</h2>
          <p className="mt-2 text-mdc-muted">
            {program.degree} · {program.name} ({program.code}) · {program.credits} credits
            {program.effective_term ? ` · effective ${program.effective_term}` : ""}
          </p>
          {program.note ? <p className="mt-2 text-sm text-amber">{program.note}</p> : null}

          <ol className="relative mt-10 space-y-8 border-l border-mdc-blue/40 pl-6">
            {program.sequence_full_time.map((term) => (
              <li key={term.term} className="relative">
                <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full bg-mdc-blue" />
                <h3 className="font-display text-lg font-bold text-mdc-ink">
                  {term.term}{" "}
                  <span className="text-sm font-normal text-mdc-muted">· {term.credits} credits</span>
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {term.courses.map((c) => (
                    <CourseChip key={`${term.term}-${c}`} careerId={careerId} codeOrLabel={c} />
                  ))}
                </div>
              </li>
            ))}
          </ol>

          {ep.fiu_transfer ? (
            <div className="mt-12 border border-mdc-line bg-white/50 p-5">
              <h3 className="font-display text-xl font-bold text-mdc-ink">Transfer · FIU</h3>
              <p className="mt-2 text-mdc-muted">{ep.fiu_transfer.degree}</p>
              {ep.fiu_transfer.min_gpa != null ? (
                <p className="mt-2 text-sm text-mdc-muted">Min GPA: {ep.fiu_transfer.min_gpa}</p>
              ) : null}
              <ul className="mt-4 space-y-2">
                {ep.fiu_transfer.admission.map((a) => (
                  <li key={a} className="flex gap-2 text-sm text-mdc-ink">
                    <span className="text-mdc-blue">☐</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {ep.mdc_bachelor ? (
            <div className="mt-6 border border-mdc-line bg-white/50 p-5">
              <h3 className="font-display text-xl font-bold text-mdc-ink">MDC bachelor&apos;s option</h3>
              <p className="mt-2 text-mdc-muted">
                {ep.mdc_bachelor.degree} · {ep.mdc_bachelor.name} ({ep.mdc_bachelor.code})
              </p>
              {ep.mdc_bachelor.admission?.length ? (
                <ul className="mt-4 space-y-2">
                  {ep.mdc_bachelor.admission.map((a) => (
                    <li key={a} className="flex gap-2 text-sm text-mdc-ink">
                      <span className="text-mdc-blue">☐</span> {a}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {career.professional_development.licensure_steps?.length ? (
            <div className="mt-8">
              <h3 className="font-display text-lg font-bold text-mdc-ink">Licensure / certification steps</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-mdc-muted">
                {career.professional_development.licensure_steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {career.unverified.length > 0 ? (
            <ul className="mt-8 space-y-2">
              {career.unverified.map((u) => (
                <UnverifiedBadge key={u} text={u} />
              ))}
            </ul>
          ) : null}
        </section>

        <section id="cost" className="scroll-mt-20 border-b border-mdc-line py-12">
          <h2 className="font-display text-2xl font-bold text-mdc-ink">Time &amp; Cost</h2>
          <div className="mt-8 flex gap-3 overflow-x-auto pb-2">
            {career.timeline_and_cost.stages.map((stage) => (
              <div
                key={stage.stage}
                className="min-w-[11rem] flex-1 border border-mdc-line bg-white/60 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-mdc-blue">{stage.years}</p>
                <p className="mt-2 font-display font-bold text-mdc-ink">{stage.stage}</p>
                <p className="mt-3 text-sm text-mdc-muted">
                  {formatUsd(stage.cost_low_usd)} – {formatUsd(stage.cost_high_usd)}
                </p>
                {stage.note ? <p className="mt-2 text-xs text-mdc-muted">{stage.note}</p> : null}
              </div>
            ))}
          </div>
          <p className="mt-6 text-mdc-ink">
            Total ~{career.timeline_and_cost.total.years}:{" "}
            <span className="font-semibold text-mdc-blue">
              {formatUsd(career.timeline_and_cost.total.cost_low_usd)} –{" "}
              {formatUsd(career.timeline_and_cost.total.cost_high_usd)}
            </span>
          </p>
          {career.timeline_and_cost.total.excludes ? (
            <p className="mt-2 text-sm text-mdc-muted">Excludes: {career.timeline_and_cost.total.excludes}</p>
          ) : null}
        </section>

        <section id="levelup" className="scroll-mt-20 border-b border-mdc-line py-12">
          <h2 className="font-display text-2xl font-bold text-mdc-ink">Level Up</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {career.professional_development.certifications?.length ? (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-mdc-blue">Certifications</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-mdc-muted">
                  {career.professional_development.certifications.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-mdc-blue">Experience</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-mdc-muted">
                {career.professional_development.experience.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
          {career.professional_development.source ? (
            <a
              href={career.professional_development.source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block text-sm text-mdc-blue underline-offset-4 hover:underline"
            >
              Source →
            </a>
          ) : null}
        </section>

        <section id="routes" className="scroll-mt-20 py-12">
          <h2 className="font-display text-2xl font-bold text-mdc-ink">Other Routes</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {career.alternative_pathways.map((alt) => (
              <li key={alt.code} className="border border-mdc-line bg-white/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-mdc-blue">{alt.degree}</p>
                <h3 className="mt-1 font-display text-lg font-bold text-mdc-ink">{alt.name}</h3>
                <p className="mt-1 text-xs text-mdc-muted">Code {alt.code}</p>
                <p className="mt-3 text-sm text-mdc-muted">Leads to: {alt.leads_to}</p>
                {alt.note ? <p className="mt-2 text-xs text-amber">{alt.note}</p> : null}
              </li>
            ))}
          </ul>
          {program.sources?.length ? (
            <div className="mt-10">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-mdc-blue">Sources</h3>
              <ul className="mt-3 space-y-1">
                {program.sources.map((s) => (
                  <li key={s}>
                    <a href={s} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-mdc-muted hover:text-mdc-blue">
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <StudyBuddy
        careerId={careerId}
        starterCourseCodes={firstTermCodes.slice(0, 3)}
        starterChips={starterChips}
      />
    </main>
  );
}
