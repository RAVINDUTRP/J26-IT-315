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
        padding: 0.95rem 1.1rem;
        border: 1px solid rgba(37, 99, 235, 0.12);
        border-radius: 1.1rem;
        background: linear-gradient(110deg, rgba(255,255,255,.96), rgba(239,250,252,.9));
        box-shadow: 0 10px 28px rgba(37, 99, 235, .08);
        margin-bottom: 0.8rem;
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
        width: 2.65rem;
        height: 2.65rem;
        border-radius: 0.85rem;
        background: linear-gradient(135deg, var(--aqua), var(--blue));
        color: white;
        font-size: 1.3rem;
        font-weight: 850;
        box-shadow: 0 7px 16px rgba(37, 99, 235, .24);
    }
    .app-nav-title {
        color: var(--ink);
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -.02em;
        line-height: 1.1;
    }
    .app-nav-subtitle {
        color: var(--muted);
        font-size: 0.75rem;
        margin-top: 0.18rem;
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
        st.info("C03 predicts future contamination risk, explains model behavior, and reports unusual patterns. Disaster-response recommendations belong to Component 04.")


def current_features():
    return build_features(st.session_state.data)


def dashboard():
    df = st.session_state.data
    c1, c2, c3 = st.columns(3)
    c1.metric("Water-quality records", len(df))
    c2.metric("Locations", df["location_id"].nunique())
    c3.metric("Latest rainfall (mm)", f"{float(df['rainfall_mm'].iloc[-1]):.1f}")
    st.subheader("Latest observed measurements")
    st.dataframe(df.tail(1), use_container_width=True)
    st.warning("Observed measurements above are not future predictions.")
    st.line_chart(df.set_index("timestamp")[["turbidity", "rainfall_mm"]])


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


if __name__ == "__main__":
    main()
