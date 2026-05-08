"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupervisors, getRuns, type Run, type Supervisor } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  sleeping:    "bg-amber-50 text-amber-700 border border-amber-200",
  interrupted: "bg-orange-50 text-orange-700 border border-orange-200",
  completed:   "bg-gray-100 text-gray-600 border border-gray-200",
  terminated:  "bg-red-50 text-red-700 border border-red-200",
};
const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500 animate-pulse", sleeping: "bg-amber-500",
  interrupted: "bg-orange-500", completed: "bg-gray-400", terminated: "bg-red-500",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border border-gray-200"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-gray-400"}`} />
      {status}
    </span>
  );
}

// ── Aggressiveness badge ───────────────────────────────────────────────────────

const AGG_STYLES: Record<string, string> = {
  conservative: "bg-blue-50 text-blue-700 border border-blue-200",
  moderate:     "bg-violet-50 text-violet-700 border border-violet-200",
  aggressive:   "bg-rose-50 text-rose-700 border border-rose-200",
};

function AggBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      AGG_STYLES[level] ?? "bg-gray-100 text-gray-600 border border-gray-200"
    }`}>
      {level}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 animate-pulse shadow-sm">
      <div className="flex justify-between items-start">
        <div className="h-4 w-32 rounded bg-gray-100" />
        <div className="h-5 w-20 rounded-full bg-gray-100" />
      </div>
      <div className="h-3 w-24 rounded bg-gray-100" />
      <div className="h-3 w-40 rounded bg-gray-100" />
      <div className="h-8 w-28 rounded-lg bg-gray-100 mt-2" />
    </div>
  );
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run }: { run: Run }) {
  const customerName = run.order_context?.customer_name ?? "Unknown customer";
  return (
    <div className="rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all duration-200 p-5 space-y-3 shadow-sm">
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-gray-900 text-sm truncate">{run.order_id}</span>
        <StatusBadge status={run.status} />
      </div>

      <div className="space-y-1">
        <p className="text-gray-500 text-xs flex items-center gap-1.5">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {customerName}
        </p>
        <p className="text-gray-400 text-xs flex items-center gap-1.5">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(run.created_at)}
        </p>
      </div>

      {run.memory_summary && (
        <p className="text-gray-500 text-xs line-clamp-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          {run.memory_summary}
        </p>
      )}

      <Link
        href={`/runs/${run.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm"
      >
        View Details
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

// ── Supervisor card ────────────────────────────────────────────────────────────

function SupervisorCard({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all duration-200 p-5 space-y-3 shadow-sm">
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-gray-900 text-sm truncate">{supervisor.name}</span>
        <AggBadge level={supervisor.wake_aggressiveness} />
      </div>

      <p className="text-gray-500 text-xs line-clamp-2">{supervisor.base_instruction}</p>

      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
        <span className="font-mono text-gray-500">{supervisor.model}</span>
      </div>

      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Wakes every {supervisor.wake_up_interval_minutes}m
      </div>

      <Link
        href={`/runs/new?supervisor_id=${supervisor.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors"
      >
        Use this supervisor
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    getSupervisors()
      .then(setSupervisors)
      .catch((e) => setSupervisorsError(e.message))
      .finally(() => setSupervisorsLoading(false));
  }, []);

  useEffect(() => {
    const fetchRuns = () =>
      getRuns()
        .then((data) => { setRuns(data); setRunsError(null); setLastRefreshed(new Date()); })
        .catch((e) => setRunsError(e.message))
        .finally(() => setRunsLoading(false));
    fetchRuns();
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, []);

  const activeRuns   = runs.filter((r) => r.status !== "completed" && r.status !== "terminated");
  const finishedRuns = runs.filter((r) => r.status === "completed" || r.status === "terminated");

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50">

      {/* Actions bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between gap-4">
          {/* Stats */}
          <div className="flex items-center gap-5 overflow-x-auto">
            {[
              { label: "Total Runs",  value: runs.length },
              { label: "Active",      value: activeRuns.length },
              { label: "Completed",   value: finishedRuns.filter((r) => r.status === "completed").length },
              { label: "Supervisors", value: supervisors.length },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-gray-400 text-xs">{label}</span>
                <span className="text-gray-900 text-sm font-semibold">{value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/supervisors/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Supervisor
            </Link>
            <Link
              href="/runs/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              New Run
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Left — Runs */}
          <section className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Active Runs</h2>
                {!runsLoading && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                    {runs.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {lastRefreshed && (
                  <span>
                    Updated {lastRefreshed.toLocaleTimeString(undefined, {
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
            </div>

            {runsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {runsError}
              </div>
            )}

            {runsLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            )}

            {!runsLoading && !runsError && runs.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center space-y-3 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm font-medium">No runs yet</p>
                <p className="text-gray-400 text-xs">Create your first run to start supervising an order.</p>
                <Link
                  href="/runs/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm mt-2"
                >
                  Create your first run
                </Link>
              </div>
            )}

            {!runsLoading && activeRuns.length > 0 && (
              <div className="space-y-3">
                {activeRuns.map((run) => <RunCard key={run.id} run={run} />)}
              </div>
            )}

            {!runsLoading && finishedRuns.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-600 transition-colors select-none list-none py-1">
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

          {/* Right — Supervisors */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Supervisor Configs</h2>
                {!supervisorsLoading && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium">
                    {supervisors.length}
                  </span>
                )}
              </div>
              <Link href="/supervisors/new" className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium">
                + New
              </Link>
            </div>

            {supervisorsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {supervisorsError}
              </div>
            )}

            {supervisorsLoading && (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            )}

            {!supervisorsLoading && !supervisorsError && supervisors.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center space-y-3 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm font-medium">No supervisors yet</p>
                <p className="text-gray-400 text-xs">Create a supervisor config first.</p>
                <Link
                  href="/supervisors/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm mt-2"
                >
                  Create supervisor
                </Link>
              </div>
            )}

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
