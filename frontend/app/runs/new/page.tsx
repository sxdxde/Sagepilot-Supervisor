"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createRun, getSupervisors, type Supervisor } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a free-text items string into a string array. */
function parseItems(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Strip a leading $ and parse as float. Returns 0 if invalid. */
function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200 mb-1.5">
      {children}
      {required && <span className="text-rose-400 ml-1">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-slate-500">{children}</p>;
}

const INPUT_CLS =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500/60 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all";

// ---------------------------------------------------------------------------
// Supervisor preview card
// ---------------------------------------------------------------------------

const AGG_STYLES: Record<string, string> = {
  conservative: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  moderate:     "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  aggressive:   "bg-rose-500/20 text-rose-300 border border-rose-500/30",
};

function SupervisorPreview({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium text-white">{supervisor.name}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AGG_STYLES[supervisor.wake_aggressiveness] ?? ""}`}>
          {supervisor.wake_aggressiveness}
        </span>
      </div>
      <p className="text-xs text-slate-400 line-clamp-2">{supervisor.base_instruction}</p>
      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Wakes every {supervisor.wake_up_interval_minutes}m
        </span>
        <span className="flex items-center gap-1 font-mono">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
          {supervisor.model}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {supervisor.available_actions.length} actions
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewRunPageWrapper() {
  return (
    <Suspense>
      <NewRunPage />
    </Suspense>
  );
}

function NewRunPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("supervisor_id") ?? "";

  // Remote data
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);

  // Form state
  const [supervisorId, setSupervisorId] = useState(preselectedId);
  const [orderId, setOrderId] = useState(
    () => `ORD-${Date.now().toString().slice(-8)}`
  );
  const [customerName, setCustomerName] = useState("");
  const [itemsRaw, setItemsRaw] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [notes, setNotes] = useState("");

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch supervisors on mount
  useEffect(() => {
    getSupervisors()
      .then((data) => {
        setSupervisors(data);
        // Auto-select the first supervisor if none preselected
        if (!preselectedId && data.length > 0) {
          setSupervisorId(data[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setSupervisorsLoading(false));
  }, [preselectedId]);

  const selectedSupervisor = supervisors.find((s) => s.id === supervisorId) ?? null;

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supervisorId) {
      setError("Please select a supervisor.");
      return;
    }

    setLoading(true);
    try {
      const run = await createRun({
        supervisor_id: supervisorId,
        order_id: orderId.trim(),
        order_context: {
          customer_name: customerName.trim(),
          items: parseItems(itemsRaw),
          amount: parseAmount(amountRaw),
          notes: notes.trim(),
        },
      });
      router.push(`/runs/${run.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-sm text-white font-medium">New Run</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Page title */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Start a Supervisor Run</h1>
            <p className="text-sm text-slate-500">Launch a Temporal workflow to monitor an order end-to-end</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* -------------------------------------------------------------- */}
          {/* Section: Supervisor                                              */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Supervisor</h2>

            {supervisorsLoading ? (
              <div className="space-y-2">
                <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
                <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
              </div>
            ) : supervisors.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-sm text-amber-300 font-medium">No supervisors found</p>
                  <p className="text-xs text-amber-400/70 mt-1">
                    You need to create a supervisor config before starting a run.{" "}
                    <Link href="/supervisors/new" className="underline hover:text-amber-200 transition-colors">
                      Create one now →
                    </Link>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="supervisor" required>Supervisor Config</Label>
                  <select
                    id="supervisor"
                    required
                    value={supervisorId}
                    onChange={(e) => setSupervisorId(e.target.value)}
                    className={`${INPUT_CLS} appearance-none cursor-pointer`}
                  >
                    <option value="" disabled className="bg-[#1a1a2e]">
                      Select a supervisor…
                    </option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#1a1a2e]">
                        {s.name} — {s.wake_aggressiveness}
                      </option>
                    ))}
                  </select>
                  <FieldHint>The supervisor defines the agent's instructions, wake schedule, and available actions.</FieldHint>
                </div>

                {selectedSupervisor && (
                  <SupervisorPreview supervisor={selectedSupervisor} />
                )}
              </>
            )}
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Section: Order details                                           */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Details</h2>

            {/* Order ID */}
            <div>
              <Label htmlFor="order_id" required>Order ID</Label>
              <input
                id="order_id"
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. ORD-12345"
                className={INPUT_CLS}
              />
              <FieldHint>Auto-generated suggestion — feel free to replace with your real order ID.</FieldHint>
            </div>

            {/* Customer name */}
            <div>
              <Label htmlFor="customer_name" required>Customer Name</Label>
              <input
                id="customer_name"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className={INPUT_CLS}
              />
            </div>

            {/* Items */}
            <div>
              <Label htmlFor="items">Items</Label>
              <textarea
                id="items"
                rows={3}
                value={itemsRaw}
                onChange={(e) => setItemsRaw(e.target.value)}
                placeholder={"Blue Nike Shoes x1\nRed T-Shirt x2\nBlack Socks x3"}
                className={`${INPUT_CLS} resize-none leading-relaxed`}
              />
              <FieldHint>One item per line. The agent uses this to understand what was ordered.</FieldHint>
            </div>

            {/* Amount + Notes side by side on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="amount">Order Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">$</span>
                  <input
                    id="amount"
                    type="text"
                    inputMode="decimal"
                    value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value)}
                    placeholder="129.99"
                    className={`${INPUT_CLS} pl-8`}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special handling instructions, priority flags, or context the supervisor should know about…"
                className={`${INPUT_CLS} resize-none leading-relaxed`}
              />
              <FieldHint>Optional. Included in the agent's initial context.</FieldHint>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Preview box                                                      */}
          {/* -------------------------------------------------------------- */}
          {(orderId || customerName) && (
            <section className="rounded-2xl border border-white/5 bg-white/2 p-5 space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {orderId && (
                  <>
                    <span className="text-slate-500">Order ID</span>
                    <span className="text-white font-mono">{orderId}</span>
                  </>
                )}
                {customerName && (
                  <>
                    <span className="text-slate-500">Customer</span>
                    <span className="text-white">{customerName}</span>
                  </>
                )}
                {amountRaw && (
                  <>
                    <span className="text-slate-500">Amount</span>
                    <span className="text-white">${parseAmount(amountRaw).toFixed(2)}</span>
                  </>
                )}
                {itemsRaw && (
                  <>
                    <span className="text-slate-500">Items</span>
                    <span className="text-white">{parseItems(itemsRaw).length} item(s)</span>
                  </>
                )}
                {selectedSupervisor && (
                  <>
                    <span className="text-slate-500">Supervisor</span>
                    <span className="text-white">{selectedSupervisor.name}</span>
                  </>
                )}
              </div>
            </section>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Submit                                                           */}
          {/* -------------------------------------------------------------- */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading || supervisors.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-900/30"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting run…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Supervisor Run
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
