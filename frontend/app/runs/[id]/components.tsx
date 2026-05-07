"use client";

import type { ActivityLog, RunDetail } from "@/lib/api";

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
  active: "bg-emerald-400 animate-pulse",
  sleeping: "bg-yellow-400",
  interrupted: "bg-orange-400",
  completed: "bg-slate-400",
  terminated: "bg-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? "bg-slate-700 text-slate-300 border border-slate-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Activity type badge
// ---------------------------------------------------------------------------

const LOG_STYLES: Record<string, string> = {
  event_received:  "bg-blue-500/20 text-blue-300",
  action_executed: "bg-emerald-500/20 text-emerald-300",
  agent_reasoning: "bg-purple-500/20 text-purple-300",
  wake_decision:   "bg-yellow-500/20 text-yellow-300",
  sleep_decision:  "bg-slate-500/20 text-slate-400",
  instruction_added:"bg-indigo-500/20 text-indigo-300",
  final_output:    "bg-teal-500/20 text-teal-300",
  system:          "bg-slate-600/30 text-slate-400",
};

function logSummary(entry: ActivityLog): string {
  const p = entry.payload ?? {};
  switch (entry.activity_type) {
    case "action_executed": {
      const tool = (p.tool_name as string) ?? "";
      const args = p.args as Record<string, string> | undefined;
      const msg = args?.message ?? args?.note ?? "";
      return `${tool}${msg ? `: ${String(msg).slice(0, 80)}` : ""}`;
    }
    case "event_received":
      return `${p.event_type ?? "event"} — will_wake: ${p.will_wake}`;
    case "agent_reasoning":
      return (p.outcome as string) ?? `trigger: ${p.trigger ?? ""}`;
    case "instruction_added":
      return String(p.instruction ?? "").slice(0, 100);
    default:
      return JSON.stringify(p).slice(0, 100);
  }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ActivityEntry({ entry }: { entry: ActivityLog }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-slate-600 text-xs pt-0.5 flex-shrink-0 w-16">{fmt(entry.created_at)}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${LOG_STYLES[entry.activity_type] ?? "bg-slate-700 text-slate-400"}`}>
          {entry.activity_type.replace(/_/g, " ")}
        </span>
        <p className="text-xs text-slate-400 truncate">{logSummary(entry)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

export function Card({ title, badge, children, className = "" }: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/8 bg-white/3 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final output
// ---------------------------------------------------------------------------

export function FinalOutput({ data }: { data: RunDetail["final_output"] }) {
  if (!data) return null;
  const f = data as Record<string, unknown>;
  const list = (key: string) => (Array.isArray(f[key]) ? f[key] as string[] : []);

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <div className="px-6 py-4 border-b border-emerald-500/20 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <h2 className="text-sm font-semibold text-emerald-300">Run Complete — Final Summary</h2>
      </div>
      <div className="p-6 space-y-6">
        {f.final_summary && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Summary</p>
            <p className="text-sm text-slate-200 leading-relaxed">{String(f.final_summary)}</p>
          </div>
        )}
        {(["important_actions_taken", "key_learnings", "recommendations"] as const).map((key) => {
          const items = list(key);
          if (!items.length) return null;
          const labels: Record<string, string> = {
            important_actions_taken: "Important Actions Taken",
            key_learnings: "Key Learnings",
            recommendations: "Recommendations",
          };
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{labels[key]}</p>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
