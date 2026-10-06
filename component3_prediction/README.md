# Component 3 - Explainable Contamination Risk Prediction
Owner: IT23383098.
- `data/raw`, `data/processed` datasets (git-ignored, share via Drive)
- `notebooks/` experiments (baseline vs RF / XGBoost / LSTM)
- `src/features.py` rainfall intensity, accumulated rainfall, lags, moving averages, change rates
- `src/train.py` baseline + candidate models
- `src/explain.py` SHAP / LIME
- `src/anomaly.py` pollution-pattern and sensor-fault detection
- `src/predict.py` `assess()` -> RiskAssessment
