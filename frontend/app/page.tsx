"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSupervisors,
  getRuns,
  type Run,
  type Supervisor,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  sleeping:    "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  interrupted: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  completed:   "bg-slate-500/20 text-slate-300 border border-slate-500/30",
  terminated:  "bg-red-500/20 text-red-300 border border-red-500/30",
};

const STATUS_DOT: Record<string, string> = {
  active:      "bg-emerald-400 animate-pulse",
  sleeping:    "bg-yellow-400",
  interrupted: "bg-orange-400",
  completed:   "bg-slate-400",
  terminated:  "bg-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-slate-700 text-slate-300 border border-slate-600"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          STATUS_DOT[status] ?? "bg-slate-400"
        }`}
      />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Aggressiveness badge
// ---------------------------------------------------------------------------

const AGG_STYLES: Record<string, string> = {
  conservative: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  moderate:     "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  aggressive:   "bg-rose-500/20 text-rose-300 border border-rose-500/30",
};

function AggBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        AGG_STYLES[level] ?? "bg-slate-700 text-slate-300 border border-slate-600"
      }`}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="h-4 w-32 rounded bg-white/10" />
        <div className="h-6 w-20 rounded-full bg-white/10" />
      </div>
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="h-3 w-40 rounded bg-white/10" />
      <div className="h-8 w-28 rounded-lg bg-white/10 mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run card
// ---------------------------------------------------------------------------

function RunCard({ run }: { run: Run }) {
  const customerName = run.order_context?.customer_name ?? "Unknown customer";

  return (
    <div className="group rounded-xl border border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/15 transition-all duration-200 p-5 space-y-3">
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-white text-sm truncate">
          {run.order_id}
        </span>
        <StatusBadge status={run.status} />
      </div>

      <div className="space-y-1">
        <p className="text-slate-400 text-xs flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {customerName}
        </p>
        <p className="text-slate-500 text-xs flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(run.created_at)}
        </p>
      </div>

      {run.memory_summary && (
        <p className="text-slate-400 text-xs line-clamp-2 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
          {run.memory_summary}
        </p>
      )}

      <Link
        href={`/runs/${run.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
      >
        View Details
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supervisor card
// ---------------------------------------------------------------------------

function SupervisorCard({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="group rounded-xl border border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/15 transition-all duration-200 p-5 space-y-3">
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-white text-sm truncate">
          {supervisor.name}
        </span>
        <AggBadge level={supervisor.wake_aggressiveness} />
      </div>

      <p className="text-slate-400 text-xs line-clamp-2">
        {supervisor.base_instruction}
      </p>

      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
        <span className="font-mono">{supervisor.model}</span>
      </div>

      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Wakes every {supervisor.wake_up_interval_minutes}m
      </div>

      <Link
        href={`/runs/new?supervisor_id=${supervisor.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
      >
        Use this supervisor
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);

  // Fetch supervisors once on mount.
  useEffect(() => {
    getSupervisors()
      .then(setSupervisors)
      .catch((e) => setSupervisorsError(e.message))
      .finally(() => setSupervisorsLoading(false));
  }, []);

  // Fetch runs on mount and poll every 5 seconds.
  useEffect(() => {
    const fetchRuns = () =>
      getRuns()
        .then((data) => {
          setRuns(data);
          setRunsError(null);
        })
        .catch((e) => setRunsError(e.message))
        .finally(() => setRunsLoading(false));

    fetchRuns();
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, []);

  const activeRuns = runs.filter((r) => r.status !== "completed" && r.status !== "terminated");
  const finishedRuns = runs.filter((r) => r.status === "completed" || r.status === "terminated");

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo + title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-none">Order Supervisor</h1>
              <p className="text-xs text-slate-500 leading-none mt-0.5">AI-powered order management</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/supervisors/new"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Supervisor
            </Link>
            <Link
              href="/runs/new"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              New Run
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Stats bar                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-white/5 bg-white/2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-6 overflow-x-auto">
          {[
            { label: "Total Runs", value: runs.length },
            { label: "Active", value: activeRuns.length },
            { label: "Completed", value: finishedRuns.filter((r) => r.status === "completed").length },
            { label: "Supervisors", value: supervisors.length },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="text-white text-sm font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Main content                                                      */}
      {/* ---------------------------------------------------------------- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* ------------------------------------------------------------ */}
          {/* Left — Runs (wider)                                            */}
          {/* ------------------------------------------------------------ */}
          <section className="lg:col-span-3 space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Active Runs</h2>
                {!runsLoading && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium">
                    {runs.length}
                  </span>
                )}
              </div>
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
            </div>

            {/* Error */}
            {runsError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {runsError}
              </div>
            )}

            {/* Loading */}
            {runsLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            )}

            {/* Empty */}
            {!runsLoading && !runsError && runs.length === 0 && (
              <div className="rounded-xl border border-white/5 bg-white/3 px-6 py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-slate-400 text-sm">No runs yet.</p>
                <p className="text-slate-500 text-xs">Create your first run to start supervising an order.</p>
                <Link
                  href="/runs/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors mt-2"
                >
                  Create your first run
                </Link>
              </div>
            )}

            {/* Active + sleeping runs */}
            {!runsLoading && activeRuns.length > 0 && (
              <div className="space-y-3">
                {activeRuns.map((run) => <RunCard key={run.id} run={run} />)}
              </div>
            )}

            {/* Finished runs (collapsed section) */}
            {!runsLoading && finishedRuns.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-slate-300 transition-colors select-none list-none py-1">
                  <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Finished runs ({finishedRuns.length})
                </summary>
                <div className="space-y-3 mt-3">
                  {finishedRuns.map((run) => <RunCard key={run.id} run={run} />)}
                </div>
              </details>
            )}
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Right — Supervisors                                            */}
          {/* ------------------------------------------------------------ */}
          <section className="lg:col-span-2 space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Supervisor Configs</h2>
                {!supervisorsLoading && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-medium">
                    {supervisors.length}
                  </span>
                )}
              </div>
              <Link
                href="/supervisors/new"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + New
              </Link>
            </div>

            {/* Error */}
            {supervisorsError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {supervisorsError}
              </div>
            )}

            {/* Loading */}
            {supervisorsLoading && (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            )}

            {/* Empty */}
            {!supervisorsLoading && !supervisorsError && supervisors.length === 0 && (
              <div className="rounded-xl border border-white/5 bg-white/3 px-6 py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <p className="text-slate-400 text-sm">No supervisors yet.</p>
                <p className="text-slate-500 text-xs">Create a supervisor config first.</p>
                <Link
                  href="/supervisors/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors mt-2"
                >
                  Create supervisor
                </Link>
              </div>
            )}

            {/* Cards */}
            {!supervisorsLoading && supervisors.length > 0 && (
              <div className="space-y-3">
                {supervisors.map((s) => <SupervisorCard key={s.id} supervisor={s} />)}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
