"""
Explainable AI (XAI) Engine using SHAP and LIME.
Computes global feature attributions, local prediction explanations,
feature dependence interactions, and exports structured explanation payloads.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
import joblib

import matplotlib
matplotlib.use("Agg")  # Headless backend for reliable server/batch execution
import matplotlib.pyplot as plt

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root

logger = logging.getLogger("contamination_risk.explainability")


class ModelExplainer:
    """
    Computes rigorous Shapley values and local feature contributions for the
    contamination risk prediction model.
    """

    def __init__(self, model: Any, feature_names: List[str]):
        self.model = model
        self.feature_names = feature_names
        self.explainer = None
        self.root_dir = get_project_root()
        self.plots_dir = self.root_dir / "plots" / "explainability"
        self.expl_dir = self.root_dir / "outputs" / "explanations"
        self.plots_dir.mkdir(parents=True, exist_ok=True)
        self.expl_dir.mkdir(parents=True, exist_ok=True)

        self._init_shap_explainer()

    def _init_shap_explainer(self) -> None:
        """Initialize SHAP TreeExplainer or fallback explainer."""
        try:
            import shap
            logger.info("Initializing SHAP TreeExplainer...")
            self.explainer = shap.TreeExplainer(self.model)
        except Exception as e:
            logger.warning(f"Could not initialize TreeExplainer directly ({e}). Attempting generic Explainer...")
            try:
                import shap
                self.explainer = shap.Explainer(self.model)
            except Exception as e2:
                logger.error(f"SHAP explainer initialization failed: {e2}")
                self.explainer = None

    def compute_shap_values(self, X: np.ndarray) -> np.ndarray:
        """Compute SHAP values matrix for input instances."""
        if self.explainer is None:
            raise RuntimeError("SHAP explainer is not available.")
        shap_vals = self.explainer.shap_values(X)
        if isinstance(shap_vals, list):
            # Binary classification list [class 0, class 1]
            return shap_vals[1]
        return shap_vals

    def explain_instance(
        self, instance_features: np.ndarray, feature_values: Dict[str, Any], top_k: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Produce a ranked, interpretable breakdown of the top positive and negative
        feature drivers for a single inference prediction.
        """
        if self.explainer is None:
            return []

        X_row = instance_features.reshape(1, -1)
        shap_row = self.compute_shap_values(X_row)[0]

        contributions = []
        for name, shap_val, feat_idx in zip(self.feature_names, shap_row, range(len(self.feature_names))):
            raw_val = feature_values.get(name, float(X_row[0, feat_idx]))
            contributions.append({
                "feature": name,
                "value": round(float(raw_val), 3) if isinstance(raw_val, (int, float, np.number)) else str(raw_val),
                "shap_value": round(float(shap_val), 4),
                "impact": "INCREASES_RISK" if shap_val > 0 else "DECREASES_RISK",
                "magnitude": round(float(abs(shap_val)), 4)
            })

        # Sort by absolute magnitude
        contributions.sort(key=lambda x: x["magnitude"], reverse=True)
        return contributions[:top_k]

    def generate_summary_plot(self, X_sample: np.ndarray, filename: str = "shap_summary_plot.png") -> Path:
        """Generate and save global SHAP summary beeswarm/bar plot."""
        import shap
        shap_vals = self.compute_shap_values(X_sample)

        fig, ax = plt.subplots(figsize=(10, 7), dpi=150)
        shap.summary_plot(
            shap_vals,
            features=X_sample,
            feature_names=self.feature_names,
            show=False,
            max_display=12
        )
        plt.title("SHAP Global Feature Attributions — Water Contamination Risk", fontsize=13, pad=15)
        plt.tight_layout()

        out_path = self.plots_dir / filename
        plt.savefig(out_path, bbox_inches="tight")
        plt.close()
        logger.info(f"Saved SHAP summary plot to {out_path}.")
        return out_path

    def explain_with_lime(
        self, X_train: np.ndarray, instance: np.ndarray, num_features: int = 6
    ) -> Optional[List[Tuple[str, float]]]:
        """Optional LIME explanation for local surrogate verification."""
        try:
            import lime
            import lime.lime_tabular

            explainer_lime = lime.lime_tabular.LimeTabularExplainer(
                training_data=X_train,
                feature_names=self.feature_names,
                class_names=["No Contamination", "Contamination Event"],
                mode="classification",
                random_state=42
            )
            exp = explainer_lime.explain_instance(
                data_row=instance,
                predict_fn=self.model.predict_proba,
                num_features=num_features
            )
            return exp.as_list()
        except Exception as e:
            logger.info(f"LIME explanation skipped or unavailable: {e}")
            return None
