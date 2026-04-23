import { formatTimestamp } from "../lib/formatters";

function shortSig(value = "") {
  if (!value) return "-";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

const adapters = [
  { name: "OSS alarm feed", direction: "Inbound", status: "Adapter mocked, schema mapped" },
  { name: "NOC ticketing", direction: "Outbound", status: "Adapter mocked, ticket payload validated" },
  { name: "SMS/email/operator notification", direction: "Outbound", status: "Adapter mocked, notification contract ready" },
  { name: "Field-team dispatch system", direction: "Outbound", status: "Adapter mocked, dispatch schema mapped" },
];

export default function GovernanceIntegrationPanel({
  auditLog = [],
  observability = {},
  integrationEvents = [],
  businessMetrics,
}) {
  const latestAudit = auditLog.slice(0, 12);

  const linkedPairs = latestAudit.slice(0, -1);
  const validLinks = linkedPairs.filter((record, index) => record.prev_signature === latestAudit[index + 1]?.signature).length;
  const chainIntegrity = linkedPairs.length > 0 ? Math.round((validLinks / linkedPairs.length) * 100) : 100;

  const modelVersions = new Set();
  if (observability.last_model_version) modelVersions.add(observability.last_model_version);
  latestAudit.forEach((record) => {
    if (record?.details?.model_version) {
      modelVersions.add(record.details.model_version);
    }
  });

  return (
    <section className="surface-panel overflow-hidden px-6 py-6 sm:px-7">
      <div className="flex flex-col gap-2 border-b border-core-border pb-5">
        <div className="section-eyebrow">Regulatory & Integration Posture</div>
        <h3 className="text-[24px] font-display font-semibold tracking-apple-tight text-core-text m-0">
          Signed logs, model lineage, actor accountability, and integration surface
        </h3>
        <p className="text-[14px] text-core-textMuted m-0">
          Every action shown here is sourced from signed audit records, incident history, and adapter event traces.
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Signed action logs</div>
              <div className="status-pill bg-core-surfaceHover text-core-textMuted">{chainIntegrity}% chain integrity</div>
            </div>
            <div className="mt-2 text-[13px] text-core-textMuted">
              {latestAudit.length} signed records · model version(s): {Array.from(modelVersions).join(", ") || "unavailable"}
            </div>

            <div className="mt-3 max-h-[300px] overflow-auto pr-1 grid gap-2">
              {latestAudit.map((record, index) => (
                <article key={`${record.timestamp}-${record.event}-${index}`} className="rounded-[12px] border border-core-borderLight bg-core-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-core-text">{record.event}</div>
                    <div className="text-[10px] font-mono text-core-textMuted">{formatTimestamp(record.timestamp)}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-core-textMuted">
                    {(record.actor?.email || record.actor?.subject || "system")} triggered {record.action} on {record.resource}
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-core-textMuted">
                    sig {shortSig(record.signature)}
                  </div>
                  <div className="text-[10px] font-mono text-core-textMuted">
                    prev {shortSig(record.prev_signature)}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Business proof</div>
            <div className="mt-3 grid gap-2 text-[13px] text-core-textMuted">
              <div>SLA penalty avoided: <strong className="text-core-text">₹{Math.round(businessMetrics.slaPenaltyAvoided).toLocaleString("en-IN")}</strong></div>
              <div>MTTR reduction: <strong className="text-core-text">{businessMetrics.mttrReductionMinutes} min</strong></div>
              <div>Dispatch savings: <strong className="text-core-text">₹{Math.round(businessMetrics.dispatchSavings).toLocaleString("en-IN")}</strong></div>
              <div>Auto-resolution success: <strong className="text-core-text">{Math.round(businessMetrics.autoResolutionSuccessRate * 100)}%</strong></div>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Integration control plane</div>
            <div className="mt-2 grid gap-2">
              {adapters.map((adapter) => (
                <div key={adapter.name} className="rounded-[12px] border border-core-borderLight bg-core-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-core-text">{adapter.name}</div>
                    <div className="text-[10px] font-mono uppercase text-core-textMuted">{adapter.direction}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-core-textMuted">{adapter.status}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-core-border bg-core-bg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-core-textMuted">Integration event trail</div>
              <div className="status-pill bg-core-surfaceHover text-core-textMuted">{integrationEvents.length}</div>
            </div>
            <div className="mt-3 max-h-[330px] overflow-auto pr-1 grid gap-2">
              {integrationEvents.length === 0 ? (
                <div className="text-[13px] text-core-textMuted">No adapter traffic yet.</div>
              ) : (
                integrationEvents.map((event) => (
                  <article key={event.id} className="rounded-[12px] border border-core-borderLight bg-core-surface px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-core-text">{event.adapter}</div>
                      <div className="text-[10px] font-mono uppercase text-core-textMuted">{event.status}</div>
                    </div>
                    <div className="mt-1 text-[12px] text-core-textMuted">{event.summary}</div>
                    <div className="mt-1 text-[10px] font-mono text-core-textMuted">{formatTimestamp(event.timestamp)} · {event.direction}</div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
