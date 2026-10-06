# Component 1 - Context-Aware Adaptive Environmental Sensing
Owner: IT23384392. ESP32 + pH/turbidity/EC/TDS/temperature sensors.
- `firmware/` PlatformIO project for the ESP32 node
- `src/preprocessing.py` calibration, noise filtering, missing values, temperature compensation, sensor confidence
- `src/context.py` context identification (stable / watch / event)
- `src/adaptive_sampling.py` `decide()` -> Observation (parameters, interval, transmission priority, reasons)
- `tests/`
