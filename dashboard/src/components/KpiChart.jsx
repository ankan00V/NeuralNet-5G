import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { formatTimestamp } from "../lib/formatters";

const kpiConfig = [
  { key: "rsrp", label: "RSRP", unit: "dBm", threshold: -110 },
  { key: "sinr", label: "SINR", unit: "dB", threshold: 0 },
  { key: "dl_throughput", label: "DL Throughput", unit: "Mbps", threshold: 80 },
  { key: "ul_throughput", label: "UL Throughput", unit: "Mbps", threshold: 15 },
  { key: "ho_failure_rate", label: "HO Failure", unit: "%", threshold: 5 },
  { key: "rtt", label: "RTT", unit: "ms", threshold: 100 },
];

export default function KpiChart({ towerId, kpiHistory = [] }) {
  const chartData = useMemo(
    () =>
      kpiHistory.map((row) => ({
        ...row,
        shortTime: formatTimestamp(row.timestamp),
      })),
    [kpiHistory],
  );

  return (
    <div>
      <div className="mb-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-black/52">Thirty-step KPI trace</div>
        <h4 className="mt-2 text-[21px] font-display font-semibold leading-[1.19] tracking-apple-loose">{towerId}</h4>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {kpiConfig.map((metric) => {
          const latestValue = chartData.at(-1)?.[metric.key];

          return (
            <div key={metric.key} className="surface-muted px-4 py-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] leading-[1.29] tracking-apple-caption text-black/78">{metric.label}</div>
                  <div className="mt-1 text-[12px] tracking-apple-micro text-black/48">{metric.unit}</div>
                </div>
                <div className="text-[14px] font-semibold leading-[1.29] tracking-apple-caption text-black/82">
                  {latestValue?.toFixed?.(1) ?? "0.0"}
                </div>
              </div>

              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="shortTime" hide />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid rgba(29,29,31,0.08)",
                        borderRadius: "14px",
                        boxShadow: "3px 5px 30px rgba(0, 0, 0, 0.12)",
                      }}
                      labelStyle={{ color: "rgba(29,29,31,0.6)" }}
                    />
                    <ReferenceLine y={metric.threshold} stroke="rgba(29,29,31,0.2)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey={metric.key} stroke="#0071e3" dot={false} strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
