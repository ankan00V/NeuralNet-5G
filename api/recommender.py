from __future__ import annotations


class SelfHealingRecommender:
    PLAYBOOKS = {
        "normal": [],
        "congestion": [
            {
                "action_name": "load_balance_to_adjacent_cell",
                "description": "Apply SON mobility load balancing and shift high-PRB users to adjacent cells with spare capacity.",
                "estimated_resolution_minutes": 4,
            },
            {
                "action_name": "neighbour_cell_offload",
                "description": "Temporarily bias A3 and CIO neighbour settings to move traffic away from the hot cell.",
                "estimated_resolution_minutes": 6,
            },
            {
                "action_name": "adjust_transmit_power",
                "description": "Use a small down-tilt or power trim only if overshoot is driving extra contention and SINR remains stable.",
                "estimated_resolution_minutes": 8,
            },
        ],
        "coverage_degradation": [
            {
                "action_name": "adjust_transmit_power",
                "description": "Increase transmit power by 2-3 dB on the affected sector to recover edge RSRP before service drops.",
                "estimated_resolution_minutes": 5,
            },
            {
                "action_name": "antenna_tilt_optimisation",
                "description": "Trigger remote electrical tilt review to recover coverage overlap and stabilise SINR for handover users.",
                "estimated_resolution_minutes": 12,
            },
            {
                "action_name": "escalate_to_engineer",
                "description": "Escalate for feeder, jumper, or radio hardware inspection if the RSRP and SINR drop persists after remote actions.",
                "estimated_resolution_minutes": 20,
            },
        ],
        "hardware_anomaly": [
            {
                "action_name": "escalate_to_engineer",
                "description": "Dispatch field engineering and correlate RAN alarms because erratic multi-KPI behaviour often indicates hardware instability.",
                "estimated_resolution_minutes": 20,
            },
            {
                "action_name": "load_balance_to_adjacent_cell",
                "description": "Protect users by draining traffic to healthy neighbours while the suspect sector remains under observation.",
                "estimated_resolution_minutes": 5,
            },
            {
                "action_name": "neighbour_cell_offload",
                "description": "Force controlled offload of mobility users to reduce failed handovers and service impact during diagnostics.",
                "estimated_resolution_minutes": 7,
            },
        ],
    }

    def recommend(self, fault_type: str, fault_probability: float, tower_id: str) -> list[dict]:
        ordered_actions = self.PLAYBOOKS.get(fault_type, [])
        recommendations = []
        for index, action in enumerate(ordered_actions[:3], start=1):
            confidence = max(0.2, min(0.99, fault_probability - ((index - 1) * 0.12)))
            recommendations.append(
                {
                    "rank": index,
                    "action_name": action["action_name"],
                    "description": action["description"],
                    "confidence_score": round(confidence, 4),
                    "estimated_resolution_minutes": action["estimated_resolution_minutes"],
                }
            )
        return recommendations
