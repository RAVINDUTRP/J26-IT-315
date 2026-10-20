"""
Component 04: Production Inference Engine.
Executes zero-retraining inference from single-scenario and batch JSON/dict payloads.
Produces predicted priority level, class probability distribution, data-quality warnings,
and local TreeSHAP explainability attributions.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import joblib
import numpy as np
import pandas as pd

from src.component04_ml import get_project_root
from src.component04_ml.data_validation import DataValidator
from src.component04_ml.explainability import DecisionModelExplainer
from src.component04_ml.preprocessing import DecisionDataPreprocessor

logger = logging.getLogger("component04.inference")

INT_TO_LABEL = {0: "P1", 1: "P2", 2: "P3", 3: "P4"}
CLASSES = ["P1", "P2", "P3", "P4"]

PRIORITY_CONTENT_MAP = {
    "P1": {
        "action_level": "EMERGENCY_INTERVENTION",
        "title": "Critical Disaster Response (P1)",
        "recommended_actions": [
            "Trigger immediate intake cutoff at municipal drinking water treatment facilities.",
            "Dispatch emergency incident response and rapid field water sampling teams.",
            "Issue high-priority public health alerts and activate alternative water supply bowsers.",
            "Switch telemetry sampling boat to continuous real-time transmission mode."
        ],
        "response_time_target": "< 15 minutes",
        "monitoring_frequency": "Continuous / High-rate telemetry (every 1-5 mins)",
        "resource_deployment": "Full Emergency Deployment (Hazmat, Emergency Bowsers, Mobile Lab)"
    },
    "P2": {
        "action_level": "EXPEDITED_ACTION",
        "title": "High Disaster Response (P2)",
        "recommended_actions": [
            "Alert regional water treatment operators to prepare auxiliary filtration and chemical dosing.",
            "Deploy autonomous sampling boat to localize upstream contamination plume origin.",
            "Issue precautionary localized boil-water advisory to downstream agricultural and residential zones.",
            "Request inspection crew standby and check backup water reserve readiness."
        ],
        "response_time_target": "< 1 hour",
        "monitoring_frequency": "Accelerated telemetry (every 10-15 mins)",
        "resource_deployment": "Expedited Inspection Crews & Standby Treatment Units"
    },
    "P3": {
        "action_level": "STANDARD_RESPONSE",
        "title": "Moderate Disaster Response (P3)",
        "recommended_actions": [
            "Schedule targeted manual verification sampling along the affected river reach.",
            "Issue standard environmental advisory to industrial effluent discharge facilities.",
            "Verify sensor calibration and monitor catchment tributary inflows.",
            "Log anomaly event in regional disaster risk management registry."
        ],
        "response_time_target": "< 4 hours",
        "monitoring_frequency": "Standard telemetry (every 30 mins)",
        "resource_deployment": "Routine Field Verification Sampling Crew"
    },
    "P4": {
        "action_level": "ROUTINE_MONITORING",
        "title": "Low Priority Monitoring (P4)",
        "recommended_actions": [
            "Maintain baseline automated riverboat patrol and sensor polling.",
            "No active emergency intervention required under current hydrological parameters.",
            "Archive periodic water quality metrics to long-term catchment database."
        ],
        "response_time_target": "Next scheduled cycle",
        "monitoring_frequency": "Baseline telemetry (every 1-2 hours)",
        "resource_deployment": "Automated Sensor Boat Telemetry Only"
    }
}


def _build_human_reasons(
    scenario_dict: Dict[str, Any],
    predicted_priority: str,
    top_drivers: List[Dict[str, Any]],
    resource_bottleneck: bool,
    comm_degraded: bool,
    stale_telemetry: bool
) -> List[str]:
    reasons = []

    # 1. Contamination hazard reasoning
    p_c = scenario_dict.get("contamination_probability")
    if p_c is not None and not pd.isna(p_c):
        try:
            p_val = float(p_c)
            if p_val >= 0.70:
                reasons.append(f"Severe upstream contamination hazard detected with probability of {p_val * 100:.1f}%.")
            elif p_val >= 0.40:
                reasons.append(f"Moderate contamination hazard detected with probability of {p_val * 100:.1f}%.")
            else:
                reasons.append(f"Baseline contamination probability is low at {p_val * 100:.1f}%.")
        except (ValueError, TypeError):
            pass

    # 2. Infrastructure criticality reasoning
    infra = scenario_dict.get("infrastructure_importance")
    if infra == "CRITICAL":
        reasons.append("Critical municipal drinking water intake or major facility directly threatened in affected zone.")
    elif infra == "MAJOR":
        reasons.append("Major commercial or municipal water supply facility located in affected river reach.")

    # 3. Population exposure reasoning
    pop = scenario_dict.get("estimated_exposed_population")
    if pop is not None and not pd.isna(pop):
        try:
            pop_val = float(pop)
            if pop_val >= 25000:
                reasons.append(f"High population exposure with estimated {int(pop_val):,} residents dependent on reach.")
            elif pop_val >= 5000:
                reasons.append(f"Moderate population exposure with estimated {int(pop_val):,} residents.")
        except (ValueError, TypeError):
            pass

    # 4. Telemetry health & communication
    if comm_degraded:
        delay = scenario_dict.get("communication_delay_seconds", 0)
        reasons.append(f"Communication telemetry degraded/offline ({float(delay):.0f}s delay), applying uncertainty escalation.")
    if stale_telemetry:
        freshness = scenario_dict.get("sensor_data_freshness_seconds", 0)
        reasons.append(f"Sensor data is stale ({float(freshness) / 60.0:.1f} mins old), warranting precautionary caution.")

    # 5. Resource constraints
    if resource_bottleneck:
        reasons.append("Severe resource bottleneck: emergency response teams or alternative water supplies are depleted.")

    # 6. Top SHAP attribution insight
    if top_drivers:
        top_feat = top_drivers[0]
        feat_name = str(top_feat.get("feature", "")).replace("_", " ").title()
        impact = top_feat.get("impact", "")
        if impact == "INCREASES_PRIORITY":
            reasons.append(f"AI Explainability (TreeSHAP): '{feat_name}' is the leading driver escalating response priority.")

    return reasons


class DecisionInferenceEngine:
    """
    Loads saved model, preprocessor, and explainer to generate deterministic,
    explainable priority predictions from incoming disaster context payloads.
    """

    def __init__(self, models_dir: Optional[Path] = None):
        self.root_dir = get_project_root()
        self.models_dir = models_dir or (self.root_dir / "models")
        self.validator = DataValidator()

        # 1. Load Preprocessor
        preproc_path = self.models_dir / "preprocessor.joblib"
        if not preproc_path.exists():
            raise FileNotFoundError(f"Preprocessor artifact not found at {preproc_path}. Run training first.")
        self.preprocessor = DecisionDataPreprocessor.load(preproc_path)
        self.feature_names = self.preprocessor.fitted_feature_names

        # 2. Load Selected Model
        model_path = self.models_dir / "selected_model.joblib"
        if not model_path.exists():
            # Fallback to xgboost or random forest
            model_path = self.models_dir / "xgboost_model.joblib"
            if not model_path.exists():
                model_path = self.models_dir / "random_forest_model.joblib"
            if not model_path.exists():
                raise FileNotFoundError(f"No trained model artifact found in {self.models_dir}.")

        self.model = joblib.load(model_path)
        self.model_name = type(self.model).__name__

        # 3. Load Explainer
        try:
            self.explainer = DecisionModelExplainer(self.model, self.feature_names)
        except Exception as e:
            logger.warning(f"Could not initialize explainer in inference: {e}")
            self.explainer = None

    def predict_scenario(self, scenario_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes prediction on a single scenario dictionary.
        Returns a structured, JSON-compatible priority assessment.
        """
        # Validate input features
        is_valid, warnings = self.validator.validate_inference_payload(scenario_dict)
        if not is_valid:
            raise ValueError(f"Invalid input payload: {'; '.join(warnings)}")

        # Convert dictionary to single-row DataFrame
        df_row = pd.DataFrame([scenario_dict])

        # Fill default missing required numerical features gracefully with domain defaults
        if "contamination_probability" not in df_row.columns and "contamination_prob" in df_row.columns:
            df_row["contamination_probability"] = df_row["contamination_prob"]

        # Preprocess features
        X_scaled = self.preprocessor.transform(df_row)

        # Model Prediction
        pred_idx = int(self.model.predict(X_scaled)[0])
        predicted_priority = INT_TO_LABEL.get(pred_idx, "P3")

        # Class Probabilities
        probabilities = {}
        if hasattr(self.model, "predict_proba"):
            probs = self.model.predict_proba(X_scaled)[0]
            for i, p in enumerate(probs):
                lbl = INT_TO_LABEL.get(i, f"P{i+1}")
                probabilities[lbl] = round(float(p), 4)

        # Operational Resource Bottleneck Flag
        def _to_float(v, default=0.0):
            if v is None or pd.isna(v):
                return default
            try:
                return float(v)
            except (ValueError, TypeError):
                return default

        def _to_int(v, default=1):
            if v is None or pd.isna(v):
                return default
            try:
                return int(v)
            except (ValueError, TypeError):
                return default

        p_c = _to_float(scenario_dict.get("contamination_probability"), 0.0)
        alt_w = _to_int(scenario_dict.get("alternative_water_available"), 1)
        insp_t = _to_int(scenario_dict.get("inspection_team_available"), 1)
        treat_r = _to_int(scenario_dict.get("treatment_resource_available"), 1)
        resource_bottleneck = bool((alt_w + insp_t + treat_r) <= 1 and p_c >= 0.50)

        freshness_val = _to_float(scenario_dict.get("sensor_data_freshness_seconds"), 0.0)
        comm_val = scenario_dict.get("communication_status")
        comm_degraded = bool(comm_val != "ONLINE") if (comm_val is not None and not pd.isna(comm_val)) else False

        # Local SHAP Explanation
        top_drivers = []
        if self.explainer is not None:
            try:
                top_drivers = self.explainer.explain_instance(
                    x_scaled=X_scaled[0],
                    raw_feature_dict=scenario_dict,
                    target_class_idx=pred_idx,
                    top_k=5
                )
            except Exception as e:
                warnings.append(f"SHAP explanation generation error: {e}")

        # Generate human-readable operational reasons
        reasons = _build_human_reasons(
            scenario_dict=scenario_dict,
            predicted_priority=predicted_priority,
            top_drivers=top_drivers,
            resource_bottleneck=resource_bottleneck,
            comm_degraded=comm_degraded,
            stale_telemetry=bool(freshness_val > 1800.0)
        )

        # Assemble JSON-compatible output response
        response = {
            "scenario_id": str(scenario_dict.get("scenario_id", "SCEN_ONLINE")),
            "predicted_priority": predicted_priority,
            "priority_description": {
                "P1": "Critical — Immediate Emergency Response Required",
                "P2": "High — Expedited Action Required",
                "P3": "Moderate — Standard Field Sampling & Advisory",
                "P4": "Low — Routine Monitoring"
            }.get(predicted_priority, "Unknown"),
            "reasons": reasons,
            "priority_content": PRIORITY_CONTENT_MAP.get(predicted_priority, {}),
            "class_probabilities": probabilities,
            "operational_flags": {
                "resource_bottleneck": resource_bottleneck,
                "stale_telemetry": bool(freshness_val > 1800.0),
                "communication_degraded": comm_degraded
            },
            "top_priority_drivers": top_drivers,
            "data_quality_warnings": warnings,
            "model_metadata": {
                "model_architecture": self.model_name,
                "n_features_evaluated": len(self.feature_names)
            }
        }

        return response

    def predict_batch(self, scenarios_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Executes prediction on a batch of scenarios.
        """
        results = []
        for _, row in scenarios_df.iterrows():
            d = row.to_dict()
            res = self.predict_scenario(d)
            results.append(res)
        return results


def run_single_inference(input_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Helper entry point for single scenario prediction."""
    engine = DecisionInferenceEngine()
    return engine.predict_scenario(input_dict)


def run_batch_inference(input_csv_path: Union[str, Path], output_json_path: Optional[Union[str, Path]] = None) -> List[Dict[str, Any]]:
    """Helper entry point for batch scenario prediction from CSV."""
    engine = DecisionInferenceEngine()
    df = pd.read_csv(input_csv_path)
    results = engine.predict_batch(df)

    if output_json_path:
        out_path = Path(output_json_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

    return results
