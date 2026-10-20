"""
Dual-Track Environmental and Sensor Anomaly Detection Engine.
Differentiates genuine physical water contamination anomalies from hardware/probe faults
using Isolation Forest and algorithmic diagnostic heuristics.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import IsolationForest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_model_config

logger = logging.getLogger("contamination_risk.anomaly_detection")


class DualTrackAnomalyDetector:
    """
    Simultaneously tracks:
    Track 1: Environmental Anomalies (Unusual multivariate hydro-chemical behavior)
    Track 2: Sensor Health & Telemetry Faults (Hardware failures, stuck readings, erratic spikes)
    """

    DEFAULT_ENV_FEATURES = [
        "ph", "turbidity_ntu", "tds_ppm", "ec_us_cm",
        "turbidity_change_rate", "ph_change_rate"
    ]

    def __init__(self, feature_cols: Optional[List[str]] = None, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_model_config().get("anomaly_detection", {})
        self.feature_cols = feature_cols or self.config.get("features", self.DEFAULT_ENV_FEATURES)
        self.contamination = self.config.get("contamination", 0.035)
        self.iso_forest = IsolationForest(
            n_estimators=self.config.get("n_estimators", 150),
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1
        )
        self.is_fitted = False
        self.threshold = 0.0
        self.root_dir = get_project_root()
        self.models_dir = self.root_dir / "models" / "anomaly_detection"
        self.reports_dir = self.root_dir / "outputs" / "anomaly_reports"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)

    def fit(self, X_train: pd.DataFrame) -> "DualTrackAnomalyDetector":
        """Fit Isolation Forest exclusively on normal/training environmental observations."""
        X_mat = X_train[self.feature_cols].values
        logger.info(f"Fitting Isolation Forest on {len(X_mat)} training instances (contamination={self.contamination})...")
        self.iso_forest.fit(X_mat)
        self.is_fitted = True

        # Compute baseline decision threshold on training set
        scores = self.iso_forest.decision_function(X_mat)
        self.threshold = float(np.percentile(scores, self.contamination * 100))
        logger.info(f"Calibrated environmental anomaly decision threshold: {self.threshold:.4f}")
        return self

    def detect_environmental_anomalies(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Track 1: Evaluate multivariate environmental anomaly.
        Returns: (is_anomaly_flag: bool array, anomaly_score: float array where lower = more anomalous)
        """
        if not self.is_fitted:
            raise RuntimeError("Anomaly detector must be fitted before running detection.")
        X_mat = X[self.feature_cols].values
        scores = self.iso_forest.decision_function(X_mat)
        is_anomaly = (scores < self.threshold).astype(int)
        return is_anomaly, scores

    def detect_sensor_faults(self, observation: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Track 2: Rule-based hardware diagnostic check to isolate instrument errors
        from actual environmental contamination.
        """
        faults = []

        # Check physical sensor bounds
        ph = observation.get("ph")
        if ph is not None and (ph < 0.0 or ph > 14.0):
            faults.append(f"pH measurement ({ph}) violates physical 0-14 limits.")

        turbidity = observation.get("turbidity_ntu")
        if turbidity is not None and (turbidity < 0.0 or turbidity > 1000.0):
            faults.append(f"Turbidity ({turbidity} NTU) violates valid instrument limits.")

        tds = observation.get("tds_ppm")
        if tds is not None and (tds < 0.0 or tds > 5000.0):
            faults.append(f"TDS ({tds} ppm) violates valid instrument limits.")

        # Check electrical conductivity correlation: EC should approximate 1.5 - 2.5 * TDS in freshwater
        ec = observation.get("ec_us_cm")
        if ec is not None and tds is not None and tds > 50:
            ratio = ec / max(1.0, tds)
            if ratio < 1.0 or ratio > 3.5:
                faults.append(f"Severe EC/TDS ratio discrepancy ({ratio:.2f}); possible probe fouling or short circuit.")

        # Sensor confidence indicator
        confidence = observation.get("sensor_confidence", 1.0)
        if confidence is not None and confidence < 0.60:
            faults.append(f"Degraded hardware confidence ({confidence:.2f}).")

        # Explicit status flag
        status = str(observation.get("sensor_status", "OK")).upper()
        if status in ["FAULT", "DEGRADED", "ERROR"]:
            faults.append(f"Hardware reports status '{status}'.")

        has_sensor_fault = len(faults) > 0
        return has_sensor_fault, faults

    def save(self) -> Tuple[Path, Path]:
        """Save fitted Isolation Forest and feature metadata."""
        model_path = self.models_dir / "isolation_forest.joblib"
        joblib.dump(self.iso_forest, model_path)

        meta = {
            "method": "IsolationForest",
            "features": self.feature_cols,
            "contamination": self.contamination,
            "calibrated_threshold": self.threshold
        }
        meta_path = self.models_dir / "anomaly_config.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        logger.info(f"Saved anomaly detector model to {model_path}.")
        return model_path, meta_path

    @classmethod
    def load(cls) -> "DualTrackAnomalyDetector":
        """Load fitted anomaly detector from disk."""
        root = get_project_root()
        model_path = root / "models" / "anomaly_detection" / "isolation_forest.joblib"
        meta_path = root / "models" / "anomaly_detection" / "anomaly_config.json"

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        detector = cls(feature_cols=meta["features"])
        detector.iso_forest = joblib.load(model_path)
        detector.threshold = meta["calibrated_threshold"]
        detector.is_fitted = True
        return detector
