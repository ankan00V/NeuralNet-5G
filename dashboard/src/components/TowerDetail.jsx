import { useEffect, useState } from "react";
import KpiChart from "./KpiChart";
import { formatProbability, sentenceCase } from "../lib/formatters";
import { buildApiPath } from "../lib/runtimeConfig";

export default function TowerDetail({ tower, serviceState, dispatchTicket, onClose }) {
  const [attributionData, setAttributionData] = useState(null);
  const [explainMeta, setExplainMeta] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [loadingAttribution, setLoadingAttribution] = useState(false);
  const [loadingForecast, setLoadingForecast] = useState(false);

  useEffect(() => {
    if (!tower) {
      setAttributionData(null);
      setExplainMeta(null);
      setForecastData(null);
      return;
    }

    let isMounted = true;
    setLoadingAttribution(true);

    fetch(buildApiPath(`/api/v1/explain/${tower.tower_id}`), { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.attributions)) {
          setAttributionData(data.attributions);
          setExplainMeta({
            model: data.model,
            method: data.method,
            note: data.note,
          });
        } else {
          setAttributionData(null);
          setExplainMeta(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAttributionData(null);
          setExplainMeta(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingAttribution(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tower]);

  useEffect(() => {
    if (!tower) {
      setForecastData(null);
      return;
    }

    let isMounted = true;
    setLoadingForecast(true);

    fetch(buildApiPath(`/api/v1/forecast/${tower.tower_id}`), { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.forecast) && data.forecast.length > 0) {
          setForecastData(data);
        } else {
          setForecastData(null);
        }
      })
      .catch(() => {
        if (isMounted) setForecastData(null);
      })
      .finally(() => {
        if (isMounted) setLoadingForecast(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tower]);

  if (!tower) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close tower inspector"
        onClick={onClose}
        className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm transition-opacity"
      />

      <aside className="fixed right-0 top-0 z-[1200] h-screen w-full max-w-[560px] overflow-auto bg-core-bg border-l border-core-border px-6 py-6 shadow-xl sm:px-8">
        <div className="animate-panel-in flex flex-col h-full">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-core-border">
            <div>
              <div className="section-eyebrow text-core-accent">Tower Overview</div>
              <h3 className="text-2xl font-bold tracking-tight text-white m-0 mt-1">{tower.tower_id}</h3>
              <div className="text-sm font-medium text-core-textMuted mt-1">
                {tower.city} · {tower.lat?.toFixed(3)}, {tower.lon?.toFixed(3)}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-core-surface border border-core-borderLight px-4 py-2 text-xs font-semibold uppercase tracking-wider text-core-text transition-colors duration-200 hover:bg-core-surfaceHover"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-6 pb-12 pr-2">
            <div className="surface-panel p-5 grid gap-5 sm:grid-cols-2 mb-6">
              <div>
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted">Live Status</div>
                <div className="mt-2 inline-flex items-center gap-2 rounded border border-core-border bg-core-bg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-core-text">
                  <span
                    className={`h-2 w-2 rounded-full shadow-md ${
                      tower.status === "red" ? "bg-red shadow-glow-critical" : tower.status === "amber" ? "bg-amber" : "bg-green"
                    }`}
                  />
                  {sentenceCase(tower.status)}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted">LSTM Prediction Class</div>
                <div className="mt-2 text-[15px] font-medium text-core-text capitalize">{sentenceCase(tower.fault_type)}</div>
              </div>

              <div className="border-t border-core-border pt-4 sm:border-none sm:pt-0">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted">Target Horizon</div>
                <div className="mt-2 text-[15px] font-medium text-core-text">{tower.lead_time_minutes} min window</div>
              </div>

              <div className="border-t border-core-border pt-4 sm:border-none sm:pt-0">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted">Confidence Interval</div>
                <div className="mt-2 text-[15px] font-medium text-core-text">{formatProbability(tower.confidence)}</div>
              </div>

              <div className="border-t border-core-border pt-4 sm:border-none sm:pt-0 sm:col-span-2">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted">Inference Model Version</div>
                <div className="mt-2 text-[14px] font-mono text-core-text">{tower.model_version ?? explainMeta?.model ?? "Unavailable"}</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-semibold text-core-text">Fault Probability Score</span>
                <span className={`font-mono text-xl font-bold ${tower.status === "red" ? "text-red" : "text-core-text"}`}>
                  {formatProbability(tower.fault_probability)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-core-surface rounded-full overflow-hidden border border-core-border">
                <div
                  className={`h-full ${tower.status === "red" ? "bg-red" : "bg-core-primary"} transition-all duration-500`}
                  style={{ width: `${Math.max(2, tower.fault_probability * 100)}%` }}
                />
              </div>
            </div>

            <div className="surface-panel p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-4 w-4 rounded-sm bg-core-accent flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full border border-core-bg"></div>
                </div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Model Attribution</h4>
              </div>

              <p className="text-xs text-core-textMuted mb-5 leading-relaxed">
                Feature impact derived from the running inference pipeline.
                {explainMeta?.method ? ` Method: ${explainMeta.method}.` : ""}
              </p>

              {loadingAttribution ? (
                <div className="h-32 flex items-center justify-center text-xs font-mono text-core-textMuted animate-pulse">
                  Calculating feature attributions...
                </div>
              ) : attributionData ? (
                <div className="grid gap-3">
                  {attributionData.map((item) => (
                    <div key={item.feature} className="relative">
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-core-text">{item.feature}</span>
                        <span className="text-core-textMuted">{(item.impact * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-core-bg rounded-full overflow-hidden">
                        <div className="h-full bg-core-accent" style={{ width: `${item.impact * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center text-xs text-core-textMuted border border-dashed border-core-border rounded">
                  Attribution endpoint unavailable.
                </div>
              )}
            </div>

            {loadingForecast ? (
              <div className="surface-panel p-5 mb-6 text-xs font-mono text-core-textMuted animate-pulse">
                Building model-derived forecast trajectory...
              </div>
            ) : forecastData ? (
              <div className="surface-panel p-5 mb-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Forecast Trajectory</h4>
                  <span className="text-[11px] font-mono text-core-textMuted">{forecastData.method}</span>
                </div>

                <div className="grid gap-3">
                  {forecastData.forecast.slice(0, 6).map((point) => (
                    <div key={`${point.step_minutes_ahead}-${point.timestamp}`}>
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="text-core-textMuted">+{point.step_minutes_ahead} min</span>
                        <span className="text-core-text">{formatProbability(point.predicted_probability)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-core-bg rounded-full overflow-hidden">
                        <div className="h-full bg-core-primary" style={{ width: `${Math.max(2, point.predicted_probability * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {serviceState && (
              <div className="mb-6 rounded-lg bg-core-primary/10 border border-core-primary/30 p-5">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-primary mb-2">Automated Policy Recovery</div>
                <div className="text-lg font-bold text-white tracking-tight">{serviceState.badge}</div>
                <div className="text-sm text-core-text mt-1">{serviceState.action}</div>

                {dispatchTicket && (
                  <div className="mt-4 pt-4 border-t border-core-primary/20 flex justify-between items-center">
                    <span className="text-xs text-core-primary">Physical Dispatch Required</span>
                    <span className="text-xs font-mono bg-core-primary/20 px-2 py-1 rounded text-white object-right">
                      {dispatchTicket.assignedTeam}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="surface-panel p-5">
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-core-textMuted mb-4">30-Step Horizon View</div>
              <KpiChart towerId={tower.tower_id} kpiHistory={tower.kpi_history} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
