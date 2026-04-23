import { createContext, startTransition, useContext, useEffect, useMemo, useRef, useState } from "react";
import { advanceDemoTowers, demoTowers, injectDemoFault, resolveDemoFault, triggerDemoDrill } from "../lib/demoData";
import { buildApiPath, isDemoModeEnabled, resolveWsUrl } from "../lib/runtimeConfig";

const MAX_ACTIVITY_ITEMS = 20;
const MAX_SERVICE_RECORDS = 20;
const MAX_DISPATCH_TICKETS = 10;
const MAX_INTEGRATION_EVENTS = 40;
const MAX_APPROVAL_ITEMS = 20;
const AUTO_REMEDIATION_THRESHOLD = 0.8;
const APPROVAL_REQUIRED_THRESHOLD = 0.86;
const DEFAULT_MTTR_MINUTES = 75;
const COST_PER_MINUTE = 650;
const DISPATCH_AVOIDANCE_VALUE = 28000;
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
const EMPTY_SERVICE_METRICS = {
  autoResolvedCount: 0,
  downtimeAvoidedMinutes: 0,
  usersProtected: 0,
  costSaved: 0,
  activeDispatches: 0,
  openIncidents: 0,
  source: "server",
  updatedAt: null,
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
    activeDispatches: 0,
    openIncidents: 0,
    source: "server",
    updatedAt: null,
  },
  businessMetrics: {
    slaPenaltyAvoided: 0,
    mttrReductionMinutes: 0,
    dispatchSavings: 0,
    autoResolutionSuccessRate: 0,
    subscribersProtectedByOperator: [],
    subscribersProtectedByRegion: [],
    resolvedIncidents: 0,
  },
  serviceRecords: [],
  dispatchTickets: [],
  towerServiceState: {},
  incidents: [],
  auditLog: [],
  observability: {},
  approvalQueue: [],
  integrationEvents: [],
  refreshOperationalData: async () => null,
  transitionIncident: async () => null,
  addIncidentNote: async () => null,
  verifyIncidentResolution: async () => null,
  closeIncident: async () => null,
  approveAutoAction: async () => null,
  rejectAutoAction: async () => null,
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

function resolveRegion(city = "") {
  const lower = city.toLowerCase();
  if (lower.includes("delhi") || lower.includes("jaipur") || lower.includes("lucknow")) return "North";
  if (lower.includes("mumbai") || lower.includes("pune") || lower.includes("ahmedabad")) return "West";
  if (lower.includes("bengaluru") || lower.includes("hyderabad") || lower.includes("chennai")) return "South";
  if (lower.includes("kolkata")) return "East";
  return "Unknown";
}

function resolveActionSummary(tower) {
  if (tower.fault_type === "coverage_degradation") return "TX power adjusted +3dB";
  if (tower.fault_type === "congestion") return "Traffic rebalanced to adjacent cells";
  if (tower.fault_type === "hardware_anomaly") return "Field dispatch raised";
  return "Recovery workflow executed";
}

function requiresAutoApproval(tower) {
  return tower.fault_probability >= APPROVAL_REQUIRED_THRESHOLD || tower.fault_type === "hardware_anomaly";
}

function buildDispatchTicket(tower) {
  const numericId = Math.floor(1000 + (Date.now() % 9000));
  return {
    id: `NN-${numericId}`,
    towerId: tower.tower_id,
    city: tower.city ?? "Operator site",
    operator: tower.operator ?? "Unknown",
    region: resolveRegion(tower.city),
    faultType: tower.fault_type,
    severity: "HIGH",
    lat: tower.lat ?? tower.kpis?.lat ?? 0,
    lon: tower.lon ?? tower.kpis?.lon ?? 0,
    predictedWindow: tower.lead_time_minutes,
    toolsRequired: TOOLS_BY_FAULT[tower.fault_type] ?? "RF analyser, field laptop",
    assignedTeam: FIELD_TEAMS[numericId % FIELD_TEAMS.length],
    lifecycleState: "assigned",
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

function normalizeServiceMetrics(payload) {
  if (!payload || typeof payload !== "object") return EMPTY_SERVICE_METRICS;
  return {
    autoResolvedCount: Number(payload.auto_resolved_count ?? 0),
    downtimeAvoidedMinutes: Number(payload.downtime_avoided_minutes ?? 0),
    usersProtected: Number(payload.users_protected ?? 0),
    costSaved: Number(payload.cost_saved ?? 0),
    activeDispatches: Number(payload.active_dispatches ?? 0),
    openIncidents: Number(payload.open_incidents ?? 0),
    source: String(payload.source ?? "server"),
    updatedAt: payload.updated_at ?? null,
  };
}

async function requestJson(path, options = {}) {
  const { method = "GET", body } = options;
  const response = await fetch(buildApiPath(path), {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    const error = new Error(message || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
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
  const [serviceMetrics, setServiceMetrics] = useState(EMPTY_SERVICE_METRICS);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [dispatchTickets, setDispatchTickets] = useState([]);
  const [towerServiceState, setTowerServiceState] = useState({});
  const [incidents, setIncidents] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [observability, setObservability] = useState({});
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [integrationEvents, setIntegrationEvents] = useState([]);
  const [autoActionStats, setAutoActionStats] = useState({ attempted: 0, succeeded: 0, failed: 0 });

  const reconnectTimeoutRef = useRef(null);
  const previousTowersRef = useRef(initialTowers);
  const demoTickRef = useRef(0);
  const automationLocksRef = useRef(new Map());
  const automationTimersRef = useRef(new Map());
  const incidentStatusRef = useRef(new Map());

  const towerById = useMemo(() => new Map(towers.map((tower) => [tower.tower_id, tower])), [towers]);
  const useLocalDemoRuntime = isDemoModeEnabled && (!connected || dataMode === "demo");

  function recordActivity(entries) {
    if (!entries.length) return;
    setActivityLog((current) => limitItems([...entries, ...current], MAX_ACTIVITY_ITEMS));
  }

  function recordServiceRecord(record) {
    setServiceRecords((current) => limitItems([record, ...current], MAX_SERVICE_RECORDS));
  }

  function recordIntegrationEvent(event) {
    setIntegrationEvents((current) =>
      limitItems(
        [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            ...event,
          },
          ...current,
        ],
        MAX_INTEGRATION_EVENTS,
      ),
    );
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

  function updateTowerServiceState(towerId, nextState) {
    setTowerServiceState((current) => ({
      ...current,
      [towerId]: nextState,
    }));
  }

  async function refreshOperationalData() {
    const [incidentsResult, auditResult, obsResult, metricsResult] = await Promise.allSettled([
      requestJson("/api/v1/incidents?include_closed=true&limit=120"),
      requestJson("/api/v1/audit-log?limit=120"),
      requestJson("/api/v1/observability"),
      requestJson("/api/v1/service-metrics"),
    ]);

    if (incidentsResult.status === "fulfilled") {
      setIncidents(Array.isArray(incidentsResult.value?.incidents) ? incidentsResult.value.incidents : []);
    } else if (incidentsResult.reason?.status === 401 || incidentsResult.reason?.status === 403) {
      setIncidents([]);
    }

    if (auditResult.status === "fulfilled") {
      setAuditLog(Array.isArray(auditResult.value?.records) ? auditResult.value.records : []);
    } else if (auditResult.reason?.status === 401 || auditResult.reason?.status === 403) {
      setAuditLog([]);
    }

    if (obsResult.status === "fulfilled") {
      setObservability(obsResult.value ?? {});
    } else if (obsResult.reason?.status === 401 || obsResult.reason?.status === 403) {
      setObservability({});
    }

    if (metricsResult.status === "fulfilled") {
      setServiceMetrics(normalizeServiceMetrics(metricsResult.value));
    } else if (metricsResult.reason?.status === 401 || metricsResult.reason?.status === 403) {
      setServiceMetrics(EMPTY_SERVICE_METRICS);
    }
  }

  async function transitionIncident(incidentId, action, details = {}) {
    const actionPath = {
      acknowledge: "acknowledge",
      dispatch: "dispatch",
      remediate: "remediate",
      fail: "fail",
      rollback: "rollback",
      close: "close",
      note: "note",
      verify: "verify",
    }[action];

    if (!actionPath) throw new Error(`Unsupported incident action: ${action}`);

    const response = await requestJson(`/api/v1/incidents/${incidentId}/${actionPath}`, {
      method: "POST",
      body: { details },
    });

    await refreshOperationalData();

    return response;
  }

  async function addIncidentNote(incidentId, note, metadata = {}) {
    const trimmed = note.trim();
    if (!trimmed) return null;
    return transitionIncident(incidentId, "note", { note: trimmed, ...metadata });
  }

  async function verifyIncidentResolution(incidentId, details = {}) {
    return transitionIncident(incidentId, "verify", {
      verified: true,
      verification_source: "operator_console",
      ...details,
    });
  }

  async function closeIncident(incidentId, details = {}) {
    return transitionIncident(incidentId, "close", {
      closure_reason: "operator_verified",
      ...details,
    });
  }

  async function executeServiceAction(tower, options = {}) {
    const source = options.source ?? "automation";
    const approvedBy = options.approvedBy ?? "system";

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

    if (!useLocalDemoRuntime) {
      if (tower.incident_id) {
        try {
          await transitionIncident(tower.incident_id, tower.fault_type === "hardware_anomaly" ? "dispatch" : "remediate", {
            source,
            approved_by: approvedBy,
            policy:
              tower.fault_type === "hardware_anomaly" ? "P1-hardware-field-dispatch" : "P2-auto-remediation",
          });
        } catch {
          recordActivity([
            createActivityEntry(
              "warning",
              "Workflow action rejected",
              `Backend rejected the ${tower.fault_type === "hardware_anomaly" ? "dispatch" : "remediation"} action for ${tower.tower_id}.`,
              "warning",
              tower.tower_id,
            ),
          ]);
        }
      }

      if (tower.fault_type !== "hardware_anomaly") {
        try {
          await requestJson("/api/dev/reset-tower", {
            method: "POST",
            body: {
              tower_id: tower.tower_id,
            },
          });
        } catch {
          recordActivity([
            createActivityEntry(
              "warning",
              "Recovery command rejected",
              `Backend rejected reset request for ${tower.tower_id}. Keeping live state unchanged.`,
              "warning",
              tower.tower_id,
            ),
          ]);
        }
      }

      await refreshOperationalData().catch(() => null);
      return;
    }

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

      if (tower.incident_id) {
        try {
          await transitionIncident(tower.incident_id, "dispatch", {
            source,
            approved_by: approvedBy,
            dispatch_ticket: ticket.id,
            escalation_policy: "P1-hardware-field-dispatch",
          });
        } catch {}
      }

      recordIntegrationEvent({
        adapter: "NOC ticketing",
        direction: "outbound",
        status: "sent",
        summary: `Ticket ${ticket.id} created for ${tower.tower_id}`,
      });
      recordIntegrationEvent({
        adapter: "Operator notification",
        direction: "outbound",
        status: "sent",
        summary: `${tower.tower_id} escalated to on-call via SMS/email`,
      });
      recordIntegrationEvent({
        adapter: "Field dispatch system",
        direction: "outbound",
        status: "sent",
        summary: `${ticket.assignedTeam} assigned to ${tower.tower_id}`,
      });
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

    recordServiceRecord(record);
    updateTowerServiceState(tower.tower_id, {
      kind: "auto_resolved",
      badge: "AUTO-RESOLVED",
      action,
      timestamp,
      approvedBy,
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

    if (tower.incident_id) {
      try {
        await transitionIncident(tower.incident_id, "remediate", {
          source,
          approved_by: approvedBy,
          policy: "P2-auto-remediation",
        });
      } catch {}
    }

    recordIntegrationEvent({
      adapter: "NOC ticketing",
      direction: "outbound",
      status: "updated",
      summary: `${tower.tower_id} marked remediated by automated policy`,
    });

    const nextTowers = resolveDemoFault(previousTowersRef.current, tower.tower_id).map((currentTower) =>
      currentTower.tower_id === tower.tower_id
        ? {
            ...currentTower,
            last_updated: timestamp,
          }
        : currentTower,
    );
    applyTowerUpdate(nextTowers, "demo", timestamp);
  }

  async function approveAutoAction(approvalId, approver = "operator") {
    const target = approvalQueue.find((item) => item.id === approvalId);
    if (!target || target.status !== "pending") return null;

    const tower = towerById.get(target.towerId);
    if (!tower) return null;

    setAutoActionStats((current) => ({ ...current, attempted: current.attempted + 1 }));

    setApprovalQueue((current) =>
      current.map((item) =>
        item.id === approvalId
          ? {
              ...item,
              status: "approved",
              decidedAt: new Date().toISOString(),
              decidedBy: approver,
            }
          : item,
      ),
    );

    recordActivity([
      createActivityEntry(
        "approval",
        `Auto-action approved for ${target.towerId}`,
        `${approver} approved ${target.action.replaceAll("_", " ")} under ${target.policy}.`,
        "info",
        target.towerId,
      ),
    ]);

    try {
      await executeServiceAction(tower, { source: "approved_auto_action", approvedBy: approver });
      setAutoActionStats((current) => ({ ...current, succeeded: current.succeeded + 1 }));
      if (target.incidentId) {
        await addIncidentNote(target.incidentId, `Approved auto-action ${target.action} by ${approver}.`, {
          approval_id: target.id,
          policy: target.policy,
        }).catch(() => null);
      }
      return { approvalId };
    } catch {
      setAutoActionStats((current) => ({ ...current, failed: current.failed + 1 }));
      return null;
    }
  }

  async function rejectAutoAction(approvalId, reason = "Operator rejected") {
    const target = approvalQueue.find((item) => item.id === approvalId);
    if (!target || target.status !== "pending") return null;

    setApprovalQueue((current) =>
      current.map((item) =>
        item.id === approvalId
          ? {
              ...item,
              status: "rejected",
              decidedAt: new Date().toISOString(),
              rejectionReason: reason,
            }
          : item,
      ),
    );

    recordActivity([
      createActivityEntry(
        "approval",
        `Auto-action rejected for ${target.towerId}`,
        `${reason}. Escalation policy now requires manual intervention.`,
        "warning",
        target.towerId,
      ),
    ]);

    if (target.incidentId) {
      await addIncidentNote(target.incidentId, `Auto-action rejected: ${reason}`, {
        approval_id: target.id,
        policy: target.policy,
      }).catch(() => null);
    }

    recordIntegrationEvent({
      adapter: "Operator notification",
      direction: "outbound",
      status: "sent",
      summary: `Manual escalation required for ${target.towerId}`,
    });

    return { approvalId };
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
    if (dataMode !== "live") return;
    setServiceRecords([]);
    setDispatchTickets([]);
    setTowerServiceState({});
  }, [dataMode]);

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
    void refreshOperationalData();
    const timer = window.setInterval(() => {
      void refreshOperationalData();
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const nextMap = new Map();
    incidents.forEach((incident) => {
      const previousStatus = incidentStatusRef.current.get(incident.incident_id);
      nextMap.set(incident.incident_id, incident.status);
      if (!previousStatus) {
        recordIntegrationEvent({
          adapter: "OSS alarm feed",
          direction: "inbound",
          status: "received",
          summary: `${incident.incident_id} opened for ${incident.tower_id}`,
        });
        return;
      }
      if (previousStatus === incident.status) return;

      const summary = `${incident.incident_id} moved ${previousStatus} -> ${incident.status}`;
      if (incident.status === "dispatched") {
        recordIntegrationEvent({ adapter: "Field dispatch system", direction: "outbound", status: "sent", summary });
      } else if (incident.status === "remediated" || incident.status === "closed") {
        recordIntegrationEvent({ adapter: "NOC ticketing", direction: "outbound", status: "updated", summary });
      } else {
        recordIntegrationEvent({ adapter: "Operator notification", direction: "outbound", status: "sent", summary });
      }
    });
    incidentStatusRef.current = nextMap;
  }, [incidents]);

  useEffect(() => {
    if (!useLocalDemoRuntime) {
      setApprovalQueue([]);
      return undefined;
    }

    towers.forEach((tower) => {
      if (tower.fault_probability < AUTO_REMEDIATION_THRESHOLD || tower.status !== "red") return;
      if (!requiresAutoApproval(tower)) return;

      setApprovalQueue((current) => {
        const existing = current.find(
          (entry) => entry.towerId === tower.tower_id && ["pending", "approved"].includes(entry.status),
        );
        if (existing) return current;

        const action = tower.fault_type === "hardware_anomaly" ? "dispatch" : "remediate";
        const next = [
          {
            id: `APR-${tower.tower_id}-${Date.now()}`,
            towerId: tower.tower_id,
            incidentId: tower.incident_id ?? "",
            action,
            policy: tower.fault_type === "hardware_anomaly" ? "P1-hardware-field-dispatch" : "P2-operator-approval",
            requestedAt: new Date().toISOString(),
            modelVersion: tower.model_version ?? observability.last_model_version ?? "unknown",
            reason: `${Math.round(tower.fault_probability * 100)}% predicted ${tower.fault_type.replaceAll("_", " ")}`,
            status: "pending",
          },
          ...current,
        ];

        recordActivity([
          createActivityEntry(
            "approval",
            `Approval required for ${tower.tower_id}`,
            `Policy gate ${tower.fault_type === "hardware_anomaly" ? "P1" : "P2"} paused autonomous action.`,
            "warning",
            tower.tower_id,
          ),
        ]);

        return limitItems(next, MAX_APPROVAL_ITEMS);
      });
    });

    setApprovalQueue((current) =>
      current.filter((entry) => {
        if (!["pending", "approved"].includes(entry.status)) return true;
        const tower = towerById.get(entry.towerId);
        if (!tower) return false;
        return tower.status === "red" && tower.fault_probability >= 0.45;
      }),
    );

    return undefined;
  }, [towers, observability.last_model_version, towerById, useLocalDemoRuntime]);

  useEffect(() => {
    if (!useLocalDemoRuntime) {
      automationLocksRef.current.clear();
      automationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      automationTimersRef.current.clear();
      return undefined;
    }

    towers.forEach((tower) => {
      const healthy = tower.status === "green" || tower.fault_probability < 0.45 || tower.fault_type === "normal";
      if (!healthy) return;

      automationLocksRef.current.delete(tower.tower_id);
      const timer = automationTimersRef.current.get(tower.tower_id);
      if (timer) {
        window.clearTimeout(timer);
        automationTimersRef.current.delete(tower.tower_id);
      }
    });

    towers.forEach((tower) => {
      if (tower.fault_probability < AUTO_REMEDIATION_THRESHOLD || tower.status !== "red") return;
      if (requiresAutoApproval(tower)) return;
      if (automationLocksRef.current.has(tower.tower_id) || automationTimersRef.current.has(tower.tower_id)) return;

      const timer = window.setTimeout(() => {
        automationTimersRef.current.delete(tower.tower_id);
        automationLocksRef.current.set(tower.tower_id, tower.last_updated ?? new Date().toISOString());
        setAutoActionStats((current) => ({ ...current, attempted: current.attempted + 1 }));
        executeServiceAction(tower, { source: "auto_threshold", approvedBy: "policy-engine" })
          .then(() => {
            setAutoActionStats((current) => ({ ...current, succeeded: current.succeeded + 1 }));
          })
          .catch(() => {
            setAutoActionStats((current) => ({ ...current, failed: current.failed + 1 }));
          });
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
  }, [towers, useLocalDemoRuntime]);

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

    recordActivity([
      createActivityEntry(
        "drill",
        "Incident drill launched",
        `${faultType.replaceAll("_", " ")} drill queued for ${towerId}.`,
        "warning",
        towerId,
      ),
    ]);

    try {
      if (connected) {
        await requestJson("/api/dev/inject-fault", {
          method: "POST",
          body: {
            tower_id: towerId,
            fault_type: faultType,
            severity: 0.9,
            precursor_steps: 0,
          },
        });
        await refreshOperationalData();
        return { towerId, faultType };
      }
    } catch {
      recordActivity([
        createActivityEntry(
          "warning",
          "Drill command rejected",
          `Backend rejected fault injection for ${towerId}.`,
          "warning",
          towerId,
        ),
      ]);
      if (connected) return null;
    }

    const previewTowers = injectDemoFault(previousTowersRef.current, towerId, faultType);
    applyTowerUpdate(previewTowers, "demo");
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
          "AI drill executed",
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
        await requestJson("/api/dev/reset-tower", {
          method: "POST",
          body: {
            tower_id: selectedTowerId,
          },
        });
        await refreshOperationalData();
        return { towerId: selectedTowerId };
      }
    } catch {
      recordActivity([
        createActivityEntry(
          "warning",
          "Recovery command rejected",
          `Backend rejected reset request for ${selectedTowerId}.`,
          "warning",
          selectedTowerId,
        ),
      ]);
      if (connected) return null;
    }

    const nextTowers = resolveDemoFault(previousTowersRef.current, selectedTowerId);
    applyTowerUpdate(nextTowers, "demo");
    return { towerId: selectedTowerId };
  }

  const businessMetrics = useMemo(() => {
    const subscribersByOperator = new Map();
    const subscribersByRegion = new Map();

    serviceRecords.forEach((record) => {
      const tower = towerById.get(record.towerId);
      const operator = tower?.operator ?? "Unknown";
      const region = resolveRegion(tower?.city);
      const users = Number(record.usersProtected ?? 0);
      if (users <= 0) return;

      subscribersByOperator.set(operator, (subscribersByOperator.get(operator) ?? 0) + users);
      subscribersByRegion.set(region, (subscribersByRegion.get(region) ?? 0) + users);
    });

    const resolvedIncidents = incidents.filter((incident) => ["remediated", "closed"].includes(incident.status));
    const resolutionDurations = resolvedIncidents
      .map((incident) => {
        const resolvedEvent = [...(incident.history ?? [])].reverse().find((entry) =>
          ["remediated", "closed"].includes(entry.event),
        );
        if (!resolvedEvent) return null;
        const openedAt = new Date(incident.opened_at).getTime();
        const resolvedAt = new Date(resolvedEvent.timestamp).getTime();
        if (Number.isNaN(openedAt) || Number.isNaN(resolvedAt) || resolvedAt <= openedAt) return null;
        return (resolvedAt - openedAt) / 60000;
      })
      .filter((value) => typeof value === "number");

    const avgResolvedMinutes =
      resolutionDurations.length > 0
        ? resolutionDurations.reduce((total, value) => total + value, 0) / resolutionDurations.length
        : DEFAULT_MTTR_MINUTES;

    const mttrReductionMinutes = Math.max(0, Math.round(DEFAULT_MTTR_MINUTES - avgResolvedMinutes));
    const dispatchSavings = serviceRecords.filter((record) => record.type === "auto").length * DISPATCH_AVOIDANCE_VALUE;
    const successRate =
      autoActionStats.attempted > 0
        ? autoActionStats.succeeded / autoActionStats.attempted
        : serviceMetrics.autoResolvedCount > 0
          ? 1
          : 0;

    return {
      slaPenaltyAvoided: serviceMetrics.costSaved,
      mttrReductionMinutes,
      dispatchSavings,
      autoResolutionSuccessRate: successRate,
      subscribersProtectedByOperator: [...subscribersByOperator.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value),
      subscribersProtectedByRegion: [...subscribersByRegion.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value),
      resolvedIncidents: resolvedIncidents.length,
    };
  }, [incidents, serviceMetrics, serviceRecords, towerById, autoActionStats]);

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
      businessMetrics,
      serviceRecords,
      dispatchTickets,
      towerServiceState,
      incidents,
      auditLog,
      observability,
      approvalQueue,
      integrationEvents,
      refreshOperationalData,
      transitionIncident,
      addIncidentNote,
      verifyIncidentResolution,
      closeIncident,
      approveAutoAction,
      rejectAutoAction,
      injectFault,
      runAutonomousRecovery,
      triggerIncidentDrill,
      triggerDemoInference,
    }),
    [
      towers,
      connected,
      lastUpdate,
      dataMode,
      cycleCount,
      activityLog,
      serviceMetrics,
      businessMetrics,
      serviceRecords,
      dispatchTickets,
      towerServiceState,
      incidents,
      auditLog,
      observability,
      approvalQueue,
      integrationEvents,
    ],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useLiveNetwork() {
  return useContext(WebSocketContext);
}
