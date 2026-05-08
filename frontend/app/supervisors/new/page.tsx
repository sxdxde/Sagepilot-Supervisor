"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupervisor } from "@/lib/api";

const ALL_ACTIONS = [
  { id: "message_fulfillment_team", label: "Message Fulfillment Team",
    description: "Send alerts or updates to the team handling order packing & dispatch" },
  { id: "message_payments_team", label: "Message Payments Team",
    description: "Escalate payment failures or flag suspicious transactions" },
  { id: "message_logistics_team", label: "Message Logistics Team",
    description: "Coordinate with couriers and warehouse for shipping issues" },
  { id: "message_customer", label: "Message Customer",
    description: "Send proactive updates or requests for information to the customer" },
  { id: "create_internal_note", label: "Create Internal Note",
    description: "Log decisions and observations for human review" },
];

const AGGRESSIVENESS_OPTIONS = [
  { value: "conservative", label: "Conservative",
    description: "Only intervene on critical issues — payment failures, refund requests, or direct customer complaints.",
    ring: "ring-blue-500", bg: "bg-blue-50 border-blue-300", text: "text-blue-700", dot: "bg-blue-500" },
  { value: "moderate", label: "Moderate",
    description: "Act on delays and problems; check in periodically even without events.",
    ring: "ring-violet-500", bg: "bg-violet-50 border-violet-300", text: "text-violet-700", dot: "bg-violet-500" },
  { value: "aggressive", label: "Aggressive",
    description: "Proactively communicate on every significant order event, even minor ones.",
    ring: "ring-rose-500", bg: "bg-rose-50 border-rose-300", text: "text-rose-700", dot: "bg-rose-500" },
];

const MODELS = [
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (Groq)" },
  { value: "llama-3.1-8b-instant",    label: "Llama 3.1 8B Instant (Groq)" },
  { value: "mixtral-8x7b-32768",      label: "Mixtral 8x7B (Groq)" },
];

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

export default function NewSupervisorPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [baseInstruction, setBaseInstruction] = useState(
    "You are an AI supervisor monitoring e-commerce orders. Your goal is to ensure orders are fulfilled smoothly and customers are kept informed.\n\nProactively communicate with teams when issues arise. If a payment fails, alert the payments team immediately. If shipping is delayed, notify both logistics and the customer. Create internal notes to document your reasoning for each decision.\n\nAlways remain professional and solution-focused."
  );
  const [wakeInterval, setWakeInterval] = useState(2);
  const [aggressiveness, setAggressiveness] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set(ALL_ACTIONS.map((a) => a.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [instructionError, setInstructionError] = useState<string | null>(null);

  function toggleAction(id: string) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNameError(null); setInstructionError(null);
    let hasErrors = false;
    if (!name.trim()) { setNameError("Supervisor name is required."); hasErrors = true; }
    if (!baseInstruction.trim()) { setInstructionError("Base instruction is required."); hasErrors = true; }
    if (selectedActions.size === 0) { setError("Select at least one available action."); hasErrors = true; }
    if (hasErrors) return;
    setLoading(true);
    try {
      await createSupervisor({
        name, base_instruction: baseInstruction,
        wake_up_interval_minutes: wakeInterval,
        wake_aggressiveness: aggressiveness, model,
        available_actions: Array.from(selectedActions),
      });
      router.push("/?created=supervisor");
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
          <span className="text-sm text-gray-700 font-medium">New Supervisor</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Create Supervisor Config</h1>
            <p className="text-sm text-gray-500">Define how the AI agent monitors and responds to order events</p>
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
          {/* Identity */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Identity</h2>

            <div>
              <Label htmlFor="name" required>Supervisor Name</Label>
              <input
                id="name" type="text" value={name}
                onChange={(e) => { setName(e.target.value); setNameError(null); }}
                placeholder="e.g. Standard Order Supervisor"
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 transition-all ${
                  nameError
                    ? "border-red-300 focus:border-red-400 focus:ring-red-500/20"
                    : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                }`}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              <FieldHint>A short, descriptive name for this supervisor configuration.</FieldHint>
            </div>

            <div>
              <Label htmlFor="base_instruction" required>Base Instruction</Label>
              <textarea
                id="base_instruction" rows={8} value={baseInstruction}
                onChange={(e) => { setBaseInstruction(e.target.value); setInstructionError(null); }}
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 transition-all resize-none leading-relaxed ${
                  instructionError
                    ? "border-red-300 focus:border-red-400 focus:ring-red-500/20"
                    : "border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                }`}
              />
              {instructionError && <p className="mt-1 text-xs text-red-500">{instructionError}</p>}
              <FieldHint>The core system prompt that shapes how the agent reasons and acts.</FieldHint>
            </div>
          </section>

          {/* Behaviour */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Behaviour</h2>

            <div>
              <Label htmlFor="wake_interval">Check order every X minutes</Label>
              <div className="flex items-center gap-3">
                <input
                  id="wake_interval" type="number" min={1} max={1440} value={wakeInterval}
                  onChange={(e) => setWakeInterval(Number(e.target.value))}
                  className="w-32 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <span className="text-sm text-gray-400">minutes between scheduled wake-ups</span>
              </div>
              <FieldHint>The agent also wakes immediately on critical events, regardless of this interval.</FieldHint>
            </div>

            <div>
              <Label htmlFor="aggressiveness">Wake Aggressiveness</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {AGGRESSIVENESS_OPTIONS.map((opt) => {
                  const selected = aggressiveness === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAggressiveness(opt.value as typeof aggressiveness)}
                      className={`relative rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? `${opt.bg} ring-2 ${opt.ring} ring-offset-1`
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      {selected && (
                        <span className="absolute top-3 right-3">
                          <svg className={`w-4 h-4 ${opt.text}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                        <span className={`text-sm font-medium ${selected ? opt.text : "text-gray-700"}`}>
                          {opt.label}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${selected ? opt.text : "text-gray-400"} opacity-80`}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="model">Language Model</Label>
              <select
                id="model" value={model} onChange={(e) => setModel(e.target.value)}
                className={`${INPUT_CLS} appearance-none cursor-pointer`}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <FieldHint>All models run via Groq for low-latency inference.</FieldHint>
            </div>
          </section>

          {/* Available Actions */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Available Actions</h2>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setSelectedActions(new Set(ALL_ACTIONS.map((a) => a.id)))}
                  className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium">
                  Select all
                </button>
                <span className="text-gray-300">·</span>
                <button type="button" onClick={() => setSelectedActions(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Clear
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-400">
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
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-center mt-0.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleAction(action.id)} className="sr-only" />
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all flex-shrink-0 ${
                        checked ? "border-emerald-500 bg-emerald-600" : "border-gray-300 bg-white"
                      }`}>
                        {checked && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium font-mono transition-colors ${checked ? "text-emerald-800" : "text-gray-600"}`}>
                        {action.id}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{action.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedActions.size === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                At least one action must be selected.
              </p>
            )}
          </section>

          {/* Submit */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</Link>
            <button
              type="submit"
              disabled={loading || selectedActions.size === 0}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md shadow-emerald-900/20"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
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
