"use client";

export { StatusBadge } from "@/components/StatusBadge";
export { ActivityEntry } from "@/components/ActivityEntry";

import type { RunDetail } from "@/lib/api";

// ── Section card ──────────────────────────────────────────────────────────────

export function Card({
  title,
  badge,
  children,
  className = "",
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Final output ──────────────────────────────────────────────────────────────

export function FinalOutput({ data }: { data: RunDetail["final_output"] }) {
  if (!data) return null;
  const f = data as Record<string, unknown>;
  const list = (key: string) => (Array.isArray(f[key]) ? (f[key] as string[]) : []);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-emerald-200 flex items-center gap-2 bg-emerald-100">
        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-emerald-800">Run Complete — Final Summary</h2>
      </div>
      <div className="p-6 space-y-6">
        {typeof f.final_summary === "string" && f.final_summary && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{f.final_summary}</p>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{labels[key]}</p>
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
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
