"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupervisor } from "@/lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_ACTIONS = [
  {
    id: "message_fulfillment_team",
    label: "Message Fulfillment Team",
    description: "Send alerts or updates to the team handling order packing & dispatch",
  },
  {
    id: "message_payments_team",
    label: "Message Payments Team",
    description: "Escalate payment failures or flag suspicious transactions",
  },
  {
    id: "message_logistics_team",
    label: "Message Logistics Team",
    description: "Coordinate with couriers and warehouse for shipping issues",
  },
  {
    id: "message_customer",
    label: "Message Customer",
    description: "Send proactive updates or requests for information to the customer",
  },
  {
    id: "create_internal_note",
    label: "Create Internal Note",
    description: "Log decisions and observations for human review",
  },
];

const AGGRESSIVENESS_OPTIONS = [
  {
    value: "conservative",
    label: "Conservative",
    description: "Only intervene on critical issues — payment failures, refund requests, or direct customer complaints.",
    color: "border-blue-500/50 bg-blue-500/10 text-blue-300",
    dot: "bg-blue-400",
  },
  {
    value: "moderate",
    label: "Moderate",
    description: "Act on delays and problems; check in periodically even without events.",
    color: "border-violet-500/50 bg-violet-500/10 text-violet-300",
    dot: "bg-violet-400",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Proactively communicate on every significant order event, even minor ones.",
    color: "border-rose-500/50 bg-rose-500/10 text-rose-300",
    dot: "bg-rose-400",
  },
];

const MODELS = [
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (Groq)" },
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Groq)" },
  { value: "mixtral-8x7b-32768", label: "Mixtral 8×7B (Groq)" },
];

// ---------------------------------------------------------------------------
// Form field components
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewSupervisorPage() {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [baseInstruction, setBaseInstruction] = useState("");
  const [wakeInterval, setWakeInterval] = useState(60);
  const [aggressiveness, setAggressiveness] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [selectedActions, setSelectedActions] = useState<Set<string>>(
    new Set(ALL_ACTIONS.map((a) => a.id))
  );

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle action checkbox
  function toggleAction(id: string) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedActions.size === 0) {
      setError("Select at least one available action.");
      return;
    }

    setLoading(true);
    try {
      await createSupervisor({
        name,
        base_instruction: baseInstruction,
        wake_up_interval_minutes: wakeInterval,
        wake_aggressiveness: aggressiveness,
        model,
        available_actions: Array.from(selectedActions),
      });
      router.push("/?created=supervisor");
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
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
            <span className="text-sm text-white font-medium">New Supervisor</span>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Create Supervisor Config</h1>
              <p className="text-sm text-slate-500">Define how the AI agent monitors and responds to order events</p>
            </div>
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
          {/* ---------------------------------------------------------------- */}
          {/* Section: Identity                                                 */}
          {/* ---------------------------------------------------------------- */}
          <section className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Identity</h2>

            {/* Name */}
            <div>
              <Label htmlFor="name" required>Supervisor Name</Label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Order Supervisor"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500/60 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
              />
              <FieldHint>A short, descriptive name for this supervisor configuration.</FieldHint>
            </div>

            {/* Base instruction */}
            <div>
              <Label htmlFor="base_instruction" required>Base Instruction</Label>
              <textarea
                id="base_instruction"
                required
                rows={6}
                value={baseInstruction}
                onChange={(e) => setBaseInstruction(e.target.value)}
                placeholder={`You are an AI supervisor monitoring e-commerce orders. Your goal is to ensure orders are fulfilled smoothly and customers are kept informed.

Proactively communicate with teams when issues arise. If a payment fails, alert the payments team immediately. If shipping is delayed, notify both logistics and the customer. Create internal notes to document your reasoning for each decision.

Always remain professional and solution-focused.`}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500/60 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all resize-none leading-relaxed"
              />
              <FieldHint>The core system prompt that shapes how the agent reasons and acts. Be specific about priorities and tone.</FieldHint>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Section: Behaviour                                                */}
          {/* ---------------------------------------------------------------- */}
          <section className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Behaviour</h2>

            {/* Wake interval */}
            <div>
              <Label htmlFor="wake_interval">Check order every X minutes</Label>
              <div className="flex items-center gap-3">
                <input
                  id="wake_interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={wakeInterval}
                  onChange={(e) => setWakeInterval(Number(e.target.value))}
                  className="w-32 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/60 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
                />
                <span className="text-sm text-slate-500">minutes between scheduled wake-ups</span>
              </div>
              <FieldHint>The agent also wakes immediately on critical events, regardless of this interval.</FieldHint>
            </div>

            {/* Wake aggressiveness */}
            <div>
              <Label htmlFor="aggressiveness">Wake Aggressiveness</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {AGGRESSIVENESS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAggressiveness(opt.value as typeof aggressiveness)}
                    className={`relative rounded-xl border p-4 text-left transition-all ${
                      aggressiveness === opt.value
                        ? opt.color
                        : "border-white/8 bg-white/3 text-slate-400 hover:bg-white/6 hover:border-white/15"
                    }`}
                  >
                    {aggressiveness === opt.value && (
                      <span className="absolute top-3 right-3">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-75">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <Label htmlFor="model">Language Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/60 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all appearance-none cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value} className="bg-[#1a1a2e]">
                    {m.label}
                  </option>
                ))}
              </select>
              <FieldHint>All models run via Groq for low-latency inference.</FieldHint>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Section: Available Actions                                        */}
          {/* ---------------------------------------------------------------- */}
          <section className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Available Actions</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedActions(new Set(ALL_ACTIONS.map((a) => a.id)))}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Select all
                </button>
                <span className="text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedActions(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Choose which actions the agent is allowed to take. Unchecked actions will be hidden from the model.
            </p>

            <div className="space-y-2">
              {ALL_ACTIONS.map((action) => {
                const checked = selectedActions.has(action.id);
                return (
                  <label
                    key={action.id}
                    className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                      checked
                        ? "border-indigo-500/40 bg-indigo-500/8"
                        : "border-white/5 bg-white/2 hover:bg-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAction(action.id)}
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all flex-shrink-0 ${
                          checked
                            ? "border-indigo-500 bg-indigo-600"
                            : "border-white/20 bg-white/5"
                        }`}
                      >
                        {checked && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium font-mono transition-colors ${checked ? "text-white" : "text-slate-400"}`}>
                        {action.id}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedActions.size === 0 && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                At least one action must be selected.
              </p>
            )}
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Submit                                                            */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading || selectedActions.size === 0}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-900/30"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Supervisor
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
