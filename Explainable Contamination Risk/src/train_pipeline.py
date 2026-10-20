"""
End-to-End Model Training, Ensembling, Anomaly Detection, and Evaluation Pipeline.
Executes chronological training, hyperparameter validation, artifact persistence,
and comparative benchmarking.
"""

import sys
import json
import logging
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, set_random_seeds, load_model_config, load_project_config
from src.preprocessing import ChronologicalSplitter, EnvironmentalPreprocessor
from src.model_training import BaselineModelsTrainer, XGBoostModelTrainer, compute_metrics
from src.hybrid_ensemble import LSTMTemporalClassifier, HybridEnsemble, create_sequences_by_location
from src.anomaly_detection import DualTrackAnomalyDetector
from src.explainability import ModelExplainer
from src.evaluation import ModelEvaluationSuite

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("contamination_risk.train_pipeline")


def run_full_training_pipeline():
    set_random_seeds(42)
    root = get_project_root()
    feat_path = root / "data" / "processed" / "engineered_features.csv"
    schema_path = root / "models" / "metadata" / "feature_schema.json"

    if not feat_path.exists() or not schema_path.exists():
        raise FileNotFoundError("Engineered features or schema not found. Run feature_engineering first.")

    logger.info("Loading engineered features...")
    df = pd.read_csv(feat_path)
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    feature_names = schema["feature_names"]

    # 1. Chronological Partitioning
    splitter = ChronologicalSplitter(test_ratio=0.20, val_ratio=0.15)
    train_df, val_df, test_df = splitter.split(df, time_col="timestamp")

    y_train = train_df["future_contamination_event"].values
    y_val = val_df["future_contamination_event"].values
    y_test = test_df["future_contamination_event"].values

    logger.info(f"Target distribution -> Train: {np.mean(y_train):.2%}, Val: {np.mean(y_val):.2%}, Test: {np.mean(y_test):.2%}")

    # 2. Fit Preprocessor (Train Only)
    preprocessor = EnvironmentalPreprocessor(feature_names=feature_names, scaler_type="standard")
    X_train_scaled = preprocessor.fit_transform(train_df)
    X_val_scaled = preprocessor.transform(val_df)
    X_test_scaled = preprocessor.transform(test_df)
    preprocessor.save()

    # 3. Train Baseline Models
    baseline_trainer = BaselineModelsTrainer()
    # Baseline uses 5 raw features only
    raw_cols = BaselineModelsTrainer.RAW_FEATURES
    raw_indices = [feature_names.index(c) for c in raw_cols if c in feature_names]

    X_train_raw = X_train_scaled[:, raw_indices]
    X_val_raw = X_val_scaled[:, raw_indices]
    X_test_raw = X_test_scaled[:, raw_indices]

    logger.info("Training Logistic Regression baseline...")
    lr_model = baseline_trainer.train_logistic_regression(X_train_raw, y_train)
    baseline_trainer.save_model(lr_model, "logistic_regression.joblib")

    logger.info("Training Random Forest baseline...")
    rf_model = baseline_trainer.train_random_forest(X_train_scaled, y_train)
    baseline_trainer.save_model(rf_model, "random_forest.joblib")

    # 4. Train XGBoost
    xgb_trainer = XGBoostModelTrainer(feature_names=feature_names)
    xgb_model, xgb_meta = xgb_trainer.train(X_train_scaled, y_train, X_val_scaled, y_val)
    xgb_trainer.save_model(xgb_model, xgb_meta)

    # 5. Train LSTM Temporal Sequence Model
    lstm_classifier = None
    prob_lstm_test = None
    prob_lstm_val = None
    try:
        import tensorflow as tf
        logger.info("Training LSTM Temporal Sequence Model...")
        seq_len = 12  # 3 hours at 15-min intervals
        # Create sequences by location for train and val
        seq_features = ["ph", "turbidity_ntu", "tds_ppm", "ec_us_cm", "water_temp_c", "rainfall_mm", "rain_3h_mm"]
        train_df_scaled = train_df.copy()
        val_df_scaled = val_df.copy()
        test_df_scaled = test_df.copy()

        # Add scaled feature columns for sequence generation
        for i, f_name in enumerate(feature_names):
            train_df_scaled[f_name] = X_train_scaled[:, i]
            val_df_scaled[f_name] = X_val_scaled[:, i]
            test_df_scaled[f_name] = X_test_scaled[:, i]

        X_train_seq, y_train_seq, _ = create_sequences_by_location(train_df_scaled, seq_features, "future_contamination_event", sequence_length=seq_len)
        X_val_seq, y_val_seq, _ = create_sequences_by_location(val_df_scaled, seq_features, "future_contamination_event", sequence_length=seq_len)
        X_test_seq, y_test_seq, test_indices = create_sequences_by_location(test_df_scaled, seq_features, "future_contamination_event", sequence_length=seq_len)

        lstm_classifier = LSTMTemporalClassifier(sequence_length=seq_len, num_features=len(seq_features))
        pos_weight = (len(y_train_seq) - sum(y_train_seq)) / max(1, sum(y_train_seq))
        lstm_classifier.train(X_train_seq, y_train_seq, X_val_seq, y_val_seq, class_weight={0: 1.0, 1: float(pos_weight)})
        lstm_classifier.save()
        logger.info("LSTM model successfully trained and persisted.")
    except Exception as e:
        logger.warning(f"LSTM training skipped or encountered error: {e}")

    # 6. Develop Hybrid Ensemble
    logger.info("Configuring and tuning Hybrid Ensemble...")
    prob_xgb_val = xgb_model.predict_proba(X_val_scaled)[:, 1]
    prob_xgb_test = xgb_model.predict_proba(X_test_scaled)[:, 1]

    prob_rf_val = rf_model.predict_proba(X_val_scaled)[:, 1]
    prob_rf_test = rf_model.predict_proba(X_test_scaled)[:, 1]

    hybrid = HybridEnsemble(method="weighted_blend")
    hybrid.base_models = {
        "xgboost": xgb_model,
        "random_forest": rf_model
    }
    # Optimize blend weights on Validation set
    best_w = hybrid.optimize_blend_weights(y_val, prob_xgb_val, prob_rf_val)

    # Evaluate Stacking alternative on Validation
    hybrid_stacking = HybridEnsemble(method="stacking")
    hybrid_stacking.base_models = hybrid.base_models
    hybrid_stacking.fit_stacking_meta_learner(y_val, prob_xgb_val, prob_rf_val)

    # Compare validation performance to select best hybrid
    prob_blend_val = hybrid.predict_proba(prob_xgb_val, prob_rf_val)[:, 1]
    prob_stack_val = hybrid_stacking.predict_proba(prob_xgb_val, prob_rf_val)[:, 1]

    from sklearn.metrics import roc_auc_score
    auc_blend = roc_auc_score(y_val, prob_blend_val)
    auc_stack = roc_auc_score(y_val, prob_stack_val)

    selected_hybrid = hybrid if auc_blend >= auc_stack else hybrid_stacking
    selected_method = "weighted_blend" if auc_blend >= auc_stack else "stacking"
    logger.info(f"Selected Hybrid Architecture: {selected_method} (Val AUC: Blend={auc_blend:.4f}, Stacking={auc_stack:.4f})")

    # Save Selected Hybrid Model & Metadata
    hybrid_meta = {
        "selected_model": "HybridEnsemble",
        "method": selected_method,
        "blend_weight_xgb": float(best_w),
        "base_models": ["xgboost", "random_forest"],
        "validation_auc": float(max(auc_blend, auc_stack)),
        "prediction_horizon_hours": 3,
        "feature_count": len(feature_names),
        "evaluation_period": f"{test_df['timestamp'].min()} to {test_df['timestamp'].max()}"
    }
    selected_hybrid.save(hybrid_meta)

    # 7. Anomaly Detection (Dual-Track)
    logger.info("Fitting Dual-Track Anomaly Detector (Isolation Forest)...")
    anomaly_detector = DualTrackAnomalyDetector()
    anomaly_detector.fit(train_df)
    anomaly_detector.save()

    # 8. Explainability (SHAP)
    logger.info("Computing SHAP attributions and generating global summary plot...")
    explainer = ModelExplainer(xgb_model, feature_names)
    # Generate summary plot on a representative sample of test data
    sample_indices = np.random.choice(len(X_test_scaled), size=min(1000, len(X_test_scaled)), replace=False)
    explainer.generate_summary_plot(X_test_scaled[sample_indices], filename="shap_summary_plot.png")

    # 9. Model Evaluation & Comparison on Final Untouched Test Set
    logger.info("Evaluating all candidate models on final untouched test set...")
    suite = ModelEvaluationSuite()

    prob_lr_test = lr_model.predict_proba(X_test_raw)[:, 1]
    prob_hybrid_test = selected_hybrid.predict_proba(prob_xgb_test, prob_rf_test)[:, 1]

    models_probs = {
        "Logistic Regression Baseline": prob_lr_test,
        "Random Forest Baseline": prob_rf_test,
        "XGBoost Classifier": prob_xgb_test,
        "Hybrid Ensemble (Selected)": prob_hybrid_test
    }

    models_preds = {
        name: (prob >= 0.5).astype(int) for name, prob in models_probs.items()
    }

    # Generate comparison plots
    suite.plot_confusion_matrices(y_test, models_preds, filename="confusion_matrices.png")
    suite.plot_roc_pr_curves(y_test, models_probs, filename="roc_pr_curves.png")

    # Compile comparative benchmark table
    metrics_records = []
    for name, prob in models_probs.items():
        m = compute_metrics(y_test, prob, threshold=0.5)
        m["model_name"] = name
        metrics_records.append(m)

    metrics_df = pd.DataFrame(metrics_records)
    # Reorder columns
    cols = ["model_name", "roc_auc", "pr_auc", "f1_score", "recall", "precision", "accuracy", "false_positive_rate", "brier_score"]
    metrics_df = metrics_df[cols]

    csv_path = root / "outputs" / "metrics" / "model_comparison.csv"
    json_path = root / "outputs" / "metrics" / "model_comparison.json"
    metrics_df.to_csv(csv_path, index=False)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(metrics_records, f, indent=2)

    logger.info(f"\nFinal Comparative Benchmarks on Untouched Test Set:\n{metrics_df.to_string(index=False)}")
    logger.info("Full training and evaluation pipeline completed successfully!")


if __name__ == "__main__":
    run_full_training_pipeline()
