"""
Production Inference Engine.
Loads saved preprocessing, hybrid/tree model, anomaly detection, and XAI artifacts
to generate zero-retraining contamination risk predictions from JSON telemetry.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
import joblib

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_project_config, score_to_category
from src.preprocessing import EnvironmentalPreprocessor
from src.anomaly_detection import DualTrackAnomalyDetector
from src.explainability import ModelExplainer

logger = logging.getLogger("contamination_risk.inference")


def compute_water_quality_index(observation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes Canadian Council of Ministers of the Environment (CCME) & NSF
    weighted arithmetic Water Quality Index (WQI) for the CURRENT sensor reading.
    Returns WQI score (0-100), qualitative grade, contamination status, and sub-indices.
    """
    ph = float(observation.get("ph", 7.0))
    turb = float(observation.get("turbidity_ntu", 10.0))
    tds = float(observation.get("tds_ppm", 150.0))
    ec = float(observation.get("ec_us_cm", 300.0))
    temp = float(observation.get("water_temp_c", 27.0))

    # Sub-indices q_i (0 to 100 where 100 is pristine)
    dev_ph = abs(ph - 7.0)
    q_ph = max(0.0, 100.0 - (dev_ph * 35.0))
    q_turb = max(0.0, 100.0 * np.exp(-0.025 * max(0.0, turb)))
    q_tds = max(0.0, 100.0 * np.exp(-0.0018 * max(0.0, tds)))
    q_ec = max(0.0, 100.0 * np.exp(-0.0012 * max(0.0, ec)))
    dev_temp = max(0.0, abs(temp - 26.5) - 1.5)
    q_temp = max(0.0, 100.0 - (dev_temp * 10.0))

    sub_indices = {
        "ph": round(float(q_ph), 1),
        "turbidity_ntu": round(float(q_turb), 1),
        "tds_ppm": round(float(q_tds), 1),
        "ec_us_cm": round(float(q_ec), 1),
        "water_temp_c": round(float(q_temp), 1)
    }

    # Weighted aggregation
    wqi = (
        0.25 * q_ph +
        0.25 * q_turb +
        0.20 * q_tds +
        0.20 * q_ec +
        0.10 * q_temp
    )
    wqi = float(np.clip(wqi, 0.0, 100.0))

    if wqi >= 90.0:
        status = "EXCELLENT"
    elif wqi >= 70.0:
        status = "GOOD"
    elif wqi >= 50.0:
        status = "FAIR"
    elif wqi >= 25.0:
        status = "POOR"
    else:
        status = "VERY_POOR"

    limiting_param = min(sub_indices, key=sub_indices.get)
    is_contaminated = bool(
        wqi < 50.0 or
        ph < 6.0 or ph > 9.0 or
        turb > 50.0 or
        tds > 600.0 or
        ec > 1200.0
    )

    return {
        "wqi_score": round(wqi, 1),
        "status": status,
        "contamination_detected": is_contaminated,
        "key_limiting_parameter": limiting_param,
        "sub_indices": sub_indices
    }


class ContaminationRiskInferenceEngine:
    """
    Loads saved model artifacts from disk and executes end-to-end inference
    for incoming LoRa boat telemetry or real-time station JSON payloads.
    Provides dual assessment: Current Water Quality Index + Future 3h Contamination Risk.
    """

    def __init__(self, root_dir: Optional[Path] = None):
        self.root_dir = root_dir or get_project_root()
        self.config = load_project_config()

        # Load Schema
        schema_path = self.root_dir / "models" / "metadata" / "feature_schema.json"
        if not schema_path.exists():
            raise FileNotFoundError(f"Feature schema not found at {schema_path}. Run training pipeline first.")
        with open(schema_path, "r", encoding="utf-8") as f:
            self.schema = json.load(f)
        self.feature_names = self.schema["feature_names"]

        # Load Preprocessor
        preproc_path = self.root_dir / "models" / "preprocessing" / "preprocessor.joblib"
        self.preprocessor = EnvironmentalPreprocessor.load(preproc_path)

        # Load Primary Production Model
        hybrid_path = self.root_dir / "models" / "hybrid" / "selected_hybrid_model.joblib"
        xgb_path = self.root_dir / "models" / "xgboost" / "xgboost_model.joblib"

        if hybrid_path.exists():
            logger.info("Loading Selected Hybrid Ensemble for inference...")
            self.model = joblib.load(hybrid_path)
            self.model_name = "selected_hybrid_ensemble"
        elif xgb_path.exists():
            logger.info("Loading XGBoost Classifier for inference...")
            self.model = joblib.load(xgb_path)
            self.model_name = "xgboost_classifier"
        else:
            raise FileNotFoundError("No trained model artifact found in models/hybrid/ or models/xgboost/.")

        # Load Anomaly Detector
        try:
            self.anomaly_detector = DualTrackAnomalyDetector.load()
        except Exception as e:
            logger.warning(f"Could not load anomaly detector: {e}. Anomaly tracking disabled.")
            self.anomaly_detector = None

        # Load Explainer (Using XGBoost underlying estimator if ensemble)
        try:
            base_estimator = self.model
            if hasattr(self.model, "base_models") and "xgboost" in self.model.base_models:
                base_estimator = self.model.base_models["xgboost"]
            elif hasattr(self.model, "xgb_model"):
                base_estimator = self.model.xgb_model
            self.explainer = ModelExplainer(base_estimator, self.feature_names)
        except Exception as e:
            logger.warning(f"Could not initialize model explainer: {e}")
            self.explainer = None

    def _extract_feature_vector(self, input_payload: Dict[str, Any]) -> Tuple[pd.DataFrame, List[str]]:
        """
        Extract and align incoming telemetry JSON into the canonical model feature schema.
        Handles flat dictionaries as well as nested telemetry payloads.
        """
        warnings = []
        raw_feat_dict = {}

        cur = input_payload.get("current_observation", {})
        weather = input_payload.get("weather_observation", {})
        history = input_payload.get("recent_history_1h", {})

        # Merge nested sections into single flattened namespace
        merged = {}
        merged.update(cur)
        merged.update(weather)
        merged.update(history)

        # Also support top-level flat fields
        for k, v in input_payload.items():
            if k not in ["current_observation", "weather_observation", "recent_history_1h", "metadata"]:
                merged[k] = v

        # Temporal feature derivation from timestamp
        ts_str = input_payload.get("metadata", {}).get("timestamp", input_payload.get("timestamp", None))
        if ts_str:
            try:
                dt = pd.to_datetime(ts_str)
                hr = dt.hour
                dow = dt.dayofweek
                mo = dt.month
                merged.setdefault("hour", hr)
                merged.setdefault("day_of_week", dow)
                merged.setdefault("month", mo)
                merged.setdefault("is_weekend", 1.0 if dow in [5, 6] else 0.0)
                merged.setdefault("hour_sin", np.sin(2 * np.pi * hr / 24.0))
                merged.setdefault("hour_cos", np.cos(2 * np.pi * hr / 24.0))
                merged.setdefault("month_sin", np.sin(2 * np.pi * mo / 12.0))
                merged.setdefault("month_cos", np.cos(2 * np.pi * mo / 12.0))
                merged.setdefault("is_monsoon", 1.0 if mo in [5, 6, 7, 8, 9, 12, 1, 2] else 0.0)
            except Exception:
                pass

        # Rain alias mapping
        for h in [1, 3, 6, 24]:
            if f"rain_{h}h_mm" not in merged and f"rainfall_accum_{h}h_mm" in merged:
                merged[f"rain_{h}h_mm"] = merged[f"rainfall_accum_{h}h_mm"]

        # Construct single-row DataFrame matching trained feature names
        for col in self.feature_names:
            if col in merged:
                raw_feat_dict[col] = float(merged[col])
            else:
                # Derive missing cyclical or fallback values where determinable
                if col == "is_monsoon":
                    raw_feat_dict[col] = float(merged.get("is_monsoon", 0))
                elif col in ["hour_sin", "hour_cos", "month_sin", "month_cos"]:
                    raw_feat_dict[col] = 0.0
                elif col == "rainfall_intensity":
                    raw_feat_dict[col] = float(merged.get("rain_1h_mm", merged.get("rainfall_mm", 0.0)))
                elif col.endswith("_change_rate"):
                    raw_feat_dict[col] = 0.0
                    warnings.append(f"Field '{col}' not supplied; defaulted to 0.0.")
                elif "avg_" in col or "lag_" in col:
                    base_key = col.split("_")[0]
                    fallback_val = float(merged.get(base_key, merged.get(f"{base_key}_ppm", merged.get(f"{base_key}_ntu", 0.0))))
                    raw_feat_dict[col] = fallback_val
                    warnings.append(f"Historical feature '{col}' missing; imputed using current value ({fallback_val}).")
                else:
                    raw_feat_dict[col] = 0.0
                    warnings.append(f"Critical feature '{col}' missing in input payload; imputed 0.0.")

        df_row = pd.DataFrame([raw_feat_dict])
        return df_row, warnings

    def predict(self, input_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute prediction, risk calculation, anomaly detection, and SHAP attribution.
        """
        # 0. Current Water Quality Assessment (WQI, Status, Immediate Contamination Check)
        cur_obs = input_payload.get("current_observation", input_payload)
        current_wq = compute_water_quality_index(cur_obs)

        # 1. Feature extraction & alignment
        df_row, warnings = self._extract_feature_vector(input_payload)

        # 2. Check sensor hardware anomalies (Track 2)
        sensor_anomaly, sensor_fault_messages = (False, [])
        if self.anomaly_detector is not None:
            sensor_anomaly, sensor_fault_messages = self.anomaly_detector.detect_sensor_faults(cur_obs)

        # 3. Preprocess features using saved preprocessor
        X_scaled = self.preprocessor.transform(df_row)

        # 4. Model probability prediction
        if hasattr(self.model, "predict_proba"):
            probs = self.model.predict_proba(X_scaled)
            if len(probs.shape) == 2 and probs.shape[1] >= 2:
                prob_positive = float(probs[0, 1])
            else:
                prob_positive = float(probs[0])
        else:
            # Fallback if raw booster
            prob_positive = float(self.model.predict(X_scaled)[0])

        # 5. Continuous Risk Score (0 - 100) and Category Mapping
        risk_score = round(prob_positive * 100.0, 1)
        low_max = self.config.get("risk_thresholds", {}).get("low_max_score", 35.0)
        med_max = self.config.get("risk_thresholds", {}).get("medium_max_score", 70.0)
        risk_category = score_to_category(risk_score, low_max, med_max)

        # 6. Environmental Anomaly Detection (Track 1)
        env_anomaly = False
        anomaly_score = None
        if self.anomaly_detector is not None:
            try:
                is_anom, scores = self.anomaly_detector.detect_environmental_anomalies(df_row)
                env_anomaly = bool(is_anom[0] == 1)
                anomaly_score = round(float(scores[0]), 4)
            except Exception as e:
                warnings.append(f"Environmental anomaly evaluation error: {e}")

        # 7. Local SHAP Attribution
        top_contributors = []
        if self.explainer is not None:
            try:
                feature_vals = df_row.iloc[0].to_dict()
                top_contributors = self.explainer.explain_instance(X_scaled[0], feature_vals, top_k=6)
            except Exception as e:
                warnings.append(f"SHAP explanation failed: {e}")

        # Construct comprehensive, reproducible response payload
        meta = input_payload.get("metadata", {})
        response = {
            "prediction_timestamp": meta.get("timestamp", pd.Timestamp.now().isoformat()),
            "location_id": input_payload.get("location_id", "SITE_001"),
            "latitude": input_payload.get("latitude", 6.9271),
            "longitude": input_payload.get("longitude", 79.8612),

            # === 1. CURRENT WATER QUALITY ASSESSMENT ===
            "current_water_quality": {
                "wqi_score": current_wq["wqi_score"],
                "status": current_wq["status"],
                "contamination_detected": current_wq["contamination_detected"],
                "key_limiting_parameter": current_wq["key_limiting_parameter"],
                "sub_indices": current_wq["sub_indices"]
            },
            "current_wqi_score": current_wq["wqi_score"],
            "current_water_quality_status": current_wq["status"],
            "current_contamination_detected": current_wq["contamination_detected"],

            # === 2. FUTURE 3-HOUR PREDICTION FORECAST ===
            "prediction_horizon_hours": self.config.get("prediction_horizon_hours", 3),
            "future_contamination_probability": round(prob_positive, 4),
            "future_risk_score": risk_score,
            "future_risk_category": risk_category,
            "prediction_confidence": None,  # Explicitly null per specification (no statistical confidence intervals claimed)

            # === 3. DUAL-TRACK ANOMALY DIAGNOSTICS ===
            "anomaly_detected": env_anomaly,
            "environmental_anomaly_score": anomaly_score,
            "sensor_anomaly_detected": sensor_anomaly,
            "sensor_fault_diagnostics": sensor_fault_messages,

            # === 4. EXPLAINABLE AI DRIVERS ===
            "top_contributing_features": top_contributors,
            "model_name": self.model_name,
            "data_provenance": meta.get("provenance", "realtime_telemetry_payload"),
            "input_warnings": warnings
        }
        return response


def run_inference(input_json_path: Path, output_json_path: Optional[Path] = None) -> Dict[str, Any]:
    """Execute inference from a file path and write result to destination."""
    with open(input_json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    engine = ContaminationRiskInferenceEngine()
    result = engine.predict(payload)

    if output_json_path:
        output_json_path = Path(output_json_path)
        output_json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        logger.info(f"Wrote inference output to {output_json_path}.")

    return result
