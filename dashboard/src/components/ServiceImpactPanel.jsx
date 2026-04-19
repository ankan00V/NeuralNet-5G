function formatCompactValue(value) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function formatRupees(value) {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(value >= 1000000 ? 1 : 2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}L`;
  }

  return `₹${formatCompactValue(value)}`;
}

export default function ServiceImpactPanel({ serviceMetrics }) {
  const metrics = [
    {
      label: "Faults auto-resolved",
      value: `${serviceMetrics.autoResolvedCount}`,
      detail: "this session",
    },
    {
      label: "Downtime avoided",
      value: `${serviceMetrics.downtimeAvoidedMinutes}`,
      detail: "minutes saved",
    },
    {
      label: "Users protected",
      value: `~${formatCompactValue(serviceMetrics.usersProtected)}`,
      detail: "estimated subscribers",
    },
    {
      label: "Cost saved",
      value: formatRupees(serviceMetrics.costSaved),
      detail: "avoided SLA impact",
    },
  ];

  return (
    <section className="surface-panel overflow-hidden px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-5 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-eyebrow">Autonomous Service Layer</div>
          <h3 className="mt-2 text-[29px] font-display font-semibold leading-[1.08] tracking-apple-tighter">
            NeuralNet5G detects, acts, and closes the loop.
          </h3>
          <p className="mt-2 max-w-[58ch] text-[16px] leading-[1.46] tracking-apple-tight text-black/72">
            The AI service is no longer only scoring faults. It is auto-remediating recoverable towers, generating
            field dispatches for hardware failures, and proving operator impact in real time.
          </p>
        </div>
        <div className="rounded-[18px] bg-black px-4 py-3 text-white">
          <div className="text-[11px] uppercase tracking-[0.12px] text-white/46">Operator outcome</div>
          <div className="mt-1 text-[18px] leading-[1.18] tracking-apple-tight">Autonomous fault resolution service</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[24px] border border-black/[0.06] bg-apple-surface px-5 py-5 ring-1 ring-black/[0.04]">
            <div className="text-[11px] uppercase tracking-[0.12px] text-black/46">{metric.label}</div>
            <div className="mt-3 text-[34px] font-display font-semibold leading-[1.02] tracking-apple-tighter text-black/88">
              {metric.value}
            </div>
            <div className="mt-2 text-[14px] leading-[1.38] tracking-apple-caption text-black/66">{metric.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
