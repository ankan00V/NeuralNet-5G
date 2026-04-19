# Telecom-Like Demo Profile

This project now uses an India-oriented demo profile instead of generic random tower placement.

## Baseline Logic

- Measurement clamps follow 5G NR reporting ranges and broad KPI bounds suitable for a demo system.
- Healthy operating means are engineering inferences calibrated for metro Indian 5G deployments.
- Throughput and latency are biased toward urban NSA/NR mid-band behavior rather than laboratory peak values.
- Handover failure targets are treated as operational thresholds, not standards-defined pass/fail limits.

## KPI Guidance Used

- `rsrp`: healthy roughly `-82 dBm` to `-96 dBm`, warning below `-105 dBm`, danger below `-110 dBm`
- `sinr`: healthy roughly `8 dB` to `20 dB`, warning below `5 dB`, danger at or below `0 dB`
- `dl_throughput`: healthy roughly `180-330 Mbps` depending on site profile, danger below `80 Mbps`
- `ul_throughput`: healthy roughly `24-46 Mbps`, danger below `12 Mbps`
- `ho_failure_rate`: healthy roughly `<1.5%`, warning above `3%`, danger above `5%`
- `rtt`: healthy roughly `10-20 ms`, warning above `40 ms`, danger above `100 ms`

## Showcase Towers

- `TOWER_006`: Mumbai - BKC
- `TOWER_013`: Bengaluru - Outer Ring Road
- `TOWER_024`: Chennai - Ambattur
- `TOWER_031`: Pune - Hinjawadi
- `TOWER_042`: Jaipur - Vaishali Nagar

## Source Notes

The exact operating thresholds above are inferred from standards and operator-style KPI practice rather than copied directly from one source.

Primary references used:

- GSMA IR.42 for service quality KPI categories:
  [IR.42 v11.0 PDF](https://www.gsma.com/newsroom/wp-content/uploads/IR.42-v11.0.pdf)
- 3GPP TS 28.554 for 5G end-to-end KPI definitions including mobility KPIs:
  [ETSI TS 128 554 V18.8.0 PDF](https://www.etsi.org/deliver/etsi_ts/128500_128599/128554/18.08.00_60/ts_128554v180800p.pdf)
- 3GPP TS 38.133 availability and NR RRM measurement context:
  [ATIS 3GPP 38.133 listing](https://atis.org/international-partnerships/3gpp/3gpp-specifications-published-as-atis-standards/)
- India QoS and drive-test context:
  [TRAI wireless data QoS report page](https://www.trai.gov.in/node/13035)
  [TRAI March 2024 wireless report page](https://www.trai.gov.in/node/2933)
- Global 5G observed throughput/latency context:
  [GSMA State of 5G 2024](https://media-assets-prod.gsmaintelligence.com/content/210224-The-State-of-5G-2024-compressed.pdf)

