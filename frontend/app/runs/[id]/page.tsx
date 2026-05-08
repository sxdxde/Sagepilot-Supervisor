"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { use } from "react";
import {
  getRun, sendEvent, addInstruction, interruptRun, resumeRun, terminateRun,
  type RunDetail,
} from "@/lib/api";
import { StatusBadge, ActivityEntry, Card, FinalOutput } from "./components";

const ACTIVE_STATUSES = new Set(["active", "sleeping", "interrupted"]);

const EVENT_TYPES: { value: string; label: string; critical?: boolean }[] = [
  { value: "order_created",             label: "Order Created" },
  { value: "payment_confirmed",         label: "Payment Confirmed" },
  { value: "payment_failed",            label: "Payment Failed",           critical: true },
  { value: "shipment_created",          label: "Shipment Created" },
  { value: "shipment_delayed",          label: "Shipment Delayed",         critical: true },
  { value: "delivered",                 label: "Delivered" },
  { value: "refund_requested",          label: "Refund Requested",         critical: true },
  { value: "customer_message_received", label: "Customer Message Received" },
  { value: "no_update_for_n_hours",     label: "No Update (Timeout)" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Control button ────────────────────────────────────────────────────────────

function CtrlBtn({
  onClick, disabled, loading, variant, children,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  variant: "orange" | "emerald" | "red";
  children: React.ReactNode;
}) {
  const styles = {
    orange:  "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    red:     "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {loading && (
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runStatusRef = useRef<string | undefined>(undefined);

  const [interrupting, setInterrupting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [terminating, setTerminating] = useState(false);

  const [eventType, setEventType] = useState(EVENT_TYPES[0].value);
  const [eventPayload, setEventPayload] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  const [sendingEvent, setSendingEvent] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [lastEventWillWake, setLastEventWillWake] = useState<boolean | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [sendingInstruction, setSendingInstruction] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [instructionOk, setInstructionOk] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(0);

  const fetchRun = useCallback(async () => {
    try {
      const data = await getRun(id);
      setRun(data);
      runStatusRef.current = data.status;
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRun();
    const interval = setInterval(() => {
      if (runStatusRef.current && !ACTIVE_STATUSES.has(runStatusRef.current)) return;
      fetchRun();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchRun]);

  useEffect(() => {
    const count = run?.activity_log?.length ?? 0;
    if (count > prevLogCount.current && logRef.current) logRef.current.scrollTop = 0;
    prevLogCount.current = count;
  }, [run?.activity_log?.length]);

  async function handleInterrupt() {
    setInterrupting(true);
    try { await interruptRun(id); await fetchRun(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setInterrupting(false); }
  }

  async function handleResume() {
    setResuming(true);
    try { await resumeRun(id); await fetchRun(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setResuming(false); }
  }

  async function handleTerminate() {
    if (!confirm("Are you sure you want to terminate this run? This cannot be undone.")) return;
    setTerminating(true);
    try { await terminateRun(id); await fetchRun(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setTerminating(false); }
  }

  async function handleSendEvent(e: React.FormEvent) {
    e.preventDefault();
    setEventError(null);
    let payload: Record<string, unknown> = {};
    if (eventPayload.trim()) {
      try { payload = JSON.parse(eventPayload); }
      catch { setEventError("Payload must be valid JSON"); return; }
    }
    setSendingEvent(true);
    try {
      const result = await sendEvent(id, eventType, payload);
      setLastEvent(EVENT_TYPES.find((t) => t.value === eventType)?.label ?? eventType);
      setLastEventWillWake(result.will_wake);
      setEventPayload("");
    } catch (err: unknown) {
      setEventError(err instanceof Error ? err.message : "Error");
    } finally { setSendingEvent(false); }
  }

  async function handleAddInstruction(e: React.FormEvent) {
    e.preventDefault();
    setInstructionError(null);
    setInstructionOk(false);
    if (!instruction.trim()) return;
    setSendingInstruction(true);
    try {
      await addInstruction(id, instruction.trim());
      setInstruction("");
      setInstructionOk(true);
      await fetchRun();
      setTimeout(() => setInstructionOk(false), 3000);
    } catch (err: unknown) {
      setInstructionError(err instanceof Error ? err.message : "Error");
    } finally { setSendingInstruction(false); }
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading run...
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600 text-sm">{error ?? "Run not found"}</p>
        <Link href="/" className="text-emerald-600 hover:text-emerald-700 text-sm transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const status = run.status;
  const ws = run.workflow_state;
  const isDone = status === "completed" || status === "terminated";
  const isInterrupted = status === "interrupted";
  const sortedLogs = [...(run.activity_log ?? [])].reverse();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50">

      {/* ── Sticky header ── */}
      <header className="sticky top-14 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors">Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500 font-mono text-xs">{id.slice(0, 8)}...</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{run.order_id}</h1>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                {run.supervisor_id && (
                  <span>Supervisor: <span className="font-mono">{run.supervisor_id.slice(0, 8)}...</span></span>
                )}
                <span>Started: {fmtDate(run.created_at)}</span>
                {run.order_context?.customer_name && (
                  <span>Customer: {run.order_context.customer_name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CtrlBtn onClick={handleInterrupt} disabled={isDone || isInterrupted} loading={interrupting} variant="orange">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                Interrupt
              </CtrlBtn>
              <CtrlBtn onClick={handleResume} disabled={!isInterrupted} loading={resuming} variant="emerald">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Resume
              </CtrlBtn>
              <CtrlBtn onClick={handleTerminate} disabled={isDone} loading={terminating} variant="red">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Terminate
              </CtrlBtn>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {status === "completed" && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">This order run has completed.</p>
          </div>
        )}

        {status === "sleeping" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-800 font-medium">
                Agent is sleeping.{" "}
                {ws?.next_wake_up_str
                  ? <>Next scheduled wake: <span className="font-semibold">{fmtDate(ws.next_wake_up_str)}</span></>
                  : "Waiting for next scheduled wake."}
              </p>
            </div>
            <p className="text-xs text-amber-600">
              Send a critical event to wake the agent early, or wait for the scheduled check-in.
            </p>
          </div>
        )}

        {status === "interrupted" && (
          <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
            <p className="text-sm text-orange-800 font-medium">
              Run is paused for manual review. Click <span className="font-semibold">Resume</span> to continue supervision.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left column */}
          <div className="lg:col-span-2 space-y-4">

            {/* Workflow State */}
            <Card title="Workflow State">
              <dl className="space-y-2">
                {([
                  ["Status", <StatusBadge key="s" status={ws?.current_status ?? status} />],
                  ["Next Wake-up", ws?.next_wake_up_str ? fmtDate(ws.next_wake_up_str) : "—"],
                  ["Actions Taken", ws?.actions_taken_count ?? "—"],
                  ["Pending Events", ws?.pending_events_count ?? "—"],
                  ["Extra Instructions", ws?.additional_instructions?.length ?? "—"],
                ] as [string, React.ReactNode][]).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-xs text-gray-400">{label}</dt>
                    <dd className="text-xs text-gray-700 text-right font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* Memory Summary */}
            <Card title="Memory Summary">
              {run.memory_summary ? (
                <p className="text-sm text-gray-700 leading-relaxed">{run.memory_summary}</p>
              ) : (run.activity_log?.length ?? 0) > 0 ? (
                <p className="text-xs text-gray-400 italic">No memory recorded yet</p>
              ) : (
                <p className="text-xs text-gray-400 italic">Waiting for first agent run…</p>
              )}
            </Card>

            {/* Send Event */}
            <Card title="Send Event">
              <form onSubmit={handleSendEvent} className="space-y-3">
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none cursor-pointer"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}{t.critical ? " — critical" : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowPayload((p) => !p)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showPayload ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {showPayload ? "Hide payload" : "Add JSON payload (optional)"}
                </button>

                {showPayload && (
                  <textarea
                    value={eventPayload}
                    onChange={(e) => setEventPayload(e.target.value)}
                    rows={3}
                    placeholder='{"key": "value"}'
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-mono placeholder-gray-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                  />
                )}

                {eventError && <p className="text-xs text-red-500">{eventError}</p>}
                {lastEvent && !eventError && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    lastEventWillWake
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lastEventWillWake ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                    {lastEventWillWake
                      ? `${lastEvent} sent — agent waking now`
                      : `${lastEvent} sent — queued for next scheduled wake`}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sendingEvent || isDone}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {sendingEvent && (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  Send Event
                </button>
              </form>
            </Card>

            {/* Add Instruction */}
            <Card title="Add Instruction">
              <form onSubmit={handleAddInstruction} className="space-y-3">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder="e.g. If shipment is delayed, escalate immediately"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                />

                {instructionError && <p className="text-xs text-red-500">{instructionError}</p>}
                {instructionOk && <p className="text-xs text-emerald-600 font-medium">Instruction added</p>}

                <button
                  type="submit"
                  disabled={sendingInstruction || isDone || !instruction.trim()}
                  className="w-full py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  {sendingInstruction && (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  Add Instruction
                </button>
              </form>

              {ws?.additional_instructions && ws.additional_instructions.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Active instructions</p>
                  {ws.additional_instructions.map((inst, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-600">
                      <span className="text-emerald-500 flex-shrink-0 font-medium">{i + 1}.</span>
                      <span>{inst}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right column — Activity Log */}
          <div className="lg:col-span-3">
            <Card
              title="Activity Log"
              badge={
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium">
                  {sortedLogs.length}
                </span>
              }
              className="h-full"
            >
              {sortedLogs.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-4">
                  No activity yet — the agent will log its actions here.
                </p>
              ) : (
                <div ref={logRef} className="overflow-y-auto max-h-[70vh] -mx-4 px-2">
                  {sortedLogs.map((entry) => (
                    <ActivityEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {status === "completed" && run.final_output && (
          <FinalOutput data={run.final_output} />
        )}
      </main>
    </div>
  );
}
