import { sentenceCase } from "../lib/formatters";

export default function RecommendationPanel({ towers }) {
  const criticalTower = towers
    .filter((tower) => tower.fault_probability > 0.5)
    .sort((left, right) => right.fault_probability - left.fault_probability)[0];

  return (
    <section className="surface-panel flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 sm:px-7">
      <div>
        <div className="recommendation-panel__label">AI Recommendation</div>
        <h3 className="recommendation-panel__title">
          AI-ranked next best action
        </h3>
        <p className="recommendation-panel__body">
          The top telecom intervention candidate generated from the current fault forecast.
        </p>
      </div>

      {!criticalTower ? (
        <div className="surface-muted mt-6 px-6 py-10 text-center text-[17px] leading-[1.47] tracking-apple-tight text-black/72">
          No immediate recommendation is required. The model is not seeing a tower above the critical action threshold.
        </div>
      ) : (
        <div className="mt-5 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <div className="recommendation-inner-card group shadow-apple-lift transition-transform duration-300 ease-apple hover:-translate-y-1">
            <div className="recommendation-inner-card__tower">
              {criticalTower.tower_id}
            </div>
            <h4 className="recommendation-inner-card__action">
              {sentenceCase(criticalTower.recommendations?.[0]?.action_name ?? "No action")}
            </h4>
            <p className="recommendation-inner-card__description">
              {criticalTower.recommendations?.[0]?.description ?? "No recommendation is currently required."}
            </p>

            <div className="mt-5">
              <div className="confidence-row">
                <span className="confidence-row__label">Confidence</span>
                <span className="confidence-row__value">{Math.round((criticalTower.recommendations?.[0]?.confidence_score ?? 0) * 100)}%</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-white/12 mt-2">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{
                    width: `${Math.max(12, (criticalTower.recommendations?.[0]?.confidence_score ?? 0) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-4 text-[13px] leading-[1.32] tracking-apple-caption text-[var(--text-on-dark-muted)]">
              Estimated telecom recovery time:{" "}
              <span className="font-semibold text-[var(--text-on-dark)]">
                {criticalTower.recommendations?.[0]?.estimated_resolution_minutes ?? 0} minutes
              </span>
            </div>
          </div>

          <div className="surface-muted min-h-0 overflow-auto px-5 py-5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-black/52">Also consider</div>
            <div className="mt-3 grid gap-2">
              {(criticalTower.recommendations ?? []).slice(1).map((action) => (
                <div 
                  key={action.rank} 
                  className="group cursor-pointer rounded-xl px-3 py-3 transition-all duration-200 ease-apple hover:bg-black/[0.04] hover:shadow-apple-lift active:scale-[0.98]"
                >
                  <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-black/44">Rank {action.rank}</div>
                  <div className="mt-1 text-[17px] leading-[1.24] tracking-apple-tight text-black/84">
                    {sentenceCase(action.action_name)}
                  </div>
                  <p className="mt-1 text-[14px] leading-[1.29] tracking-apple-caption text-black/68">
                    {action.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
