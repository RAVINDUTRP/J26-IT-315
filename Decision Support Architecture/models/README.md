# Component 04 Models Directory

Stores trained and serialized model artifacts for priority level prediction:

- `preprocessor.joblib`: Train-fitted Scikit-Learn transformer (Imputer + One-Hot/Ordinal Encoder + Robust Scaler).
- `random_forest_model.joblib`: Trained Random Forest Classifier.
- `xgboost_model.joblib`: Trained XGBoost Classifier.
- `selected_model.joblib`: The primary selected model for production inference.
- `model_metadata.json`: Feature schemas, hyperparameters, cross-validation metrics, and serialization timestamps.
