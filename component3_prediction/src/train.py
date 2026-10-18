"""Training and persistence for the future-risk prototype."""

from pathlib import Path
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

try:
    from xgboost import XGBClassifier
except ImportError:  # pragma: no cover
    XGBClassifier = None


def chronological_split(df: pd.DataFrame, test_fraction: float = 0.2):
    if not 0 < test_fraction < 1:
        raise ValueError("test_fraction must be between 0 and 1.")
    ordered = df.sort_values("timestamp").reset_index(drop=True)
    cut = max(1, min(len(ordered) - 1, int(len(ordered) * (1 - test_fraction))))
    return ordered.iloc[:cut].copy(), ordered.iloc[cut:].copy()


def train_model(df: pd.DataFrame, feature_columns: list[str],
                target: str = "future_contamination", test_fraction: float = 0.2,
                model_kind: str = "xgboost") -> dict:
    train, test = chronological_split(df.dropna(subset=[target]), test_fraction)
    if train[target].nunique() < 2:
        raise ValueError("Training data must contain both future-risk classes.")
    if model_kind == "xgboost" and XGBClassifier is not None:
        estimator = XGBClassifier(n_estimators=120, max_depth=3, learning_rate=0.05,
                                  subsample=0.9, colsample_bytree=0.9,
                                  eval_metric="logloss", random_state=42)
    else:
        estimator = RandomForestClassifier(n_estimators=150, random_state=42,
                                           class_weight="balanced")
        model_kind = "random_forest_baseline"
    pipeline = Pipeline([("imputer", SimpleImputer(strategy="median")), ("model", estimator)])
    pipeline.fit(train[feature_columns], train[target].astype(int))
    predictions = pipeline.predict(test[feature_columns])
    probabilities = pipeline.predict_proba(test[feature_columns])[:, 1]
    metrics = {"accuracy": accuracy_score(test[target], predictions),
               "precision": precision_score(test[target], predictions, zero_division=0),
               "recall": recall_score(test[target], predictions, zero_division=0),
               "f1": f1_score(test[target], predictions, zero_division=0)}
    if test[target].nunique() == 2:
        metrics["roc_auc"] = roc_auc_score(test[target], probabilities)
    return {"pipeline": pipeline, "feature_columns": feature_columns, "model_kind": model_kind,
            "metrics": metrics, "train_rows": len(train), "test_rows": len(test)}


def save_model(bundle: dict, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)


def load_model(path: str | Path) -> dict:
    return joblib.load(path)
