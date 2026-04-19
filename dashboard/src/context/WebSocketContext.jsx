import { createContext, startTransition, useContext, useEffect, useMemo, useRef, useState } from "react";
import { advanceDemoTowers, demoTowers, injectDemoFault, resolveDemoFault, triggerDemoDrill } from "../lib/demoData";
import { buildApiPath, isDemoModeEnabled, resolveWsUrl } from "../lib/runtimeConfig";

const MAX_ACTIVITY_ITEMS = 16;
const MAX_SERVICE_RECORDS = 12;
const MAX_DISPATCH_TICKETS = 6;
const AUTO_REMEDIATION_THRESHOLD = 0.8;
const DEFAULT_MTTR_MINUTES = 75;
const COST_PER_MINUTE = 650;
const FIELD_TEAMS = ["Field Team A", "Field Team B", "Field Team C"];
const TOOLS_BY_FAULT = {
  hardware_anomaly: "RF analyser, baseband unit",
  coverage_degradation: "Tilt kit, spectrum scanner",
  congestion: "SON profile pack, capacity console",
};
const SUBSCRIBERS_BY_PROFILE = {
  urban_core: 3400,
  dense_urban: 4200,
  enterprise: 2600,
  transit_hub: 3100,
  suburban: 1850,
  coastal_core: 2400,
  tech_corridor: 2900,
  growth_corridor: 2200,
  suburban_mix: 2100,
};

const WebSocketContext = createContext({
  towers: [],
  connected: false,
  lastUpdate: null,
  dataMode: "live",
  demoEnabled: false,
  cycleCount: 0,
  activityLog: [],
  serviceMetrics: {
    autoResolvedCount: 0,
    downtimeAvoidedMinutes: 0,
    usersProtected: 0,
    costSaved: 0,
  },
  serviceRecords: [],
  dispatchTickets: [],
  towerServiceState: {},
  injectFault: async () => null,
  runAutonomousRecovery: async () => null,
  triggerIncidentDrill: async () => null,
  triggerDemoInference: async () => null,
});

function createActivityEntry(type, title, detail, tone = "info", towerId = null) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    detail,
    tone,
    towerId,
    timestamp: new Date().toISOString(),
  };
}

function limitActivity(entries) {
  return entries.slice(0, MAX_ACTIVITY_ITEMS);
}

function limitItems(entries, maxItems) {
  return entries.slice(0, maxItems);
}

function stampTowers(towers, timestamp) {
  return towers.map((tower) => ({
    ...tower,
    last_updated: timestamp,
  }));
}

function estimateUsersProtected(tower) {
  const profileBase = SUBSCRIBERS_BY_PROFILE[tower.profile] ?? 2200;
  return Math.round(profileBase + tower.fault_probability * 850);
}

function resolveActionSummary(tower) {
  if (tower.fault_type === "coverage_degradation") return "TX power adjusted +3dB";
  if (tower.fault_type === "congestion") return "Traffic rebalanced to adjacent cells";
  if (tower.fault_type === "hardware_anomaly") return "Field dispatch raised";
  return "Recovery workflow executed";
}

function buildDispatchTicket(tower) {
  const numericId = Math.floor(1000 + (Date.now() % 9000));
  return {
    id: `NN-${numericId}`,
    towerId: tower.tower_id,
    city: tower.city ?? "Operator site",
    faultType: tower.fault_type,
    severity: "HIGH",
    lat: tower.lat ?? tower.kpis.lat ?? 0,
    lon: tower.lon ?? tower.kpis.lon ?? 0,
    predictedWindow: tower.lead_time_minutes,
    toolsRequired: TOOLS_BY_FAULT[tower.fault_type] ?? "RF analyser, field laptop",
    assignedTeam: FIELD_TEAMS[numericId % FIELD_TEAMS.length],
    timestamp: new Date().toISOString(),
  };
}

function deriveActivityEntries(previousTowers, nextTowers) {
  const previousById = new Map(previousTowers.map((tower) => [tower.tower_id, tower]));
  const entries = [];

  nextTowers.forEach((tower) => {
    const previous = previousById.get(tower.tower_id);
    if (!previous) return;

    if (tower.status === "red" && previous.status !== "red") {
      entries.push(
        createActivityEntry(
          "critical",
          `${tower.tower_id} escalated to critical`,
          `AI raised ${tower.fault_type.replaceAll("_", " ")} risk to ${Math.round(
            tower.fault_probability * 100,
          )}% and opened a ${tower.lead_time_minutes} minute response window.`,
          "critical",
          tower.tower_id,
        ),
      );
      return;
    }

    if (tower.status === "green" && previous.status !== "green") {
      entries.push(
        createActivityEntry(
          "recovered",
          `${tower.tower_id} returned to nominal`,
          "The recovery playbook brought the tower back into the safe operating band.",
          "positive",
          tower.tower_id,
        ),
      );
      return;
    }

    const probabilityDelta = tower.fault_probability - previous.fault_probability;
    if (probabilityDelta >= 0.18) {
      entries.push(
        createActivityEntry(
          "warning",
          `Risk jump on ${tower.tower_id}`,
          `The model saw a ${Math.round(probabilityDelta * 100)} point increase and updated the response order.`,
          "warning",
          tower.tower_id,
        ),
      );
      return;
    }

    if (tower.top_action !== previous.top_action && tower.fault_probability > 0.36) {
      entries.push(
        createActivityEntry(
          "playbook",
          `Playbook updated for ${tower.tower_id}`,
          `Recommended action is now ${tower.top_action.replaceAll("_", " ")} based on the latest KPI drift.`,
          "info",
          tower.tower_id,
        ),
      );
    }
  });

  return entries.slice(0, 3);
}

async function postJson(path, payload) {
  const response = await fetch(buildApiPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function WebSocketProvider({ children }) {
  const initialTimestamp = new Date().toISOString();
  const initialTowers = isDemoModeEnabled ? stampTowers(demoTowers, initialTimestamp) : [];

  const [towers, setTowers] = useState(initialTowers);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(initialTimestamp);
  const [dataMode, setDataMode] = useState(isDemoModeEnabled ? "demo" : "live");
  const [cycleCount, setCycleCount] = useState(1);
  const [activityLog, setActivityLog] = useState(() => {
    if (isDemoModeEnabled) {
      return [
        createActivityEntry(
          "boot",
          "Operator workspace ready",
          "Demo mode is active. Trigger a fault drill or wait for the inference stream to advance.",
          "info",
        ),
      ];
    }
    return [
      createActivityEntry(
        "boot",
        "Operator workspace ready",
        "Secure live mode is active. Waiting for authenticated network feed.",
        "info",
      ),
    ];
  });
  const [serviceMetrics, setServiceMetrics] = useState({
    autoResolvedCount: 0,
    downtimeAvoidedMinutes: 0,
    usersProtected: 0,
    costSaved: 0,
  });
  const [serviceRecords, setServiceRecords] = useState([]);
  const [dispatchTickets, setDispatchTickets] = useState([]);
  const [towerServiceState, setTowerServiceState] = useState({});
  const reconnectTimeoutRef = useRef(null);
  const previousTowersRef = useRef(initialTowers);
  const demoTickRef = useRef(0);
  const automationLocksRef = useRef(new Map());
  const automationTimersRef = useRef(new Map());

  function recordActivity(entries) {
    if (!entries.length) return;
    setActivityLog((current) => limitActivity([...entries, ...current]));
  }

  function recordServiceRecord(record) {
    setServiceRecords((current) => limitItems([record, ...current], MAX_SERVICE_RECORDS));
  }

  function applyTowerUpdate(nextTowers, mode, timestamp = new Date().toISOString()) {
    const stampedTowers = stampTowers(nextTowers, timestamp);
    const entries = deriveActivityEntries(previousTowersRef.current, stampedTowers);

    startTransition(() => {
      setTowers(stampedTowers);
      setLastUpdate(timestamp);
      setDataMode(mode);
      setCycleCount((current) => current + 1);
    });

    previousTowersRef.current = stampedTowers;
    recordActivity(entries);
  }

  function clearAutomationState(currentTowers) {
    currentTowers.forEach((tower) => {
      const healthy = tower.status === "green" || tower.fault_probability < 0.45 || tower.fault_type === "normal";
      if (!healthy) return;

      automationLocksRef.current.delete(tower.tower_id);
      const timer = automationTimersRef.current.get(tower.tower_id);
      if (timer) {
        window.clearTimeout(timer);
        automationTimersRef.current.delete(tower.tower_id);
      }
    });
  }

  function updateTowerServiceState(towerId, nextState) {
    setTowerServiceState((current) => ({
      ...current,
      [towerId]: nextState,
    }));
  }

  async function executeServiceAction(tower) {
    if (!isDemoModeEnabled) {
      updateTowerServiceState(tower.tower_id, {
        kind: "manual",
        badge: "OPERATOR ACTION",
        action: "Autonomous execution is disabled in live mode",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const timestamp = new Date().toISOString();

    if (tower.fault_type === "hardware_anomaly") {
      const ticket = buildDispatchTicket(tower);
      const record = {
        id: `${tower.tower_id}-dispatch-${ticket.id}`,
        type: "dispatch",
        badge: "TICKET SENT",
        towerId: tower.tower_id,
        action: "Field dispatch created",
        detail: `${ticket.assignedTeam} assigned with ${ticket.toolsRequired}. Predicted window ${ticket.predictedWindow} minutes.`,
        timestamp,
        ticket,
      };

      setDispatchTickets((current) => limitItems([ticket, ...current], MAX_DISPATCH_TICKETS));
      recordServiceRecord(record);
      updateTowerServiceState(tower.tower_id, {
        kind: "dispatch",
        badge: "TICKET SENT",
        action: "Field dispatch created",
        timestamp,
        ticketId: ticket.id,
      });
      recordActivity([
        createActivityEntry(
          "dispatch",
          `Dispatch ${ticket.id} raised for ${tower.tower_id}`,
          `${ticket.assignedTeam} has been assigned to ${tower.city}. Tools required: ${ticket.toolsRequired}.`,
          "warning",
          tower.tower_id,
        ),
      ]);
      return;
    }

    const usersProtected = estimateUsersProtected(tower);
    const downtimeAvoidedMinutes = DEFAULT_MTTR_MINUTES;
    const costSaved = downtimeAvoidedMinutes * COST_PER_MINUTE;
    const action = resolveActionSummary(tower);
    const record = {
      id: `${tower.tower_id}-auto-${Date.now()}`,
      type: "auto",
      badge: "AUTO-RESOLVED",
      towerId: tower.tower_id,
      action,
      detail: `NeuralNet5G AI executed ${action.toLowerCase()} and closed the loop before user impact spread.`,
      timestamp,
      usersProtected,
      downtimeAvoidedMinutes,
      costSaved,
    };

    setServiceMetrics((current) => ({
      autoResolvedCount: current.autoResolvedCount + 1,
      downtimeAvoidedMinutes: current.downtimeAvoidedMinutes + downtimeAvoidedMinutes,
      usersProtected: current.usersProtected + usersProtected,
      costSaved: current.costSaved + costSaved,
    }));
    recordServiceRecord(record);
    updateTowerServiceState(tower.tower_id, {
      kind: "auto_resolved",
      badge: "AUTO-RESOLVED",
      action,
      timestamp,
    });
    recordActivity([
      createActivityEntry(
        "auto",
        `[AUTO] ${tower.tower_id} remediated`,
        `${action} initiated by NeuralNet5G AI. Estimated ${usersProtected.toLocaleString()} users protected.`,
        "positive",
        tower.tower_id,
      ),
    ]);

    const mode = connected ? "live" : "demo";
    const nextTowers = resolveDemoFault(previousTowersRef.current, tower.tower_id).map((currentTower) =>
      currentTower.tower_id === tower.tower_id
        ? {
            ...currentTower,
            last_updated: timestamp,
          }
        : currentTower,
    );
    applyTowerUpdate(nextTowers, mode, timestamp);

    if (mode === "live") {
      try {
        await postJson("/api/dev/reset-tower", {
          tower_id: tower.tower_id,
        });
      } catch {
        // Preserve local state in demo mode.
      }
    }
  }

  useEffect(() => {
    const url = resolveWsUrl();
    if (!url) return undefined;

    let socket;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(url);

      socket.addEventListener("open", () => {
        if (disposed) return;
        setConnected(true);
      });

      socket.addEventListener("message", (event) => {
        if (disposed) return;
        const payload = JSON.parse(event.data);
        if (!payload?.towers) return;
        applyTowerUpdate(payload.towers, "live", payload.timestamp ?? new Date().toISOString());
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        setConnected(false);
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      });

      socket.addEventListener("error", () => {
        socket.close();
      });
    };

    connect();

    return () => {
      disposed = true;
      setConnected(false);
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!isDemoModeEnabled || connected) return undefined;

    const timer = window.setInterval(() => {
      demoTickRef.current += 1;
      const nextTowers = advanceDemoTowers(previousTowersRef.current, demoTickRef.current);
      applyTowerUpdate(nextTowers, "demo");
    }, 4000);

    return () => window.clearInterval(timer);
  }, [connected]);

  useEffect(() => {
    if (!isDemoModeEnabled) return undefined;

    clearAutomationState(towers);

    towers.forEach((tower) => {
      if (tower.fault_probability < AUTO_REMEDIATION_THRESHOLD || tower.status !== "red") return;
      if (automationLocksRef.current.has(tower.tower_id) || automationTimersRef.current.has(tower.tower_id)) return;

      const timer = window.setTimeout(() => {
        automationTimersRef.current.delete(tower.tower_id);
        automationLocksRef.current.set(tower.tower_id, tower.last_updated ?? new Date().toISOString());
        void executeServiceAction(tower);
      }, tower.fault_type === "hardware_anomaly" ? 900 : 1200);

      automationTimersRef.current.set(tower.tower_id, timer);
    });

    return () => {
      towers.forEach((tower) => {
        if (tower.fault_probability >= AUTO_REMEDIATION_THRESHOLD && tower.status === "red") return;
        const timer = automationTimersRef.current.get(tower.tower_id);
        if (timer) {
          window.clearTimeout(timer);
          automationTimersRef.current.delete(tower.tower_id);
        }
      });
    };
  }, [towers]);

  async function injectFault(towerId, faultType) {
    if (!isDemoModeEnabled) {
      recordActivity([
        createActivityEntry(
          "warning",
          "Demo actions disabled",
          "Fault injection is disabled in live mode.",
          "warning",
          towerId,
        ),
      ]);
      return null;
    }

    const mode = connected ? "live" : "demo";
    const nextEntry = createActivityEntry(
      "drill",
      `Incident drill launched`,
      `${faultType.replaceAll("_", " ")} drill queued for ${towerId}.`,
      "warning",
      towerId,
    );
    recordActivity([nextEntry]);

    const previewTowers = injectDemoFault(previousTowersRef.current, towerId, faultType);
    applyTowerUpdate(previewTowers, mode);

    try {
      if (mode === "live") {
        await postJson("/api/dev/inject-fault", {
          tower_id: towerId,
          fault_type: faultType,
          severity: 0.9,
          precursor_steps: 0,
        });
      }
    } catch {
      // Keep local simulation.
    }

    return { towerId, faultType };
  }

  async function triggerIncidentDrill(faultType) {
    if (!isDemoModeEnabled) return null;

    const towersSnapshot = previousTowersRef.current;
    const target = towersSnapshot.toSorted((left, right) => right.fault_probability - left.fault_probability)[
      faultType === "hardware_anomaly" ? 1 : 0
    ] ?? towersSnapshot[0];
    if (!target) return null;

    if (dataMode === "demo" && !connected) {
      const nextTowers = triggerDemoDrill(previousTowersRef.current, faultType);
      recordActivity([
        createActivityEntry(
          "drill",
          `AI drill executed`,
          `${faultType.replaceAll("_", " ")} scenario injected into ${target.tower_id}.`,
          "warning",
          target.tower_id,
        ),
      ]);
      applyTowerUpdate(nextTowers, "demo");
      return { towerId: target.tower_id, faultType };
    }

    return injectFault(target.tower_id, faultType);
  }

  async function triggerDemoInference() {
    if (!isDemoModeEnabled) return null;

    const towersSnapshot = previousTowersRef.current;
    const target = towersSnapshot.toSorted((left, right) => right.fault_probability - left.fault_probability)[0];
    if (!target) return null;

    const faultType = target.fault_type !== "normal" ? target.fault_type : "hardware_anomaly";
    const result = await injectFault(target.tower_id, faultType);

    recordActivity([
      createActivityEntry(
        "critical",
        `DEMO INFERENCE escalated ${target.tower_id}`,
        `${target.tower_id} was forced into a ${faultType.replaceAll(
          "_",
          " ",
        )} event so the queue, map, and recovery workflow react immediately.`,
        "critical",
        target.tower_id,
      ),
    ]);

    return result ?? { towerId: target.tower_id, faultType };
  }

  async function runAutonomousRecovery(towerId) {
    if (!isDemoModeEnabled) return null;

    const selectedTowerId =
      towerId ??
      previousTowersRef.current.toSorted((left, right) => right.fault_probability - left.fault_probability)[0]?.tower_id;

    if (!selectedTowerId) return null;

    recordActivity([
      createActivityEntry(
        "action",
        "Autonomous recovery triggered",
        `The AI playbook is executing the recovery workflow for ${selectedTowerId}.`,
        "positive",
        selectedTowerId,
      ),
    ]);

    try {
      if (connected) {
        await postJson("/api/dev/reset-tower", {
          tower_id: selectedTowerId,
        });
        return { towerId: selectedTowerId };
      }
    } catch {
      // Fall back to local demo state below.
    }

    const nextTowers = resolveDemoFault(previousTowersRef.current, selectedTowerId);
    applyTowerUpdate(nextTowers, "demo");
    return { towerId: selectedTowerId };
  }

  const value = useMemo(
    () => ({
      towers,
      connected,
      lastUpdate,
      dataMode,
      demoEnabled: isDemoModeEnabled,
      cycleCount,
      activityLog,
      serviceMetrics,
      serviceRecords,
      dispatchTickets,
      towerServiceState,
      injectFault,
      runAutonomousRecovery,
      triggerIncidentDrill,
      triggerDemoInference,
    }),
    [activityLog, connected, cycleCount, dataMode, dispatchTickets, lastUpdate, serviceMetrics, serviceRecords, towers, towerServiceState],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useLiveNetwork() {
  return useContext(WebSocketContext);
}
