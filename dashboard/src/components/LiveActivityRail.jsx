import { formatTimestamp } from "../lib/formatters";

const toneClasses = {
  critical: "border-red/30 bg-red/10 text-red",
  warning: "border-amber/30 bg-amber/12 text-amber",
  positive: "border-green/30 bg-green/12 text-green",
  info: "border-[#2997ff]/25 bg-[#2997ff]/10 text-[#0a63b0]",
};

export default function LiveActivityRail({ activityLog = [] }) {
  const filteredLog = activityLog.filter(
    (entry) => !(entry.detail || "").toLowerCase().includes("none based on the latest kpi drift")
  );

  return (
    <section className="surface-panel flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 sm:px-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow">Live Activity</div>
          <h3 className="mt-2 text-[22px] font-display font-semibold leading-[1.12] tracking-apple-loose">
            What the AI is doing right now
          </h3>
          <p className="mt-1 max-w-[30ch] text-[16px] leading-[1.42] tracking-apple-tight text-black/72">
            Every drill, escalation, risk jump, and recovery is logged here so the product feels operational.
          </p>
        </div>
        <div className="status-pill bg-black/[0.04] text-black/68">{filteredLog.length} events</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="grid gap-3">
          {filteredLog.map((entry) => (
            <article key={entry.id} className="activity-item">
              <div className="activity-item__header">
                <div className={`badge ${
                  entry.tone === 'critical' ? 'badge--critical' :
                  entry.tone === 'warning' ? 'badge--warning' :
                  entry.tone === 'positive' ? 'badge--recovered' :
                  'badge--auto'
                }`}>
                  {entry.type}
                </div>
                <div className="activity-item__timestamp">{formatTimestamp(entry.timestamp)}</div>
              </div>
              <div className="activity-item__title">{entry.title}</div>
              <p className="activity-item__body">{entry.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
