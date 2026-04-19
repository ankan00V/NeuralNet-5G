import { useEffect, useMemo, useRef, useState } from "react";
import AIProofPanel from "../components/AIProofPanel";
import AlertFeed from "../components/AlertFeed";
import DispatchTicketPanel from "../components/DispatchTicketPanel";
import LiveActivityRail from "../components/LiveActivityRail";
import MissionControlPanel from "../components/MissionControlPanel";
import RecommendationPanel from "../components/RecommendationPanel";
import ServiceImpactPanel from "../components/ServiceImpactPanel";
import TowerDetail from "../components/TowerDetail";
import TowerMap from "../components/TowerMap";
import { useLiveNetwork } from "../context/WebSocketContext";
import { formatProbability } from "../lib/formatters";

export default function Dashboard({ demoMoment, session }) {
  const {
    activityLog,
    cycleCount,
    dataMode,
    demoEnabled,
    dispatchTickets,
    runAutonomousRecovery,
    serviceMetrics,
    serviceRecords,
    towerServiceState,
    towers,
    triggerIncidentDrill,
  } = useLiveNetwork();
  const [selectedTower, setSelectedTower] = useState(null);
  const [attentionTowerId, setAttentionTowerId] = useState("");
  const missionControlRef = useRef(null);
  const handledDemoTokenRef = useRef(null);

  const metrics = useMemo(() => {
    const critical = towers.filter((tower) => tower.status === "red").length;
    const warning = towers.filter((tower) => tower.status === "amber").length;
    
    // Calculate a 0-100 aggregate network health score. In a real environment, this factors in availability and throughput.
    const averageRisk = towers.length ? towers.reduce((total, tower) => total + tower.fault_probability, 0) / towers.length : 0;
    const healthScore = Math.max(0, Math.round(100 - (averageRisk * 100) - (critical * 0.5)));

    return [
      {
        label: "NETWORK HEALTH",
        value: `${healthScore}/100`,
        detail: "Aggregate availability & stability",
        color: healthScore > 85 ? "text-green" : healthScore > 70 ? "text-amber" : "text-red",
      },
      {
        label: "CRITICAL TOWERS",
        value: critical,
        detail: "Failure window open",
        color: critical > 0 ? "text-[rgba(235,85,69,1)]" : "text-[var(--text-primary)]",
      },
      {
        label: "WARNING TOWERS",
        value: warning,
        detail: "KPI drift detected",
        color: warning > 0 ? "text-[rgba(245,166,35,1)]" : "text-[var(--text-primary)]",
      },
      {
        label: "ACTIVE DISPATCHES",
        value: dispatchTickets.length,
        detail: "Field teams deployed",
        color: "text-[var(--accent)]",
      }
    ];
  }, [towers, dispatchTickets.length]);

  useEffect(() => {
    if (!demoMoment?.towerId) return undefined;
    if (handledDemoTokenRef.current === demoMoment.token) return undefined;

    const targetTower = towers.find((tower) => tower.tower_id === demoMoment.towerId);
    handledDemoTokenRef.current = demoMoment.token;
    if (targetTower) {
      setSelectedTower(targetTower);
    }
    setAttentionTowerId(demoMoment.towerId);
    missionControlRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = window.setTimeout(() => {
      setAttentionTowerId("");
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [demoMoment, towers]);

  return (
    <section className="pb-6 animate-fade-in-up">
      {/* Dense KPI Ribbon */}
      <div className="surface-panel mb-6 px-4 py-4 translate-y-[-12px]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4 border-b border-core-border pb-4 lg:border-b-0 lg:pb-0 lg:border-r pr-6">
            <h1 className="text-xl font-bold tracking-tight text-white m-0">Live Network Insights</h1>
            <div className="status-pill border-core-primary bg-core-primary/10 text-core-primary hidden sm:flex">
              {dataMode === "live" ? "LIVE ML TELEMETRY" : "DEMO ML TELEMETRY"}
            </div>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 flex-1 text-left">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col">
                <span className="text-[10px] font-mono tracking-wider font-semibold text-[var(--text-secondary)] uppercase">{metric.label}</span>
                <span className={`text-[24px] tracking-tight font-display font-bold mt-1 ${metric.color ?? "text-[var(--text-primary)]"}`}>
                  {metric.value}
                </span>
                <span className="text-[12px] tracking-apple-caption text-[var(--text-secondary)] mt-1 hidden sm:block">{metric.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <ServiceImpactPanel serviceMetrics={serviceMetrics} />
      </div>

      <div className="mt-6">
        <AIProofPanel towers={towers} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_400px]">
        <div className="relative">
          <div ref={missionControlRef} id="mission-control">
            <MissionControlPanel
              session={session}
              towers={towers}
              cycleCount={cycleCount}
              dataMode={dataMode}
              demoEnabled={demoEnabled}
              onInjectDrill={triggerIncidentDrill}
              onRecover={runAutonomousRecovery}
            />
          </div>
          {dispatchTickets.length > 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[24px] bg-core-page/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="w-full max-w-[600px] shadow-apple-hover scale-[0.98]">
                <DispatchTicketPanel dispatchTickets={dispatchTickets} />
              </div>
            </div>
          )}
        </div>
        <div className="h-[500px] xl:h-[640px] min-h-0">
          <LiveActivityRail activityLog={activityLog} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.62fr)_352px] xl:items-start">
        <div className="group flex flex-col overflow-hidden rounded-lg border border-core-border bg-core-surface shadow-sm h-[500px] xl:h-[680px]">
          <div className="px-5 py-4 border-b border-core-border flex items-center justify-between bg-core-surfaceHover">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-core-textMuted uppercase mb-1">Inference Graph</span>
              <h3 className="text-[16px] font-semibold text-core-text m-0">National Tower Risk Grid</h3>
            </div>
            <div className="text-[11px] font-mono bg-core-bg border border-core-border px-2 py-1 rounded text-core-textMuted hidden sm:block">
              Select any node to view KPI trace
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-core-bg">
            <TowerMap
              towers={towers}
              selectedTower={selectedTower}
              attentionTowerId={attentionTowerId}
              onSelectTower={setSelectedTower}
            />
          </div>
        </div>

        <div className="grid gap-6 xl:sticky xl:top-[72px] xl:h-[calc(100vh-104px)] xl:grid-rows-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <AlertFeed towers={towers} serviceRecords={serviceRecords} demoEnabled={demoEnabled} />
          <RecommendationPanel towers={towers} />
        </div>
      </div>

      <TowerDetail
        tower={selectedTower}
        serviceState={selectedTower ? towerServiceState[selectedTower.tower_id] : null}
        dispatchTicket={selectedTower ? dispatchTickets.find((ticket) => ticket.towerId === selectedTower.tower_id) : null}
        onClose={() => setSelectedTower(null)}
      />
    </section>
  );
}
