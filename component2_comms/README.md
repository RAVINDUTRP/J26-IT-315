# Component 2 - Resilient Disaster Communication (self-healing LoRa mesh)
Owner: IT23384224. ESP32 + LoRa Ra-02 nodes.
- `firmware/` PlatformIO project (sensor / relay / gateway roles)
- `simulation/mesh_sim.py` software mesh for testing routing before hardware is ready
- `src/node_health.py` predicts link/node degradation from RSSI, SNR, battery trend, congestion
- `src/routing.py` `deliver()` ranks paths and switches pre-emptively
