"use client";

import { useState } from "react";
import type { ActivityLog } from "@/lib/api";

const LOG_STYLES: Record<string, string> = {
  event_received:    "bg-blue-50 text-blue-700 border border-blue-200",
  action_executed:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  agent_reasoning:   "bg-purple-50 text-purple-700 border border-purple-200",
  wake_decision:     "bg-amber-50 text-amber-700 border border-amber-200",
  sleep_decision:    "bg-gray-100 text-gray-600 border border-gray-200",
  instruction_added: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  final_output:      "bg-teal-50 text-teal-700 border border-teal-200",
  system:            "bg-gray-100 text-gray-500 border border-gray-200",
};

const LOG_LEFT: Record<string, string> = {
  event_received:    "bg-blue-400",
  action_executed:   "bg-emerald-500",
  agent_reasoning:   "bg-purple-400",
  wake_decision:     "bg-amber-400",
  sleep_decision:    "bg-gray-300",
  instruction_added: "bg-indigo-400",
  final_output:      "bg-teal-400",
  system:            "bg-gray-300",
};

export function logSummary(entry: ActivityLog): string {
  const p = entry.payload ?? {};
  switch (entry.activity_type) {
    case "action_executed": {
      const tool = (p.tool_name as string) ?? "";
      const args = p.args as Record<string, string> | undefined;
      const msg = args?.message ?? args?.note ?? "";
      return `${tool}${msg ? `: ${String(msg)}` : ""}`;
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
      return `Wake: ${wake ? "yes" : "no"}${reason ? ` — ${reason}` : ""}`;
    }
    case "sleep_decision": {
      const nextWake = (p.next_wake_up as string) ?? (p.next_wake as string) ?? "";
      return nextWake ? `Next wake: ${nextWake}` : "Sleeping";
    }
    case "instruction_added":
      return String(p.instruction ?? "");
    case "final_output":
      return "Final summary generated";
    default:
      return JSON.stringify(p).slice(0, 120);
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
  const [expanded, setExpanded] = useState(false);
  const badgeCls = LOG_STYLES[entry.activity_type] ?? "bg-gray-100 text-gray-600 border border-gray-200";
  const leftCls  = LOG_LEFT[entry.activity_type]  ?? "bg-gray-300";
  const hasPayload = entry.payload && Object.keys(entry.payload).length > 0;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => hasPayload && setExpanded((v) => !v)}
        className={`w-full flex gap-3 py-2.5 px-3 text-left transition-colors rounded ${
          hasPayload ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className={`w-0.5 rounded-full flex-shrink-0 self-stretch ${leftCls}`} />
        <span className="text-gray-400 text-[10px] pt-0.5 flex-shrink-0 w-16 font-mono tabular-nums">
          {fmt(entry.created_at)}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${badgeCls}`}>
              {entry.activity_type.replace(/_/g, " ")}
            </span>
            {hasPayload && (
              <svg
                className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{logSummary(entry)}</p>
        </div>
      </button>

      {expanded && hasPayload && (
        <div className="ml-[88px] mb-3 mr-3">
          <pre className="text-[10px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5 overflow-x-auto border border-gray-200 leading-relaxed font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
