"""SHAP explanations for tree-based future-risk models."""

import numpy as np
import pandas as pd


def explain_prediction(model, features: pd.DataFrame, row: pd.DataFrame) -> pd.DataFrame:
    """Return local feature contributions, largest absolute contribution first."""
    try:
        import shap
    except ImportError as exc:
        raise RuntimeError("SHAP is required for explanations. Install requirements.txt.") from exc
    if len(row) != 1:
        raise ValueError("A local explanation requires exactly one prediction row.")
    explainer = shap.TreeExplainer(model)
    values = np.asarray(explainer.shap_values(row))
    if isinstance(explainer.shap_values(row), list):
        values = np.asarray(explainer.shap_values(row)[-1])
    if values.ndim == 3:
        values = values[0, :, -1]
    elif values.ndim == 2:
        values = values[0]
    return pd.DataFrame({
        "feature": features.columns,
        "contribution": values.astype(float),
        "value": row.iloc[0].values,
    }).sort_values("contribution", key=lambda s: s.abs(), ascending=False)
