import os
import sys
import json
import logging
from pathlib import Path

# Add project root to sys.path for direct execution
_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from typing import Dict, Any, Tuple, List, Optional
import numpy as np
import pandas as pd

from src.utils import get_project_root, load_project_config, set_all_seeds, score_to_category

logger = logging.getLogger("contamination_risk.data_generator")


class EnvironmentalDataGenerator:
    """
    Simulates high-resolution, multi-location water quality and meteorology time-series
    reflecting tropical river catchment dynamics (e.g. Kelani River basin).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_project_config()
        self.seed = self.config.get("random_seed", 42)
        set_all_seeds(self.seed)

        self.locations = self.config.get("locations", {})
        self.sampling_interval_min = self.config.get("sensor_sampling_interval_minutes", 15)
        self.simulation_days = self.config.get("simulation_duration_days", 365)
        self.horizon_hours = self.config.get("prediction_horizon_hours", 3)
        self.horizon_steps = int((self.horizon_hours * 60) / self.sampling_interval_min)
        self.root_dir = get_project_root()

    def generate_weather_series(self, timestamps: pd.DatetimeIndex) -> pd.DataFrame:
        """
        Generate physically correlated weather parameters with seasonal monsoons
        and episodic tropical convective rainstorms.
        """
        n = len(timestamps)
        day_of_year = timestamps.dayofyear.values
        hour_of_day = timestamps.hour.values + timestamps.minute.values / 60.0

        # Monsoonal seasonality in Sri Lanka:
        # Southwest Monsoon (May-Sep, peak June), Northeast Monsoon (Dec-Feb, peak Jan)
        sw_monsoon = np.exp(-0.5 * ((day_of_year - 165) / 35.0) ** 2)
        ne_monsoon = np.exp(-0.5 * ((day_of_year - 355) / 25.0) ** 2) + np.exp(-0.5 * ((day_of_year - 15) / 25.0) ** 2)
        monsoon_intensity = 0.25 + 0.55 * sw_monsoon + 0.35 * ne_monsoon

        # Diurnal temperature cycle: peaks around 14:00, coolest at 05:00
        temp_diurnal = 5.0 * np.sin(2 * np.pi * (hour_of_day - 8.0) / 24.0)
        base_temp = 28.5 + temp_diurnal - 2.0 * monsoon_intensity
        weather_temp = base_temp + np.random.normal(0, 0.8, n)

        # Humidity inversely proportional to temperature, higher during monsoon
        weather_humidity = 82.0 - 0.7 * temp_diurnal + 12.0 * monsoon_intensity + np.random.normal(0, 2.5, n)
        weather_humidity = np.clip(weather_humidity, 45.0, 99.0)

        # Wind speed: higher in monsoon afternoons
        wind_speed = 8.0 + 6.0 * monsoon_intensity + 4.0 * np.maximum(0, np.sin(np.pi * (hour_of_day - 10) / 12)) + np.random.exponential(2.5, n)
        wind_speed = np.clip(wind_speed, 1.0, 60.0)

        # Multi-state Markov / Auto-regressive Rainfall model
        # State 0: Dry (85% prob), State 1: Light drizzle (10%), State 2: Convective/Heavy storm (5%)
        rainfall = np.zeros(n)
        rain_prob = np.zeros(n)
        weather_code = np.zeros(n, dtype=int)

        current_rain = 0.0
        rain_duration_left = 0
        storm_type = 0

        for i in range(n):
            local_prob = monsoon_intensity[i] * 0.45
            if timestamps[i].hour in [14, 15, 16, 17, 18]:  # Afternoon convective instability
                local_prob += 0.25
            rain_prob[i] = np.clip(local_prob * 100.0 + np.random.normal(0, 5), 0, 100)

            if rain_duration_left > 0:
                rain_duration_left -= 1
                if storm_type == 1:
                    # Light intermittent rain (0.5 - 4 mm/step)
                    current_rain = max(0.0, current_rain * 0.8 + np.random.exponential(0.8))
                    weather_code[i] = 61 if current_rain < 2.0 else 63
                else:
                    # Heavy convective storm (5 - 35 mm/step)
                    current_rain = max(1.5, current_rain * 0.85 + np.random.gamma(shape=2.5, scale=4.0))
                    weather_code[i] = 65 if current_rain < 15.0 else 95
                rainfall[i] = current_rain
            else:
                if np.random.rand() < (local_prob * 0.12):  # New rain event begins
                    storm_type = 2 if (np.random.rand() < 0.25 + 0.3 * monsoon_intensity[i]) else 1
                    rain_duration_left = np.random.randint(4, 20)  # 1 to 5 hours duration
                    current_rain = np.random.uniform(1.0, 5.0) if storm_type == 1 else np.random.uniform(6.0, 25.0)
                    rainfall[i] = current_rain
                    weather_code[i] = 80 if storm_type == 1 else 95
                else:
                    rainfall[i] = 0.0
                    current_rain = 0.0
                    weather_code[i] = 0 if weather_humidity[i] < 75 else 2

        weather_df = pd.DataFrame({
            "rainfall_mm": np.round(rainfall, 2),
            "precipitation_probability_pct": np.round(rain_prob, 1),
            "weather_temp_c": np.round(weather_temp, 2),
            "weather_humidity_pct": np.round(weather_humidity, 1),
            "wind_speed_kmh": np.round(wind_speed, 1),
            "weather_code": weather_code,
            "weather_data_type": "synthetic_forecast_aligned"
        })
        return weather_df

    def generate_single_location_series(
        self,
        location_id: str,
        loc_meta: Dict[str, Any],
        timestamps: pd.DatetimeIndex,
        weather_df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Simulate water quality parameters for a specific monitoring station,
        coupling hydrodynamics with meteorological runoff and local point-source events.
        """
        n = len(timestamps)
        rainfall = weather_df["rainfall_mm"].values
        weather_temp = weather_df["weather_temp_c"].values
        hour_of_day = timestamps.hour.values + timestamps.minute.values / 60.0

        # Antecedent cumulative rainfall (runoff hydrograph driving force)
        rain_series = pd.Series(rainfall)
        rain_accum_3h = rain_series.rolling(window=12, min_periods=1).sum().values
        rain_accum_24h = rain_series.rolling(window=96, min_periods=1).sum().values

        # 1. Water Temperature: follows air temp with thermal inertia & diurnal dampening
        water_temp = 26.5 + 0.35 * (weather_temp - 28.0) + 1.2 * np.sin(2 * np.pi * (hour_of_day - 11.0) / 24.0)
        water_temp += np.random.normal(0, 0.25, n)

        # 2. Baseline Turbidity (NTU): nominal 8-15 NTU.
        # Runoff sediment pulse: non-linear response to 3h and 24h rainfall
        base_turbidity = 10.0 + np.random.gamma(shape=2.0, scale=1.5, size=n)
        runoff_sediment = 1.8 * rain_accum_3h + 0.6 * np.sqrt(rain_accum_24h) * rain_accum_3h
        turbidity = base_turbidity + runoff_sediment

        # 3. pH: nominal neutral (7.3 - 7.6) with slight photosynthesis daytime rise
        diurnal_ph = 0.15 * np.sin(2 * np.pi * (hour_of_day - 8.0) / 24.0)
        rain_ph_acidification = -0.015 * rain_accum_3h  # Acid rain / organic soil runoff drop
        ph = 7.42 + diurnal_ph + rain_ph_acidification + np.random.normal(0, 0.08, n)

        # 4. TDS (ppm) & EC (uS/cm):
        # Initial wash-off causes slight TDS spike, followed by dilution during prolonged flooding
        dilution_factor = np.clip(1.0 - 0.003 * rain_accum_24h + 0.005 * rain_accum_3h, 0.65, 1.4)
        base_tds = (160.0 + np.random.normal(0, 10.0, n)) * dilution_factor
        tds = base_tds

        # Location-specific environmental characteristics:
        if location_id == "SITE_001":
            # Estuary: periodic semi-diurnal tidal salinity intrusion
            tide_phase = (timestamps.dayofyear * 24 + hour_of_day) % 12.42
            tidal_salt_pulse = 220.0 * np.maximum(0, np.sin(2 * np.pi * tide_phase / 12.42)) * np.exp(-0.02 * rain_accum_24h)
            tds += tidal_salt_pulse
        elif location_id == "SITE_003":
            # Upper industrial node: higher base TDS and vulnerability to unpermitted discharge
            tds += 35.0

        # Electrical Conductivity is strongly correlated with TDS in freshwater: EC ~ 1.85 to 2.05 * TDS
        ec = tds * (1.92 + np.random.normal(0, 0.04, n))

        # Sensor health & telemetry confidence
        sensor_confidence = np.ones(n, dtype=float)
        sensor_status = ["OK"] * n

        # ---------------------------------------------------------------------
        # CONTAMINATION EVENT INJECTION (Realistic Environmental Scenarios)
        # ---------------------------------------------------------------------
        events_record = []
        raw_risk_score = np.zeros(n)
        is_contaminated_instant = np.zeros(n, dtype=int)

        # Scenario Generator:
        # A) Heavy Runoff Flooding & Sedimentation Events
        # B) Point-Source Chemical / Industrial Spill Events (mainly SITE_003 and SITE_002)
        # C) Severe Acid / Alkaline Dumping
        # D) Estuarine Hyper-salinity Contamination
        # E) Sensor Anomaly Injections (Stuck readings, spikes, drift)

        num_events = int(self.simulation_days * 0.18)  # ~65 episodic events across the year
        event_starts = np.sort(np.random.choice(np.arange(100, n - 200), size=num_events, replace=False))

        for ev_idx, start_step in enumerate(event_starts):
            # Select event scenario based on location and antecedent weather
            current_local_rain = rain_accum_3h[start_step]
            ev_type_rand = np.random.rand()

            if current_local_rain > 20.0:
                # Scenario A: Massive Stormwater Runoff Contamination
                duration = np.random.randint(8, 28)  # 2 to 7 hours
                end_step = min(n, start_step + duration)
                profile = np.sin(np.pi * np.linspace(0, 1, end_step - start_step))
                turbidity[start_step:end_step] += profile * np.random.uniform(70.0, 320.0)
                tds[start_step:end_step] += profile * np.random.uniform(40.0, 180.0)
                ec[start_step:end_step] = tds[start_step:end_step] * 1.95
                ph[start_step:end_step] -= profile * np.random.uniform(0.3, 0.8)

                severity = np.random.uniform(65.0, 95.0)
                raw_risk_score[start_step:end_step] = np.maximum(raw_risk_score[start_step:end_step], profile * severity)
                is_contaminated_instant[start_step:end_step] = 1

                events_record.append({
                    "event_id": f"EV_{location_id}_{ev_idx+1:03d}",
                    "location_id": location_id,
                    "event_type": "STORMWATER_RUNOFF_SEDIMENTATION",
                    "start_time": str(timestamps[start_step]),
                    "end_time": str(timestamps[end_step - 1]),
                    "duration_hours": round(duration * self.sampling_interval_min / 60.0, 2),
                    "peak_risk_score": round(severity, 1),
                    "trigger_rainfall_3h_mm": round(float(current_local_rain), 2)
                })

            elif ev_type_rand < 0.40 and location_id in ["SITE_003", "SITE_002"]:
                # Scenario B: Industrial Acidic Discharge (Night/Off-peak dumping)
                duration = np.random.randint(6, 18)  # 1.5 to 4.5 hours
                end_step = min(n, start_step + duration)
                profile = np.sin(np.pi * np.linspace(0, 1, end_step - start_step))
                ph_drop = np.random.uniform(1.2, 2.4)
                ph[start_step:end_step] -= profile * ph_drop
                tds[start_step:end_step] += profile * np.random.uniform(120.0, 450.0)
                ec[start_step:end_step] += profile * np.random.uniform(300.0, 950.0)

                severity = np.random.uniform(75.0, 98.0)
                raw_risk_score[start_step:end_step] = np.maximum(raw_risk_score[start_step:end_step], profile * severity)
                is_contaminated_instant[start_step:end_step] = 1

                events_record.append({
                    "event_id": f"EV_{location_id}_{ev_idx+1:03d}",
                    "location_id": location_id,
                    "event_type": "INDUSTRIAL_ACIDIC_EFFLUENT",
                    "start_time": str(timestamps[start_step]),
                    "end_time": str(timestamps[end_step - 1]),
                    "duration_hours": round(duration * self.sampling_interval_min / 60.0, 2),
                    "peak_risk_score": round(severity, 1),
                    "ph_min_observed": round(float(np.min(ph[start_step:end_step])), 2)
                })

            elif ev_type_rand < 0.65 and location_id in ["SITE_001", "SITE_004"]:
                # Scenario C: Severe Brackish Saline Intrusion / Wetland Drainage
                duration = np.random.randint(12, 36)
                end_step = min(n, start_step + duration)
                profile = np.sin(np.pi * np.linspace(0, 1, end_step - start_step))
                tds[start_step:end_step] += profile * np.random.uniform(350.0, 1100.0)
                ec[start_step:end_step] = tds[start_step:end_step] * 2.05
                turbidity[start_step:end_step] += profile * np.random.uniform(15.0, 45.0)

                severity = np.random.uniform(60.0, 85.0)
                raw_risk_score[start_step:end_step] = np.maximum(raw_risk_score[start_step:end_step], profile * severity)
                is_contaminated_instant[start_step:end_step] = 1

                events_record.append({
                    "event_id": f"EV_{location_id}_{ev_idx+1:03d}",
                    "location_id": location_id,
                    "event_type": "SALINE_WATER_INTRUSION",
                    "start_time": str(timestamps[start_step]),
                    "end_time": str(timestamps[end_step - 1]),
                    "duration_hours": round(duration * self.sampling_interval_min / 60.0, 2),
                    "peak_risk_score": round(severity, 1),
                    "peak_tds_ppm": round(float(np.max(tds[start_step:end_step])), 1)
                })

            elif ev_type_rand > 0.88:
                # Scenario D: Sensor Anomaly (Hardware fault / biofouling)
                fault_len = np.random.randint(6, 24)
                f_end = min(n, start_step + fault_len)
                fault_type = np.random.choice(["STUCK_READING", "ERRATIC_SPIKE", "PROBE_FOULING"])

                if fault_type == "STUCK_READING":
                    turbidity[start_step:f_end] = turbidity[start_step]
                    sensor_status[start_step:f_end] = ["FAULT"] * (f_end - start_step)
                    sensor_confidence[start_step:f_end] = 0.35
                elif fault_type == "ERRATIC_SPIKE":
                    ph[start_step:f_end] = np.clip(ph[start_step:f_end] + np.random.choice([-3.5, 4.0], size=f_end-start_step), 0, 14)
                    sensor_status[start_step:f_end] = ["DEGRADED"] * (f_end - start_step)
                    sensor_confidence[start_step:f_end] = 0.45
                else:
                    turbidity[start_step:f_end] += np.linspace(10, 80, f_end - start_step)
                    sensor_status[start_step:f_end] = ["DEGRADED"] * (f_end - start_step)
                    sensor_confidence[start_step:f_end] = 0.55

        # Clip values to physically realistic limits
        ph = np.clip(ph, 1.0, 13.5)
        turbidity = np.clip(turbidity, 1.0, 850.0)
        tds = np.clip(tds, 20.0, 3500.0)
        ec = np.clip(ec, 40.0, 7200.0)
        water_temp = np.clip(water_temp, 18.0, 36.0)

        # Baseline noise score for non-event periods (reflecting natural minor fluctuations)
        baseline_score = 12.0 + 0.15 * turbidity + 2.5 * np.abs(ph - 7.4) + 0.04 * tds + 0.4 * rain_accum_3h
        raw_risk_score = np.maximum(raw_risk_score, baseline_score)
        raw_risk_score = np.clip(raw_risk_score + np.random.normal(0, 2.0, n), 0.0, 100.0)

        # ---------------------------------------------------------------------
        # FUTURE TARGET PREPARATION (Strict 3-Hour Lookahead Window)
        # Prevents temporal leakage by looking strictly between t+1 and t+H
        # ---------------------------------------------------------------------
        future_event = np.zeros(n, dtype=int)
        future_score = np.zeros(n, dtype=float)
        future_category = ["LOW"] * n

        # For step i, future window covers steps [i + 1, i + horizon_steps]
        # Equivalent to maximum risk over the next 3 hours
        series_instant = pd.Series(is_contaminated_instant)
        series_score = pd.Series(raw_risk_score)

        # Rolling max reversed for forward looking:
        forward_event_max = series_instant.iloc[::-1].rolling(window=self.horizon_steps, min_periods=1).max().iloc[::-1].shift(-1).fillna(0).values
        forward_score_max = series_score.iloc[::-1].rolling(window=self.horizon_steps, min_periods=1).max().iloc[::-1].shift(-1).fillna(10.0).values

        future_event = (forward_event_max > 0).astype(int)
        future_score = np.round(np.clip(forward_score_max, 0.0, 100.0), 1)

        low_max = self.config.get("risk_thresholds", {}).get("low_max_score", 35.0)
        med_max = self.config.get("risk_thresholds", {}).get("medium_max_score", 70.0)
        future_category = [score_to_category(s, low_max, med_max) for s in future_score]

        df = pd.DataFrame({
            "timestamp": timestamps,
            "location_id": location_id,
            "latitude": loc_meta["latitude"],
            "longitude": loc_meta["longitude"],
            "ph": np.round(ph, 2),
            "turbidity_ntu": np.round(turbidity, 2),
            "tds_ppm": np.round(tds, 1),
            "ec_us_cm": np.round(ec, 1),
            "water_temp_c": np.round(water_temp, 2),
            "sensor_confidence": np.round(sensor_confidence, 2),
            "sensor_status": sensor_status,
            "future_contamination_event": future_event,
            "future_risk_score": future_score,
            "future_risk_category": future_category
        })

        # Merge weather columns
        combined_df = pd.concat([df, weather_df.reset_index(drop=True)], axis=1)

        events_df = pd.DataFrame(events_record)
        return combined_df, events_df

    def generate_full_dataset(self) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
        """
        Generate complete multi-site dataset across the entire simulation duration.
        """
        logger.info("Initializing multi-site environmental dataset generation...")
        start_time = pd.Timestamp("2025-01-01 00:00:00", tz=self.config.get("timezone", "Asia/Colombo"))
        total_steps = self.simulation_days * 24 * (60 // self.sampling_interval_min)
        timestamps = pd.date_range(start=start_time, periods=total_steps, freq=f"{self.sampling_interval_min}min")

        logger.info(f"Generated {total_steps} timestamp steps per location ({self.simulation_days} days @ {self.sampling_interval_min}m intervals).")

        # Master weather stream across the river basin
        weather_df = self.generate_weather_series(timestamps)

        all_site_dfs = []
        all_events = []

        for loc_id, loc_meta in self.locations.items():
            logger.info(f"Simulating hydro-environmental dynamics for {loc_id} ({loc_meta['name']})...")
            site_df, ev_df = self.generate_single_location_series(loc_id, loc_meta, timestamps, weather_df)
            all_site_dfs.append(site_df)
            if not ev_df.empty:
                all_events.append(ev_df)

        full_df = pd.concat(all_site_dfs, axis=0, ignore_index=True)
        # Sort chronologically, then by location
        full_df["timestamp"] = pd.to_datetime(full_df["timestamp"])
        full_df = full_df.sort_values(by=["timestamp", "location_id"]).reset_index(drop=True)

        full_events_df = pd.concat(all_events, axis=0, ignore_index=True) if all_events else pd.DataFrame()

        # Metadata dictionary
        metadata = {
            "dataset_title": "Synthetic Multi-Station River Water Quality and Meteorology Time-Series",
            "provenance": "Synthetic Physics-Informed Stochastic Simulation (Kelani River Basin Calibration)",
            "random_seed": self.seed,
            "sampling_interval_minutes": self.sampling_interval_min,
            "simulation_start": str(timestamps[0]),
            "simulation_end": str(timestamps[-1]),
            "total_records": len(full_df),
            "records_per_location": total_steps,
            "monitoring_locations": list(self.locations.keys()),
            "prediction_horizon_hours": self.horizon_hours,
            "lead_time_steps": self.horizon_steps,
            "features_generated": list(full_df.columns),
            "total_contamination_events_injected": len(full_events_df),
            "class_distribution": {
                "negative_count (0)": int((full_df["future_contamination_event"] == 0).sum()),
                "positive_count (1)": int((full_df["future_contamination_event"] == 1).sum()),
                "positive_ratio_pct": round(float((full_df["future_contamination_event"] == 1).mean() * 100.0), 2)
            },
            "category_distribution": full_df["future_risk_category"].value_counts().to_dict(),
            "synthetic_disclaimer": (
                "CRITICAL NOTICE: This dataset is a synthetic benchmark created for algorithm verification, "
                "temporal learning validation, and explainability testing. While mathematical dynamics mimic "
                "tropical catchment hydrology, labels represent synthetic proxy targets and must not be cited "
                "as measured real-world pollution records."
            )
        }

        return full_df, full_events_df, metadata

    def save_dataset_artifacts(self, full_df: pd.DataFrame, events_df: pd.DataFrame, metadata: Dict[str, Any]) -> None:
        """Save all required raw files, data dictionary, metadata, and sample inference JSON."""
        raw_dir = self.root_dir / "data" / "raw"
        proc_dir = self.root_dir / "data" / "processed"
        sample_dir = self.root_dir / "data" / "inference_samples"

        raw_dir.mkdir(parents=True, exist_ok=True)
        proc_dir.mkdir(parents=True, exist_ok=True)
        sample_dir.mkdir(parents=True, exist_ok=True)

        # 1. Main Raw Dataset CSV
        raw_csv_path = raw_dir / "synthetic_water_quality_weather.csv"
        full_df.to_csv(raw_csv_path, index=False)
        logger.info(f"Saved primary raw dataset: {raw_csv_path} ({len(full_df)} rows)")

        # 2. Contamination Events CSV
        events_csv_path = raw_dir / "synthetic_contamination_events.csv"
        events_df.to_csv(events_csv_path, index=False)
        logger.info(f"Saved contamination event log: {events_csv_path} ({len(events_df)} events)")

        # 3. Dataset Metadata JSON
        meta_path = proc_dir / "dataset_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Saved dataset metadata: {meta_path}")

        # 4. Data Dictionary CSV
        dictionary_data = [
            {"column_name": "timestamp", "data_type": "datetime64[ns, Asia/Colombo]", "unit": "ISO-8601", "description": "Timestamp of observation in Sri Lanka Standard Time (SLST / UTC+5:30)", "category": "Temporal"},
            {"column_name": "location_id", "data_type": "string", "unit": "ID", "description": "Unique monitoring station identifier (SITE_001 to SITE_004)", "category": "Identifier"},
            {"column_name": "latitude", "data_type": "float64", "unit": "degrees", "description": "WGS84 Latitude coordinate of monitoring station", "category": "Geospatial"},
            {"column_name": "longitude", "data_type": "float64", "unit": "degrees", "description": "WGS84 Longitude coordinate of monitoring station", "category": "Geospatial"},
            {"column_name": "ph", "data_type": "float64", "unit": "pH", "description": "Acidity / Basicity index of water (nominal 6.5 - 8.5)", "category": "Water Quality"},
            {"column_name": "turbidity_ntu", "data_type": "float64", "unit": "NTU", "description": "Nephelometric Turbidity Units representing water clarity and suspended sediment", "category": "Water Quality"},
            {"column_name": "tds_ppm", "data_type": "float64", "unit": "ppm", "description": "Total Dissolved Solids in parts per million (salts, minerals, pollutants)", "category": "Water Quality"},
            {"column_name": "ec_us_cm", "data_type": "float64", "unit": "uS/cm", "description": "Electrical Conductivity representing ionic dissolved concentration", "category": "Water Quality"},
            {"column_name": "water_temp_c", "data_type": "float64", "unit": "Celsius", "description": "Surface water temperature from DS18B20 digital thermometer probe", "category": "Water Quality"},
            {"column_name": "sensor_confidence", "data_type": "float64", "unit": "0.0 - 1.0", "description": "Hardware measurement confidence score (sensor health index)", "category": "Data Quality"},
            {"column_name": "sensor_status", "data_type": "string", "unit": "categorical", "description": "Operational state flag ('OK', 'DEGRADED', 'FAULT')", "category": "Data Quality"},
            {"column_name": "rainfall_mm", "data_type": "float64", "unit": "mm", "description": "Accumulated rainfall recorded during the 15-minute interval", "category": "Meteorology"},
            {"column_name": "precipitation_probability_pct", "data_type": "float64", "unit": "percent", "description": "Rain forecast likelihood from Open-Meteo API", "category": "Meteorology"},
            {"column_name": "weather_temp_c", "data_type": "float64", "unit": "Celsius", "description": "Ambient 2m air temperature", "category": "Meteorology"},
            {"column_name": "weather_humidity_pct", "data_type": "float64", "unit": "percent", "description": "Relative air humidity", "category": "Meteorology"},
            {"column_name": "wind_speed_kmh", "data_type": "float64", "unit": "km/h", "description": "10m wind speed", "category": "Meteorology"},
            {"column_name": "weather_code", "data_type": "int64", "unit": "WMO code", "description": "World Meteorological Organization standard weather code", "category": "Meteorology"},
            {"column_name": "weather_data_type", "data_type": "string", "unit": "categorical", "description": "Provenance flag for weather inputs", "category": "Provenance"},
            {"column_name": "future_contamination_event", "data_type": "int64", "unit": "binary (0/1)", "description": "Target: Whether water contamination event occurs in the next 3 hours", "category": "Target Variable"},
            {"column_name": "future_risk_score", "data_type": "float64", "unit": "0 - 100", "description": "Target: Maximum continuous risk score over the 3-hour lookahead horizon", "category": "Target Variable"},
            {"column_name": "future_risk_category", "data_type": "string", "unit": "LOW/MED/HIGH", "description": "Target: Categorical risk tier based on threshold policy", "category": "Target Variable"}
        ]
        dict_df = pd.DataFrame(dictionary_data)
        dict_path = self.root_dir / "data" / "data_dictionary.csv"
        dict_df.to_csv(dict_path, index=False)
        logger.info(f"Saved comprehensive data dictionary: {dict_path}")

        # 5. Production Sample Inference Input JSON
        sample_input = {
            "metadata": {
                "description": "Illustrative telemetry observation for standalone inference testing",
                "provenance": "sample_input",
                "timestamp": "2026-10-18T10:00:00+05:30",
                "disclaimer": "Sample test observation — not measured pollution."
            },
            "location_id": "SITE_003",
            "latitude": 6.9550,
            "longitude": 79.9240,
            "current_observation": {
                "ph": 5.85,
                "turbidity_ntu": 42.5,
                "tds_ppm": 340.0,
                "ec_us_cm": 655.0,
                "water_temp_c": 28.4,
                "sensor_confidence": 0.95,
                "sensor_status": "OK"
            },
            "weather_observation": {
                "rainfall_mm": 18.5,
                "precipitation_probability_pct": 85.0,
                "weather_temp_c": 27.2,
                "weather_humidity_pct": 92.0,
                "wind_speed_kmh": 16.5,
                "weather_code": 65,
                "weather_data_type": "sample_observed"
            },
            "recent_history_1h": {
                "rainfall_accum_1h_mm": 32.0,
                "rainfall_accum_3h_mm": 48.5,
                "rainfall_accum_6h_mm": 64.0,
                "rainfall_accum_24h_mm": 92.0,
                "rainfall_change_rate": 8.5,
                "turbidity_lag_1h": 22.0,
                "turbidity_change_rate": 20.5,
                "ph_lag_1h": 7.15,
                "ph_change_rate": -1.30,
                "tds_lag_1h": 210.0,
                "tds_change_rate": 130.0,
                "ec_lag_1h": 410.0,
                "ec_change_rate": 245.0,
                "turbidity_avg_3h": 28.5,
                "ph_avg_3h": 6.85,
                "tds_avg_3h": 260.0,
                "ec_avg_3h": 505.0
            }
        }
        sample_path = sample_dir / "sample_input.json"
        with open(sample_path, "w", encoding="utf-8") as f:
            json.dump(sample_input, f, indent=2)
        logger.info(f"Saved canonical inference sample input: {sample_path}")
        
        # Also mirror to inference/sample_input.json for direct inference script access
        inf_sample_path = self.root_dir / "inference" / "sample_input.json"
        with open(inf_sample_path, "w", encoding="utf-8") as f:
            json.dump(sample_input, f, indent=2)
        logger.info(f"Mirrored inference sample: {inf_sample_path}")


def generate_synthetic_dataset(seed: int = 42):
    """Convenience helper to generate and save synthetic dataset."""
    generator = EnvironmentalDataGenerator()
    generator.seed = seed
    full_df, events_df, meta = generator.generate_full_dataset()
    generator.save_dataset_artifacts(full_df, events_df, meta)
    return full_df, events_df


def main():
    """CLI / programmatic generator execution."""
    full_df, events_df = generate_synthetic_dataset()
    print("=" * 70)
    print("Environmental Dataset Creation Completed Successfully!")
    print(f"Total Rows: {len(full_df)} | Total Columns: {full_df.shape[1]}")
    print(f"Contamination Events: {len(events_df)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
