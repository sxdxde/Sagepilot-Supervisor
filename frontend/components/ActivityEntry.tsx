"use client";

import type { ActivityLog } from "@/lib/api";

const LOG_STYLES: Record<string, string> = {
  event_received:   "bg-blue-500/20 text-blue-300",
  action_executed:  "bg-emerald-500/20 text-emerald-300",
  agent_reasoning:  "bg-purple-500/20 text-purple-300",
  wake_decision:    "bg-yellow-500/20 text-yellow-300",
  sleep_decision:   "bg-slate-500/20 text-slate-400",
  instruction_added:"bg-indigo-500/20 text-indigo-300",
  final_output:     "bg-teal-500/20 text-teal-300",
  system:           "bg-slate-600/30 text-slate-400",
};

export function logSummary(entry: ActivityLog): string {
  const p = entry.payload ?? {};
  switch (entry.activity_type) {
    case "action_executed": {
      const tool = (p.tool_name as string) ?? "";
      const args = p.args as Record<string, string> | undefined;
      const msg = args?.message ?? args?.note ?? "";
      return `${tool}${msg ? `: ${String(msg).slice(0, 80)}` : ""}`;
    }
    case "event_received": {
      const eventType = (p.event_type as string) ?? "event";
      const willWake = p.will_wake;
      return `${eventType} — will wake: ${willWake ? "yes" : "no"}`;
    }
    case "agent_reasoning":
      return (p.outcome as string) ?? `trigger: ${(p.trigger as string) ?? ""}`;
    case "wake_decision": {
      const wake = p.should_wake ?? p.wake;
      const reason = (p.reason as string) ?? (p.event_type as string) ?? "";
      return `Wake: ${wake ? "YES" : "NO"}${reason ? ` — ${reason}` : ""}`;
    }
    case "sleep_decision": {
      const nextWake = (p.next_wake_up as string) ?? (p.next_wake as string) ?? "";
      return nextWake ? `Next wake: ${nextWake}` : "Sleeping";
    }
    case "instruction_added":
      return String(p.instruction ?? "").slice(0, 100);
    case "final_output":
      return "Final summary generated";
    default:
      return JSON.stringify(p).slice(0, 100);
  }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityEntry({ entry }: { entry: ActivityLog }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-slate-600 text-xs pt-0.5 flex-shrink-0 w-16 font-mono">
        {fmt(entry.created_at)}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
            LOG_STYLES[entry.activity_type] ?? "bg-slate-700 text-slate-400"
          }`}
        >
          {entry.activity_type.replace(/_/g, " ")}
        </span>
        <p className="text-xs text-slate-400 truncate">{logSummary(entry)}</p>
      </div>
    </div>
  );
}
