from __future__ import annotations

import argparse
import os
import time
from datetime import UTC, datetime

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inject demo faults into the running NeuralNet5G API")
    parser.add_argument("--tower", required=True)
    parser.add_argument("--fault", choices=["congestion", "coverage_degradation", "hardware_anomaly"], default="coverage_degradation")
    parser.add_argument("--duration", type=int, default=180)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--api-base", default=os.getenv("API_BASE_URL", ""))
    parser.add_argument("--token", default=os.getenv("API_AUTH_TOKEN", ""))
    parser.add_argument("--email", default=os.getenv("API_AUTH_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("API_AUTH_PASSWORD", ""))
    return parser.parse_args()


def log_step(tower_id: str, fault: str, severity: float) -> None:
    timestamp = datetime.now(UTC).isoformat()
    print(f"{timestamp} tower={tower_id} fault={fault} severity={severity:.2f}")


def main() -> None:
    args = parse_args()
    if not args.api_base:
        raise SystemExit("Set API_BASE_URL or pass --api-base to target the API.")

    headers = {"Content-Type": "application/json"}
    with httpx.Client(base_url=args.api_base, timeout=10.0) as client:
        token = args.token
        if not token and args.email and args.password:
            auth_response = client.post(
                "/api/v1/auth/login",
                json={"email": args.email, "password": args.password},
            )
            auth_response.raise_for_status()
            token = auth_response.json().get("access_token", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        if args.reset:
            response = client.post("/api/dev/reset-tower", json={"tower_id": args.tower}, headers=headers)
            response.raise_for_status()
            print(response.json())
            return

        steps = max(1, args.duration // 5)
        for step in range(steps):
            severity = min(1.0, 0.25 + ((step + 1) / steps) * 0.75)
            response = client.post(
                "/api/dev/inject-fault",
                json={
                    "tower_id": args.tower,
                    "fault_type": args.fault,
                    "severity": severity,
                },
                headers=headers,
            )
            response.raise_for_status()
            log_step(args.tower, args.fault, severity)
            time.sleep(5)


if __name__ == "__main__":
    main()
