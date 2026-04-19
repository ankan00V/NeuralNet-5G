import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { formatProbability, sentenceCase } from "../lib/formatters";
import { buildApiPath } from "../lib/runtimeConfig";

function Countdown({ tower }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const target = new Date(tower.kpis.timestamp).getTime() + tower.lead_time_minutes * 60 * 1000;
  const remainingMs = Math.max(0, target - now);
  const minutes = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");

  return <span className="text-[14px] font-semibold tracking-apple-caption text-[var(--text-secondary)]">{minutes}:{seconds}</span>;
}

export default function AlertFeed({ towers, serviceRecords = [], maxItems = 10, expanded = false, demoEnabled = false }) {
  const [acknowledgedIds, setAcknowledgedIds] = useState([]);
  const [flashConfirmedIds, setFlashConfirmedIds] = useState([]);
  const timerRefs = useRef({});

  const alerts = useMemo(() => {
    const active = towers
      .filter((tower) => tower.fault_probability > 0.3 && !acknowledgedIds.includes(tower.tower_id))
      .sort((left, right) => right.fault_probability - left.fault_probability);
    return active.slice(0, maxItems);
  }, [acknowledgedIds, maxItems, towers]);

  async function acknowledge(towerId) {
    try {
      const response = await fetch(buildApiPath("/api/acknowledge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tower_id: towerId, alert_id: `${towerId}-latest` }),
      });
      if (!response.ok) {
        throw new Error(`Acknowledge failed with status ${response.status}`);
      }

      setFlashConfirmedIds((curr) => [...curr, towerId]);
      timerRefs.current[towerId] = window.setTimeout(() => {
        setFlashConfirmedIds((curr) => curr.filter((id) => id !== towerId));
        startTransition(() => {
          setAcknowledgedIds((current) => [...current, towerId]);
        });
      }, 1800);
    } catch {
      if (!demoEnabled) return;
      setFlashConfirmedIds((curr) => [...curr, towerId]);
      timerRefs.current[towerId] = window.setTimeout(() => {
        setFlashConfirmedIds((curr) => curr.filter((id) => id !== towerId));
        startTransition(() => {
          setAcknowledgedIds((current) => [...current, towerId]);
        });
      }, 1800);
    }
  }

  return (
    <section className="surface-panel flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 sm:px-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow">Active AI alerts</div>
          <h3 className="mt-2 text-[21px] font-display font-semibold leading-[1.19] tracking-apple-loose">
            ML-prioritized fault queue
          </h3>
          <p className="mt-1 max-w-[24ch] text-[17px] leading-[1.42] tracking-apple-tight text-black/76">
            Towers sorted by forecasted telecom risk and intervention urgency.
          </p>
        </div>
        <div className="status-pill bg-black/[0.04] text-black/68">{alerts.length + Math.min(serviceRecords.length, 3)} tracked</div>
      </div>

      {alerts.length === 0 && serviceRecords.length === 0 ? (
        <div className="surface-muted flex flex-1 items-center justify-center px-6 py-10 text-center">
          <div>
            <div className="text-[28px] font-display font-normal leading-[1.14] tracking-apple-loose">All clear</div>
            <div className="mt-2 text-[17px] leading-[1.47] tracking-apple-tight text-black/72">
              No towers are currently above the active alert threshold.
            </div>
          </div>
        </div>
      ) : (
        <div className={`min-h-0 flex-1 overflow-auto pr-1 ${expanded ? "max-h-none" : ""}`}>
          <div className="grid gap-3">
            {serviceRecords.slice(0, 3).map((record, idx) => (
              <div
                key={record.id}
                className="rounded-[24px] border border-green/20 bg-[linear-gradient(180deg,rgba(29,158,117,0.09),rgba(29,158,117,0.03))] px-4 py-4 transition-all duration-300 ease-apple animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="badge badge--recovered">
                      {record.badge}
                    </div>
                    <div className="mt-3 text-[20px] font-display leading-[1.16] tracking-apple-loose text-[var(--text-primary)]">
                      {record.towerId}
                    </div>
                    <div className="mt-1 text-[14px] leading-[1.29] tracking-apple-caption text-black/68">{record.action}</div>
                  </div>
                  <div className="text-[12px] tracking-[0.12px] text-black/52">{new Date(record.timestamp).toLocaleTimeString("en-IN")}</div>
                </div>

                <p className="mt-3 text-[14px] leading-[1.42] tracking-apple-caption text-black/72">{record.detail}</p>

                {"usersProtected" in record ? (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border)] pt-4 text-[13px] leading-[1.32] tracking-apple-caption text-[var(--text-secondary)]">
                    <span>Users protected: <span className="font-semibold text-[var(--text-primary)]">~{record.usersProtected.toLocaleString()}</span></span>
                    <span>Downtime avoided: <span className="font-semibold text-[var(--text-primary)]">{record.downtimeAvoidedMinutes} min</span></span>
                  </div>
                ) : null}
              </div>
            ))}
            {alerts.map((tower, idx) => (
              <div 
                key={tower.tower_id} 
                className="surface-muted px-4 py-4 transition-all duration-300 ease-apple animate-fade-in-up hover:-translate-y-1 hover:shadow-apple-hover active:scale-[0.99]"
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-black/52">
                      {sentenceCase(tower.status)}
                    </div>
                    <div className="mt-2 text-[20px] font-display leading-[1.16] tracking-apple-loose">
                      {tower.tower_id}
                    </div>
                    <div className="mt-1 text-[14px] leading-[1.29] tracking-apple-caption text-[var(--text-secondary)]">
                      {sentenceCase(tower.fault_type)}
                    </div>
                  </div>
                  <Countdown tower={tower} />
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.12px] text-[var(--text-secondary)]">
                    <span>Fault probability</span>
                    <span>{formatProbability(tower.fault_probability)}</span>
                  </div>
                  <div className="h-[3px] overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        tower.status === "red" ? "bg-[rgba(235,85,69,1)]" : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${Math.max(10, tower.fault_probability * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-1 text-[14px] leading-[1.29] tracking-apple-caption text-[var(--text-secondary)]">
                    <div>
                      Action: <span className="font-semibold text-[var(--text-primary)]">{sentenceCase(tower.top_action)}</span>
                    </div>
                    <div>
                      Lead time: <span className="font-semibold text-[var(--text-primary)]">{tower.lead_time_minutes} minutes</span>
                    </div>
                  </div>
                  {(() => {
                    const isFlashing = flashConfirmedIds.includes(tower.tower_id);
                    return (
                      <button
                        type="button"
                        onClick={() => acknowledge(tower.tower_id)}
                        disabled={isFlashing}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-[8px] border px-4 py-2 text-[12px] font-bold uppercase tracking-wider transition-all duration-300 ${
                          isFlashing
                            ? "border-green/40 bg-green/10 text-green"
                            : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
                        }`}
                        style={isFlashing ? { animation: "ack-pulse 0.9s ease-out" } : {}}
                      >
                        {isFlashing ? (
                          <>
                            <span className="inline-block h-2 w-2 rounded-full bg-green" />
                            Acknowledged
                          </>
                        ) : (
                          "Acknowledge"
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
