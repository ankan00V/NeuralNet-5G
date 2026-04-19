import { useMemo } from "react";
import { formatProbability, sentenceCase } from "../lib/formatters";

const pipelineSteps = [
  {
    label: "Telemetry window",
    value: "30 time steps",
    detail: "RSRP, SINR, DL/UL throughput, handover failure rate, and RTT per tower.",
  },
  {
    label: "ML inference",
    value: "Sequence model",
    detail: "Scores temporal KPI drift instead of reacting only after a hard outage alarm.",
  },
  {
    label: "Telecom classes",
    value: "4 outcomes",
    detail: "Normal, congestion, coverage degradation, and hardware anomaly.",
  },
  {
    label: "Closed loop action",
    value: "Top 3 responses",
    detail: "Ranks SON-style and field actions by confidence and expected resolution time.",
  },
];

const telecomKpis = [
  { label: "RSRP", detail: "coverage strength" },
  { label: "SINR", detail: "radio quality" },
  { label: "DL throughput", detail: "user experience" },
  { label: "UL throughput", detail: "uplink health" },
  { label: "HO failure rate", detail: "mobility stability" },
  { label: "RTT", detail: "latency pressure" },
];

export default function AIProofPanel({ towers }) {
  const insight = useMemo(() => {
    const active = towers.filter((tower) => tower.fault_probability > 0.3);
    const topTower = active.toSorted((left, right) => right.fault_probability - left.fault_probability)[0] ?? null;
    const averageLeadTime = active.length
      ? Math.round(active.reduce((total, tower) => total + tower.lead_time_minutes, 0) / active.length)
      : 22;

    return {
      topTower,
      activeCount: active.length,
      averageLeadTime,
    };
  }, [towers]);

  return (
    <section className="dark-explainer-card mt-6">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.05fr)_360px]">
        <div>
          <div className="section-eyebrow text-white/56">AI Telecom Engine</div>
          <h3 className="mt-2 text-[29px] font-display font-semibold leading-[1.08] tracking-apple-tighter sm:text-[34px] text-[#F0EFE9]">
            This product is an AI/ML fault prediction layer for 5G operations.
          </h3>
          <p className="mt-3 max-w-[64ch] text-[17px] leading-[1.47] tracking-apple-tight text-[#B0AFA9]">
            Each tower streams telecom KPIs into a 30-step sequence window. The model forecasts likely fault class,
            estimates the lead window before service impact, and converts that prediction into ranked self-healing or
            dispatch actions for the network team.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {pipelineSteps.map((step) => (
              <div key={step.label} className="feature-sub-card">
                <div className="feature-sub-card__label">{step.label}</div>
                <div className="feature-sub-card__title">
                  {step.value}
                </div>
                <p className="feature-sub-card__body">{step.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {telecomKpis.map((kpi) => (
              <div
                key={kpi.label}
                className="kpi-tag"
              >
                <strong>{kpi.label}</strong> · {kpi.detail}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
            {[
              { label: "3GPP TS 28.552", title: "5G KPI Definitions" },
              { label: "ITU-T X.733", title: "Fault Management" },
              { label: "SON", title: "Self-Organizing Networks" },
              { label: "3GPP TS 38.300", title: "NR Architecture" },
            ].map((std) => (
              <div
                key={std.label}
                className="inline-flex items-center gap-2 rounded-[6px] border border-[#2997ff]/30 bg-[#2997ff]/10 px-3 py-1.5 text-[11px] tracking-wide"
              >
                <span className="font-bold text-[#8abfff]">{std.label}</span>
                <span className="text-white/50">{std.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 self-start">
          <div className="operator-outcome-card">
            <div className="operator-outcome-card__label">Operator outcome</div>
            <div className="operator-outcome-card__title">
              This is an autonomous fault resolution service, not a monitoring dashboard.
            </div>
            <p className="operator-outcome-card__body">
              The model predicts network faults ahead of time, classifies the issue type, triggers remediation or
              dispatch, and proves the operator impact in the live workflow.
            </p>
          </div>

          <div className="proof-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="proof-panel__label">Current proof</div>
                <div className="proof-panel__title">Live model output</div>
              </div>
              <div className="proof-panel__count">{insight.activeCount} flagged</div>
            </div>

            <div className="mt-4">
              <div className="proof-row">
                <span className="proof-row__key">Forecast horizon</span>
                <span className="proof-row__value">15 to 30 minutes</span>
              </div>
              <div className="proof-row">
                <span className="proof-row__key">Average intervention lead time</span>
                <span className="proof-row__value">{insight.averageLeadTime} min</span>
              </div>
              <div className="proof-row">
                <span className="proof-row__key">Top predicted issue</span>
                <span className="proof-row__value">
                  {insight.topTower ? sentenceCase(insight.topTower.fault_type) : "No active fault"}
                </span>
              </div>
              <div className="proof-row" style={{borderBottom: 'none'}}>
                <span className="proof-row__key">Top tower risk</span>
                <span className="proof-row__value">
                  {insight.topTower
                    ? `${insight.topTower.tower_id} · ${formatProbability(insight.topTower.fault_probability)}`
                    : "Network nominal"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
