function formatCompactValue(value) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function formatRupees(value) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export default function ServiceImpactPanel({ serviceMetrics, businessMetrics }) {
  const topOperators = businessMetrics.subscribersProtectedByOperator.slice(0, 2);
  const topRegions = businessMetrics.subscribersProtectedByRegion.slice(0, 2);

  const metrics = [
    {
      label: "SLA penalty avoided",
      value: formatRupees(businessMetrics.slaPenaltyAvoided),
      detail: "from auto-remediation impact",
    },
    {
      label: "Subscribers protected",
      value: `~${formatCompactValue(serviceMetrics.usersProtected)}`,
      detail: "verified from executed actions",
    },
    {
      label: "MTTR reduction",
      value: `${businessMetrics.mttrReductionMinutes} min`,
      detail: "vs baseline 75-minute MTTR",
    },
    {
      label: "Dispatch savings",
      value: formatRupees(businessMetrics.dispatchSavings),
      detail: "dispatches avoided by auto-fixes",
    },
    {
      label: "Auto-resolution success",
      value: `${Math.round(businessMetrics.autoResolutionSuccessRate * 100)}%`,
      detail: `${businessMetrics.resolvedIncidents} incidents verified/closed`,
    },
  ];

  return (
    <section className="surface-panel overflow-hidden px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-5 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-eyebrow">Business Impact Proof</div>
          <h3 className="mt-2 text-[29px] font-display font-semibold leading-[1.08] tracking-apple-tighter">
            Evidence of business outcomes, not just model activity
          </h3>
          <p className="mt-2 max-w-[62ch] text-[16px] leading-[1.46] tracking-apple-tight text-black/72">
            Metrics below are derived from executed remediation records, incident timelines, and dispatch/audit traces.
            No synthetic SHAP/forecast values are used in this proof layer.
          </p>
        </div>
        <div className="rounded-[18px] bg-black px-4 py-3 text-white">
          <div className="text-[11px] uppercase tracking-[0.12px] text-white/46">Live business posture</div>
          <div className="mt-1 text-[18px] leading-[1.18] tracking-apple-tight">Operator-grade outcome tracking</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[24px] border border-black/[0.06] bg-apple-surface px-5 py-5 ring-1 ring-black/[0.04]">
            <div className="text-[11px] uppercase tracking-[0.12px] text-black/46">{metric.label}</div>
            <div className="mt-3 text-[30px] font-display font-semibold leading-[1.02] tracking-apple-tighter text-black/88">
              {metric.value}
            </div>
            <div className="mt-2 text-[13px] leading-[1.38] tracking-apple-caption text-black/66">{metric.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] border border-black/[0.06] bg-apple-surface px-5 py-4 ring-1 ring-black/[0.04]">
          <div className="text-[11px] uppercase tracking-[0.12px] text-black/46">Subscribers protected by operator</div>
          <div className="mt-3 grid gap-2 text-[14px] text-black/72">
            {topOperators.length === 0 ? (
              <div>No protected-subscriber records yet.</div>
            ) : (
              topOperators.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between gap-3">
                  <span>{entry.name}</span>
                  <strong className="text-black/88">~{formatCompactValue(entry.value)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[18px] border border-black/[0.06] bg-apple-surface px-5 py-4 ring-1 ring-black/[0.04]">
          <div className="text-[11px] uppercase tracking-[0.12px] text-black/46">Subscribers protected by region</div>
          <div className="mt-3 grid gap-2 text-[14px] text-black/72">
            {topRegions.length === 0 ? (
              <div>No regional records yet.</div>
            ) : (
              topRegions.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between gap-3">
                  <span>{entry.name}</span>
                  <strong className="text-black/88">~{formatCompactValue(entry.value)}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
