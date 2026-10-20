"""
Component 04: Explainable AI (XAI) Module using SHAP.
Generates global feature attributions, summary beeswarm plots,
and local instance explanations ranking top priority drivers.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap

from src.component04_ml import get_project_root

logger = logging.getLogger("component04.explainability")

CLASSES = ["P1", "P2", "P3", "P4"]


class DecisionModelExplainer:
    """
    Computes exact TreeSHAP attributions for disaster prioritization models.
    """

    def __init__(self, model: Any, feature_names: List[str]):
        self.model = model
        self.feature_names = feature_names
        self.root_dir = get_project_root()
        self.fig_dir = self.root_dir / "artifacts" / "figures"
        self.expl_dir = self.root_dir / "artifacts" / "explanations"
        self.fig_dir.mkdir(parents=True, exist_ok=True)
        self.expl_dir.mkdir(parents=True, exist_ok=True)

        self.explainer: Optional[shap.TreeExplainer] = None
        self._init_explainer()

    def _init_explainer(self) -> None:
        try:
            logger.info("Initializing SHAP TreeExplainer...")
            self.explainer = shap.TreeExplainer(self.model)
        except Exception as e:
            logger.warning(f"Could not initialize TreeExplainer directly ({e}). Trying generic Explainer...")
            try:
                self.explainer = shap.Explainer(self.model)
            except Exception as e2:
                logger.error(f"Failed to initialize any SHAP explainer: {e2}")
                self.explainer = None

    def generate_summary_plots(
        self,
        X_sample: np.ndarray,
        filename_prefix: str = "shap_summary"
    ) -> Tuple[Path, Path]:
        """
        Generates global SHAP summary beeswarm and bar importance plots.
        """
        if self.explainer is None:
            raise RuntimeError("SHAP explainer is not available.")

        logger.info(f"Computing SHAP values for {len(X_sample)} background samples...")
        shap_values = self.explainer.shap_values(X_sample)

        # Handle multi-class shap output (list of arrays or 3D array)
        # Class 0 corresponds to P1 (Critical)
        if isinstance(shap_values, list):
            vals_for_summary = shap_values[0]  # Focus on P1 Critical attributions
        elif len(shap_values.shape) == 3:
            vals_for_summary = shap_values[:, :, 0]
        else:
            vals_for_summary = shap_values

        # 1. Bar Importance Plot
        fig, ax = plt.subplots(figsize=(10, 6))
        mean_abs_shap = np.abs(vals_for_summary).mean(axis=0)
        idx_sorted = np.argsort(mean_abs_shap)[-15:]  # Top 15 features
        ax.barh(range(len(idx_sorted)), mean_abs_shap[idx_sorted], color="#1f77b4")
        ax.set_yticks(range(len(idx_sorted)))
        ax.set_yticklabels([self.feature_names[i] for i in idx_sorted])
        ax.set_xlabel("Mean |SHAP Value| (Impact on P1 Critical Priority)")
        ax.set_title("Global Feature Importance (TreeSHAP)")
        plt.tight_layout()
        bar_path = self.fig_dir / f"{filename_prefix}_bar.png"
        plt.savefig(bar_path, dpi=200)
        plt.close()

        # 2. Beeswarm Plot
        fig, ax = plt.subplots(figsize=(11, 7))
        df_sample = pd.DataFrame(X_sample, columns=self.feature_names)
        shap.summary_plot(
            vals_for_summary, df_sample,
            show=False, max_display=15
        )
        plt.title("SHAP Global Summary Beeswarm Plot (P1 Critical Attribution)")
        plt.tight_layout()
        beeswarm_path = self.fig_dir / f"{filename_prefix}_plot.png"
        plt.savefig(beeswarm_path, dpi=200)
        plt.close()

        logger.info(f"Saved SHAP summary plots to {bar_path} and {beeswarm_path}")
        return bar_path, beeswarm_path

    def explain_instance(
        self,
        x_scaled: np.ndarray,
        raw_feature_dict: Optional[Dict[str, Any]] = None,
        target_class_idx: int = 0,
        top_k: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Computes local SHAP attributions for a single observation.
        target_class_idx 0 = P1 (Critical), 1 = P2 (High).
        """
        if self.explainer is None:
            return []

        x_2d = x_scaled.reshape(1, -1)
        shap_vals = self.explainer.shap_values(x_2d)

        if isinstance(shap_vals, list):
            instance_shap = shap_vals[target_class_idx][0]
        elif len(shap_vals.shape) == 3:
            instance_shap = shap_vals[0, :, target_class_idx]
        else:
            instance_shap = shap_vals[0]

        top_indices = np.argsort(np.abs(instance_shap))[::-1][:top_k]

        contributors = []
        for idx in top_indices:
            feat_name = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
            s_val = float(instance_shap[idx])
            raw_val = raw_feature_dict.get(feat_name, None) if raw_feature_dict else None

            direction = "INCREASES_PRIORITY" if s_val > 0 else "DECREASES_PRIORITY"

            contributors.append({
                "feature": feat_name,
                "raw_value": raw_val,
                "shap_value": round(s_val, 4),
                "impact": direction,
                "magnitude": round(abs(s_val), 4)
            })

        return contributors
