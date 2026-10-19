"""
Component 04: Model Evaluation & Comparison Module.
Computes multi-class classification metrics across Rule-Based Baseline,
Random Forest, and XGBoost on held-out test scenarios. Generates
confusion matrices, per-class performance breakdowns, and comparison reports.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix
)

from src.component04_ml import get_project_root
from src.component04_ml.preprocessing import DecisionDataPreprocessor
from src.component04_ml.rule_baseline import RuleBasedPrioritizer

logger = logging.getLogger("component04.evaluation")

CLASSES = ["P1", "P2", "P3", "P4"]
INT_TO_LABEL = {0: "P1", 1: "P2", 2: "P3", 3: "P4"}


def evaluate_all_models(
    test_df: Optional[pd.DataFrame] = None,
    preprocessor: Optional[DecisionDataPreprocessor] = None,
    rf_model: Optional[Any] = None,
    xgb_model: Optional[Any] = None,
    rule_prioritizer: Optional[RuleBasedPrioritizer] = None,
    artifacts_dir: Optional[Path] = None,
    test_data_path: Optional[Union[str, Path]] = None,
    models_dir: Optional[Union[str, Path]] = None,
    output_dir: Optional[Union[str, Path]] = None
) -> Dict[str, Any]:
    """
    Evaluates rule baseline, Random Forest, and XGBoost on test_df.
    Saves metrics and plots to artifacts directory.
    Supports direct DataFrame/model inputs or automatic loading from paths.
    """
    root_dir = get_project_root()
    if artifacts_dir is None and output_dir is not None:
        artifacts_dir = Path(output_dir)
    artifacts_dir = artifacts_dir or (root_dir / "artifacts")
    fig_dir = artifacts_dir / "figures"
    metrics_dir = artifacts_dir / "metrics"
    fig_dir.mkdir(parents=True, exist_ok=True)
    metrics_dir.mkdir(parents=True, exist_ok=True)

    if models_dir is None:
        models_dir = root_dir / "models"
    else:
        models_dir = Path(models_dir)

    if test_df is None:
        if test_data_path is not None:
            test_df = pd.read_csv(test_data_path)
        else:
            test_path = root_dir / "data" / "processed" / "test_scenarios.csv"
            test_df = pd.read_csv(test_path)

    if preprocessor is None:
        preprocessor = DecisionDataPreprocessor.load(models_dir / "preprocessor.joblib")
    if rf_model is None:
        rf_model = joblib.load(models_dir / "random_forest_model.joblib")
    if xgb_model is None:
        xgb_model = joblib.load(models_dir / "xgboost_model.joblib")

    y_test_raw = test_df["priority_level"].values
    rule_prioritizer = rule_prioritizer or RuleBasedPrioritizer()

    # 1. Predictions
    # A. Rule Baseline
    y_pred_rule = rule_prioritizer.predict(test_df)

    # B. ML Models (Transform via train-fitted preprocessor)
    X_test_scaled = preprocessor.transform(test_df)
    
    y_pred_rf_int = rf_model.predict(X_test_scaled)
    y_pred_rf = [INT_TO_LABEL[i] for i in y_pred_rf_int]

    y_pred_xgb_int = xgb_model.predict(X_test_scaled)
    y_pred_xgb = [INT_TO_LABEL[i] for i in y_pred_xgb_int]

    candidate_predictions = {
        "Rule-Based Baseline": y_pred_rule,
        "Random Forest Classifier": y_pred_rf,
        "XGBoost Classifier": y_pred_xgb
    }

    # 2. Compute Metrics
    summary_rows = []
    detailed_reports = {}

    for name, preds in candidate_predictions.items():
        acc = accuracy_score(y_test_raw, preds)
        prec_macro = precision_score(y_test_raw, preds, average="macro", zero_division=0)
        rec_macro = recall_score(y_test_raw, preds, average="macro", zero_division=0)
        f1_macro = f1_score(y_test_raw, preds, average="macro", zero_division=0)
        f1_weighted = f1_score(y_test_raw, preds, average="weighted", zero_division=0)
        
        # Critical class P1 Recall (safety metric)
        cm = confusion_matrix(y_test_raw, preds, labels=CLASSES)
        p1_idx = CLASSES.index("P1")
        p1_true_total = cm[p1_idx].sum()
        p1_recall = (cm[p1_idx, p1_idx] / p1_true_total) if p1_true_total > 0 else 0.0

        rep = classification_report(y_test_raw, preds, labels=CLASSES, output_dict=True, zero_division=0)
        detailed_reports[name] = rep

        summary_rows.append({
            "Model": name,
            "Accuracy": round(float(acc), 4),
            "Macro F1": round(float(f1_macro), 4),
            "Weighted F1": round(float(f1_weighted), 4),
            "Macro Precision": round(float(prec_macro), 4),
            "Macro Recall": round(float(rec_macro), 4),
            "Critical P1 Recall": round(float(p1_recall), 4)
        })

    summary_df = pd.DataFrame(summary_rows)
    logger.info("\n=== MODEL COMPARISON SUMMARY ===\n" + summary_df.to_string(index=False))

    # Save CSV and JSON metrics
    summary_csv_path = metrics_dir / "model_comparison.csv"
    summary_df.to_csv(summary_csv_path, index=False)

    summary_json_path = metrics_dir / "model_comparison.json"
    with open(summary_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "summary": summary_rows,
            "detailed_reports": detailed_reports
        }, f, indent=2)

    # 3. Generate Visual Plots
    # A. Confusion Matrices Plot
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    for ax, (name, preds) in zip(axes, candidate_predictions.items()):
        cm = confusion_matrix(y_test_raw, preds, labels=CLASSES)
        cm_norm = cm.astype("float") / cm.sum(axis=1)[:, np.newaxis]
        sns.heatmap(
            cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=CLASSES, yticklabels=CLASSES, ax=ax,
            cbar=False
        )
        ax.set_title(f"{name}\n(Acc: {accuracy_score(y_test_raw, preds):.3f}, P1-Rec: {cm[0,0]/cm[0].sum():.3f})")
        ax.set_xlabel("Predicted Priority")
        ax.set_ylabel("True Priority")
    plt.tight_layout()
    cm_path = fig_dir / "confusion_matrices.png"
    plt.savefig(cm_path, dpi=200)
    plt.close()

    # B. Per-Class F1 Score Comparison
    fig, ax = plt.subplots(figsize=(10, 5))
    plot_data = []
    for name, rep in detailed_reports.items():
        for cls_name in CLASSES:
            plot_data.append({
                "Model": name,
                "Class": cls_name,
                "F1-Score": rep.get(cls_name, {}).get("f1-score", 0.0)
            })
    df_plot = pd.DataFrame(plot_data)
    sns.barplot(data=df_plot, x="Class", y="F1-Score", hue="Model", palette="Set2", ax=ax)
    ax.set_title("Per-Class F1-Score Across Candidate Models (P1=Critical ... P4=Low)")
    ax.set_ylim(0.0, 1.05)
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    plt.tight_layout()
    f1_path = fig_dir / "per_class_f1_comparison.png"
    plt.savefig(f1_path, dpi=200)
    plt.close()

    logger.info(f"Saved evaluation figures to {fig_dir}")
    return {
        "summary_df": summary_df,
        "detailed_reports": detailed_reports,
        "cm_path": cm_path,
        "f1_path": f1_path
    }
