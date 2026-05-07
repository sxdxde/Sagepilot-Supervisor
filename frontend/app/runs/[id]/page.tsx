"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { use } from "react";
import {
  getRun, sendEvent, addInstruction,
  interruptRun, resumeRun, terminateRun,
  type RunDetail,
} from "@/lib/api";
import { StatusBadge, ActivityEntry, Card, FinalOutput } from "./components";

const ACTIVE_STATUSES = new Set(["active", "sleeping", "interrupted"]);

const EVENT_TYPES = [
  "order_created", "payment_confirmed", "payment_failed",
  "shipment_created", "shipment_delayed", "delivered",
  "refund_requested", "customer_message_received", "no_update_for_n_hours",
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Control button
// ---------------------------------------------------------------------------
function CtrlBtn({ onClick, disabled, loading, color, children }: {
  onClick: () => void; disabled: boolean; loading: boolean; color: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${color}`}>
      {loading && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Control loading states
  const [interrupting, setInterrupting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [terminating, setTerminating] = useState(false);

  // Event panel
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [eventPayload, setEventPayload] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  const [sendingEvent, setSendingEvent] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  // Instruction panel
  const [instruction, setInstruction] = useState("");
  const [sendingInstruction, setSendingInstruction] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [instructionOk, setInstructionOk] = useState(false);

  // Activity log auto-scroll
  const logRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(0);

  const fetchRun = useCallback(async () => {
    try {
      const data = await getRun(id);
      setRun(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Poll every 3 seconds while active
  useEffect(() => {
    fetchRun();
    const interval = setInterval(() => {
      if (run && !ACTIVE_STATUSES.has(run.status)) return;
      fetchRun();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchRun, run?.status]);

  // Auto-scroll log when new entries arrive
  useEffect(() => {
    const count = run?.activity_log?.length ?? 0;
    if (count > prevLogCount.current && logRef.current) {
      logRef.current.scrollTop = 0; // newest at top
    }
    prevLogCount.current = count;
  }, [run?.activity_log?.length]);

  // ---------------------------------------------------------------------------
  // Control handlers
  // ---------------------------------------------------------------------------
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
    if (!confirm("Terminate this run? The workflow will stop after completing its current action.")) return;
    setTerminating(true);
    try { await terminateRun(id); await fetchRun(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setTerminating(false); }
  }

  // ---------------------------------------------------------------------------
  // Event handler
  // ---------------------------------------------------------------------------
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
      await sendEvent(id, eventType, payload);
      setLastEvent(eventType);
      setEventPayload("");
    } catch (err: unknown) {
      setEventError(err instanceof Error ? err.message : "Error");
    } finally { setSendingEvent(false); }
  }

  // ---------------------------------------------------------------------------
  // Instruction handler
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading run…
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-sm">{error ?? "Run not found"}</p>
        <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">← Back to Dashboard</Link>
      </div>
    );
  }

  const status = run.status;
  const ws = run.workflow_state;
  const isDone = status === "completed" || status === "terminated";
  const isInterrupted = status === "interrupted";
  const sortedLogs = [...(run.activity_log ?? [])].reverse();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1 — Header                                                  */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">← Dashboard</Link>
            <span className="text-slate-700">/</span>
            <span className="text-slate-500 font-mono text-xs">{id.slice(0, 8)}…</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-white">{run.order_id}</h1>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                {run.supervisor_id && <span>Supervisor ID: <span className="font-mono">{run.supervisor_id.slice(0, 8)}…</span></span>}
                <span>Started: {fmtDate(run.created_at)}</span>
                {run.order_context?.customer_name && <span>Customer: {run.order_context.customer_name}</span>}
              </div>
            </div>

            {/* SECTION 2 — Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <CtrlBtn onClick={handleInterrupt} disabled={isDone || isInterrupted} loading={interrupting}
                color="bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30">
                ⏸ Interrupt
              </CtrlBtn>
              <CtrlBtn onClick={handleResume} disabled={!isInterrupted} loading={resuming}
                color="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30">
                ▶ Resume
              </CtrlBtn>
              <CtrlBtn onClick={handleTerminate} disabled={isDone} loading={terminating}
                color="bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30">
                ■ Terminate
              </CtrlBtn>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* SECTION 3 — Two column layout                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-4">

            {/* Box A — Workflow State */}
            <Card title="Workflow State">
              <dl className="space-y-2">
                {[
                  ["Status", <StatusBadge key="s" status={ws?.current_status ?? status} />],
                  ["Next Wake-up", ws?.next_wake_up_str ? fmtDate(ws.next_wake_up_str) : "Not scheduled"],
                  ["Actions Taken", ws?.actions_taken_count ?? "—"],
                  ["Pending Events", ws?.pending_events_count ?? "—"],
                  ["Extra Instructions", ws?.additional_instructions?.length ?? "—"],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-2">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="text-xs text-slate-200 text-right">{val as React.ReactNode}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* Box B — Memory Summary */}
            <Card title="Memory Summary">
              {run.memory_summary ? (
                <p className="text-sm text-slate-300 leading-relaxed">{run.memory_summary}</p>
              ) : (
                <p className="text-xs text-slate-600 italic">No memory yet — agent hasn&apos;t run</p>
              )}
            </Card>

            {/* Box C — Inject Event */}
            <Card title="Send Event">
              <form onSubmit={handleSendEvent} className="space-y-3">
                <select value={eventType} onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60 transition-all appearance-none">
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-[#1a1a2e]">{t}</option>
                  ))}
                </select>

                <button type="button" onClick={() => setShowPayload((p) => !p)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  {showPayload ? "▲ Hide payload" : "▼ Add JSON payload (optional)"}
                </button>

                {showPayload && (
                  <textarea value={eventPayload} onChange={(e) => setEventPayload(e.target.value)}
                    rows={3} placeholder='{"key": "value"}'
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-all resize-none" />
                )}

                {eventError && <p className="text-xs text-red-400">{eventError}</p>}
                {lastEvent && !eventError && (
                  <p className="text-xs text-emerald-400">✓ Sent: {lastEvent}</p>
                )}

                <button type="submit" disabled={sendingEvent || isDone}
                  className="w-full py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                  {sendingEvent && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  Send Event
                </button>
              </form>
            </Card>

            {/* Box D — Add Instruction */}
            <Card title="Add Instruction">
              <form onSubmit={handleAddInstruction} className="space-y-3">
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  rows={3} placeholder="e.g. If shipment is delayed, escalate immediately"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-all resize-none" />

                {instructionError && <p className="text-xs text-red-400">{instructionError}</p>}
                {instructionOk && <p className="text-xs text-emerald-400">✓ Instruction added</p>}

                <button type="submit" disabled={sendingInstruction || isDone || !instruction.trim()}
                  className="w-full py-2 rounded-lg bg-violet-600/80 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                  {sendingInstruction && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  Add Instruction
                </button>
              </form>

              {ws?.additional_instructions && ws.additional_instructions.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t border-white/5 pt-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Active instructions</p>
                  {ws.additional_instructions.map((inst, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-300">
                      <span className="text-violet-500 flex-shrink-0">{i + 1}.</span>
                      <span>{inst}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT COLUMN — Activity Timeline */}
          <div className="lg:col-span-3">
            <Card
              title="Activity Log"
              badge={
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs font-medium">
                  {sortedLogs.length}
                </span>
              }
              className="h-full"
            >
              {sortedLogs.length === 0 ? (
                <p className="text-xs text-slate-600 italic">No activity yet.</p>
              ) : (
                <div ref={logRef} className="overflow-y-auto max-h-[600px] -mx-4 px-4">
                  {sortedLogs.map((entry) => (
                    <ActivityEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 4 — Final Output (completed only)                        */}
        {/* ---------------------------------------------------------------- */}
        {status === "completed" && run.final_output && (
          <FinalOutput data={run.final_output} />
        )}
      </main>
    </div>
  );
}
