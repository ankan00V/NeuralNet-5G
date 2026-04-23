import { useMemo, useState } from "react";
import { formatProbability, formatTimestamp, sentenceCase } from "../lib/formatters";

const dispatchStages = ["open", "acknowledged", "dispatched", "remediated", "closed"];

function stageReached(currentStatus, stage) {
  const currentIndex = dispatchStages.indexOf(currentStatus);
  const stageIndex = dispatchStages.indexOf(stage);
  if (currentStatus === "failed" || currentStatus === "rolled_back") {
    return stage === "open" || stage === "acknowledged";
  }
  if (currentIndex === -1 || stageIndex === -1) return false;
  return currentIndex >= stageIndex;
}

function latestEventByName(history, eventName) {
  if (!Array.isArray(history)) return null;
  return [...history].reverse().find((entry) => entry.event === eventName) ?? null;
}

export default function OperatorWorkflowPanel({
  incidents = [],
  approvalQueue = [],
  dispatchTickets = [],
  onTransitionIncident,
  onAddIncidentNote,
  onVerifyIncidentResolution,
  onCloseIncident,
  onApproveAutoAction,
  onRejectAutoAction,
}) {
  const [selectedIncidentId, setSelectedIncidentId] = useState(incidents[0]?.incident_id ?? "");
  const [noteDraft, setNoteDraft] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const orderedIncidents = useMemo(
    () => [...incidents].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    [incidents],
  );

  const selectedIncident = useMemo(() => {
    if (!orderedIncidents.length) return null;
    return orderedIncidents.find((incident) => incident.incident_id === selectedIncidentId) ?? orderedIncidents[0];
  }, [orderedIncidents, selectedIncidentId]);

  const relatedTicket = useMemo(() => {
    if (!selectedIncident) return null;
    return dispatchTickets.find((ticket) => ticket.towerId === selectedIncident.tower_id) ?? null;
  }, [dispatchTickets, selectedIncident]);

  async function runAction(action, details = {}) {
    if (!selectedIncident) return;
    setBusyAction(action);
    try {
      await onTransitionIncident(selectedIncident.incident_id, action, details);
    } finally {
      setBusyAction("");
    }
  }

  async function submitNote() {
    if (!selectedIncident || !noteDraft.trim()) return;
    setBusyAction("note");
    try {
      await onAddIncidentNote(selectedIncident.incident_id, noteDraft.trim(), {
        source: "operator_console",
      });
      setNoteDraft("");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="surface-panel overflow-hidden px-6 py-6 sm:px-7">
      <div className="flex flex-col gap-2 border-b border-core-border pb-5">
        <div className="section-eyebrow">Operator Workflow</div>
        <h3 className="text-[24px] font-display font-semibold tracking-apple-tight text-core-text m-0">
          Incident lifecycle, approvals, escalation, and verification
        </h3>
        <p className="text-[14px] text-core-textMuted m-0">
          Real incident records drive the state machine from open to verified closure, including signed approvals and notes.
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid gap-3">
          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Escalation policy</div>
            <div className="mt-3 grid gap-2 text-[13px] text-core-textMuted">
              <div>
                <strong className="text-core-text">P1</strong> · Hardware anomaly or risk ≥ 86% requires explicit approval and dispatch.
              </div>
              <div>
                <strong className="text-core-text">P2</strong> · Risk between 80% and 85% allows approved auto-remediation.
              </div>
              <div>
                <strong className="text-core-text">P3</strong> · Below 80% stays in monitored queue with operator override.
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Approval path for auto-actions</div>
              <div className="status-pill bg-core-surfaceHover text-core-textMuted">{approvalQueue.length}</div>
            </div>
            <div className="mt-3 grid gap-3 max-h-[280px] overflow-auto pr-1">
              {approvalQueue.length === 0 ? (
                <div className="text-[13px] text-core-textMuted">No pending approvals.</div>
              ) : (
                approvalQueue.map((entry) => (
                  <article key={entry.id} className="rounded-[14px] border border-core-borderLight bg-core-surface px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-core-text">{entry.towerId}</div>
                      <div className="text-[10px] font-mono uppercase text-core-textMuted">{entry.status}</div>
                    </div>
                    <div className="mt-1 text-[12px] text-core-textMuted">{entry.policy} · {entry.reason}</div>
                    <div className="mt-1 text-[11px] font-mono text-core-textMuted">model {entry.modelVersion}</div>

                    {entry.status === "pending" ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onApproveAutoAction(entry.id, "operator")}
                          className="rounded border border-green/40 bg-green/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-green"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectAutoAction(entry.id, "Escalate to manual runbook")}
                          className="rounded border border-red/40 bg-red/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Incident state transitions</div>
              <div className="status-pill bg-core-surfaceHover text-core-textMuted">{orderedIncidents.length} incidents</div>
            </div>

            <div className="mt-3 grid gap-2 max-h-[190px] overflow-auto pr-1">
              {orderedIncidents.map((incident) => (
                <button
                  key={incident.incident_id}
                  type="button"
                  onClick={() => setSelectedIncidentId(incident.incident_id)}
                  className={`rounded-[12px] border px-3 py-2 text-left ${
                    selectedIncident?.incident_id === incident.incident_id
                      ? "border-core-primary bg-core-primary/10"
                      : "border-core-borderLight bg-core-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-core-text">{incident.incident_id}</span>
                    <span className="text-[10px] font-mono uppercase text-core-textMuted">{incident.status}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-core-textMuted">
                    {incident.tower_id} · {sentenceCase(incident.fault_type)} · {formatProbability(incident.fault_probability)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedIncident ? (
            <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
              <div className="text-[12px] font-semibold text-core-text">
                {selectedIncident.incident_id} · {selectedIncident.tower_id}
              </div>
              <div className="mt-1 text-[12px] text-core-textMuted">
                Opened {formatTimestamp(selectedIncident.opened_at)} · Updated {formatTimestamp(selectedIncident.updated_at)}
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {dispatchStages.map((stage) => (
                  <div
                    key={stage}
                    className={`rounded px-2 py-1.5 text-center text-[10px] font-mono uppercase tracking-wider ${
                      stageReached(selectedIncident.status, stage)
                        ? "bg-core-primary/15 text-core-primary border border-core-primary/40"
                        : "bg-core-surface text-core-textMuted border border-core-border"
                    }`}
                  >
                    {stage}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedIncident.status === "open" ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => runAction("acknowledge", { source: "operator_console" })}
                    className="rounded border border-core-primary/35 bg-core-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-core-primary"
                  >
                    Acknowledge
                  </button>
                ) : null}

                {["open", "acknowledged"].includes(selectedIncident.status) ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => runAction("dispatch", { source: "operator_console" })}
                    className="rounded border border-amber/40 bg-amber/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber"
                  >
                    Dispatch
                  </button>
                ) : null}

                {selectedIncident.status === "dispatched" ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => runAction("remediate", { source: "operator_console" })}
                    className="rounded border border-green/40 bg-green/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-green"
                  >
                    Mark remediated
                  </button>
                ) : null}

                {selectedIncident.status === "dispatched" ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => runAction("fail", { source: "operator_console", reason: "fix_failed" })}
                    className="rounded border border-red/40 bg-red/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red"
                  >
                    Mark failed
                  </button>
                ) : null}

                {["remediated", "failed", "rolled_back"].includes(selectedIncident.status) ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => onVerifyIncidentResolution(selectedIncident.incident_id, { verifier: "operator_console" })}
                    className="rounded border border-core-borderLight bg-core-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-core-text"
                  >
                    Resolution verification
                  </button>
                ) : null}

                {["remediated", "failed", "rolled_back"].includes(selectedIncident.status) ? (
                  <button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={() => onCloseIncident(selectedIncident.incident_id, { verifier: "operator_console" })}
                    className="rounded border border-core-borderLight bg-core-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-core-text"
                  >
                    Close
                  </button>
                ) : null}
              </div>

              {relatedTicket ? (
                <div className="mt-4 rounded-[12px] border border-core-borderLight bg-core-surface p-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Dispatch lifecycle</div>
                  <div className="mt-1 text-[12px] text-core-text">{relatedTicket.id} · {relatedTicket.assignedTeam}</div>
                  <div className="mt-1 text-[12px] text-core-textMuted">
                    {relatedTicket.operator} / {relatedTicket.region} · {relatedTicket.toolsRequired}
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Operator notes</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add note for audit trail"
                    className="w-full rounded border border-core-border bg-core-surface px-3 py-2 text-[13px] text-core-text outline-none"
                  />
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={busyAction !== "" || !noteDraft.trim()}
                    className="rounded border border-core-primary/35 bg-core-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-core-primary disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-[180px] overflow-auto rounded-[12px] border border-core-borderLight bg-core-surface p-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Traceable remediation history</div>
                <div className="mt-2 grid gap-2">
                  {(selectedIncident.history ?? [])
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="rounded border border-core-border bg-core-bg px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-core-text">{entry.event}</span>
                          <span className="text-[10px] font-mono text-core-textMuted">{formatTimestamp(entry.timestamp)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-core-textMuted">
                          {(entry.actor?.email || entry.actor?.subject || "system")} · {entry.actor?.role || "service"}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {latestEventByName(selectedIncident.history, "resolution_verified") ? (
                <div className="mt-3 rounded border border-green/30 bg-green/10 px-3 py-2 text-[12px] text-green">
                  Resolution verification logged.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[18px] border border-core-border bg-core-bg p-4 text-[13px] text-core-textMuted">
              No incidents available yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
