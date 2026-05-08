export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" };
  return (
    <svg
      className={`${dims[size]} animate-spin text-slate-400`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="min-h-[calc(100vh-3rem)] bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400 text-sm">
        <LoadingSpinner size="md" />
        Loading…
      </div>
    </div>
  );
}
