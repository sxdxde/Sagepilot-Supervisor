"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createRun, getSupervisors, type Supervisor } from "@/lib/api";

function parseItems(raw: string): string[] {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}
function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-400">{children}</p>;
}

const INPUT_CLS =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all";

// ── Aggressiveness badge ──────────────────────────────────────────────────────

const AGG_STYLES: Record<string, string> = {
  conservative: "bg-blue-50 text-blue-700 border border-blue-200",
  moderate:     "bg-violet-50 text-violet-700 border border-violet-200",
  aggressive:   "bg-rose-50 text-rose-700 border border-rose-200",
};

function SupervisorPreview({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-900">{supervisor.name}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AGG_STYLES[supervisor.wake_aggressiveness] ?? ""}`}>
          {supervisor.wake_aggressiveness}
        </span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2">{supervisor.base_instruction}</p>
      <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Wakes every {supervisor.wake_up_interval_minutes}m
        </span>
        <span className="flex items-center gap-1 font-mono">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
          {supervisor.model}
        </span>
        <span>{supervisor.available_actions.length} actions</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewRunPageWrapper() {
  return <Suspense><NewRunPage /></Suspense>;
}

function NewRunPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("supervisor_id") ?? "";

  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [supervisorId, setSupervisorId] = useState(preselectedId);
  const [orderId, setOrderId] = useState(() => `ORD-${Date.now().toString().slice(-8)}`);
  const [customerName, setCustomerName] = useState("");
  const [itemsRaw, setItemsRaw] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSupervisors()
      .then((data) => {
        setSupervisors(data);
        if (!preselectedId && data.length > 0) setSupervisorId(data[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSupervisorsLoading(false));
  }, [preselectedId]);

  const selectedSupervisor = supervisors.find((s) => s.id === supervisorId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supervisorId) { setError("Please select a supervisor."); return; }
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
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">New Run</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Start a Supervisor Run</h1>
            <p className="text-sm text-gray-500">Launch a Temporal workflow to monitor an order end-to-end</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Supervisor section */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Supervisor</h2>

            {supervisorsLoading ? (
              <div className="space-y-2">
                <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ) : supervisors.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-sm text-amber-700 font-medium">No supervisors found</p>
                  <p className="text-xs text-amber-600 mt-1">
                    You need to create a supervisor config first.{" "}
                    <Link href="/supervisors/new" className="underline hover:text-amber-800 transition-colors">
                      Create one now
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
                    <option value="" disabled>Select a supervisor...</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {s.wake_aggressiveness}</option>
                    ))}
                  </select>
                  <FieldHint>The supervisor defines the agent's instructions, wake schedule, and available actions.</FieldHint>
                </div>
                {selectedSupervisor && <SupervisorPreview supervisor={selectedSupervisor} />}
              </>
            )}
          </section>

          {/* Order details section */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Order Details</h2>

            <div>
              <Label htmlFor="order_id" required>Order ID</Label>
              <input id="order_id" type="text" required value={orderId}
                onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. ORD-12345" className={INPUT_CLS} />
              <FieldHint>Auto-generated — feel free to replace with your real order ID.</FieldHint>
            </div>

            <div>
              <Label htmlFor="customer_name" required>Customer Name</Label>
              <input id="customer_name" type="text" required value={customerName}
                onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Jane Smith" className={INPUT_CLS} />
            </div>

            <div>
              <Label htmlFor="items">Items</Label>
              <textarea id="items" rows={3} value={itemsRaw}
                onChange={(e) => setItemsRaw(e.target.value)}
                placeholder={"Blue Nike Shoes x1\nRed T-Shirt x2"}
                className={`${INPUT_CLS} resize-none leading-relaxed`} />
              <FieldHint>One item per line.</FieldHint>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="amount">Order Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">$</span>
                  <input id="amount" type="text" inputMode="decimal" value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value)}
                    placeholder="129.99" className={`${INPUT_CLS} pl-8`} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" rows={3} value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special handling instructions or context..."
                className={`${INPUT_CLS} resize-none leading-relaxed`} />
              <FieldHint>Optional. Included in the agent's initial context.</FieldHint>
            </div>
          </section>

          {/* Preview */}
          {(orderId || customerName) && (
            <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {orderId && (<><span className="text-gray-400">Order ID</span><span className="text-gray-900 font-mono font-medium">{orderId}</span></>)}
                {customerName && (<><span className="text-gray-400">Customer</span><span className="text-gray-900">{customerName}</span></>)}
                {amountRaw && (<><span className="text-gray-400">Amount</span><span className="text-gray-900">${parseAmount(amountRaw).toFixed(2)}</span></>)}
                {itemsRaw && (<><span className="text-gray-400">Items</span><span className="text-gray-900">{parseItems(itemsRaw).length} item(s)</span></>)}
                {selectedSupervisor && (<><span className="text-gray-400">Supervisor</span><span className="text-gray-900">{selectedSupervisor.name}</span></>)}
              </div>
            </section>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</Link>
            <button
              type="submit"
              disabled={loading || supervisors.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md shadow-emerald-900/20"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting run...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
