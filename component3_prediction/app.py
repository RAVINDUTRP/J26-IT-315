"""Streamlit interface for the Component 03 research prototype."""

from pathlib import Path
import io
import numpy as np
import pandas as pd
import streamlit as st

from src.anomaly import detect_anomalies
from src.data_loader import load_csv
from src.explain import explain_prediction
from src.features import add_future_target, build_features
from src.integration import export_json
from src.predict import assess
from src.preprocessing import clean_dataframe
from src.train import train_model

ROOT = Path(__file__).parent


def synthetic_data(rows=96):
    rng = np.random.default_rng(42)
    timestamps = pd.date_range("2026-01-01", periods=rows, freq="h", tz="UTC")
    rain = np.maximum(0, rng.normal(2, 2, rows))
    rain[40:52] += np.linspace(2, 18, 12)
    rain[52:64] += np.linspace(18, 2, 12)
    turbidity = 8 + rain * 1.8 + rng.normal(0, 0.7, rows)
    df = pd.DataFrame({
        "timestamp": timestamps, "location_id": "synthetic-site",
        "pH": 7.1 - rain * 0.015 + rng.normal(0, .03, rows),
        "turbidity": turbidity, "electrical_conductivity": 220 + rain * 4,
        "TDS": 140 + rain * 2, "water_temperature": 27 + rng.normal(0, .4, rows),
        "rainfall_mm": rain, "sensor_confidence": .95,
    })
    df["contamination_label"] = ((df["turbidity"] > 25) | (df["rainfall_mm"] > 12)).astype(int)
    return df


def main():
    st.set_page_config(page_title="AquaShield C03", layout="wide")
    st.markdown("""
    <style>
    :root {
        --aqua: #079aa5;
        --blue: #2563eb;
        --ink: #16324f;
        --muted: #718096;
    }
    .app-nav {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 3.75rem;
        padding: 0.6rem 0.85rem;
        border: 1px solid rgba(37, 99, 235, 0.12);
        border-radius: 0.85rem;
        background: linear-gradient(110deg, rgba(255,255,255,.96), rgba(239,250,252,.9));
        box-shadow: 0 7px 20px rgba(37, 99, 235, .07);
        margin-bottom: 0.55rem;
        overflow: hidden;
    }
    .app-nav::after {
        content: "";
        position: absolute;
        width: 12rem;
        height: 12rem;
        right: -5rem;
        top: -8rem;
        border-radius: 50%;
        background: rgba(14, 165, 168, .12);
    }
    .app-nav-brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 1;
    }
    .app-nav-mark {
        display: grid;
        place-items: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.65rem;
        background: linear-gradient(135deg, var(--aqua), var(--blue));
        color: white;
        font-size: 1.05rem;
        font-weight: 850;
        box-shadow: 0 5px 12px rgba(37, 99, 235, .2);
    }
    .app-nav-title {
        color: var(--ink);
        font-size: 1.08rem;
        font-weight: 800;
        letter-spacing: -.02em;
        line-height: 1.1;
    }
    .app-nav-subtitle {
        color: var(--muted);
        font-size: 0.68rem;
        margin-top: 0.12rem;
    }
    div[data-testid="stRadio"] {
        padding: 0.35rem;
        border: 1px solid rgba(37, 99, 235, .12);
        border-radius: 1rem;
        background: rgba(248, 252, 255, .78);
        box-shadow: 0 6px 18px rgba(15, 23, 42, .04);
    }
    div[data-testid="stRadio"] > label { display: none; }
    div[data-testid="stRadio"] > div {
        gap: 0.35rem;
        flex-wrap: wrap;
    }
    div[data-testid="stRadio"] label {
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 0.25rem 0.72rem;
        color: #294766;
        background: transparent;
        transition: all 150ms ease;
    }
    div[data-testid="stRadio"] label:hover {
        color: var(--blue);
        border-color: rgba(37, 99, 235, .2);
        background: rgba(37, 99, 235, .07);
        transform: translateY(-1px);
    }
    div[data-testid="stRadio"] label:has(input:checked) {
        color: white;
        border-color: var(--blue);
        background: linear-gradient(100deg, var(--aqua), var(--blue));
        box-shadow: 0 5px 12px rgba(37, 99, 235, .2);
    }
    div[data-testid="stRadio"] label:has(input:checked) p {
        color: white;
        font-weight: 650;
    }
    div[data-testid="stRadio"] label > div > div:first-child {
        display: none;
    }
    div[data-testid="stRadio"] label > div {
        display: block;
    }
    .app-disclaimer {
        color: #7a8797;
        font-size: .78rem;
        margin: .65rem .2rem 1rem;
    }
    .dashboard-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        margin: 1.25rem 0 1rem;
    }
    .dashboard-kicker {
        color: var(--aqua);
        font-size: .72rem;
        font-weight: 800;
        letter-spacing: .13em;
        text-transform: uppercase;
    }
    .dashboard-title {
        color: var(--ink);
        font-size: 1.75rem;
        font-weight: 800;
        letter-spacing: -.04em;
        margin-top: .2rem;
    }
    .dashboard-badge {
        border: 1px solid rgba(14, 165, 168, .22);
        border-radius: 999px;
        color: #087f87;
        background: rgba(14, 165, 168, .09);
        font-size: .75rem;
        font-weight: 700;
        padding: .38rem .75rem;
        white-space: nowrap;
    }
    .metric-card {
        min-height: 7.1rem;
        padding: 1rem 1.05rem;
        border: 1px solid rgba(37, 99, 235, .12);
        border-radius: 1rem;
        background: linear-gradient(145deg, rgba(255,255,255,.97), rgba(242,249,253,.9));
        box-shadow: 0 8px 22px rgba(15, 23, 42, .06);
    }
    .metric-label {
        color: var(--muted);
        font-size: .76rem;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: .05em;
    }
    .metric-value {
        color: var(--ink);
        font-size: 1.65rem;
        font-weight: 800;
        margin-top: .55rem;
    }
    .metric-note {
        color: #8391a2;
        font-size: .72rem;
        margin-top: .12rem;
    }
    .section-heading {
        color: var(--ink);
        font-size: 1.08rem;
        font-weight: 750;
        margin: 1.35rem 0 .55rem;
    }
    .observation-note {
        border-left: 4px solid #d4a72c;
        border-radius: .75rem;
        padding: .85rem 1rem;
        color: #6d5815;
        background: #fff9df;
        font-size: .84rem;
        margin: .9rem 0 1rem;
    }
    @media (max-width: 800px) {
        .app-nav { align-items: flex-start; }
        .app-nav-subtitle { max-width: 15rem; }
        div[data-testid="stRadio"] label { padding: .22rem .52rem; }
    }
    </style>
    <div class="app-nav">
        <div class="app-nav-brand">
            <div class="app-nav-mark">A</div>
            <div>
                <div class="app-nav-title">AquaShield</div>
                <div class="app-nav-subtitle">Explainable environmental intelligence · Component 03</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    if "data" not in st.session_state:
        st.session_state.data = synthetic_data()
    pages = [
        "Dashboard", "Upload Dataset", "Data Preprocessing", "Feature Engineering",
        "Risk Prediction", "SHAP Explanations", "Anomaly Detection", "Model Evaluation",
        "Prediction History", "Component 04 Export", "About the Research"
    ]
    page = st.radio("Navigate", pages, horizontal=True, key="active_page")
    st.markdown('<div class="app-disclaimer">Synthetic demonstration data is not validated monitoring data.</div>', unsafe_allow_html=True)
    if page == "Dashboard":
        dashboard()
    elif page == "Upload Dataset":
        upload()
    elif page == "Data Preprocessing":
        preprocessing_page()
    elif page == "Feature Engineering":
        feature_page()
    elif page == "Risk Prediction":
        prediction_page()
    elif page == "SHAP Explanations":
        shap_page()
    elif page == "Anomaly Detection":
        anomaly_page()
    elif page == "Model Evaluation":
        evaluation_page()
    elif page == "Prediction History":
        history_page()
    elif page == "Component 04 Export":
        export_page()
    else:
        about_page()


def current_features():
    return build_features(st.session_state.data)


def dashboard():
    df = st.session_state.data
    latest = df.iloc[-1]
    st.markdown("""
    <div class="dashboard-heading">
        <div>
            <div class="dashboard-kicker">Monitoring dashboard</div>
            <div class="dashboard-title">Water quality overview</div>
        </div>
        <div class="dashboard-badge">● Synthetic demonstration</div>
    </div>
    """, unsafe_allow_html=True)
    c1, c2, c3, c4 = st.columns(4)
    cards = [
        ("Water-quality records", f"{len(df):,}", "observations loaded"),
        ("Monitoring locations", f"{df['location_id'].nunique():,}", "active locations"),
        ("Latest rainfall", f"{float(latest['rainfall_mm']):.1f} mm", "most recent reading"),
        ("Sensor confidence", f"{float(latest.get('sensor_confidence', 0)):.0%}", "latest reported value"),
    ]
    for column, (label, value, note) in zip((c1, c2, c3, c4), cards):
        column.markdown(
            f'<div class="metric-card"><div class="metric-label">{label}</div>'
            f'<div class="metric-value">{value}</div><div class="metric-note">{note}</div></div>',
            unsafe_allow_html=True,
        )
    st.markdown('<div class="section-heading">Latest observed measurements</div>', unsafe_allow_html=True)
    measurement_columns = [
        column for column in (
            "timestamp", "location_id", "pH", "turbidity",
            "electrical_conductivity", "TDS", "water_temperature", "rainfall_mm",
            "sensor_confidence",
        ) if column in df
    ]
    latest_table = df[measurement_columns].tail(1).copy()
    st.dataframe(latest_table, hide_index=True, use_container_width=True)
    st.markdown(
        '<div class="observation-note"><strong>Observed data only.</strong> '
        'These measurements describe the latest recorded conditions and are not future predictions.</div>',
        unsafe_allow_html=True,
    )
    st.markdown('<div class="section-heading">Observed conditions trend</div>', unsafe_allow_html=True)
    chart_data = df.set_index("timestamp")[["rainfall_mm", "turbidity"]].rename(
        columns={"rainfall_mm": "Rainfall (mm)", "turbidity": "Turbidity"}
    )
    st.line_chart(chart_data, height=360, use_container_width=True)


def upload():
    st.subheader("Dataset management")
    st.write("Use the synthetic demonstration dataset or upload a CSV. Missing measurements are never silently invented.")
    uploaded = st.file_uploader("CSV dataset", type="csv")
    if uploaded:
        try:
            df, report = load_csv(uploaded)
            st.json(report.__dict__)
            if report.missing_required or report.invalid_timestamps:
                st.error("The file cannot be used until required fields and timestamps are corrected.")
            else:
                st.session_state.data = df
                st.success("Dataset loaded.")
        except ValueError as exc:
            st.error(str(exc))
    st.download_button("Download CSV template", "timestamp,location_id,pH,turbidity,electrical_conductivity,TDS,water_temperature,rainfall_mm,contamination_label\n", "dataset_template.csv", "text/csv")


def preprocessing_page():
    cleaned, report = clean_dataframe(st.session_state.data)
    st.json(report.__dict__)
    st.dataframe(cleaned.head(20), use_container_width=True)
    st.download_button("Download cleaned dataset", cleaned.to_csv(index=False), "cleaned_dataset.csv", "text/csv")


def feature_page():
    features = current_features()
    st.dataframe(features.tail(20), use_container_width=True)
    st.caption("Rolling and lagged features are calculated per location after chronological sorting.")


def train_demo():
    features = add_future_target(current_features(), 3)
    excluded = {"timestamp", "location_id", "contamination_label", "future_contamination"}
    columns = [c for c in features.select_dtypes(include="number") if c not in excluded]
    bundle = train_model(features, columns)
    st.session_state.bundle, st.session_state.features = bundle, features
    return bundle


def prediction_page():
    if st.button("Train future-risk model"):
        try:
            bundle = train_demo()
            st.success(f"Trained {bundle['model_kind']} on {bundle['train_rows']} chronological rows.")
            st.json(bundle["metrics"])
        except ValueError as exc:
            st.error(str(exc))
    if "bundle" in st.session_state:
        result = assess("synthetic-site", st.session_state.features, st.session_state.bundle)
        st.metric("Predicted future risk score", f"{result['risk_score']:.3f}")
        st.write(f"Category: **{result['risk_category']}** | Horizon: **{result['horizon_h']} hours**")
        st.info("This score is a model output, not a calibrated probability or public-health decision.")


def shap_page():
    if "bundle" not in st.session_state:
        st.info("Train a model on the Risk Prediction page first.")
        return
    bundle = st.session_state.bundle
    X = st.session_state.features[bundle["feature_columns"]].tail(1)
    try:
        explanation = explain_prediction(bundle["pipeline"].named_steps["model"], X, X)
        st.dataframe(explanation, use_container_width=True)
        st.bar_chart(explanation.set_index("feature")["contribution"].head(10))
        st.caption("SHAP contributions describe model behavior; they do not prove causation.")
    except RuntimeError as exc:
        st.error(str(exc))


def anomaly_page():
    try:
        result = detect_anomalies(current_features())
        st.dataframe(result[result["anomaly_flag"]], use_container_width=True)
        st.caption("Isolation Forest flags unusual patterns. An anomaly is not automatically contamination.")
    except ValueError as exc:
        st.error(str(exc))


def evaluation_page():
    if "bundle" not in st.session_state:
        st.info("Train a model first.")
    else:
        st.json(st.session_state.bundle["metrics"])
        st.caption("Metrics are chronological holdout results, not a claim of scientific validation.")


def history_page():
    st.info("Prediction history is stored in session state for this prototype; export it as CSV from the prediction page after training.")


def export_page():
    if "bundle" not in st.session_state:
        st.info("Train a model first.")
        return
    result = assess("synthetic-site", st.session_state.features, st.session_state.bundle)
    payload = export_json(result)
    st.download_button("Download Component 04 JSON", payload, "component03_assessment.json", "application/json")
    st.json(result)


def about_page():
    st.markdown("## Explainable Contamination Risk Prediction")
    st.markdown("""
    ### 1. Research Overview

    **Research Title:** Adaptive Environmental Intelligence for Early Water Contamination Detection and Disaster Response

    **Individual Research Component:** Component 03 – Explainable Contamination Risk Prediction  
    **Project ID:** J26-IT-315  
    **Research Area:** Artificial Intelligence, Machine Learning, Explainable AI, Environmental Monitoring, and Water Quality Prediction.

    This research component focuses on developing an Explainable Artificial Intelligence
    (XAI)-based framework to predict future water contamination risk using water-quality
    observations, weather and rainfall information, historical contamination patterns,
    and temporal environmental features.

    Unlike systems that only classify the current water-quality status, the proposed
    framework aims to forecast potential future contamination risk and explain the
    factors contributing to each prediction. It also investigates anomaly detection
    to identify unusual water-quality patterns or possible sensor abnormalities.

    ### 2. Research Problem

    Water contamination can increase during heavy rainfall and flooding because surface
    runoff may transport sediments, sewage, agricultural pollutants, and industrial
    waste into rivers and other water sources.

    Conventional monitoring approaches may identify water-quality problems only after
    measurements have deteriorated. Furthermore, machine-learning predictions can be
    difficult to interpret when the reasons behind a prediction are not clearly explained.

    Therefore, this framework investigates future contamination-risk prediction using
    multiple environmental data sources while providing understandable explanations and
    identifying unusual patterns.

    ### 3. Main Research Objective

    To design, develop, and evaluate an Explainable Artificial Intelligence-based
    contamination-risk prediction framework that forecasts future water contamination
    risk using multi-source environmental data, historical water-quality patterns,
    weather and rainfall information, and engineered temporal features while providing
    transparent prediction explanations and anomaly indications for disaster-management
    decision support.

    ### 4. Specific Objectives

    1. Collect and preprocess water-quality, weather, rainfall, and historical contamination datasets.
    2. Develop temporal features such as rainfall intensity, rainfall increase rate, accumulated rainfall, lag features, and water-quality trends.
    3. Develop and evaluate machine-learning models for future contamination-risk prediction.
    4. Apply SHAP as the primary explainability method to identify environmental features contributing to predictions.
    5. Investigate anomaly detection for unusual contamination patterns and potential sensor abnormalities.
    6. Evaluate prediction performance, early-warning lead time, explanation quality, and anomaly-detection performance where suitable reference data are available.

    ### 5. Proposed Methodology

    The research follows an experimental quantitative approach.

    - **Data preprocessing:** Cleaning, validation, missing-value handling, and timestamp synchronization.
    - **Feature engineering:** Extracting temporal and rainfall-related features from available observations.
    - **Machine learning:** Evaluating a baseline model and XGBoost where appropriate.
    - **Explainable AI:** Using SHAP to interpret model predictions.
    - **Anomaly detection:** Investigating Isolation Forest as an initial candidate method.
    - **Evaluation:** Comparing model performance against an appropriate baseline using suitable test data.

    Final model selection and performance conclusions depend on the available data and
    experimental results.

    ### 6. System Inputs

    - Water-quality observations, such as pH, turbidity, electrical conductivity, and total dissolved solids (TDS).
    - Weather and rainfall information.
    - Historical water-quality measurements and contamination records.
    - Sensor-confidence metadata, when available.
    - Timestamp and location information.

    ### 7. Expected Outputs

    - Predicted future contamination-risk score.
    - Predicted risk category using documented thresholds.
    - Prediction confidence or calibrated probability, where properly supported.
    - SHAP-based explanation of important contributing features.
    - Anomaly flag for unusual observations.
    - Prediction timestamp and location.
    - Structured output for integration with Component 04.

    These are intended system outputs; their validity will be established through
    implementation and evaluation.

    ### 8. Technology Stack

    - **Programming Language:** Python
    - **User Interface:** Streamlit
    - **Data Processing:** Pandas and NumPy
    - **Machine Learning:** Scikit-learn and XGBoost
    - **Explainability:** SHAP
    - **Anomaly Detection:** Isolation Forest
    - **Persistence and Integration:** Joblib, CSV, and JSON

    ### Research Scope and Limitations

    This application is a research prototype, not a certified public-health monitoring
    system. The included demonstration data is synthetic and must not be interpreted as
    validated Sri Lankan river data or as evidence of real contamination events.

    A future-risk model requires appropriately labelled future observations. Model scores
    are not calibrated confidence values unless calibration has been implemented and
    validated. SHAP describes how the model uses features; it does not prove that a
    feature caused contamination. An anomaly is not automatically proof of contamination.

    Component 03 provides predictions, explanations, anomaly indications, and structured
    outputs only. Disaster-response recommendations belong to Component 04.
    """)


if __name__ == "__main__":
    main()
