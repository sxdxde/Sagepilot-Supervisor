"use client";

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

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-slate-700 text-slate-300 border border-slate-600"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          STATUS_DOT[status] ?? "bg-slate-400"
        }`}
      />
      {status}
    </span>
  );
}
