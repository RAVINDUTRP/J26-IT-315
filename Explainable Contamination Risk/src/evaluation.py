"""
Model Evaluation and Multi-Architecture Comparison Suite.
Computes comprehensive validation benchmarks, generates publication-quality plots,
and exports comparative metrics in structured CSV and JSON formats.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import roc_curve, precision_recall_curve, confusion_matrix

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root

logger = logging.getLogger("contamination_risk.evaluation")


class ModelEvaluationSuite:
    """
    Standardized benchmarking and evaluation visualization suite for all models.
    """

    def __init__(self):
        self.root_dir = get_project_root()
        self.metrics_dir = self.root_dir / "outputs" / "metrics"
        self.plots_dir = self.root_dir / "plots" / "evaluation"
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        self.plots_dir.mkdir(parents=True, exist_ok=True)

    def plot_confusion_matrices(
        self, y_true: np.ndarray, model_preds: Dict[str, np.ndarray], filename: str = "confusion_matrices.png"
    ) -> Path:
        """Plot comparative side-by-side confusion matrices."""
        n_models = len(model_preds)
        fig, axes = plt.subplots(1, n_models, figsize=(5 * n_models, 4.5), dpi=150)
        if n_models == 1:
            axes = [axes]

        for ax, (name, y_pred) in zip(axes, model_preds.items()):
            cm = confusion_matrix(y_true, y_pred)
            sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax,
                        xticklabels=["Clean (0)", "Contaminated (1)"],
                        yticklabels=["Clean (0)", "Contaminated (1)"])
            ax.set_title(f"{name}\nConfusion Matrix", fontsize=11, fontweight="bold")
            ax.set_xlabel("Predicted Label")
            ax.set_ylabel("True Label")

        plt.tight_layout()
        out_path = self.plots_dir / filename
        plt.savefig(out_path, bbox_inches="tight")
        plt.close()
        logger.info(f"Saved confusion matrix comparison to {out_path}.")
        return out_path

    def plot_roc_pr_curves(
        self, y_true: np.ndarray, model_probs: Dict[str, np.ndarray], filename: str = "roc_pr_curves.png"
    ) -> Path:
        """Plot simultaneous ROC and Precision-Recall Curves for all candidate models."""
        fig, (ax_roc, ax_pr) = plt.subplots(1, 2, figsize=(13, 5.5), dpi=150)

        for name, prob in model_probs.items():
            fpr, tpr, _ = roc_curve(y_true, prob)
            from sklearn.metrics import roc_auc_score, average_precision_score
            auc_val = roc_auc_score(y_true, prob)
            ax_roc.plot(fpr, tpr, label=f"{name} (AUC={auc_val:.3f})", lw=2)

            prec, rec, _ = precision_recall_curve(y_true, prob)
            pr_auc = average_precision_score(y_true, prob)
            ax_pr.plot(rec, prec, label=f"{name} (PR-AUC={pr_auc:.3f})", lw=2)

        ax_roc.plot([0, 1], [0, 1], "k--", alpha=0.5, label="Random Guess")
        ax_roc.set_title("Receiver Operating Characteristic (ROC)", fontsize=12, fontweight="bold")
        ax_roc.set_xlabel("False Positive Rate (Fallout)")
        ax_roc.set_ylabel("True Positive Rate (Recall)")
        ax_roc.grid(True, alpha=0.3)
        ax_roc.legend(loc="lower right", fontsize=9)

        pos_rate = float(np.mean(y_true))
        ax_pr.axhline(pos_rate, color="k", linestyle="--", alpha=0.5, label=f"Baseline ({pos_rate:.1%})")
        ax_pr.set_title("Precision-Recall (PR) Curve", fontsize=12, fontweight="bold")
        ax_pr.set_xlabel("Recall")
        ax_pr.set_ylabel("Precision")
        ax_pr.grid(True, alpha=0.3)
        ax_pr.legend(loc="lower left", fontsize=9)

        plt.tight_layout()
        out_path = self.plots_dir / filename
        plt.savefig(out_path, bbox_inches="tight")
        plt.close()
        logger.info(f"Saved ROC/PR curves to {out_path}.")
        return out_path

    def plot_metric_bar_comparison(
        self, metrics_df: pd.DataFrame, filename: str = "model_metric_comparison.png"
    ) -> Path:
        """Bar plot comparing F1, Recall, Precision, and ROC-AUC across models."""
        df_melted = pd.melt(
            metrics_df,
            id_vars=["model_name"],
            value_vars=["f1_score", "recall", "precision", "roc_auc", "pr_auc"],
            var_name="metric",
            value_name="score"
        )

        fig, ax = plt.subplots(figsize=(11, 5.5), dpi=150)
        sns.barplot(data=df_melted, x="model_name", y="score", hue="metric", palette="viridis", ax=ax)
        ax.set_title("Cross-Architecture Performance Benchmark (Untouched Test Partition)", fontsize=12, fontweight="bold")
        ax.set_ylabel("Score (0.0 - 1.0)")
        ax.set_xlabel("Model Architecture")
        ax.set_ylim(0, 1.05)
        ax.grid(axis="y", alpha=0.3)
        ax.legend(title="Metric", loc="lower right")

        plt.tight_layout()
        out_path = self.plots_dir / filename
        plt.savefig(out_path, bbox_inches="tight")
        plt.close()
        logger.info(f"Saved metric bar comparison to {out_path}.")
        return out_path

    def save_comparison_table(
        self, comparison_rows: List[Dict[str, Any]], base_filename: str = "model_comparison"
    ) -> Tuple[Path, Path]:
        """Save benchmark comparison in both CSV and JSON formats."""
        df = pd.DataFrame(comparison_rows)
        csv_path = self.metrics_dir / f"{base_filename}.csv"
        df.to_csv(csv_path, index=False)

        json_path = self.metrics_dir / f"{base_filename}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(comparison_rows, f, indent=2)

        logger.info(f"Saved evaluation metrics to {csv_path} and {json_path}.")
        return csv_path, json_path
