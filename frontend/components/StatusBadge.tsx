"use client";

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  sleeping:    "bg-amber-50 text-amber-700 border border-amber-200",
  interrupted: "bg-orange-50 text-orange-700 border border-orange-200",
  completed:   "bg-gray-100 text-gray-600 border border-gray-200",
  terminated:  "bg-red-50 text-red-700 border border-red-200",
};

const STATUS_DOT: Record<string, string> = {
  active:      "bg-emerald-500 animate-pulse",
  sleeping:    "bg-amber-500",
  interrupted: "bg-orange-500",
  completed:   "bg-gray-400",
  terminated:  "bg-red-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border border-gray-200"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? "bg-gray-400"}`} />
      {status}
    </span>
  );
}
