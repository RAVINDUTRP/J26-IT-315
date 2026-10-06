# Component 2 — Resilient Disaster Communication (Self-Healing LoRa Mesh)

**Owner:** IT23384224  
**Hardware target:** ESP32 + LoRa Ra-02  
**Research focus:** reliable, low-power, disaster-resilient transmission when cellular/public internet infrastructure is unavailable.

## Implemented layers

1. **Node health scoring** — RSSI, SNR, battery and congestion are normalised into an explainable 0–1 health score.
2. **Adaptive multi-hop routing** — candidate paths are ranked using node health, radio quality, packet loss and hop count. A healthier alternative is selected when the active path degrades.
3. **Self-healing simulation** — a node/link failure is injected and route recovery time is measured.
4. **Compact binary packets** — fixed-width sensor telemetry is encoded before transmission.
5. **Rolling-key XOR protection** — each sequence derives a different XOR keystream. An 8-byte HMAC tag is also used to detect tampering.
6. **Gateway pipeline** — the backend demonstrates packet decode/decrypt and exposes the resulting network state to the dashboard.
7. **Performance metrics** — PDR, end-to-end latency, energy estimate, route-switch rate and recovery time are available for experiments.

> The rolling-key XOR mechanism is a lightweight research prototype. XOR is not a modern authenticated-encryption primitive and should not be presented as production-grade cryptography.

## Run the Python tests

From `component2_comms/`:

```powershell
python -m pytest
```

## Run the simulation

From the repository root:

```powershell
python -m component2_comms.simulation.mesh_sim
```

## Hardware

`firmware/` is a PlatformIO ESP32 project. The current firmware contains the radio/node skeleton and serial telemetry hooks; actual mesh deployment requires the selected LoRa wiring, node IDs and field-test parameters to be confirmed with the hardware setup.
