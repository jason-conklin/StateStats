import type { Metadata } from "next";
import Image from "next/image";
import {
  AlertCircle,
  Database,
  LineChart,
  Map,
  MapPinned,
  MousePointerClick,
  SlidersHorizontal,
} from "lucide-react";

const dataHighlights = [
  {
    title: "Public data sources",
    body: "StateStats uses official public datasets from sources including U.S. Census ACS, BLS LAUS, NOAA climate and storm records, and the USGS earthquake catalog.",
    Icon: Database,
  },
  {
    title: "State-level coverage",
    body: "Metrics cover all 50 states with year coverage varying by source.",
    Icon: Map,
  },
  {
    title: "Data availability",
    body: "Some metrics or years may be unavailable due to publication schedules, methodology changes, or source limitations.",
    Icon: AlertCircle,
  },
] as const;

const explorationSteps = [
  {
    title: "Choose a metric",
    body: "Select income, population, unemployment, age, home value, and more.",
    Icon: MousePointerClick,
  },
  {
    title: "Explore the map",
    body: "Hover or pin states to inspect rankings and values for a selected year.",
    Icon: MapPinned,
  },
  {
    title: "Compare trends",
    body: "Add states to the Graph page to analyze changes over time.",
    Icon: LineChart,
  },
  {
    title: "Normalize data",
    body: "Compare relative growth and long-term changes more clearly.",
    Icon: SlidersHorizontal,
  },
] as const;

export const metadata: Metadata = {
  title: "StateStats - About",
};

export default function AboutPage() {
  return (
    <main className="min-h-full w-full overflow-y-auto bg-slate-950 px-4 py-6 md:px-8 md:py-10">
      <div className="w-full space-y-6 md:space-y-8">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/40 shadow-[0_20px_50px_rgba(15,23,42,0.35)]">
          <div className="relative">
            <Image
              src="/statestats-banner.png"
              alt="StateStats banner showing the StateStats logo and a U.S. data map"
              width={2475}
              height={793}
              priority
              className="h-auto w-full"
              sizes="(max-width: 1280px) 100vw, 1200px"
            />
          </div>
        </section>

        <section className="space-y-2 md:space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">About</p>
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Why StateStats exists</h2>
          <p className="text-sm leading-relaxed text-slate-300 md:text-base">
            StateStats helps users explore U.S. state-level data over time through interactive maps and
            comparison charts. The goal is to keep public data accessible, explorable, and transparent.
          </p>
        </section>

        <section className="space-y-4 md:space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">About the data</p>
            <h3 className="text-xl font-semibold text-white md:text-2xl">Grounded in public sources and transparent coverage</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {dataHighlights.map(({ title, body, Icon }) => (
              <article
                key={title}
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.22)] md:p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-800/80 text-emerald-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h4 className="text-lg font-semibold text-white">{title}</h4>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4 md:space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">How to explore StateStats</p>
            <h3 className="text-xl font-semibold text-white md:text-2xl">A simple workflow for comparing states and trends</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {explorationSteps.map(({ title, body, Icon }) => (
              <article
                key={title}
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.22)] md:p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-800/80 text-sky-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h4 className="text-lg font-semibold text-white">{title}</h4>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4 md:space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">About the creator</p>
            <h3 className="text-xl font-semibold text-white md:text-2xl">The person and philosophy behind StateStats</h3>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.22)] md:p-7">
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex shrink-0 justify-start">
                    <Image
                      src="/jason_conklin.png"
                      alt="Portrait of Jason Conklin, creator of StateStats"
                      width={208}
                      height={208}
                      className="h-36 w-36 rounded-full border border-white/10 object-cover shadow-md sm:h-40 sm:w-40 md:h-52 md:w-52"
                      priority
                    />
                  </div>
                  <div className="min-w-0 space-y-3">
                    <p className="text-base uppercase tracking-[0.18em] text-slate-400 md:text-lg">Built by</p>
                    <div className="space-y-2">
                      <p className="text-2xl font-semibold text-slate-50 md:text-3xl">Jason Conklin</p>
                      <p className="text-base text-slate-300 md:text-lg">Creator of StateStats</p>
                      <p className="text-base leading-relaxed text-slate-400 md:text-lg">
                        B.S. Computer Science, New Jersey Institute of Technology (NJIT)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/10 pt-6 md:border-l md:border-t-0 md:pt-0 md:pl-8">
                <div className="max-w-prose border-l-2 border-emerald-400/40 pl-5">
                  <div className="text-4xl leading-none text-emerald-300/25">“</div>
                  <div className="mt-2 space-y-4 text-sm leading-relaxed text-slate-200 md:text-[15px]">
                    <p>
                      I created StateStats to make U.S. state-level data easier to explore, compare, and
                      trust without needing spreadsheets or complicated tools. I enjoy combining clean
                      design with public data so students, journalists, and policy-curious citizens can
                      quickly see how states differ over time.
                    </p>
                    <p>
                      My goal is to keep this site clear, transparent, and genuinely useful as new
                      metrics and years of data are added.
                    </p>
                    <p>
                      Learn more about Jason at{" "}
                      <a
                        href="https://jasonconklin.dev"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-emerald-300 underline-offset-2 hover:underline"
                      >
                        jasonconklin.dev
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
