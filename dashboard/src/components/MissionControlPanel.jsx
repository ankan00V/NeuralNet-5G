import { useMemo, useState } from "react";
import { formatProbability, sentenceCase } from "../lib/formatters";

const tierLabels = {
  sandbox: "Sandbox",
  pilot: "Operator Pilot",
  autonomous: "Autonomous Ops",
};

const drillCatalog = [
  {
    faultType: "congestion",
    label: "Load Spike Drill",
    detail: "Simulate a high-traffic event and watch the AI reprioritize cell balancing.",
  },
  {
    faultType: "coverage_degradation",
    label: "Coverage Drift Drill",
    detail: "Create a radio coverage drop and inspect how the playbook changes.",
  },
  {
    faultType: "hardware_anomaly",
    label: "Hardware Anomaly Drill",
    detail: "Trigger unstable multi-KPI behavior and route it into field escalation.",
  },
];

export default function MissionControlPanel({ session, towers, cycleCount, dataMode, demoEnabled = false, onInjectDrill, onRecover }) {
  const [busyFaultType, setBusyFaultType] = useState("");
  const [resolvedFaultType, setResolvedFaultType] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  const summary = useMemo(() => {
    const sorted = towers.toSorted((left, right) => right.fault_probability - left.fault_probability);
    const topTower = sorted[0] ?? null;
    const active = towers.filter((tower) => tower.fault_probability > 0.3);
    const impactedSubscribers = active.reduce(
      (total, tower, index) => total + Math.round(180 + tower.fault_probability * 420 + index * 6),
      0,
    );
    const automationCoverage = Math.round(
      towers.reduce((total, tower) => total + tower.confidence, 0) / Math.max(1, towers.length) * 100,
    );

    return {
      topTower,
      activeCount: active.length,
      impactedSubscribers,
      automationCoverage,
    };
  }, [towers]);

  async function handleDrill(faultType) {
    setBusyFaultType(faultType);
    try {
      const result = await onInjectDrill(faultType);
      if (!result) return;
      setResolvedFaultType(faultType);
      window.setTimeout(() => setResolvedFaultType(""), 3500);
    } finally {
      setBusyFaultType("");
    }
  }

  async function handleRecovery() {
    setRecovering(true);
    try {
      const result = await onRecover(summary.topTower?.tower_id);
      if (!result) return;
      setRecoverySuccess(true);
      window.setTimeout(() => setRecoverySuccess(false), 4000);
    } finally {
      setRecovering(false);
    }
  }

  return (
    <section className="surface-panel overflow-hidden px-6 py-6 sm:px-7">
      <div className="flex flex-col gap-5 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="section-eyebrow">Mission Control</div>
          <h3 className="mt-2 text-[28px] font-display font-semibold leading-[1.08] tracking-apple-tighter">
            Operator workspace with closed-loop automation
          </h3>
          <p className="mt-2 max-w-[58ch] text-[16px] leading-[1.46] tracking-apple-tight text-black/72">
            Fault drills feed the autonomous service layer below. Recoverable towers are auto-remediated, hardware
            anomalies raise field dispatches, and the operator can still intervene when needed.
          </p>
        </div>

        <div className="grid gap-2 text-right">
          <div className="workspace-card">
            <div className="workspace-card__label">Active workspace</div>
            <div className="workspace-card__title">{session.operator}</div>
            <div className="workspace-card__subtitle">
              {tierLabels[session.plan] ?? "Secure Live"} · {session.role}
            </div>
          </div>
          <div className="inference-cycle-label">
            Last inference: {Math.max(1, (cycleCount * 3) % 45)}s ago
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] bg-[#08111c] px-4 py-4 text-white">
              <div className="text-[11px] uppercase tracking-[0.12px] text-white/42">Top tower risk</div>
              <div className="mt-2 text-[24px] font-display leading-[1.1] tracking-apple-loose">
                {summary.topTower?.tower_id ?? "Waiting"}
              </div>
              <div className="mt-2 text-[14px] leading-[1.38] tracking-apple-caption text-white/72">
                {summary.topTower ? formatProbability(summary.topTower.fault_probability) : "No tower yet"}
              </div>
            </div>

            <div className="rounded-[22px] bg-apple-surface px-4 py-4 ring-1 ring-black/[0.04]">
              <div className="text-[11px] uppercase tracking-[0.12px] text-black/44">Subscribers at risk</div>
              <div className="mt-2 text-[24px] font-display leading-[1.1] tracking-apple-loose text-black/86">
                {summary.impactedSubscribers.toLocaleString()}
              </div>
              <div className="mt-2 text-[14px] leading-[1.38] tracking-apple-caption text-black/68">
                {demoEnabled
                  ? "Simulated protected demand under the current incident queue."
                  : "Live estimate derived from current operator queue."}
              </div>
            </div>

            <div className="rounded-[22px] bg-apple-surface px-4 py-4 ring-1 ring-black/[0.04]">
              <div className="text-[11px] uppercase tracking-[0.12px] text-black/44">Automation coverage</div>
              <div className="mt-2 text-[24px] font-display leading-[1.1] tracking-apple-loose text-black/86">
                {summary.automationCoverage}%
              </div>
              <div className="mt-2 text-[14px] leading-[1.38] tracking-apple-caption text-black/68">
                Model confidence across towers in the current workspace.
              </div>
            </div>
          </div>

          {demoEnabled ? (
            <div className="mt-5 flex flex-row gap-3 overflow-x-auto pb-2">
              {drillCatalog.map((drill) => {
                const isBusy = busyFaultType === drill.faultType;
                const isResolved = resolvedFaultType === drill.faultType;
                return (
                  <button
                    key={drill.faultType}
                    type="button"
                    onClick={() => handleDrill(drill.faultType)}
                    disabled={!!busyFaultType || isResolved}
                    className={`drill-card min-w-[180px] w-[200px] max-w-[220px] flex-shrink-0 rounded-[24px] border px-4 py-4 text-left shadow-apple-lift transition-all duration-300 ease-apple hover:-translate-y-[2px] hover:shadow-apple-hover disabled:cursor-not-allowed ${
                      isResolved
                        ? "border-green/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04))] scale-[0.98]"
                        : "border-core-border bg-core-bg"
                    }`}
                  >
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.12px] transition-colors ${
                      isResolved ? "text-green" : "text-core-textMuted"
                    }`}>
                      {isResolved ? "✓ Drill active" : "Live drill"}
                    </div>
                    <div className={`mt-2 text-[20px] font-display leading-[1.14] tracking-apple-loose transition-colors ${
                      isResolved ? "text-green" : "text-core-text"
                    }`}>
                      {isBusy ? "Launching..." : isResolved ? drill.label : drill.label}
                    </div>
                    <p className={`mt-2 text-[14px] leading-[1.4] tracking-apple-caption transition-colors ${
                      isResolved ? "text-green/70" : "text-core-textMuted"
                    }`}>
                      {isResolved ? "Fault injected — autonomous loop is responding." : drill.detail}
                    </p>
                    {isResolved && (
                      <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-green/20">
                        <div className="h-full animate-[shrink_3.5s_linear_forwards] rounded-full bg-green" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-[20px] border border-core-border bg-core-bg px-4 py-4 text-[14px] text-core-textMuted">
              Live mode is active. Drill injection controls are disabled.
            </div>
          )}
        </div>

        <div className="rounded-[28px] bg-[#111111] px-5 py-5 text-white shadow-apple-lift">
          <div className="text-[11px] uppercase tracking-[0.12px] text-white/46">Autonomous response</div>
          <div className="mt-2 text-[24px] font-display leading-[1.08] tracking-apple-loose">
            {summary.topTower ? `Recover ${summary.topTower.tower_id}` : "Await next incident"}
          </div>
          <p className="mt-3 text-[15px] leading-[1.44] tracking-apple-caption text-white/72">
            NeuralNet5G will execute neighbor offload and transmit power rebalancing. Recovery will propagate across the fault queue, map, and activity stream.
          </p>

          <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.12px] text-white/42">Current target</div>
            <div className="mt-2 text-[18px] leading-[1.2] tracking-apple-tight text-white">
              {summary.topTower?.tower_id ?? "Waiting for tower"}
            </div>
            <div className="mt-2 text-[14px] leading-[1.4] tracking-apple-caption text-white/68">
              {summary.topTower
                ? `${sentenceCase(summary.topTower.fault_type)} · ${summary.topTower.lead_time_minutes} minute lead time`
                : "No action target has been selected yet."}
            </div>
          </div>

              <button
                type="button"
                onClick={handleRecovery}
                disabled={!summary.topTower || recovering || !demoEnabled}
                className={`mt-5 w-full justify-center py-4 text-[16px] font-semibold rounded-[14px] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                  recoverySuccess
                    ? "bg-green/20 text-green border border-green/30"
                    : "app-button-primary"
                }`}
              >
                {!demoEnabled
                  ? "Recovery Automation Disabled In Live Mode"
                  : recovering
                    ? "Executing Recovery..."
                    : recoverySuccess
                      ? "✓ Recovery Executed"
                      : "Run Autonomous Recovery"}
              </button>
        </div>
      </div>
    </section>
  );
}
