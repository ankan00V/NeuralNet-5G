function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildNetworkSummary(towers) {
  const critical = towers.filter((tower) => tower.status === "red");
  const warning = towers.filter((tower) => tower.status === "amber");
  const healthy = towers.filter((tower) => tower.status === "green");
  const hotspotTowers = [...towers]
    .sort((left, right) => right.fault_probability - left.fault_probability)
    .slice(0, 4);

  const availability = towers.length
    ? Math.max(92.1, 99.6 - average(towers.map((tower) => tower.fault_probability)) * 8.5)
    : 99.2;
  const interventionWindow = hotspotTowers.length
    ? Math.round(average(hotspotTowers.map((tower) => tower.lead_time_minutes)))
    : 18;
  const throughput = Math.round(average(towers.map((tower) => tower.kpis?.dl_throughput ?? 0)));
  const confidence = Math.round(average(hotspotTowers.map((tower) => tower.recommendations?.[0]?.confidence_score ?? 0)) * 100);

  return {
    counts: {
      total: towers.length,
      critical: critical.length,
      warning: warning.length,
      healthy: healthy.length,
    },
    availability: availability.toFixed(1),
    interventionWindow,
    throughput,
    confidence,
    hotspotTowers,
  };
}
