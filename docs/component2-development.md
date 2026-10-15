# Component 2 Development Notes

Branch: `new/feat-Component2`

## Research implementation

- Explainable node health score from RSSI, SNR, battery and congestion.
- Adaptive multi-hop route ranking and pre-emptive route switching.
- Failure injection and self-healing recovery simulation.
- Fixed-width compact binary telemetry packet.
- Rolling-key XOR protection plus an 8-byte HMAC integrity tag in the Python prototype.
- Gateway decode/decrypt demonstration.
- PDR, latency, energy and recovery metrics.
- React network dashboard backed by FastAPI.

## Suggested commit sequence

1. `feat(c2): implement adaptive routing and node health`
2. `feat(c2): add compact packet codec and rolling-key protection`
3. `feat(c2): add deterministic mesh failure simulation`
4. `feat(c2): implement ESP32 LoRa node firmware skeleton`
5. `feat(c2): expose communication metrics through FastAPI`
6. `feat(c2): build resilient mesh network dashboard`
7. `docs: document component 2 development and run steps`

## Important scope note

The proposal calls for an adaptive multi-hop routing mechanism; it does not name AODV, DSR, RPL or another standard routing protocol. This implementation therefore uses an explicit path-ranking and route-recovery mechanism rather than claiming that one of those named protocols is already part of the proposal.

The XOR rolling-key mechanism is a lightweight research prototype. XOR is not production-grade authenticated encryption.
