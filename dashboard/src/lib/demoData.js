const clusters = [
  { city: "Delhi NCR", lat: 28.6139, lon: 77.209, operator: "Airtel", profile: "urban_core", cluster: "North" },
  { city: "Mumbai BKC", lat: 19.076, lon: 72.8777, operator: "Jio", profile: "enterprise", cluster: "West" },
  { city: "Bengaluru ORR", lat: 12.9716, lon: 77.5946, operator: "Airtel", profile: "dense_urban", cluster: "South" },
  { city: "Hyderabad HITEC", lat: 17.385, lon: 78.4867, operator: "Jio", profile: "enterprise", cluster: "South" },
  { city: "Chennai OMR", lat: 13.0827, lon: 80.2707, operator: "Vi", profile: "coastal_core", cluster: "South" },
  { city: "Kolkata Sector V", lat: 22.5726, lon: 88.3639, operator: "Airtel", profile: "enterprise", cluster: "East" },
  { city: "Pune Hinjawadi", lat: 18.5204, lon: 73.8567, operator: "Jio", profile: "tech_corridor", cluster: "West" },
  { city: "Ahmedabad SG Highway", lat: 23.0225, lon: 72.5714, operator: "BSNL", profile: "suburban_mix", cluster: "West" },
  { city: "Jaipur Central", lat: 26.9124, lon: 75.7873, operator: "Vi", profile: "urban_core", cluster: "North" },
  { city: "Lucknow Gomti", lat: 26.8467, lon: 80.9462, operator: "BSNL", profile: "growth_corridor", cluster: "North" },
];

const faultCatalog = {
  congestion: {
    action_name: "load_balance_to_adjacent_cell",
    description: "Move high-PRB traffic into neighboring cells and reduce latency before the hot sector collapses.",
    top_action: "load balance to adjacent cells",
  },
  coverage_degradation: {
    action_name: "adjust_transmit_power",
    description: "Boost sector power and correct radio overlap to recover coverage and stabilize edge-user SINR.",
    top_action: "adjust transmit power",
  },
  hardware_anomaly: {
    action_name: "escalate_to_engineer",
    description: "Drain traffic, isolate the unstable radio path, and dispatch field engineering for hardware inspection.",
    top_action: "escalate to field engineer",
  },
};

const faultTypes = ["congestion", "coverage_degradation", "hardware_anomaly"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seeded(index, shift = 0) {
  return (Math.sin(index * 12.9898 + shift) + 1) / 2;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getStatus(probability) {
  if (probability > 0.7) return "red";
  if (probability > 0.3) return "amber";
  return "green";
}

function inferFaultType(probability, previousFaultType, index) {
  if (probability < 0.26) return "normal";
  if (probability > 0.72 && previousFaultType && previousFaultType !== "normal") return previousFaultType;
  return faultTypes[index % faultTypes.length];
}

function buildRecommendationSet(seedIndex, faultType, risk) {
  if (faultType === "normal") return [];

  const primary = faultCatalog[faultType];
  const confidence = clamp(0.58 + risk * 0.34, 0.58, 0.97);
  const alternatives = [
    {
      action_name: "neighbour_cell_offload",
      description: "Bias mobility thresholds to move sessions away from the impacted tower while recovery is underway.",
    },
    {
      action_name: "open_operator_bridge",
      description: "Start a coordinated bridge between RAN, transport, and field operations for faster escalation.",
    },
  ];

  return [
    {
      rank: 1,
      action_name: primary.action_name,
      description: primary.description,
      confidence_score: round(confidence, 2),
      estimated_resolution_minutes: 10 + (seedIndex % 4) * 4,
    },
    ...alternatives.map((action, actionIndex) => ({
      rank: actionIndex + 2,
      action_name: action.action_name,
      description: action.description,
      confidence_score: round(clamp(confidence - 0.14 - actionIndex * 0.08, 0.3, 0.9), 2),
      estimated_resolution_minutes: 18 + actionIndex * 10 + (seedIndex % 3) * 4,
    })),
  ];
}

function nextKpisForRisk(risk, basePhase, previousKpis) {
  return {
    rsrp: round(clamp(-79 - risk * 27 - Math.sin(basePhase) * 2.8, -125, -65)),
    sinr: round(clamp(24 - risk * 16 - Math.cos(basePhase * 1.1) * 1.8, -8, 30)),
    dl_throughput: round(clamp(520 - risk * 335 + Math.sin(basePhase * 0.8) * 24, 18, 620)),
    ul_throughput: round(clamp(68 - risk * 28 + Math.cos(basePhase * 0.7) * 5, 5, 90)),
    ho_failure_rate: round(clamp(1.1 + risk * 7 + Math.abs(Math.sin(basePhase * 0.9)) * 0.8, 0.3, 12), 2),
    rtt: round(clamp(18 + risk * 108 + Math.abs(Math.cos(basePhase * 0.75)) * 9, 8, 190)),
    timestamp: new Date((previousKpis?.timestamp ? new Date(previousKpis.timestamp) : new Date()).getTime() + 5000).toISOString(),
  };
}

function buildKpiHistory(seedIndex, current) {
  const now = Date.now();

  return Array.from({ length: 30 }, (_, offset) => {
    const step = 29 - offset;
    const phase = seedIndex * 0.6 + step * 0.22;
    const drift = step / 29;

    return {
      timestamp: new Date(now - step * 5 * 60 * 1000).toISOString(),
      rsrp: round(current.rsrp + Math.sin(phase) * 2.8 + drift * 4),
      sinr: round(current.sinr + Math.cos(phase * 1.2) * 1.6 + drift * 1.2),
      dl_throughput: round(current.dl_throughput + Math.sin(phase * 0.8) * 18 + drift * 26),
      ul_throughput: round(current.ul_throughput + Math.cos(phase * 0.75) * 5 + drift * 8),
      ho_failure_rate: round(current.ho_failure_rate + Math.sin(phase * 1.1) * 0.8 - drift * 0.9, 2),
      rtt: round(current.rtt + Math.cos(phase * 0.9) * 4 + drift * 8),
    };
  });
}

function appendHistory(tower, nextKpis) {
  const nextHistory = [...(tower.kpi_history ?? []), nextKpis];
  return nextHistory.slice(-30);
}

function buildTower(cluster, corridorIndex, sectorIndex) {
  const id = corridorIndex * 5 + sectorIndex + 1;
  const riskBase = seeded(id, 0.6);
  const risk =
    sectorIndex === 0
      ? clamp(0.72 + riskBase * 0.2, 0.72, 0.95)
      : sectorIndex === 1
        ? clamp(0.48 + riskBase * 0.18, 0.46, 0.72)
        : clamp(0.1 + riskBase * 0.28, 0.08, 0.46);
  const faultType = inferFaultType(risk, faultTypes[(id + corridorIndex) % faultTypes.length], id);
  const status = getStatus(risk);
  const latOffset = (sectorIndex - 2) * 0.032 + (seeded(id, 1.2) - 0.5) * 0.02;
  const lonOffset = (sectorIndex - 2) * 0.029 + (seeded(id, 2.4) - 0.5) * 0.02;
  const current = nextKpisForRisk(risk, id * 0.7, null);
  const catalogEntry = faultCatalog[faultType];

  return {
    tower_id: `TOWER_${String(id).padStart(3, "0")}`,
    city: `${cluster.city} Sector ${sectorIndex + 1}`,
    operator: cluster.operator,
    profile: cluster.profile,
    cluster: cluster.cluster,
    lat: round(cluster.lat + latOffset, 4),
    lon: round(cluster.lon + lonOffset, 4),
    status,
    fault_probability: round(risk, 2),
    fault_type: faultType,
    top_action: catalogEntry?.top_action ?? "none",
    lead_time_minutes: Math.max(5, Math.round((1 - risk) * 30)),
    confidence: round(clamp(0.52 + risk * 0.4, 0.52, 0.96), 2),
    state_phase: risk > 0.72 ? "fault" : risk > 0.36 ? "precursor" : "normal",
    acknowledged: false,
    last_updated: current.timestamp,
    kpis: current,
    kpi_history: buildKpiHistory(id, current),
    recommendations: buildRecommendationSet(id, faultType, risk),
  };
}

function pickInjectedTarget(towers, preferredIndex = 0) {
  return (
    towers.toSorted((left, right) => right.fault_probability - left.fault_probability)[preferredIndex] ??
    towers[preferredIndex] ??
    towers[0]
  );
}

export function injectDemoFault(towers, towerId, faultType) {
  return towers.map((tower, index) => {
    if (tower.tower_id !== towerId) return tower;

    const risk = clamp(0.84 + ((index % 4) * 0.03), 0.82, 0.95);
    const kpis = nextKpisForRisk(risk, index * 0.9 + Date.now() / 4000, tower.kpis);

    return {
      ...tower,
      status: "red",
      last_updated: kpis.timestamp,
      fault_probability: round(risk, 2),
      fault_type: faultType,
      top_action: faultCatalog[faultType].top_action,
      lead_time_minutes: 6 + (index % 4) * 2,
      confidence: round(clamp(risk + 0.02, 0.7, 0.98), 2),
      state_phase: "fault",
      kpis,
      kpi_history: appendHistory(tower, kpis),
      recommendations: buildRecommendationSet(index + 1, faultType, risk),
      __demoLockCycles: 6,
      __forcedFaultType: faultType,
    };
  });
}

export function resolveDemoFault(towers, towerId) {
  return towers.map((tower, index) => {
    if (tower.tower_id !== towerId) return tower;

    const risk = 0.16 + (index % 3) * 0.03;
    const kpis = nextKpisForRisk(risk, index * 0.8 + Date.now() / 5000, tower.kpis);

    return {
      ...tower,
      status: "green",
      last_updated: kpis.timestamp,
      fault_probability: round(risk, 2),
      fault_type: "normal",
      top_action: "none",
      lead_time_minutes: 26,
      confidence: 0.61,
      state_phase: "normal",
      kpis,
      kpi_history: appendHistory(tower, kpis),
      recommendations: [],
      __demoLockCycles: 0,
      __forcedFaultType: undefined,
    };
  });
}

export function triggerDemoDrill(towers, faultType) {
  const target = pickInjectedTarget(towers, faultType === "hardware_anomaly" ? 1 : 0);
  return target ? injectDemoFault(towers, target.tower_id, faultType) : towers;
}

export function advanceDemoTowers(towers, tick = 1) {
  return towers.map((tower, index) => {
    const basePhase = tick * 0.55 + index * 0.38;
    const locked = tower.__demoLockCycles > 0;
    const currentRisk = tower.fault_probability ?? 0.2;
    const drift = Math.sin(basePhase) * 0.07 + Math.cos(basePhase * 0.45) * 0.03;
    const nextRisk = locked
      ? clamp(currentRisk - 0.015 + Math.sin(basePhase * 1.1) * 0.02, 0.52, 0.96)
      : clamp(currentRisk + drift, 0.08, 0.92);
    const faultType = locked
      ? tower.__forcedFaultType
      : inferFaultType(nextRisk, tower.fault_type, index + Math.floor(tick));
    const status = getStatus(nextRisk);
    const kpis = nextKpisForRisk(nextRisk, basePhase, tower.kpis);

    return {
      ...tower,
      status,
      last_updated: kpis.timestamp,
      fault_probability: round(nextRisk, 2),
      fault_type: faultType,
      top_action: faultCatalog[faultType]?.top_action ?? "none",
      lead_time_minutes: Math.max(5, Math.round((1 - nextRisk) * 30)),
      confidence: round(clamp(0.54 + nextRisk * 0.38, 0.52, 0.97), 2),
      state_phase: status === "red" ? "fault" : status === "amber" ? "precursor" : "normal",
      kpis,
      kpi_history: appendHistory(tower, kpis),
      recommendations: buildRecommendationSet(index + 1, faultType, nextRisk),
      __demoLockCycles: Math.max(0, (tower.__demoLockCycles ?? 0) - 1),
      __forcedFaultType: tower.__demoLockCycles > 1 ? tower.__forcedFaultType : undefined,
    };
  });
}

export const demoTowers = clusters.flatMap((cluster, corridorIndex) =>
  Array.from({ length: 5 }, (_, sectorIndex) => buildTower(cluster, corridorIndex, sectorIndex)),
);
