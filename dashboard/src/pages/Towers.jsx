import { useDeferredValue, useMemo, useState } from "react";
import { useLiveNetwork } from "../context/WebSocketContext";
import { formatProbability, formatTimestamp, sentenceCase } from "../lib/formatters";

const sorters = {
  probability: (left, right) => right.fault_probability - left.fault_probability,
  rsrp: (left, right) => left.kpis.rsrp - right.kpis.rsrp,
  throughput: (left, right) => right.kpis.dl_throughput - left.kpis.dl_throughput,
};

export default function Towers() {
  const { lastUpdate, towers } = useLiveNetwork();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("probability");
  const deferredTowers = useDeferredValue(towers);

  const filtered = useMemo(() => {
    const next = deferredTowers.filter((tower) => statusFilter === "all" || tower.status === statusFilter);
    return [...next].sort(sorters[sortBy]);
  }, [deferredTowers, sortBy, statusFilter]);

  return (
    <section className="pb-6 animate-fade-in-up">
      <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-eyebrow">Inference Queue</div>
          <h2 className="section-title">Every tower scored by the telecom ML pipeline</h2>
          <p className="section-copy">
            Compare KPI health, predicted fault class, and lead time for each tower in the current network model to
            understand how the AI layer is prioritizing intervention.
          </p>
        </div>

        <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-[var(--text-secondary)]">
          {filtered.length} towers shown
          <span className="mx-2 inline-block text-[var(--border)]">/</span>
          Updated {formatTimestamp(lastUpdate)}
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-[999px] bg-[var(--bg-surface-hover)] p-[4px] border border-[var(--border)]">
          {["all", "green", "amber", "red"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-[999px] px-4 py-[6px] text-[13px] font-semibold tracking-wide uppercase transition-all duration-200 active:scale-95 ${
                statusFilter === value ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {sentenceCase(value)}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-3 rounded-[11px] bg-[var(--bg-surface)] px-4 py-2 ring-1 ring-[var(--border)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Sort</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="bg-transparent text-[13px] tracking-wide text-[var(--text-primary)] outline-none"
          >
            <option value="probability">Fault probability</option>
            <option value="rsrp">RSRP</option>
            <option value="throughput">DL throughput</option>
          </select>
        </label>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-surface)]">
              <tr className="text-left">
                {["ID", "Status", "RSRP", "SINR", "DL Throughput", "Fault Probability", "Confidence", "Predicted Fault", "Last Updated"].map(
                  (column) => (
                    <th
                      key={column}
                      className="px-5 py-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      {column}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
              {filtered.map((tower) => (
                <tr key={tower.tower_id} className="cursor-pointer transition-all duration-200 hover:bg-[var(--bg-surface-hover)]">
                  <td className="px-5 py-4 text-[13px] font-mono tracking-wider text-[var(--text-secondary)]">{tower.tower_id}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          tower.status === "red"
                            ? "bg-[rgba(235,85,69,1)] shadow-[0_0_8px_rgba(235,85,69,0.8)]"
                            : tower.status === "amber"
                              ? "bg-[rgba(245,166,35,1)] shadow-[0_0_8px_rgba(245,166,35,0.8)]"
                              : "bg-[rgba(10,132,255,1)] shadow-[0_0_8px_rgba(10,132,255,0.8)]"
                        }`}
                      />
                      <span className="text-[var(--text-secondary)]">{sentenceCase(tower.status)}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[13px] tracking-wide text-[var(--text-secondary)]">{tower.kpis.rsrp.toFixed(1)} dBm</td>
                  <td className="px-5 py-4 text-[13px] tracking-wide text-[var(--text-secondary)]">{tower.kpis.sinr.toFixed(1)} dB</td>
                  <td className="px-5 py-4 text-[13px] tracking-wide text-[var(--text-secondary)]">
                    {tower.kpis.dl_throughput.toFixed(1)} Mbps
                  </td>
                  <td className="px-5 py-4">
                    <div className="mb-2 h-[3px] w-32 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.max(8, tower.fault_probability * 100)}%` }}
                      />
                    </div>
                    <div className="text-[11px] font-mono tracking-wider text-[var(--text-secondary)]">
                      {formatProbability(tower.fault_probability)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const p = tower.fault_probability;
                      const level = p >= 0.7 ? "HIGH" : p >= 0.4 ? "MEDIUM" : "LOW";
                      const cls = p >= 0.7
                        ? "border-[rgba(235,85,69,0.4)] bg-[rgba(235,85,69,0.12)] text-[rgba(235,85,69,1)]"
                        : p >= 0.4
                        ? "border-[rgba(245,166,35,0.4)] bg-[rgba(245,166,35,0.12)] text-[rgba(245,166,35,1)]"
                        : "border-[rgba(10,132,255,0.3)] bg-[rgba(10,132,255,0.08)] text-[rgba(10,132,255,1)]";
                      return (
                        <span className={`inline-flex rounded-[4px] border px-2 py-0.5 text-[10px] font-bold tracking-widest ${cls}`}>
                          {level}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4 text-[13px] tracking-wide text-[var(--text-secondary)]">
                    {sentenceCase(tower.fault_type)}
                  </td>
                  <td className="px-5 py-4 text-[11px] font-mono tracking-wider text-[var(--text-secondary)]">
                    {formatTimestamp(tower.last_updated ?? tower.kpis.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
